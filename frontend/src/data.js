// AI-assisted (Claude): reads Ibrahim's files from data/processed (served at /data).
// Never fills gaps: a missing file or a null value is reported as missing/pending.

const cache = new Map();
let indexPromise = null;

export function dataIndex() {
  if (!indexPromise) {
    indexPromise = fetch('/data/index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((j) => new Set(j.files || []))
      .catch(() => new Set());
  }
  return indexPromise;
}

/** Returns { ok, data, error }. Missing files are a normal state, not an exception. */
export async function load(name) {
  if (cache.has(name)) return cache.get(name);
  const p = (async () => {
    const files = await dataIndex();
    if (files.size && !files.has(name)) return { ok: false, error: `${name} is not in data/processed yet` };
    try {
      const r = await fetch(`/data/${name}`, { cache: 'no-store' });
      if (!r.ok) return { ok: false, error: `${name} is not in data/processed yet` };
      return { ok: true, data: await r.json() };
    } catch (e) {
      return { ok: false, error: `${name} could not be read: ${e.message}` };
    }
  })();
  cache.set(name, p);
  return p;
}

export function clearCache() {
  cache.clear();
  indexPromise = null;
}

/**
 * earth_grid.json is a compact table. Column order is read from `fields`, never assumed.
 * Returns a lookup keyed by grid cell so a click can find its row.
 */
export function indexGrid(grid) {
  const fields = grid.fields || [];
  const iLat = fields.indexOf('lat');
  const iLon = fields.indexOf('lon');
  const res = grid.resolution_deg || inferResolution(grid.cells.map((c) => c[iLat]));
  const map = new Map();
  for (const row of grid.cells) map.set(cellKey(row[iLat], row[iLon], res), row);
  return {
    fields,
    res,
    year: grid.year,
    sources: grid.sources || {},
    illustrative: !!grid.illustrative,
    get(lat, lon) {
      const row = map.get(cellKey(lat, lon, res));
      if (!row) return null;
      return Object.fromEntries(fields.map((f, i) => [f, row[i]]));
    },
  };
}

export function cellKey(lat, lon, res) {
  return `${Math.floor((lat + 90) / res)}:${Math.floor((lon + 180) / res)}`;
}

export function inferResolution(lats) {
  const u = [...new Set(lats)].sort((a, b) => a - b);
  let best = Infinity;
  for (let i = 1; i < u.length; i++) {
    const d = +(u[i] - u[i - 1]).toFixed(6);
    if (d > 0 && d < best) best = d;
  }
  return Number.isFinite(best) ? best : 0.5;
}

/**
 * scores_<target>.json comes as a compact table: `fields` + rows, per-feature
 * similarities in `s_<feature>` columns, tier cut-offs in `tiers`. Column order is
 * read from `fields`. Returns the same file with cells as objects:
 * { lat, lon, score, tier, dims: { <feature>: similarity } }.
 * Files already in object form pass through unchanged.
 */
export function normalizeScores(raw) {
  if (!raw || !Array.isArray(raw.cells) || !Array.isArray(raw.fields) || !Array.isArray(raw.cells[0])) return raw;
  const f = raw.fields;
  const iLat = f.indexOf('lat');
  const iLon = f.indexOf('lon');
  const iScore = f.indexOf('score');
  const iTier = f.indexOf('tier');
  const iLand = f.indexOf('land');
  const dimCols = f.map((name, i) => [name, i]).filter(([n]) => n.startsWith('s_')).map(([n, i]) => [n.slice(2), i]);
  const cuts = raw.tiers && typeof raw.tiers === 'object' ? Object.entries(raw.tiers).sort((a, b) => b[1] - a[1]) : null;
  const tierOf = (s) => (cuts && typeof s === 'number' ? cuts.find(([, t]) => s >= t)?.[0] || null : null);
  const cells = raw.cells.map((r) => ({
    lat: r[iLat],
    lon: r[iLon],
    score: r[iScore],
    tier: iTier >= 0 ? r[iTier] : tierOf(r[iScore]),
    dims: Object.fromEntries(dimCols.map(([n, i]) => [n, r[i]])),
    land: iLand >= 0 ? r[iLand] : 1,
  }));
  return { ...raw, cells };
}

/** A target feature's display value: "pending", a range, or the number. */
export function featureValue(f) {
  if (!f) return { text: 'pending', pending: true };
  if (Array.isArray(f.range)) return { text: `${fmt(f.range[0])} to ${fmt(f.range[1])}`, pending: false, range: f.range };
  if (f.value === null || f.value === undefined) return { text: 'pending', pending: true };
  return { text: fmt(f.value), pending: false, value: f.value };
}

export function fmt(n) {
  if (typeof n !== 'number') return String(n);
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
}
