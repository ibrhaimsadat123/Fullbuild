// AI-assisted (Claude): live scoring in the browser, so ANY spot on Mars (or the Moon)
// can be compared with all of Earth on click. This is a line-by-line port of
// pipeline/score.py; the two must stay identical (check: clicking Jezero here gives the
// same top matches as scores_jezero.json).
//
//   1. Only dimensions measured on BOTH worlds are compared.
//   2. s_i = exp(-(x_earth - x_target)^2 / (2 sigma_i^2)),
//      sigma_i = (p95 - p5) / 4 of Earth's values; slope and relief in log space.
//   3. Target beyond anything on Earth -> percentile rank toward that extreme, gap reported.
//   4. Overall = weighted geometric mean, each s_i floored at 0.01. Day/night/swing temperature
//      share one vote; a dimension beyond anything on Earth does not vote (gap still reported).
//   5. Tiers are relative: top 0.5 / 2 / 5 / 10 % of Earth's land cells.

const DIMS = {
  slope_deg: true,
  relief_55km_m: true,
  lst_day_c: false,
  lst_night_c: false,
  lst_swing_c: false,
  albedo: false,
  ndvi: false,
};
export const MIN_DIMS = 3;
export const FAMILY_W = { lst_day_c: 1 / 3, lst_night_c: 1 / 3, lst_swing_c: 1 / 3 };
const TIER_PCT = [['exact', 0.5], ['strong', 2], ['moderate', 5], ['variable', 10]];

const tx = (x, log) => (log ? Math.log1p(Math.max(x, 0)) : x);

// numpy.percentile (linear interpolation) on an ascending-sorted array
function percentile(sorted, p) {
  const pos = (sorted.length - 1) * (p / 100);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Precompute, once, everything about Earth the formula needs. */
export function buildEarthModel(grid) {
  const f = grid.fields;
  const iLat = f.indexOf('lat');
  const iLon = f.indexOf('lon');
  const n = grid.cells.length;
  const lat = new Float32Array(n);
  const lon = new Float32Array(n);
  grid.cells.forEach((r, k) => { lat[k] = r[iLat]; lon[k] = r[iLon]; });
  const dims = {};
  for (const [dim, log] of Object.entries(DIMS)) {
    const i = f.indexOf(dim);
    if (i < 0) continue;
    const raw = new Float64Array(n);
    const t = new Float64Array(n);
    grid.cells.forEach((r, k) => { raw[k] = r[i]; t[k] = tx(r[i], log); });
    const sortedT = Float64Array.from(t).sort();
    const sigma = Math.max((percentile(sortedT, 95) - percentile(sortedT, 5)) / 4, 1e-6);
    // percentile rank of each cell (0 = lowest value on Earth, 1 = highest), like argsort().argsort()
    const order = Array.from(raw.keys()).sort((a, b) => raw[a] - raw[b]);
    const rank = new Float64Array(n);
    order.forEach((cell, pos) => { rank[cell] = pos / (n - 1); });
    let lo = Infinity, hi = -Infinity;
    for (const v of raw) { if (v < lo) lo = v; if (v > hi) hi = v; }
    dims[dim] = { log, raw, t, sigma, rank, lo, hi };
  }
  return { n, lat, lon, dims, resolution_deg: grid.resolution_deg || 0.5 };
}

/**
 * Score every Earth cell against a set of target values { dim: number }.
 * Returns the same shape the app gets from a scores_<target>.json after normalizeScores().
 */
export function scoreLive(model, values, meta = {}, weights = null) {
  const used = [];
  const missing = [];
  const gaps = {};
  const sims = [];
  const w = [];
  for (const [dim, log] of Object.entries(DIMS)) {
    const v = values[dim];
    const d = model.dims[dim];
    if (typeof v !== 'number' || !Number.isFinite(v) || !d) { missing.push(dim); continue; }
    const clamped = Math.min(Math.max(v, d.lo), d.hi);
    const s = new Float64Array(model.n);
    if (clamped !== v) {
      gaps[dim] = { target: v, earth_extreme: clamped, gap: +(v - clamped).toFixed(2) };
      const up = v > d.hi;
      for (let k = 0; k < model.n; k++) s[k] = up ? d.rank[k] : 1 - d.rank[k];
    } else {
      const tt = tx(clamped, log);
      const twoS2 = 2 * d.sigma * d.sigma;
      for (let k = 0; k < model.n; k++) { const e = d.t[k] - tt; s[k] = Math.exp(-(e * e) / twoS2); }
    }
    sims.push([dim, s]);
    w.push(clamped !== v ? 0 : (weights?.[dim] ?? 1) * (FAMILY_W[dim] ?? 1));
    used.push(dim);
  }
  const voting = used.filter((_, j) => w[j] > 0);
  if (voting.length < MIN_DIMS) {
    return { error: `Only ${voting.length} comparable measurement(s) here (${voting.join(', ') || 'none'}); need ${MIN_DIMS}.` };
  }
  const wsum = w.reduce((a, b) => a + b, 0);
  const score = new Float64Array(model.n);
  for (let k = 0; k < model.n; k++) {
    let acc = 0;
    for (let j = 0; j < sims.length; j++) if (w[j] > 0) acc += Math.log(Math.max(sims[j][1][k], 0.01)) * w[j];
    score[k] = Math.exp(acc / wsum);
  }
  const sorted = Float64Array.from(score).sort();
  const q = (top) => sorted[Math.max(0, Math.min(model.n - 1, Math.floor(model.n * (1 - top / 100))))];
  const tiers = Object.fromEntries(TIER_PCT.map(([name, pct]) => [name, +q(pct).toFixed(3)]));
  const tierOf = (x) => TIER_PCT.find(([name]) => x >= tiers[name])?.[0] || null;
  const cells = new Array(model.n);
  for (let k = 0; k < model.n; k++) {
    cells[k] = {
      lat: model.lat[k], lon: model.lon[k], score: score[k], tier: tierOf(score[k]),
      dims: Object.fromEntries(sims.map(([dim, s]) => [dim, s[k]])),
    };
  }
  return {
    target: meta.id || 'live', world: meta.world, name: meta.name,
    dims_used: used, dims_voting: voting, dims_missing: missing, earth_gaps: gaps, tiers,
    resolution_deg: model.resolution_deg, cells, live: true,
    method: 'Computed live in the browser with the same formula as pipeline/score.py',
  };
}

/** Lookup for a planet grid file (mars_grid.json): nearest cell to a clicked lat/lon. */
export function indexPlanetGrid(grid) {
  const f = grid.fields;
  const res = grid.resolution_deg || 1;
  const map = new Map();
  const key = (la, lo) => `${Math.floor((la + 90) / res)}:${Math.floor((((lo + 180) % 360) + 360) % 360 / res)}`;
  for (const r of grid.cells) map.set(key(r[f.indexOf('lat')], r[f.indexOf('lon')]), r);
  return {
    res,
    sources: grid.sources || {},
    get(lat, lon) {
      const r = map.get(key(lat, lon));
      return r ? Object.fromEntries(f.map((name, i) => [name, r[i]])) : null;
    },
  };
}
