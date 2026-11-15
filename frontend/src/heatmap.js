// AI-assisted (Claude): draws scores_<target>.json as one image draped on Earth.
// One pixel per grid cell, so the 0.5 deg global grid (~60k cells) is a 720x360
// texture and the 0.05 deg regional tiles work the same way over their own extent.
import { ImageryLayer, Rectangle, SingleTileImageryProvider, Credit } from 'cesium';
import { inferResolution, cellKey } from './data.js';

// Score ramp: fully transparent for the bottom ~85% of Earth so the satellite imagery
// stays clean; colour only where a place is a real candidate (input is percentile^6:
// 0.53 = top 10%, 0.74 = top 5%, 0.89 = top 2%, 0.97 = top 0.5%).
const RAMP = [
  [0.0, [40, 90, 170, 0]],
  [0.38, [40, 90, 170, 0]],
  [0.53, [90, 200, 200, 150]],
  [0.65, [232, 227, 90, 190]],
  [0.8, [255, 176, 0, 215]],
  [0.92, [255, 90, 54, 235]],
  [1.0, [255, 40, 40, 245]],
];

export function rampColor(score) {
  const s = Math.max(0, Math.min(1, score));
  for (let i = 1; i < RAMP.length; i++) {
    const [s1, c1] = RAMP[i];
    const [s0, c0] = RAMP[i - 1];
    if (s <= s1) {
      const t = (s - s0) / (s1 - s0 || 1);
      return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    }
  }
  return RAMP[RAMP.length - 1][1];
}

export function rampCss() {
  return `linear-gradient(90deg, ${RAMP.map(([s, c]) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(c[3], 60) / 255}) ${s * 100}%`).join(', ')})`;
}

/**
 * Lens rescoring, matching pipeline/score.py: overall = weighted GEOMETRIC mean of the
 * per-dimension scores, each floored at 0.01, so one badly failed dimension (e.g. bright
 * ice vs dark Mars rock) pulls the whole score down. Only dims present in the cell count.
 */
export function rescore(cell, weights) {
  if (!weights) return cell.score;
  let sum = 0;
  let wsum = 0;
  for (const [dim, w] of Object.entries(weights)) {
    const v = cell.dims?.[dim];
    if (typeof v === 'number' && w > 0) {
      sum += Math.log(Math.max(v, 0.01)) * w;
      wsum += w;
    }
  }
  return wsum > 0 ? Math.exp(sum / wsum) : null;
}

/**
 * Tier for a rescored cell, from lenses.json `tier_thresholds` ({ exact: 0.9, ... }).
 * Without thresholds from Ibrahim, a rescored cell has no tier rather than a guessed one.
 */
function tierFor(score, thresholds) {
  if (!thresholds || typeof score !== 'number') return null;
  const sorted = Object.entries(thresholds).sort((a, b) => b[1] - a[1]);
  return sorted.find(([, t]) => score >= t)?.[0] || null;
}

/** Builds lookup + image for a scores file. `weights` null = the file's own scores. */
export function buildHeat(scores, weights = null, thresholds = null) {
  const cells = scores.cells || [];
  const res = scores.resolution_deg || inferResolution(cells.map((c) => c.lat));
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const c of cells) {
    minLat = Math.min(minLat, c.lat); maxLat = Math.max(maxLat, c.lat);
    minLon = Math.min(minLon, c.lon); maxLon = Math.max(maxLon, c.lon);
  }
  // Snap the extent to cell edges.
  const west = Math.floor((minLon + 180) / res) * res - 180;
  const south = Math.floor((minLat + 90) / res) * res - 90;
  const east = Math.min(180, west + (Math.floor((maxLon - west) / res) + 1) * res);
  const north = Math.min(90, south + (Math.floor((maxLat - south) / res) + 1) * res);
  const w = Math.max(1, Math.round((east - west) / res));
  const h = Math.max(1, Math.round((north - south) / res));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const lookup = new Map();
  const ranked = [];
  // Scores are honest absolute values (no place on Earth is truly Mars-like), so the
  // colours show RANK instead: the top 0.5% of Earth for this target glows red.
  const scored = cells.map((c) => (weights ? rescore(c, weights) : c.score));
  const sortedVals = scored.filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const n = sortedVals.length;
  const pctOf = (v) => {
    let lo = 0, hi = n;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sortedVals[m] < v) lo = m + 1; else hi = m; }
    return n > 1 ? lo / (n - 1) : 1;
  };
  // Relative tiers for a lens (same rule as pipeline/score.py): top 0.5 / 2 / 5 / 10 %.
  const q = (top) => sortedVals[Math.max(0, Math.min(n - 1, Math.floor(n * (1 - top / 100))))];
  const lensTiers = weights && !thresholds?.fixed ? { exact: q(0.5), strong: q(2), moderate: q(5), variable: q(10) } : thresholds;
  cells.forEach((c, idx) => {
    const score = scored[idx];
    const entry = { ...c, score, tier: weights ? tierFor(score, lensTiers) : c.tier };
    lookup.set(cellKey(c.lat, c.lon, res), entry);
    if (typeof score !== 'number') return;
    ranked.push(entry);
    const x = Math.floor((c.lon - west) / res);
    const y = h - 1 - Math.floor((c.lat - south) / res);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, g, b, a] = rampColor(Math.pow(pctOf(score), 6));
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = a;
  });
  ctx.putImageData(img, 0, 0);
  ranked.sort((a, b) => b.score - a.score);
  return {
    res,
    rectangle: Rectangle.fromDegrees(west, south, east, north),
    dataUrl: canvas.toDataURL('image/png'),
    lookup,
    ranked,
    get(lat, lon) {
      return lookup.get(cellKey(lat, lon, res)) || null;
    },
  };
}

export async function addHeatLayer(viewer, heat, credit) {
  const provider = await SingleTileImageryProvider.fromUrl(heat.dataUrl, {
    rectangle: heat.rectangle,
    credit: new Credit(credit),
  });
  const layer = new ImageryLayer(provider, { alpha: 0.7 });
  viewer.imageryLayers.add(layer);
  return layer;
}
