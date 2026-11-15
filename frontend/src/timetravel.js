// AI-assisted (Claude): time travel. Earth changes month by month (NASA MODIS 2023 monthly
// climate, by calendar month); Mars changes with its season (Mars Climate Database, every
// 30 deg of Ls, at 10:30 and 22:30 local time, the same hours as Earth's MODIS data).
// For any date, every Earth cell is re-scored against the target as it is on that date.
import { marsLs } from './timesim.js';

const DAY = 86400000;

/** earth_monthly.json (header) + earth_monthly.bin (Int16 [month][var][cell]). */
export async function loadEarthMonthly(base = '/data') {
  const h = await (await fetch(`${base}/earth_monthly.json`, { cache: 'no-store' })).json();
  const buf = await (await fetch(`${base}/earth_monthly.bin`, { cache: 'no-store' })).arrayBuffer();
  return { ...h, data: new Int16Array(buf) };
}

/** Value of variable v for every cell at a fractional month (0 = mid-January, cyclic). */
function monthValues(M, v, mf) {
  const n = M.cells, nv = M.vars.length, vi = M.vars.indexOf(v), sc = M.scale[v];
  const m0 = ((Math.floor(mf) % 12) + 12) % 12, m1 = (m0 + 1) % 12, f = mf - Math.floor(mf);
  const a = (m0 * nv + vi) * n, b = (m1 * nv + vi) * n;
  const out = new Float64Array(n);
  for (let k = 0; k < n; k++) out[k] = ((1 - f) * M.data[a + k] + f * M.data[b + k]) / sc;
  return out;
}

/** Fractional month for a date: 0.0 = 15 January (mid-month = the monthly mean). */
export function monthOf(date) {
  const y0 = Date.UTC(date.getUTCFullYear(), 0, 1);
  return ((date - y0) / DAY / 365.25) * 12 - 0.5;
}

/** An earth_grid-shaped object whose temperature, swing, albedo and NDVI are those of `date`. */
export function earthGridAt(grid, M, date) {
  const mf = monthOf(date);
  const f = grid.fields;
  const cols = {};
  for (const v of M.vars) cols[v] = monthValues(M, v, mf);
  const iDay = f.indexOf('lst_day_c'), iNight = f.indexOf('lst_night_c'), iSwing = f.indexOf('lst_swing_c');
  const iAlb = f.indexOf('albedo'), iNdvi = f.indexOf('ndvi');
  const cells = grid.cells.map((r, k) => {
    const c = r.slice();
    c[iDay] = cols.lst_day_c[k]; c[iNight] = cols.lst_night_c[k]; c[iSwing] = c[iDay] - c[iNight];
    c[iAlb] = cols.albedo[k]; c[iNdvi] = cols.ndvi[k];
    return c;
  });
  return { ...grid, cells };
}

/** Mars day/night surface temperature (deg C) at a spot for the date's season. */
export function marsTempsAt(S, lat, lon, date) {
  const ls = marsLs(date);
  const { lats, lons } = S, nLat = lats.length, nLon = lons.length;
  const x = ((((lon - lons[0]) % 360) + 360) % 360) / (360 / nLon);
  const i0 = Math.floor(x) % nLon, i1 = (i0 + 1) % nLon, fx = x - Math.floor(x);
  const y = Math.max(0, Math.min(nLat - 1 - 1e-9, (lat - lats[0]) / ((lats[nLat - 1] - lats[0]) / (nLat - 1))));
  const j0 = Math.floor(y), j1 = j0 + 1, fy = y - j0;
  const at = (g) => (1 - fx) * (1 - fy) * g[i0 * nLat + j0] + fx * (1 - fy) * g[i1 * nLat + j0] + (1 - fx) * fy * g[i0 * nLat + j1] + fx * fy * g[i1 * nLat + j1];
  const step = 360 / S.ls.length, u = ls / step, s0 = Math.floor(u) % S.ls.length, s1 = (s0 + 1) % S.ls.length, fs = u - Math.floor(u);
  const day = (1 - fs) * at(S.day[s0]) + fs * at(S.day[s1]) - 273.15;
  const night = (1 - fs) * at(S.night[s0]) + fs * at(S.night[s1]) - 273.15;
  return { ls, day, night, swing: day - night };
}

/** Weekly dates from `start` over `weeks`. */
export function timeline(start = new Date(), weeks = 100) {
  const d0 = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Array.from({ length: weeks + 1 }, (_, k) => new Date(d0 + k * 7 * DAY));
}
