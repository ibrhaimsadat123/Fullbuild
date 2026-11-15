// AI-assisted (Claude): HTML for the side cards. Normal Mode shows plain language;
// Nerd Mode (.nerd-only) adds the technical names, numbers and full source tags.
import { featureValue, fmt } from './data.js';
import { TIER_COLORS } from './config.js';
import { dimLabel } from './charts.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Place names for Earth cells (earth_places.json, Natural Earth). Set once by main.js.
let placeOf = () => '';
export function setPlaceLookup(fn) { placeOf = fn || (() => ''); }
export const placeName = (lat, lon) => placeOf(lat, lon) || '';
const where = (lat, lon) => {
  const p = placeOf(lat, lon);
  return p ? `${esc(p)} <span class="muted">${latLon(lat, lon)}</span>` : latLon(lat, lon);
};

// Display names only. Values, units in the data and sources all come from the files.
const FEATURES = {
  elevation_m: { normal: 'Height', nerd: 'Elevation', unit: 'm' },
  slope_deg: { normal: 'Steepness', nerd: 'Slope, 5 km baseline', unit: '°' },
  roughness_m: { normal: 'Bumpiness', nerd: 'Roughness', unit: 'm' },
  climb_m: { normal: 'Climb over the segment', nerd: 'Elevation change, segment end minus start', unit: 'm' },
  seg_slope_deg: { normal: 'Steepness', nerd: 'Slope, 50 m baseline', unit: '°' },
  relief_55km_m: { normal: 'Hilliness across ~55 km', nerd: 'Relief, 55 km scale (elevation std dev)', unit: 'm' },
  lst_day_c: { normal: 'Ground temperature by day', nerd: 'Surface temperature, day', unit: '°C' },
  lst_night_c: { normal: 'Ground temperature at night', nerd: 'Surface temperature, night', unit: '°C' },
  lst_swing_c: { normal: 'Day-night temperature swing', nerd: 'Diurnal temperature swing', unit: '°C' },
  albedo: { normal: 'Brightness', nerd: 'Albedo', unit: '' },
  ndvi: { normal: 'Plant cover', nerd: 'NDVI', unit: '' },
  thermal_inertia_si: { normal: 'Ground type (dust to bedrock)', nerd: 'Thermal inertia', unit: 'J m⁻² K⁻¹ s⁻½' },
  ice_depth_m: { normal: 'Depth to buried ice', nerd: 'Ice depth', unit: 'm' },
  sun_elevation_deg: { normal: 'How high the sun gets', nerd: 'Sun elevation', unit: '°' },
  pit_shade_temp_c: { normal: 'Temperature in the shaded pit', nerd: 'Pit shade temperature', unit: '°C' },
  pit_depth_m: { normal: 'Pit depth', nerd: 'Pit depth', unit: 'm' },
};

export function featureMeta(key) {
  return FEATURES[key] || { normal: dimLabel(key), nerd: key, unit: '' };
}

function withUnit(text, unit, pending) {
  if (pending || !unit) return text;
  return unit === '°' || unit === '°C' ? `${text}${unit === '°' ? '°' : ' °C'}` : `${text} ${unit}`;
}

function latLon(lat, lon) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function targetCard(t, world) {
  if (!t) return `<h3>No target</h3><p class="empty">targets.json has no ${esc(world)} targets yet.</p>`;
  const rows = Object.entries(t.features || {})
    .map(([key, f]) => {
      const m = featureMeta(key);
      const v = featureValue(f);
      const na = f?.status === 'not_applicable';
      const status = f?.status === 'sourced' ? 'sourced' : na ? 'n/a' : 'pending';
      return `<tr>
        <td><span class="normal-only">${esc(m.normal)}</span><span class="nerd-only">${esc(m.nerd)}${m.unit ? ` (${esc(m.unit)})` : ''}</span>
          <span class="src ${na ? '' : 'nerd-only'}">${esc(f?.source || 'no source given')}</span></td>
        <td class="${v.pending && !na ? 'pending' : ''}">${esc(na ? 'n/a' : v.pending ? 'pending' : withUnit(v.text, m.unit))}<span class="chip ${na ? 'sourced' : status}">${status}</span></td>
      </tr>`;
    })
    .join('');
  const sourced = Object.values(t.features || {}).filter((f) => f?.status === 'sourced').length;
  const total = Object.values(t.features || {}).filter((f) => f?.status !== 'not_applicable').length;
  return `
    <h3>${esc(t.name)}</h3>
    <p class="why">${esc(t.why || '')}</p>
    <p class="muted">${latLon(t.lat, t.lon)}${t.coords_note ? `<span class="src nerd-only">${esc(t.coords_note)}</span>` : ''}</p>
    <h4>Measurements <span class="chip">${sourced} of ${total} sourced</span></h4>
    <table class="kv">${rows}</table>`;
}

