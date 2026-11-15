// AI-assisted (Claude): Nerd Mode panel, built from the same data the engine uses.
//   1. The maths: every number behind one Earth place's score, with the formula.
//   2. Where the target sits in Earth's range: a histogram per measurement.
//   3. Through the year: Mars season (MCD) vs the Earth place's months (MODIS monthly).
//   4. Through a day: Mars hours today (MCD) vs the Earth place's next 24 h (Open-Meteo).
import { FAMILY_W } from './livescore.js';
import { histChart, overlayChart } from './charts.js';
import { marsLs, marsTemp, earthWeek } from './timesim.js';
import { marsTempsAt, timeline } from './timetravel.js';

const DIMS = { slope_deg: true, relief_55km_m: true, lst_day_c: false, lst_night_c: false, lst_swing_c: false, albedo: false, ndvi: false };
const tx = (x, log) => (log ? Math.log1p(Math.max(x, 0)) : x);

/** Rows of the maths table for one Earth row vs the target values. */
export function mathRows(model, target, earthRow, weights, gaps) {
  return Object.entries(DIMS).filter(([d]) => typeof target[d] === 'number' && model.dims[d]).map(([d, log]) => {
    const m = model.dims[d];
    const t = target[d], e = earthRow?.[d];
    const beyond = d in (gaps || {});
    let sim = null, z = null;
    if (typeof e === 'number') {
      if (beyond) {
        // percentile toward the extreme (does not vote)
        let below = 0; for (const v of m.raw) if (v < e) below++;
        const r = below / (m.raw.length - 1);
        sim = t > m.hi ? r : 1 - r;
      } else {
        z = (tx(e, log) - tx(t, log)) / m.sigma;
        sim = Math.exp(-(z * z) / 2);
      }
    }
    const w = beyond ? 0 : (weights?.[d] ?? 1) * (FAMILY_W[d] ?? 1);
    return { d, log, t, e, sigma: m.sigma, z, sim, w, beyond, lo: m.lo, hi: m.hi };
  });
}

/** Histogram spec of Earth's values for one measurement (log bins for slope and relief). */
export function histSpec(model, d, log, markers) {
  const raw = model.dims[d].raw;
  const vals = Array.from(raw, (v) => tx(v, log)).sort((a, b) => a - b);
  const lo = vals[Math.floor(vals.length * 0.001)], hi = vals[Math.floor(vals.length * 0.999)];
  const nb = 30, w = (hi - lo) / nb || 1;
  const counts = new Array(nb).fill(0);
  for (const v of vals) counts[Math.max(0, Math.min(nb - 1, Math.floor((v - lo) / w)))]++;
  const back = (x) => (log ? Math.expm1(x) : x);
  const fmtv = (x) => { const a = Math.abs(x); return a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : x.toFixed(2); };
  const labels = counts.map((_, i) => fmtv(back(lo + (i + 0.5) * w)));
  const pos = (v) => (tx(v, log) - lo) / w - 0.5;
  return {
    labels, counts,
    markers: markers.filter((m) => typeof m.value === 'number').map((m, k) => {
      const p = pos(m.value);
      const off = p < -0.5 ? ' ◀ beyond Earth' : p > nb - 0.5 ? ' beyond Earth ▶' : '';
      return { pos: p, label: `${m.label} ${fmtv(m.value)}${off}`, color: m.color, dash: m.dash, row: k };
    }),
  };
}

/** Earth place's month-by-month values (earth_monthly) for one cell index. */
export function cellMonths(M, k) {
  const nv = M.vars.length, out = {};
  M.vars.forEach((v, vi) => { out[v] = Array.from({ length: 12 }, (_, m) => M.data[(m * nv + vi) * M.cells + k] / M.scale[v]); });
  return out;
}

/** Through-the-year series: next Mars year, weekly. */
export function yearSeries(S, target, months, start = new Date()) {
  const dates = timeline(start, 100);
  const mf = (d) => { const y0 = Date.UTC(d.getUTCFullYear(), 0, 1); return ((d - y0) / 86400000 / 365.25) * 12 - 0.5; };
  const lerpM = (arr, x) => { const m0 = ((Math.floor(x) % 12) + 12) % 12, m1 = (m0 + 1) % 12, f = x - Math.floor(x); return (1 - f) * arr[m0] + f * arr[m1]; };
  const wk = (d) => Math.round((d - dates[0]) / (7 * 86400000));
  const series = [];
  if (S) {
    const mt = dates.map((d) => [wk(d), marsTempsAt(S, target.lat, target.lon, d)]);
    series.push({ world: 'mars', label: 'Target, day (10:30)', points: mt.map(([x, r]) => [x, +r.day.toFixed(1)]) });
    series.push({ world: 'mars', label: 'Target, night (22:30)', points: mt.map(([x, r]) => [x, +r.night.toFixed(1)]), dash: true });
  }
  if (months) {
    series.push({ world: 'earth', label: 'Earth place, day', points: dates.map((d) => [wk(d), +lerpM(months.lst_day_c, mf(d)).toFixed(1)]) });
    series.push({ world: 'earth', label: 'Earth place, night', points: dates.map((d) => [wk(d), +lerpM(months.lst_night_c, mf(d)).toFixed(1)]), dash: true });
  }
  return series;
}

/** Through-a-day series: Mars today (MCD diurnal) vs the Earth place's next 24 hours (Open-Meteo). */
export async function daySeries(D, target, earth) {
  const ls = marsLs();
  const out = [];
  if (D) out.push({ world: 'mars', label: `Target today (Ls ${ls.toFixed(0)}°)`, points: Array.from({ length: 25 }, (_, h) => [h, +marsTemp(D, target.lat, target.lon, ls, h).toFixed(1)]) });
  if (earth) {
    const w = await earthWeek(earth.lat, earth.lon);
    const first = w.times.slice(0, 24).map((t, k) => [+t.slice(11, 13), w.temps[k]]).sort((a, b) => a[0] - b[0]);
    out.push({ world: 'earth', label: `Earth place, next 24 h (${w.tz})`, points: first });
  }
  return out;
}

export { overlayChart, histChart };
