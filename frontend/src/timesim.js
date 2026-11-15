// AI-assisted (Claude): the time factor. A week on a Mars spot vs a week at its Earth twin,
// compared at the same local solar time.
//   Mars: Mars Climate Database v6.2 surface temperature maps, 8 local times x 4 seasons
//         (mars_diurnal.json), interpolated to the spot, today's season and each hour.
//   Earth: Open-Meteo hourly forecast, soil temperature at 0 cm (ground surface), next 7 days.

const rad = Math.PI / 180;

/** Mars areocentric solar longitude Ls (deg) for a date. Allison & McEwen (2000), Planet. Space Sci. 48, 215. */
export function marsLs(date = new Date()) {
  const jdUT = date.getTime() / 86400000 + 2440587.5;
  const dt = jdUT + 69.184 / 86400 - 2451545.0; // TT - UT ~ 69 s
  const M = (19.3871 + 0.52402073 * dt) * rad;
  const aFMS = 270.3871 + 0.524038496 * dt;
  const eoc = (10.691 + 3.0e-7 * dt) * Math.sin(M) + 0.623 * Math.sin(2 * M) + 0.050 * Math.sin(3 * M)
    + 0.005 * Math.sin(4 * M) + 0.0005 * Math.sin(5 * M);
  return (((aFMS + eoc) % 360) + 360) % 360;
}

export function seasonName(ls, lat) {
  const north = ['spring', 'summer', 'autumn', 'winter'][Math.floor(ls / 90) % 4];
  const flip = { spring: 'autumn', summer: 'winter', autumn: 'spring', winter: 'summer' };
  return lat >= 0 ? `northern ${north}` : `southern ${flip[north]}`;
}

/** Surface temperature (deg C) at a Mars spot, season Ls and local time (h), from the MCD maps. */
export function marsTemp(d, lat, lon, ls, lt) {
  const { lats, lons, seasons, times, T } = d; // T[si][ti] = flat [lonIdx * nLat + latIdx], K
  const nLat = lats.length;
  const nLon = lons.length;
  // bilinear in space (longitude wraps)
  const dLon = 360 / nLon;
  let x = (((lon - lons[0]) % 360) + 360) % 360 / dLon;
  const i0 = Math.floor(x) % nLon, i1 = (i0 + 1) % nLon, fx = x - Math.floor(x);
  const dLat = (lats[nLat - 1] - lats[0]) / (nLat - 1);
  let y = Math.max(0, Math.min(nLat - 1 - 1e-9, (lat - lats[0]) / dLat));
  const j0 = Math.floor(y), j1 = j0 + 1, fy = y - j0;
  const at = (si, ti) => {
    const g = T[si][ti];
    return (1 - fx) * (1 - fy) * g[i0 * nLat + j0] + fx * (1 - fy) * g[i1 * nLat + j0]
      + (1 - fx) * fy * g[i0 * nLat + j1] + fx * fy * g[i1 * nLat + j1];
  };
  // periodic linear interpolation in season and in local time
  const per = (v, arr, period) => {
    const step = period / arr.length;
    const u = (((v - arr[0]) % period) + period) % period / step;
    const a = Math.floor(u) % arr.length;
    return [a, (a + 1) % arr.length, u - Math.floor(u)];
  };
  const [s0, s1, fs] = per(ls, seasons, 360);
  const [t0, t1, ft] = per(lt, times, 24);
  const k = (1 - fs) * ((1 - ft) * at(s0, t0) + ft * at(s0, t1)) + fs * ((1 - ft) * at(s1, t0) + ft * at(s1, t1));
  return k - 273.15;
}

/** Next 7 days of hourly ground temperature at an Earth spot (Open-Meteo, local time). */
export async function earthWeek(lat, lon) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&hourly=soil_temperature_0cm&forecast_days=7&timezone=auto`;
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Open-Meteo returned ${r.status}`);
  const j = await r.json();
  return { times: j.hourly.time, temps: j.hourly.soil_temperature_0cm, tz: j.timezone };
}

/**
 * Pair every Earth hour with Mars at the same local solar time (a sol is 24 h 39 min, so we
 * compare by local time, not by clock), with Mars' season advancing through the week.
 */
export function compareWeek(diurnal, mars, earth, now = new Date()) {
  const ls0 = marsLs(now);
  const rows = earth.times.map((t, k) => {
    const lt = +t.slice(11, 13) + +t.slice(14, 16) / 60;
    const ls = (ls0 + (k / 24) * 0.524) % 360; // Ls advances ~0.52 deg per Earth day
    const tm = marsTemp(diurnal, mars.lat, mars.lon, ls, lt);
    const te = earth.temps[k];
    return { t, lt, earth: te, mars: tm, gap: te == null ? null : Math.abs(te - tm) };
  });
  const valid = rows.filter((r) => r.gap != null);
  const best = valid.reduce((a, r) => (r.gap < a.gap ? r : a), valid[0]);
  const coldestEarth = valid.reduce((a, r) => (r.earth < a.earth ? r : a), valid[0]);
  const coldestMars = rows.reduce((a, r) => (r.mars < a.mars ? r : a), rows[0]);
  // best hour per day
  const days = {};
  for (const r of valid) { const d = r.t.slice(0, 10); if (!days[d] || r.gap < days[d].gap) days[d] = r; }
  return { rows, best, coldestEarth, coldestMars, perDay: Object.values(days), ls: ls0 };
}