const LEVELS = [
  [0.85, 'excellent'],
  [0.7, 'strong'],
  [0.5, 'fair'],
  [0, 'poor'],
];
const level = (v) => LEVELS.find(([t]) => v >= t)[1];

/** Plain-English verdict from the per-dimension scores, e.g. "Excellent terrain analog, poor temperature analog". */
export function verdict(dims, skip = new Set()) {
  // Dimensions beyond anything on Earth are never called a match.
  const entries = Object.entries(dims || {}).filter(([k, v]) => typeof v === 'number' && !skip.has(k));
  if (!entries.length) return 'No per-dimension scores for this cell.';
  entries.sort((a, b) => b[1] - a[1]);
  const [bestK, bestV] = entries[0];
  const [worstK, worstV] = entries[entries.length - 1];
  if (level(bestV) === level(worstV)) return `${cap(level(bestV))} analog on all ${entries.length} dimensions.`;
  return `${cap(level(bestV))} ${featureMeta(bestK).normal.toLowerCase()} analog, ${level(worstV)} ${featureMeta(worstK).normal.toLowerCase()} analog.`;
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export function tierChip(tier) {
  if (!tier) return '';
  const c = TIER_COLORS[String(tier).toLowerCase()] || '#888';
  // Tiers are relative ranks, not "how Mars-like": show them as what they are.
  const label = { exact: 'Top 0.5%', strong: 'Top 2%', moderate: 'Top 5%', variable: 'Top 10%' }[String(tier).toLowerCase()] || tier;
  return `<span class="tier" style="background:${c}" title="Among the best ${esc(label.replace('Top ', ''))} of Earth's land for this target">${esc(label)}</span>`;
}

export function matchEmpty({ target, scoresError, heat, scores }) {
  if (scoresError) {
    return `<h3>Earth matches</h3>
      <p class="empty">Waiting for the similarity engine: ${esc(scoresError)}.</p>
      <p class="muted">The heatmap, tiers and fingerprint appear here as soon as Ibrahim commits <code>scores_${esc(target?.id || '<target>')}.json</code>.</p>`;
  }
  if (!heat) return `<h3>Earth matches</h3><p class="empty">Loading scores…</p>`;
  // Best cell in each of 5 different named places (falls back to raw cells without names).
  const seen = new Set();
  const picks = [];
  for (const c of heat.ranked) {
    const p = placeOf(c.lat, c.lon);
    if (p && seen.has(p)) continue;
    if (p) seen.add(p);
    picks.push(c);
    if (picks.length === 5) break;
  }
  const top = picks
    .map((c, i) => `<tr data-lat="${c.lat}" data-lon="${c.lon}" class="top-row" style="cursor:pointer">
      <td>${i + 1}. ${where(c.lat, c.lon)}</td><td>${fmt(c.score)}${tierChip(c.tier)}</td></tr>`)
    .join('');
  return `<h3>Earth matches</h3>
    <p class="muted">Click anywhere on Earth to see how well it matches ${esc(target?.name || 'the target')}.</p>
    <h4>Top places</h4><table class="kv">${top}</table>${scoresMeta(scores)}`;
}

export function matchCell({ cell, target, earthRow, grid, apiOn, scores }) {
  const beyond = new Set(Object.keys(scores?.earth_gaps || {}));
  if (!earthRow && grid) {
    // Ocean (or a cell with no land data): say so plainly, no score, no actions.
    return `<h3>${latLon(cell.lat, cell.lon)}</h3>
      <p class="empty">No land data here. TwinWorlds compares land only: this is ocean, a large lake, or the Greenland ice sheet (no terrain data in GMTED2010).</p>
      <p class="muted">Click on land, or pick one of the top places above.</p>`;
  }
  const head = `<h3>${where(cell.lat, cell.lon)}</h3>
    <div><span class="score-big">${typeof cell.score === 'number' ? fmt(cell.score) : '—'}</span>${tierChip(cell.tier)}</div>
    <p class="verdict">${typeof cell.score === 'number' ? esc(verdict(cell.dims, beyond)) : 'Match score pending: the similarity engine has not published scores for this target yet.'}</p>
    <div class="radar-wrap"><canvas id="radar"></canvas></div>`;

  const dimsTable = `<table class="kv nerd-only">${Object.entries(cell.dims || {})
    .map(([k, v]) => `<tr><td>${esc(featureMeta(k).nerd)} similarity</td><td>${typeof v === 'number' ? v.toFixed(3) : 'pending'}</td></tr>`)
    .join('')}</table>`;

  // Side-by-side values: only features measured on both worlds under the same name.
  let compare = '';
  if (earthRow && target) {
    const keys = Object.keys(target.features || {}).filter((k) => k in earthRow);
    if (keys.length) {
      compare = `<h4>Earth vs ${esc(target.name)}</h4><table class="kv">${keys
        .map((k) => {
          const m = featureMeta(k);
          const tv = featureValue(target.features[k]);
          const ev = earthRow[k];
          const earthSrc = grid?.sources?.[k] || `Earth grid${grid?.year ? `, ${grid.year}` : ''}`; // each source already states its own period
          return `<tr><td><span class="normal-only">${esc(m.normal)}</span><span class="nerd-only">${esc(m.nerd)}</span>
              <span class="src nerd-only">Earth: ${esc(earthSrc)}</span>
              <span class="src nerd-only">Target: ${esc(target.features[k]?.source || '')}</span></td>
            <td>${esc(withUnit(fmt(ev), m.unit))} <span class="muted">vs</span> <span class="${tv.pending ? 'pending' : ''}">${esc(tv.pending ? 'pending' : withUnit(tv.text, m.unit))}</span></td></tr>`;
        })
        .join('')}</table>`;
    }
  } else if (!earthRow && grid) {
    compare = `<p class="empty">No Earth grid cell here (ocean or outside the grid).</p>`;
  }

  const actions = `<div class="row">
      <button id="dive-here">Dive here</button>
      ${apiOn ? '<button id="explain-btn">Explain (AI)</button>' : ''}
    </div>
    <div id="analyst-out"></div>`;

  return head + dimsTable + compare + actions + scoresMeta(scores);
}

/** What the score is built from, what is not scored yet, and where Earth can't reach the target. */
function scoresMeta(scores) {
  if (!scores) return '';
  const name = (k) => esc(featureMeta(k).normal);
  const beyond = new Set(Object.keys(scores.earth_gaps || {}));
  const used = (scores.dims_voting || (scores.dims_used || []).filter((k) => !beyond.has(k))).map(name).join(', ');
  const missing = (scores.dims_missing || []).map(name).join(', ');
  const gaps = Object.entries(scores.earth_gaps || {})
    .map(([k, g]) => {
      const u = featureMeta(k).unit;
      return `<tr><td>${name(k)}</td><td>${esc(withUnit(fmt(g.target), u))} <span class="muted">vs Earth's most extreme</span> ${esc(withUnit(fmt(g.earth_extreme), u))}</td></tr>`;
    })
    .join('');
  return `${used ? `<h4>Scored on</h4><p>${used}</p>` : ''}${missing ? `<p class="muted">Not scored yet: ${missing}</p>` : ''}${
    gaps ? `<h4>Beyond anything on Earth</h4><table class="kv">${gaps}</table><p class="muted">Nowhere on Earth reaches these values, so they cannot tell Earth places apart and do not count toward the score. The gap stays visible: these are what Earth testing has to fake.</p>` : ''
  }`;
}

export function gapsCard(gaps, world, error) {
  const title = `<h3>Earth can't do this</h3>`;
  if (error) return `${title}<p class="empty">Waiting for <code>gaps.json</code>.</p><p class="muted">Every permanent gap (gravity, vacuum, atmosphere, radiation…) and its "How to Fake It" hardware will be listed here.</p>`;
  const list = (gaps.gaps || []).filter((g) => !g.worlds || g.worlds.includes(world));
  if (!list.length) return `${title}<p class="empty">No gaps listed for ${esc(world)}.</p>`;
  return `${title}${list
    .map((g) => `<div class="gap"><div><b>${esc(g.gap)}</b>${g.detail?.[world] ? ` <span class="muted">${esc(g.detail[world])}</span>` : ''}</div>
      ${(g.how_to_fake_it || []).length ? `<div class="fake"><b>How to fake it:</b> ${g.how_to_fake_it.map(esc).join(' · ')}</div>` : ''}
      ${g.source ? `<span class="src nerd-only">${esc(g.source)}</span>` : ''}</div>`)
    .join('')}`;
}

export function blindCard(blind, error) {
  const title = `<h3>Blind test</h3>`;
  if (error) return `${title}<p class="empty">Waiting for <code>blind_test.json</code>.</p><p class="muted">Shows where famous analog sites rank, with no site names given to the engine.</p>`;
  // Strict format from pipeline/blind_test.py: % of Earth land cells scoring higher (lower = better, random = 50%).
  if (blind.per_site_mean_top_percent) {
    const perTarget = Object.entries(blind.per_target || {})
      .map(([t, v]) => `<tr><td>${esc(t)}</td><td>top ${fmt(v.median_top_percent)}%</td></tr>`).join('');
    const rows = Object.entries(blind.per_site_mean_top_percent)
      .sort((a, b) => a[1] - b[1])
      .map(([name, p]) => `<tr><td>${p <= 25 ? '✅' : p <= 50 ? '➖' : '❌'} ${esc(name)}</td><td>top ${fmt(p)}%</td></tr>`).join('');
    return `${title}
      <p class="muted">The engine was never told about these famous analog sites. Lower is better; a random place averages <b>top 50%</b>.</p>
      <h4>Each site, averaged over all targets</h4><table class="kv">${rows}</table>
      <h4 class="nerd-only">Median known site, per target</h4><table class="kv nerd-only">${perTarget}</table>
      <span class="src nerd-only">${esc(blind.method || '')}</span>`;
  }
  const r = blind.recall || {};
  const rows = (blind.known_analogs || [])
    .map((k) => `<tr><td>${k.in_top_n ? '✅' : '❌'} ${esc(k.name)}</td><td>${k.rank != null ? `#${fmt(k.rank)}` : '—'}</td></tr>`)
    .join('');
  return `${title}
    <p><span class="score-big">${fmt(r.found ?? 0)} of ${fmt(r.total ?? (blind.known_analogs || []).length)}</span></p>
    <p class="muted">known analogs ranked in the top ${fmt(blind.top_n ?? '?')} cells${blind.target ? ` for ${esc(blind.target)}` : ''}, with no site names given to the engine.</p>
    <table class="kv">${rows}</table>
    ${blind.illustrative ? '<p class="ai-label">Illustrative data</p>' : ''}`;
}

export function statusCard(files, wanted) {
  const items = wanted
    .map((f) => {
      const have = files.has(f);
      return `<li class="${have ? 'ok' : ''}">${have ? '✓' : '…'} ${esc(f)}</li>`;
    })
    .join('');
  return `<h3>Data status</h3><p class="muted">Files in <code>data/processed</code> that this screen reads.</p><ul class="status-list">${items}</ul>`;
}

/** Mission Twin card: current segment, match quality bar, fingerprint, gaps, itinerary. */
export function missionCard(m, i) {
  const segs = m.segments || [];
  const seg = segs[i];
  if (!seg) return `<h3>Mission Twin</h3><p class="empty">mission_twin.json has no segments.</p>`;
  const q = typeof seg.match === 'number' ? seg.match : null;
  const qColor = q == null ? '#555' : q >= 0.7 ? '#6fd18b' : q >= 0.5 ? '#ffcc4d' : '#ff6b5a';
  const quality = q == null
    ? '<p class="empty">No good Earth match for this segment.</p>'
    : `<div class="qbar"><i style="width:${Math.round(q * 100)}%;background:${qColor}"></i></div>
       <p class="muted">Match quality ${fmt(q)}${q < 0.5 ? ' · weak match, shown on purpose' : ''}</p>`;
  const keys = [...new Set([...Object.keys(seg.planet || {}), ...Object.keys(seg.earth || {})])];
  const fp = keys.length
    ? `<h4>Segment fingerprint</h4><table class="kv"><tr><td></td><td class="muted">${esc(cap(m.planet?.world || 'planet'))} · Earth</td></tr>${keys
        .map((k) => {
          const meta = featureMeta(k);
          const pv = seg.planet?.[k];
          const ev = seg.earth?.[k];
          const show = (v) => (v === null || v === undefined ? '<span class="pending">pending</span>' : esc(typeof v === 'number' ? withUnit(fmt(v), meta.unit) : v));
          return `<tr><td><span class="normal-only">${esc(meta.normal)}</span><span class="nerd-only">${esc(meta.nerd)}</span></td><td>${show(pv)} · ${show(ev)}</td></tr>`;
        })
        .join('')}</table>`
    : '';
  const gaps = (seg.gaps || []).length ? `<h4>Earth can't do this here</h4><p>${seg.gaps.map(esc).join(' · ')}</p>` : '';
  const itin = (m.itinerary || []).length
    ? `<h4>Rehearsal itinerary</h4><ol class="itin">${m.itinerary
        .map((it) => `<li class="${it.segment === seg.id ? 'now' : ''}">${it.day != null ? `Day ${esc(it.day)}, ` : ''}${esc(it.time || '')}${it.time ? ': ' : ''}${esc(it.text || '')}</li>`)
        .join('')}</ol>`
    : '';
  const mean = segs.filter((x) => typeof x.match === 'number').reduce((a, x, _, arr) => a + x.match / arr.length, 0);
  const strip = `<div class="seg-strip" role="list" aria-label="Segments by match quality">${segs
    .map((x, k) => {
      const c = typeof x.match !== 'number' ? '#555' : x.match >= 0.7 ? '#6fd18b' : x.match >= 0.5 ? '#ffcc4d' : '#ff6b5a';
      return `<button class="seg ${k === i ? 'now' : ''}" data-seg="${k}" style="background:${c}" title="Segment ${k + 1}: ${esc(x.label || '')}, match ${typeof x.match === 'number' ? fmt(x.match) : 'none'}"></button>`;
    })
    .join('')}</div>
    <p class="muted strip-legend"><span style="color:#6fd18b">■</span> good · <span style="color:#ffcc4d">■</span> fair · <span style="color:#ff6b5a">■</span> weak · <span style="color:#888">■</span> no Earth match. Click a block to jump there.</p>`;
  const intro = `<p class="mt-intro">Rehearse a real Mars drive on Earth. <b>${esc(m.planet?.rover || 'The rover')}</b> drove this route${m.distance_km ? ` (${fmt(m.distance_km)} km)` : ''}; we searched ${(m.candidates || []).length || 'several'} Earth regions for a path with the same sequence of slopes and climbs. Best twin: <b>${esc(m.earth?.site || 'Earth')}</b>, average segment match ${fmt(mean)}. <span style="color:#e0703a">●</span> ${esc(m.planet?.rover || 'Rover')} · <span style="color:#4aa3ff">●</span> Earth twin: each segment plays at the same moment on both worlds.</p>`;
  return `<h3>Mission Twin <span class="chip">${esc(m.mission || '')}</span></h3>
    ${m.illustrative ? '<p class="ai-label">Illustrative data</p>' : ''}
    ${intro}${strip}
    <p><b>Segment ${i + 1} of ${segs.length}</b>${seg.label ? ` · ${esc(seg.label)}` : ''}${seg.length_m ? ` <span class="muted">(${fmt(seg.length_m)} m)</span>` : ''}${seg.sols ? ` <span class="muted">· Perseverance drove it on sol${String(seg.sols).includes('-') ? 's' : ''} ${esc(seg.sols)}</span>` : ''}</p>
    ${quality}${fp}${gaps}${itin}
    ${m.timing_note ? `<p class="muted">${esc(m.timing_note)}</p>` : ''}
    ${(m.candidates || []).length ? `<h4 class="nerd-only">Other Earth regions tried</h4><table class="kv nerd-only">${m.candidates.map((c) => `<tr><td>${esc(c.site)}</td><td>mean match ${fmt(c.mean_match)}</td></tr>`).join('')}</table>` : ''}
    ${m.method ? `<span class="src nerd-only">Method: ${esc(m.method)}</span>` : ''}
    <span class="src nerd-only">Route: ${esc(m.planet?.source || 'source missing')}</span>
    <span class="src nerd-only">Earth path: ${esc(m.earth?.source || 'source missing')}</span>`;
}
