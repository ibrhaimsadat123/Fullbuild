// AI-assisted (Claude): match zones. Contours of the real score field around the top places,
// drawn at the rank thresholds the app already uses: Exact (top 0.5% of Earth), Strong (top 2%),
// Moderate (top 5%), Variable (top 10%). Marching squares on the 0.5 deg grid, no hand-drawn radii.
import { PolylineCollection, LabelCollection, Material, Color, Cartesian3, LabelStyle, Cartesian2, NearFarScalar, VerticalOrigin } from 'cesium';
import { TIER_COLORS } from './config.js';

export const ZONE_LEVELS = [
  { id: 'exact', top: 0.5, name: 'Exact' },
  { id: 'strong', top: 2, name: 'Strong' },
  { id: 'moderate', top: 5, name: 'Moderate' },
  { id: 'variable', top: 10, name: 'Variable' },
];

/** Pick up to n top places at least `sep` degrees apart. */
export function topSites(heat, n = 4, sep = 4) {
  const out = [];
  for (const c of heat.ranked) {
    if (out.every((o) => Math.abs(o.lat - c.lat) > sep || Math.abs(o.lon - c.lon) > sep)) out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** Segments of the contour v = level on a grid (marching squares). v[j][i], lower = better. */
function march(v, level, lat0, lon0, res) {
  const segs = [];
  const H = v.length, W = v[0].length;
  const P = (i, j) => [lon0 + i * res, lat0 + j * res];
  const lerp = (a, b, va, vb) => { const t = (level - va) / (vb - va); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]; };
  for (let j = 0; j < H - 1; j++) for (let i = 0; i < W - 1; i++) {
    const a = v[j][i], b = v[j][i + 1], c = v[j + 1][i + 1], d = v[j + 1][i];
    const code = (a <= level ? 1 : 0) | (b <= level ? 2 : 0) | (c <= level ? 4 : 0) | (d <= level ? 8 : 0);
    if (code === 0 || code === 15) continue;
    const pa = P(i, j), pb = P(i + 1, j), pc = P(i + 1, j + 1), pd = P(i, j + 1);
    const e = { ab: () => lerp(pa, pb, a, b), bc: () => lerp(pb, pc, b, c), cd: () => lerp(pc, pd, c, d), da: () => lerp(pd, pa, d, a) };
    const T = {
      1: [['da', 'ab']], 2: [['ab', 'bc']], 3: [['da', 'bc']], 4: [['bc', 'cd']], 5: [['da', 'ab'], ['bc', 'cd']], 6: [['ab', 'cd']], 7: [['da', 'cd']],
      8: [['cd', 'da']], 9: [['cd', 'ab']], 10: [['ab', 'bc'], ['cd', 'da']], 11: [['cd', 'bc']], 12: [['bc', 'da']], 13: [['bc', 'ab']], 14: [['ab', 'da']],
    }[code];
    for (const [p, q] of T) segs.push([e[p](), e[q]()]);
  }
  return segs;
}

/** Draw the zones on the Earth viewer. Returns { remove(), sites, counts }. */
export function drawZones(viewer, heat, { n = 4, win = 6 } = {}) {
  const res = heat.res;
  const lines = viewer.scene.primitives.add(new PolylineCollection());
  const labels = viewer.scene.primitives.add(new LabelCollection());
  const sites = topSites(heat, n);
  const counts = {};
  for (const s of sites) {
    const lat0 = s.lat - win, lon0 = s.lon - win, N = Math.round((2 * win) / res) + 1;
    const v = [];
    for (let j = 0; j < N; j++) {
      const row = [];
      for (let i = 0; i < N; i++) {
        const c = heat.get(lat0 + j * res, lon0 + i * res);
        row.push(c && typeof c.top === 'number' ? c.top : 100);
      }
      v.push(row);
    }
    for (const L of ZONE_LEVELS) {
      const segs = march(v, L.top, lat0, lon0, res);
      counts[L.id] = (counts[L.id] || 0) + segs.length;
      const color = Color.fromCssColorString(TIER_COLORS[L.id]);
      for (const [p, q] of segs) {
        lines.add({
          positions: Cartesian3.fromDegreesArrayHeights([p[0], p[1], 3000, q[0], q[1], 3000]),
          width: L.id === 'exact' ? 3 : 2,
          material: Material.fromType('Color', { color: color.withAlpha(0.95) }),
        });
      }
    }
    labels.add({
      position: Cartesian3.fromDegrees(s.lon, s.lat, 3000),
      text: `Top ${s.top < 0.05 ? '0.1' : s.top.toFixed(1)}%`,
      font: '600 12px Inter, system-ui, sans-serif',
      fillColor: Color.WHITE, outlineColor: Color.BLACK, outlineWidth: 3, style: LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cartesian2(0, -14), verticalOrigin: VerticalOrigin.BOTTOM,
      scaleByDistance: new NearFarScalar(1e6, 1.0, 2e7, 0.6),
    });
  }
  return {
    sites, counts,
    remove() { viewer.scene.primitives.remove(lines); viewer.scene.primitives.remove(labels); },
  };
}

/** What changes from the centre of a zone outward: mean per-dimension similarity in each band. */
export function zoneProfile(heat, site, win = 6) {
  const res = heat.res;
  const bands = ZONE_LEVELS.map((L, k) => ({ ...L, lo: k ? ZONE_LEVELS[k - 1].top : 0, cells: [] }));
  for (let lat = site.lat - win; lat <= site.lat + win + 1e-9; lat += res) {
    for (let lon = site.lon - win; lon <= site.lon + win + 1e-9; lon += res) {
      const c = heat.get(lat, lon);
      if (!c || typeof c.top !== 'number') continue;
      const b = bands.find((x) => c.top > x.lo && c.top <= x.top) || (c.top <= 0.5 ? bands[0] : null);
      if (b) b.cells.push(c);
    }
  }
  return bands.map((b) => {
    const dims = {};
    for (const c of b.cells) for (const [d, v] of Object.entries(c.dims || {})) if (typeof v === 'number') (dims[d] ||= []).push(v);
    const mean = Object.fromEntries(Object.entries(dims).map(([d, a]) => [d, a.reduce((x, y) => x + y, 0) / a.length]));
    return { id: b.id, name: b.name, top: b.top, n: b.cells.length, mean };
  });
}
