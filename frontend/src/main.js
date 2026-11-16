// AI-assisted (Claude): TwinWorlds app wiring.
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './style.css';
import {
  Cartesian2,
  Color,
  LabelStyle,
  VerticalOrigin,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  defined,
  NearFarScalar,
  DistanceDisplayCondition,
  Cartesian3,
} from 'cesium';
import { createPlanetViewer, createEarthViewer, toCartesian, toLonLat, flyHome, flyToPoint } from './globes.js';
import { load, dataIndex, indexGrid, normalizeScores, cellKey } from './data.js';
import { buildHeat, addHeatLayer, rampCss } from './heatmap.js';
import { buildEarthModel, scoreLive, indexPlanetGrid } from './livescore.js';
import { TwinDive } from './dive.js';
import { MissionTwin } from './mission.js';
import { marsLs, seasonName, earthWeek, compareWeek } from './timesim.js';
import { loadEarthMonthly, earthGridAt, marsTempsAt, timeline } from './timetravel.js';
import * as N from './nerd.js';
import { drawZones, zoneProfile } from './zones.js';
import { addRehearseLayer, rehearseIndex } from './rehearse.js';
import { setSun, clearSun } from './sun.js';
import { DIVE_PAIRS, HERO_PAIRS, DIVE_VIEW, WORLDS } from './config.js';
import { radarChart, overlayChart, sourcesHtml } from './charts.js';
import { apiEnabled, askPlanet, analyst, whatIf, whenBest, liveNow, fieldBrief } from './api.js';
import * as P from './panels.js';

const $ = (id) => document.getElementById(id);
queueMicrotask(() => { if (import.meta.env.DEV) { window.__tw = state; window.__P = P; } });

const state = {
  world: 'mars',
  targets: [],
  target: null,
  scores: null,
  scoresError: null,
  heat: null,
  heatLayer: null,
  weights: null, // null = the scores file's own lens
  lensLabel: '',
  lenses: null,
  grid: null,
  gaps: null,
  sites: null,
  cell: null,
  planet: null,
  earth: null,
  dive: null,
  radar: null,
  mission: null, // mission_twin.json
  mt: null, // MissionTwin playback
  nerdCharts: [],
};

const WANTED = ['targets.json', 'missions.json', 'earth_grid.json', 'earth_places.json', 'earth_monthly.json', 'mars_grid.json', 'moon_grid.json', 'mars_seasonal.json', 'mars_diurnal.json', 'lenses.json', 'sites.json', 'gaps.json', 'blind_test.json', 'mission_twin_perseverance.json', 'mission_twin_curiosity.json', 'minerals.json', 'spectra.json', 'thermal_inertia.json', 'rehearsability.json', 'mars_sky.json'];

// ---------- boot ----------
async function boot() {
  const targets = await load('targets.json');
  const missions = await load('missions.json');
  state.missions = missions.ok ? missions.data.missions || [] : [];
  state.missionsSource = missions.ok ? missions.data.source : '';
  state.targets = targets.ok ? targets.data.targets || [] : [];
  if (!targets.ok) toast(`Can't read targets.json: ${targets.error}`);

  state.earth = await createEarthViewer($('earth-globe'));
  state.earth.onSourcesChanged = () => renderSources();
  wireEarthClicks();
  await setWorld('mars');

  // Everything else loads in the background; each card waits for its own file.
  loadSide();
  wireUi();
  refreshStatus();
}

async function loadSide() {
  const [lenses, gaps, blind, sites, grid] = await Promise.all(
    ['lenses.json', 'gaps.json', 'blind_test.json', 'sites.json', 'earth_grid.json'].map(load),
  );
  // Mission Twins: one file per rover, mission_twin_<id>.json.
  const twinFiles = [...(await dataIndex())].filter((f) => /^mission_twin_[a-z0-9_]+\.json$/.test(f));
  state.missionTwins = (await Promise.all(twinFiles.map(load))).filter((r) => r.ok && r.data?.planet?.path?.length).map((r) => r.data);
  // Place names (optional file): same cell order as earth_grid.json.
  load('earth_places.json').then((pl) => {
    if (!pl.ok || !grid.ok) return;
    const f = grid.data.fields, iLa = f.indexOf('lat'), iLo = f.indexOf('lon');
    const res = grid.data.resolution_deg || 0.5;
    const m = new Map();
    grid.data.cells.forEach((r, i) => m.set(cellKey(r[iLa], r[iLo], res), pl.data.names[pl.data.cells[i]]));
    P.setPlaceLookup((lat, lon) => m.get(cellKey(lat, lon, res)) || '');
    if (state.target) { renderMatch(); resetTime(); renderSky(); }
  });
  updateMissionButton();
  addMissionInvite();
  if (lenses.ok) {
    state.lenses = lenses.data;
    const sel = $('lens-select');
    for (const l of lenses.data.lenses || []) sel.add(new Option(l.name || l.id, l.id));
  }
  state.gaps = gaps;
  renderGaps();
  $('card-blind').innerHTML = P.blindCard(blind.data, blind.ok ? null : blind.error);
  if (sites.ok) {
    state.sites = sites.data;
    drawSites();
  }
  if (grid.ok) {
    state.gridRaw = grid.data;
    state.grid = indexGrid(grid.data);
    renderSources();
    renderBadges();
    if (state.cell) selectCell(state.cell.lat, state.cell.lon, false);
  }
}

// ---------- worlds and targets ----------
async function setWorld(world) {
  state.dive?.stop();
  stopMission();
  if (state.planet) state.planet.viewer.destroy();
  state.world = world;
  document.body.classList.toggle('world-moon', world === 'moon');
  document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.world === world));
  $('planet-label').textContent = world === 'moon' ? 'Moon' : 'Mars';
  $('planet-globe').innerHTML = '';
  state.planet = await createPlanetViewer($('planet-globe'), world);
  state.dive = new TwinDive(state.planet, state.earth);
  wirePlanetClicks();
  wireReadout();
  updateMissionButton();
  wireFarSideCulling(state.planet.viewer);
  state.rehLayer = null;
  if (state.rehOn) toggleRehearse(true);
  // Earth's viewer lives for the whole session: wire its listeners only once.
  if (!state.earthWired) {
    wireHeatFade();
    wireFarSideCulling(state.earth.viewer);
    state.earthWired = true;
  }
  drawTargets();
  renderSources();

  const list = state.targets.filter((t) => t.world === world);
  const sel = $('target-select');
  sel.innerHTML = '';
  // One dropdown, two groups: real NASA missions, and the challenge's candidate base/landing sites.
  const ms = (state.missions || []).filter((m) => m.world === world);
  if (ms.length) {
    const g1 = document.createElement('optgroup');
    g1.label = world === 'moon' ? 'NASA missions (Apollo)' : 'NASA missions';
    for (const m of ms) g1.appendChild(new Option(m.name, `mission:${m.id}`));
    sel.appendChild(g1);
  }
  const g2 = document.createElement('optgroup');
  g2.label = world === 'moon' ? 'Candidate Moon base sites' : 'Candidate Mars landing sites';
  for (const t of list) g2.appendChild(new Option(t.name, t.id));
  sel.appendChild(g2);
  await selectTarget(list[0]?.id || null);
}

function drawTargets() {
  const v = state.planet.viewer;
  v.entities.removeAll();
  for (const m of (state.missions || []).filter((x) => x.world === state.world)) {
    v.entities.add({
      id: `mission:${m.id}`,
      position: toCartesian(state.world, m.lon, m.lat, 0),
      point: { pixelSize: 9, color: Color.fromCssColorString('#4aa3ff'), outlineColor: Color.WHITE, outlineWidth: 1.5, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: m.name.replace(/ \(.*\)$/, ''),
        font: '500 11px Inter, system-ui, sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, outlineColor: Color.BLACK,
        fillColor: Color.fromCssColorString('#cfe6ff'),
        verticalOrigin: VerticalOrigin.TOP, pixelOffset: new Cartesian2(0, 8),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 9_000_000),
      },
    });
  }
  for (const t of state.targets.filter((x) => x.world === state.world)) {
    v.entities.add({
      id: `target:${t.id}`,
      position: toCartesian(state.world, t.lon, t.lat, 0),
      point: { pixelSize: 11, color: Color.fromCssColorString('#ffb000'), outlineColor: Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: t.name,
        font: '600 13px Inter, system-ui, sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 3,
        outlineColor: Color.BLACK,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -12),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new NearFarScalar(1e5, 1.0, 2e7, 0.75),
      },
    });
  }
}

async function selectTarget(id) {
  state.target = state.targets.find((t) => t.id === id) || null;
  $('target-select').value = id || '';
  $('planet-site').textContent = state.target ? state.target.name : '';
  $('card-target').innerHTML = P.targetCard(state.target, state.world);
  renderDivePairs();
  renderNow();
  renderGround();
  renderSky();
  renderMinerals();
  renderLandsat();
  addMissionInvite();
  state.whatIf = null; state.whatIfDiff = null; state.whatIfBefore = null;
  queueMicrotask(renderWhatIf);
  highlightTarget();
  if (state.target && !state.dive?.active) {
    flyToPoint(state.planet.viewer, state.world, state.target.lon, state.target.lat, null, 1.6);
  }
  state.cell = null;
  clearEarthMarker();
  $('earth-site').textContent = '';
  await loadScores();
  renderGaps();
}

function highlightTarget() {
  for (const e of state.planet.viewer.entities.values) {
    if (!String(e.id).startsWith('target:')) continue;
    const on = state.target && e.id === `target:${state.target.id}`;
    e.point.pixelSize = on ? 15 : 10;
    e.point.color = Color.fromCssColorString(on ? '#ffb000' : '#d9d9d9');
  }
}

// ---------- scores / heatmap ----------
async function loadScores() {
  if (!state._keepWhatIf) { state.whatIf = null; state.whatIfDiff = null; state.whatIfBefore = null; }
  removeHeat();
  state.scores = null;
  state.heat = null;
  state.scoresError = null;
  renderMatch();
  if (!state.target) return;
  if (state.target.live) {
    if (!state.gridRaw) { toast('Earth grid still loading, try again in a moment.'); return; }
    state.earthModel ||= buildEarthModel(state.gridRaw);
    const vals = Object.fromEntries(Object.entries(state.target.features)
      .filter(([, f]) => f?.status === 'sourced' && typeof f.value === 'number').map(([k, f]) => [k, f.value]));
    const res = scoreLive(state.earthModel, vals, { id: 'live', world: state.world, name: state.target.name });
    if (res.error) { state.scoresError = res.error; renderMatch(); renderBadges(); toast(res.error, 5000); return; }
    state.scores = res;
    await drawHeat();
    const best = state.heat?.ranked?.[0];
    if (best && !state.dive?.active) flyToPoint(state.earth.viewer, 'earth', best.lon, best.lat, null, 2);
    return;
  }
  const r = await load(`scores_${state.target.id}.json`);
  if (!r.ok) {
    state.scoresError = r.error;
    renderMatch();
    renderBadges();
    return;
  }
  state.scores = normalizeScores(r.data);
  await drawHeat();
  // Take the viewer straight to Earth's best match for this target.
  const best = state.heat?.ranked?.[0];
  if (best && !state.dive?.active) flyToPoint(state.earth.viewer, 'earth', best.lon, best.lat, null, 2);
}

let _heatSeq = 0;
async function drawHeat() {
  const seq = ++_heatSeq;
  removeHeat();
  if (!state.scores) { resetTime(); return; }
  const heat = buildHeat(state.scores, state.weights, state.lenses?.tier_thresholds || state.scores?.tiers);
  state.heat = heat;
  const credit = `TwinWorlds similarity scores, ${state.target.name}${state.weights ? ` (${state.lensLabel})` : ''}`;
  const layer = await addHeatLayer(state.earth.viewer, heat, credit);
  // A newer target or lens arrived while this layer was loading: drop this one so heatmaps never stack.
  if (seq !== _heatSeq) { state.earth.viewer.imageryLayers.remove(layer, true); return; }
  state.heatLayer = layer;
  if (state.showZones !== false && !state.travelPlaying) state.zones = drawZones(state.earth.viewer, heat);
  $('legend').hidden = false;
  renderBadges();
  renderMatch();
  resetTime();
  if (!_ttBusy && !state.travelPlaying) renderNerd();
  hideSplash();
  renderGround();
  renderSky();
}

function removeHeat() {
  if (state.heatLayer) state.earth.viewer.imageryLayers.remove(state.heatLayer, true);
  state.zones?.remove();
  state.zones = null;
  state.heatLayer = null;
  $('legend').hidden = true;
}

function renderBadges() {
  const b = [];
  if (state.scores?.illustrative) b.push('<span class="badge illustrative">Illustrative data</span>');
  if (state.grid?.illustrative) b.push('<span class="badge illustrative">Illustrative Earth grid</span>');
  if (state.weights) b.push(`<span class="badge info">Lens: ${P.esc(state.lensLabel)}</span>`);
  else if (state.scores?.lens) b.push(`<span class="badge info">Lens: ${P.esc(state.scores.lens.replace(/_/g, ' '))}</span>`);
  $('earth-badges').innerHTML = b.join('');
}

// ---------- Earth cell selection ----------
function selectCell(lat, lon, fly = false) {
  state.cell = { lat, lon };
  const heatCell = state.heat?.get(lat, lon) || null;
  const earthRow = state.grid?.get(lat, lon) || null;
  const cell = heatCell || { lat, lon, score: null, tier: null, dims: {} };
  $('earth-site').textContent = P.placeName(lat, lon) || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  placeEarthMarker(lat, lon);
  if (!state.time_lock) queueMicrotask(resetTime);
  queueMicrotask(renderNerd);
  queueMicrotask(renderGround);
  queueMicrotask(renderSky);
  queueMicrotask(() => renderLandsat());
  if (fly) {
    flyToPoint(state.earth.viewer, 'earth', lon, lat, 900_000, 1.4);
  }
  // With the Earth grid in, a click shows measured values even before scores exist.
  if (!state.scores && !state.grid) {
    renderMatch();
    return;
  }
  state.radar?.destroy();
  $('card-match').innerHTML = P.matchCell({ cell, target: state.target, earthRow, grid: state.grid, apiOn: apiEnabled(), scores: state.scores });
  if (Object.keys(cell.dims || {}).length) state.radar = radarChart($('radar'), cell.dims, (k) => P.featureMeta(k).normal);
  const dh = $('dive-here');
  if (dh) dh.onclick = () => startDive({ lat, lon, name: P.placeName(lat, lon) || `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
  const ex = $('explain-btn');
  if (ex) ex.onclick = () => explain(cell, earthRow);
  const fb = $('brief-btn');
  if (fb) fb.onclick = () => openBrief(cell, earthRow);
}

/** Field Brief: Gemini writes the plan from our numbers; the numbers table is ours, not the AI's. */
async function openBrief(cell, earthRow) {
  const w = window.open('', '_blank');
  if (!w) return toast('Allow pop-ups to open the Field Brief.');
  const place = P.placeName(cell.lat, cell.lon) || `${cell.lat.toFixed(2)}, ${cell.lon.toFixed(2)}`;
  const esc = P.esc;
  const page = (body) => `<!doctype html><html><head><meta charset="utf-8"><title>Field Brief: ${esc(place)}</title>
    <style>body{font:14px/1.5 Inter,system-ui,sans-serif;color:#14182a;max-width:820px;margin:24px auto;padding:0 16px}h1{font-size:24px;margin:0}h2{font-size:15px;margin:18px 0 6px;color:#9a3d17;text-transform:uppercase;letter-spacing:1px}
    .sub{color:#555}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}.ai{font-size:12px;color:#7a4b00;background:#fff4dd;padding:4px 8px;border-radius:4px;display:inline-block}
    .src{font-size:11px;color:#666}button{padding:6px 12px}@media print{button{display:none}}</style></head><body>${body}</body></html>`;
  w.document.write(page('<p>Writing the Field Brief from measured data\u2026</p>'));
  const gaps = (state.gaps?.data?.gaps || []).filter((g) => (g.worlds || []).includes(state.world)).map((g) => ({ gap: g.label, earth: g.earth, there: g[state.world], how_to_fake_it: g.how_to_fake_it }));
  const tiT = state.ti?.ok ? state.ti.data.targets[state.target.id]?.ti : null;
  const tiE = state.ti?.ok ? await tiAt('earth', cell.lat, cell.lon) : null;
  try {
    const gapsSet = new Set(Object.keys(state.scores?.earth_gaps || {}));
    const voteDims = Object.fromEntries(Object.entries(cell.dims || {}).filter(([d]) => !gapsSet.has(d)));
    const r = await fieldBrief({ target: state.target, place, cell: { score: cell.score, top: cell.top, dims: voteDims }, earth: earthRow,
      beyondEarth: state.scores?.earth_gaps || null, gaps, ground: { target_thermal_inertia: tiT, earth_apparent_thermal_inertia: tiE, note: 'model estimate; Earth values read high' } });
    const b = r.brief;
    const list = (a) => `<ul>${(a || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const dims = Object.entries(cell.dims || {}).map(([d, v]) => `<tr><td>${esc(P.featureMeta(d).normal)}</td><td>${typeof v === 'number' ? v.toFixed(2) : '\u2014'}</td><td>${esc(String(earthRow?.[d] ?? '\u2014'))}</td></tr>`).join('');
    w.document.open();
    w.document.write(page(`<button onclick="print()">Print / save as PDF</button>
      <h1>${esc(b.title || `Field Brief: ${place}`)}</h1>
      <p class="sub">TwinWorlds Field Brief \u00b7 ${esc(place)} as an analog for ${esc(state.target.name)} \u00b7 score ${typeof cell.score === 'number' ? cell.score.toFixed(2) : '\u2014'}${typeof cell.top === 'number' ? ` (top ${cell.top.toFixed(1)}% of Earth)` : ''}</p>
      <p class="ai">Text below the line is AI-generated (Gemini) from TwinWorlds measured data; the table is the data itself.</p>
      <h2>Measured match</h2><table><tr><th>Measurement</th><th>Similarity (0 to 1)</th><th>Earth value</th></tr>${dims}</table>
      <hr>
      <h2>Why here</h2><p>${esc(b.why_here)}</p>
      <h2>What matches</h2>${list(b.what_matches)}
      <h2>What does not</h2>${list(b.what_does_not)}
      <h2>Tests to run</h2>${list(b.tests_to_run)}
      <h2>Hardware for what Earth can\u2019t do</h2>${list(b.hardware_for_the_gaps)}
      <h2>When to go</h2><p>${esc(b.when_to_go)}</p>
      <p class="src">Data: NASA MODIS 2023, USGS GMTED2010, MGS MOLA/TES, Mars Climate Database, LRO LOLA/Diviner. Model: ${esc(r.model || 'Gemini')}. twinworlds.us</p>`));
    w.document.close();
  } catch (e) {
    w.document.open(); w.document.write(page(`<p>Could not write the brief: ${esc(e.message)}</p>`)); w.document.close();
  }
}

function renderMatch() {
  if (state.cell && (state.scores || state.grid)) return selectCell(state.cell.lat, state.cell.lon);
  state.radar?.destroy();
  state.radar = null;
  $('card-match').innerHTML = P.matchEmpty({ target: state.target, scoresError: state.scoresError, heat: state.heat, scores: state.scores, exclude: benchmarkFilter(), spread: !!state.spread });
  document.querySelectorAll('[data-spread]').forEach((b) => b.addEventListener('click', () => { state.spread = b.dataset.spread === '1'; renderMatch(); }));
  document.querySelectorAll('.top-row').forEach((tr) =>
    tr.addEventListener('click', () => selectCell(+tr.dataset.lat, +tr.dataset.lon, true)),
  );
}

let earthMarker = null;
function placeEarthMarker(lat, lon) {
  clearEarthMarker();
  earthMarker = state.earth.viewer.entities.add({
    position: toCartesian('earth', lon, lat, 0),
    point: { pixelSize: 12, color: Color.fromCssColorString('#4aa3ff'), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
}
function clearEarthMarker() {
  if (earthMarker) state.earth.viewer.entities.remove(earthMarker);
  earthMarker = null;
}

function benchmarkFilter() {
  if (!state.undiscovered) return null;
  const bench = (state.sites?.sites || []).filter((s) => String(s.tag).toLowerCase() === 'benchmark');
  return (c) => bench.some((b) => Math.abs(b.lat - c.lat) <= 3 && Math.abs(((b.lon - c.lon + 540) % 360) - 180) <= 3);
}

function drawSites() {
  for (const s of state.sites?.sites || []) {
    const tag = String(s.tag || '').toLowerCase();
    if (state.undiscovered && tag === 'benchmark') continue;
    state.earth.viewer.entities.add({
      id: `site:${s.id}`,
      position: toCartesian('earth', s.lon, s.lat, 0),
      point: { pixelSize: 8, color: Color.fromCssColorString(tag === 'emerging' ? '#6fd18b' : '#c9ccd3'), outlineColor: Color.BLACK, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: `${s.name}${tag ? ` · ${tag[0].toUpperCase()}${tag.slice(1)}` : ''}`,
        font: '500 12px Inter, system-ui, sans-serif',
        style: LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 3,
        outlineColor: Color.BLACK,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian2(0, -10),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        // Names appear once you zoom in; from orbit the sites are just dots (no label pile-up).
        distanceDisplayCondition: new DistanceDisplayCondition(0, 4_500_000),
      },
    });
  }
}

// ---------- clicks ----------
function wireEarthClicks() {
  const v = state.earth.viewer;
  const h = new ScreenSpaceEventHandler(v.scene.canvas);
  h.setInputAction((e) => {
    const picked = v.scene.pick(e.position);
    if (defined(picked) && typeof picked.id?.id === 'string' && picked.id.id.startsWith('site:')) {
      const s = state.sites.sites.find((x) => `site:${x.id}` === picked.id.id);
      if (s) {
        selectCell(s.lat, s.lon);
        $('earth-site').textContent = s.name;
        return loadNerd(s);
      }
    }
    const ray = v.camera.getPickRay(e.position);
    const p = (ray && v.scene.globe.pick(ray, v.scene)) || v.camera.pickEllipsoid(e.position);
    if (!p) return;
    const ll = toLonLat('earth', p);
    if (ll) selectCell(ll.lat, ll.lon);
  }, ScreenSpaceEventType.LEFT_CLICK);
}

function wirePlanetClicks() {
  const v = state.planet.viewer;
  const h = new ScreenSpaceEventHandler(v.scene.canvas);
  h.setInputAction((e) => {
    const picked = v.scene.pick(e.position);
    const id = picked?.id?.id;
    if (typeof id === 'string' && id.startsWith('target:') && id !== 'target:live') return selectTarget(id.slice(7));
    if (typeof id === 'string' && id.startsWith('mission:')) return selectMission(id.slice(8));
    // Anywhere else: score that exact spot against all of Earth, live.
    let p = v.scene.pickPositionSupported ? v.scene.pickPosition(e.position) : undefined;
    if (!defined(p)) p = v.camera.pickEllipsoid(e.position, WORLDS[state.world].ellipsoid);
    if (!defined(p)) return;
    const ll = toLonLat(state.world, p);
    if (ll) selectLiveSpot(ll.lat, ll.lon);
  }, ScreenSpaceEventType.LEFT_CLICK);
}

// ---------- Click anywhere on Mars / the Moon ----------
const LIVE_SOURCES = { ndvi: 'No vegetation (target value by definition)' };
async function selectMission(id) {
  const m = (state.missions || []).find((x) => x.id === id);
  if (!m) return;
  if (m.world !== state.world) await setWorld(m.world);
  if (!state.dive?.active) flyToPoint(state.planet.viewer, state.world, m.lon, m.lat, null, 1.6);
  await selectLiveSpot(m.lat, m.lon, { id: `mission:${m.id}`, name: m.name, why: `${m.why}. Its landing spot is scored live against all of Earth.`, mission: m });
}

async function toggleRehearse(on) {
  state.rehOn = on;
  $('reh-btn').setAttribute('aria-pressed', String(on));
  document.querySelector('.reh-legend').hidden = !on;
  const v = state.planet.viewer;
  if (state.rehLayer) { v.imageryLayers.remove(state.rehLayer, true); state.rehLayer = null; }
  // Mars and the Moon draw as 3D tiles, which hide the globe and its image layers: while the map is on,
  // show the flat NASA Trek globe with the map on top, and put the 3D tiles back afterwards.
  const ts = state.planet.tileset;
  if (ts) { ts.show = !on; v.scene.globe.show = on; }
  if (!on) return;
  state.reh ||= await load('rehearsability.json');
  if (!state.reh.ok) { toast('Rehearsability map needs rehearsability.json in data/processed.'); return; }
  const W = state.reh.data.worlds[state.world];
  if (!W) return;
  state.rehLayer = await addRehearseLayer(v, state.world, W);
  toast('Rehearsability Map: green = Earth can rehearse it well, red = analog desert (bottom 10% of this world). Click anywhere for details.', 7000);
}

function rehearseInfo(lat, lon) {
  if (!state.rehOn || !state.reh?.ok) return;
  const W = state.reh.data.worlds[state.world];
  const idx = (state.rehIdx ||= {})[state.world] ||= rehearseIndex(W);
  const c = idx.get(lat, lon);
  if (!c) return;
  const f = W.fields, g = (k) => c[f.indexOf(k)];
  const r = g('rehearsability');
  if (r == null) return toast('Rehearsability: not enough measurements here.');
  const pct = Math.round(idx.rank(r) * 100);
  const desert = r <= W.deserts_below;
  toast(`${desert ? 'Analog desert. ' : ''}Rehearsability ${r.toFixed(2)} (better than ${pct}% of ${state.world === 'moon' ? 'the Moon' : 'Mars'}). Best Earth place: ${W.places[g('place')] || '?'} (score ${g('best_score').toFixed(2)}); Earth reaches ${Math.round(g('coverage') * 100)}% of the measurements${g('dims_beyond_earth') ? `, ${g('dims_beyond_earth')} beyond anything on Earth` : ''}.`, 9000);
}

async function selectLiveSpot(lat, lon, meta = {}) {
  rehearseInfo(lat, lon);
  const file = `${state.world}_grid.json`;
  state.planetGrids ||= {};
  if (!state.planetGrids[state.world]) {
    const r = await load(file);
    if (!r.ok) return toast(`Click-anywhere needs ${file} in data/processed.`, 5000);
    state.planetGrids[state.world] = indexPlanetGrid(r.data);
  }
  const g = state.planetGrids[state.world];
  const cell = g.get(lat, lon);
  if (!cell) return toast('No data for that spot.');
  const features = {};
  for (const [k, v] of Object.entries(cell)) {
    if (k === 'lat' || k === 'lon') continue;
    features[k] = typeof v === 'number'
      ? { value: v, status: 'sourced', source: g.sources[k] || file }
      : { value: null, status: 'pending', source: g.sources[k] || 'not available for this spot' };
  }
  features.ndvi = { value: 0, status: 'sourced', source: LIVE_SOURCES.ndvi };
  for (const k of ['lst_day_c', 'lst_night_c', 'lst_swing_c']) {
    if (!features[k]) features[k] = { value: null, status: 'pending', source: 'Planet-wide temperature maps not added yet' };
  }
  const label = `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? 'E' : 'W'}`;
  state.target = {
    id: meta.id || 'live', live: true, world: state.world, lat: cell.lat, lon: cell.lon,
    name: meta.name || `${state.world === 'moon' ? 'Moon' : 'Mars'} spot ${label}`,
    why: meta.why || `Any spot you click is scored live against all of Earth (${g.res}° cell).`,
    mission: meta.mission || null,
    site: meta.mission ? { lat: meta.mission.lat, lon: meta.mission.lon } : null,
    coords_note: meta.mission ? `Landing site ${label}. ${state.missionsSource || ''}` : undefined,
    features,
  };
  $('target-select').value = meta.id || '';
  $('planet-site').textContent = state.target.name;
  $('card-target').innerHTML = P.targetCard(state.target, state.world);
  addMissionInvite();
  state.whatIf = null; state.whatIfDiff = null; state.whatIfBefore = null;
  queueMicrotask(renderWhatIf);
  placeLiveMarker(cell.lat, cell.lon);
  highlightTarget();
  queueMicrotask(() => { renderSky(); renderGround(); renderNow(); renderMinerals(); });
  state.cell = null;
  clearEarthMarker();
  $('earth-site').textContent = '';
  await loadScores();
  renderGaps();
}

function placeLiveMarker(lat, lon) {
  const ents = state.planet.viewer.entities;
  const old = ents.getById('target:live');
  if (old) ents.remove(old);
  ents.add({
    id: 'target:live',
    position: toCartesian(state.world, lon, lat, 0),
    point: { pixelSize: 15, color: Color.fromCssColorString('#ffb000'), outlineColor: Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY },
  });
}

// ---------- Twin Dive ----------
function renderDivePairs() {
  const sel = $('dive-pair');
  const pairs = (state.target && HERO_PAIRS[state.target.id]) || [];
  sel.innerHTML = `<option value="">Land on: ${state.cell ? 'the place you clicked' : 'best score match'}</option>`
    + pairs.map((p, i) => `<option value="${i}">Hero pair: ${P.esc(p.name)}</option>`).join('');
  sel.hidden = !pairs.length;
}

function diveEarthSite() {
  const pick = $('dive-pair').value;
  const pairs = (state.target && HERO_PAIRS[state.target.id]) || [];
  if (pick !== '' && pairs[+pick]) {
    const p = pairs[+pick];
    return { ...p, source: `${p.source}. Hand-picked for a shared process (${p.why}), not by score.` };
  }
  if (state.cell) return { ...state.cell, name: $('earth-site').textContent };
  const top = state.heat?.ranked?.[0];
  if (top) return { lat: top.lat, lon: top.lon, name: P.placeName(top.lat, top.lon) || 'best match' };
  return null;
}

async function startDive(earthSite = diveEarthSite()) {
  if (!state.target) return toast('Pick a target first.');
  if (!earthSite) return toast('Click a spot on Earth first, so Twin Dive knows where to land.');
  $('earth-site').textContent = earthSite.name || `${earthSite.lat.toFixed(2)}, ${earthSite.lon.toFixed(2)}`;
  placeEarthMarker(earthSite.lat, earthSite.lon);
  if (earthSite.source) toast(`Earth site: ${earthSite.name}. Source: ${earthSite.source}`, 6000);
  await state.dive.start({ lat: state.target.lat, lon: state.target.lon }, earthSite);
}

// Markers draw on top of terrain (disableDepthTestDistance), which also lets them show
// THROUGH the planet from the far side. Hide any marker whose spot faces away from the camera.
const _n = new Cartesian3();
const _v = new Cartesian3();
function wireFarSideCulling(viewer) {
  viewer.scene.postRender.addEventListener(() => {
    const cam = viewer.camera.positionWC;
    const time = viewer.clock.currentTime;
    for (const e of viewer.entities.values) {
      const p = e.position?.getValue(time);
      if (!p) continue;
      Cartesian3.normalize(p, _n);
      Cartesian3.subtract(cam, p, _v);
      const facing = Cartesian3.dot(_n, _v) > 0;
      if (e.show !== facing) e.show = facing;
    }
  });
}

// The heatmap is 55 km cells: great from orbit, a flat coloured sheet up close.
// Fade it with camera height so close-ups show the real ground (Twin Dive, clicks).
function wireHeatFade() {
  const v = state.earth.viewer;
  const FULL = 0.7, FAR = 1_500_000, NEAR = 150_000;
  v.scene.postRender.addEventListener(() => {
    if (!state.heatLayer) return;
    const h = v.camera.positionCartographic?.height ?? FAR;
    const a = FULL * Math.max(0, Math.min(1, (h - NEAR) / (FAR - NEAR)));
    if (Math.abs(state.heatLayer.alpha - a) > 0.01) state.heatLayer.alpha = a;
  });
}

function wireReadout() {
  let last = 0;
  state.planet.viewer.scene.postRender.addEventListener(() => {
    const now = performance.now();
    if (now - last < 200) return;
    last = now;
    if (state.mt) {
      $('mt-seek').value = String(Math.round(state.mt.t * 1000));
      $('mt-play').textContent = state.mt.playing ? '❚❚' : '▶';
    }
    const r = state.dive?.readout();
    $('dive-readout').textContent = r
      ? `Synced · altitude ${(r.altitudeM / 1000).toFixed(1)} km · heading ${r.headingDeg.toFixed(0)}° · pitch ${r.pitchDeg.toFixed(0)}°`
      : '';
  });
}

// ---------- Nerd Mode charts (nerd_<site>.json) ----------
/** A site marker opens that place in the match card (and the Nerd panel in Nerd Mode). */
async function loadNerd(site) {
  selectCell(site.lat, site.lon, true);
}

// ---------- Splash ----------
// Wait until the heatmap is drawn AND the globes have their first tiles (or 4 s), so the reveal is not a pop-in.
let _splashDone = false;
async function hideSplash(force = false) {
  if (_splashDone) return;
  if (!force) {
    const t0 = performance.now();
    const settled = () => (state.earth?.viewer.scene.globe.tilesLoaded ?? true)
      && (state.planet?.tileset ? state.planet.tileset.tilesLoaded !== false : (state.planet?.viewer.scene.globe.tilesLoaded ?? true));
    while (!settled() && performance.now() - t0 < 4000) await new Promise((r) => setTimeout(r, 150));
  }
  if (_splashDone) return;
  _splashDone = true;
  const el = document.getElementById('splash');
  document.body.classList.add('ready');
  if (el) { el.classList.add('out'); setTimeout(() => el.remove(), 900); }
}
setTimeout(() => hideSplash(true), 12000);

// ---------- Drawer tabs ----------
// Science and Explore cards render only when their tab is open (saves ~1.5 MB and work on first load).
const _dirty = new Set();
const tabOpen = (t) => document.querySelector('.drawer-body')?.dataset.tab === t || window.innerWidth <= 820;
function showTab(name) {
  const body = document.querySelector('.drawer-body');
  if (!body) return;
  body.dataset.tab = name;
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
    if (on) { const ink = document.querySelector('.tab-ink'); if (ink) { ink.style.left = `${b.offsetLeft}px`; ink.style.width = `${b.offsetWidth}px`; } }
  });
  body.scrollTop = 0;
  body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap');
  const fns = { renderSky, renderGround, renderMinerals, renderLandsat };
  for (const f of [..._dirty]) if (({ renderSky: 'science', renderGround: 'science', renderMinerals: 'science', renderLandsat: 'explore' })[f] === name) { _dirty.delete(f); fns[f](); }
}

// ---------- Story Mode: a scripted ~30 s tour for the demo video ----------
let _story = null;
async function playStory() {
  if (_story) { _story.stop = true; $('story-cap').hidden = true; _story = null; $('story-btn').textContent = '\u25b6 Story'; return; }
  const me = (_story = { stop: false });
  $('story-btn').textContent = '\u25a0 Stop';
  const cap = $('story-cap');
  const say = (t) => { cap.hidden = false; cap.innerHTML = t; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const step = async (ms, fn) => { if (me.stop) throw new Error('stopped'); await fn?.(); await wait(ms); };
  try {
    state.dive?.stop(); stopMission();
    if (state.world !== 'mars') await setWorld('mars');
    await step(3000, async () => { say('<b>TwinWorlds.</b> Rovers get one shot on Mars. Where on Earth do you practise?'); flyHome(state.earth.viewer, 'earth', 1.5); });
    await step(4500, async () => { say('Pick a real site: <b>Jezero crater</b>, where Perseverance landed. All 79,625 land cells on Earth are scored on the same measurements.'); await selectTarget('jezero'); });
    await step(4500, async () => { say('We never told it about the Atacama. It still ranked it in the <b>top 1.4%</b> of Earth.'); flyToPoint(state.earth.viewer, 'earth', -69.9, -24.1, 2_500_000, 2); });
    await step(4000, async () => { say('And it finds places nobody uses: <b>Chagai Hills, Pakistan</b>, top 1% for Jezero.'); flyToPoint(state.earth.viewer, 'earth', 62.8, 29.1, 2_500_000, 2); });
    await step(6000, async () => { say('<b>Twin Dive:</b> both worlds, same scale, side by side.'); await startDive(); });
    await step(8000, async () => { say('<b>Mission Twin:</b> Perseverance\u2019s real route, driven on a matched path in Altyn-Tagh, China. 15 of 16 segments match.'); await startMission(); });
    await step(4000, () => say('Before a rover drives a meter on Mars, <b>drive it on Earth.</b> &nbsp;twinworlds.us'));
  } catch (e) { /* stopped */ }
  if (_story === me) { _story = null; $('story-btn').textContent = '\u25b6 Story'; setTimeout(() => { if (!_story) cap.hidden = true; }, 3000); }
}

// ---------- Landsat then and now (1985-1990 vs 2023-2024) ----------
let _landsat = null;
async function renderLandsat(pickId) {
  if (!tabOpen('explore')) { _dirty.add('renderLandsat'); return; }
  const card = $('card-landsat');
  if (!_landsat) {
    try { const r = await fetch('/landsat/index.json', { cache: 'no-store' }); _landsat = r.ok && (r.headers.get('content-type') || '').includes('json') ? await r.json() : { sites: [] }; }
    catch { _landsat = { sites: [] }; }
  }
  const sites = (_landsat.sites || []).filter((x) => x.then && x.now);
  if (!sites.length) { card.hidden = true; return; }
  const c = state.cell;
  const near = c ? sites.map((x) => [x, Math.hypot(x.lat - c.lat, x.lon - c.lon)]).sort((a, b) => a[1] - b[1])[0] : null;
  const site = sites.find((x) => x.id === pickId) || (near && near[1] < 1.5 ? near[0] : null) || sites.find((x) => x.id === state.landsatPick) || sites[0];
  state.landsatPick = site.id;
  card.hidden = false;
  card.innerHTML = `<h3>Then and now (Landsat)</h3>
    <label class="muted">Site <select id="ls-pick">${sites.map((x) => `<option value="${x.id}" ${x.id === site.id ? 'selected' : ''}>${P.esc(x.name)}</option>`).join('')}</select></label>
    <div class="ls-compare" id="ls-compare">
      <img src="/landsat/${encodeURI(site.now)}" alt="${P.esc(site.name)}, Landsat 8/9, 2023 to 2024">
      <div class="ls-then" id="ls-then"><img src="/landsat/${encodeURI(site.then)}" alt="${P.esc(site.name)}, Landsat 5, 1985 to 1990"></div>
      <span class="ls-tag l">1985\u20131990</span><span class="ls-tag r">2023\u20132024</span>
    </div>
    <input type="range" id="ls-slider" min="0" max="100" value="50" aria-label="Slide between 1985 and now">
    <p class="muted">Drag to compare. Same place, same colours: lakes, ice, dunes and fields that changed show up. ${site.then_scenes} and ${site.now_scenes} cloud-free scene medians.</p>
    <span class="src">${P.esc(_landsat.source || '')}</span>`;
  const set = (v) => { $('ls-then').style.clipPath = `inset(0 ${100 - v}% 0 0)`; };
  set(50);
  $('ls-slider').addEventListener('input', (e) => set(+e.target.value));
  $('ls-pick').addEventListener('change', (e) => renderLandsat(e.target.value));
}

// ---------- Sky: dust, water and UV shield, Mars (MCD) vs the Earth place (NASA POWER) ----------
const _powerCache = new Map();
async function powerAt(lat, lon) {
  const k = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (!_powerCache.has(k)) {
    _powerCache.set(k, (async () => {
      const r = await fetch(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=AOD_55,PW,ALLSKY_SFC_UV_INDEX&community=RE&longitude=${lon.toFixed(3)}&latitude=${lat.toFixed(3)}&format=JSON`);
      if (!r.ok) throw new Error(`NASA POWER returned ${r.status}`);
      return (await r.json()).properties.parameter;
    })());
  }
  return _powerCache.get(k);
}

let _skySeq = 0;
async function renderSky() {
  if (!tabOpen('science')) { _dirty.add('renderSky'); return; }
  const card = $('card-sky');
  const seq = ++_skySeq;
  if (!state.target) { card.hidden = true; return; }
  const spot = state.cell || (state.heat?.ranked?.[0] && { lat: state.heat.ranked[0].lat, lon: state.heat.ranked[0].lon, name: state.heat.ranked[0].name || state.heat.ranked[0].place });
  const place = spot ? (spot.name || P.placeName(spot.lat, spot.lon) || `${spot.lat.toFixed(2)}, ${spot.lon.toFixed(2)}`) : null;
  const moon = state.world === 'moon';
  let mars = null;
  if (!moon) {
    state.sky ||= await load('mars_sky.json');
    mars = state.sky.ok ? state.sky.data.targets[state.target.id] : null;
    // Click-anywhere: use the nearest modelled Mars point if it is within 1,500 km, and say so.
    if (!mars && state.sky.ok) {
      const near = Object.values(state.sky.data.targets).map((x) => [x, marsKm(state.target, x)]).sort((a, b) => a[1] - b[1])[0];
      if (near && near[1] < 1500) mars = { ...near[0], nearKm: near[1] };
    }
  }
  if (!moon && !mars) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = '<h3>Sky: dust, water, UV</h3><p class="muted">Loading NASA POWER climate data\u2026</p>';
  let E = null, err = '';
  try { if (spot) E = await powerAt(spot.lat, spot.lon); } catch (e) { err = e.message; }
  if (seq !== _skySeq) return;
  const ann = (k) => (E && E[k] && E[k].ANN > -900 ? E[k].ANN : null);
  const f = (x, d = 2) => (x == null ? '\u2014' : x.toFixed(d));
  const tName = P.esc(state.target.name);
  const rows = moon ? [
    ['Dust haze (column optical depth)', '0 (no air)', f(ann('AOD_55'))],
    ['Water vapour (mm of rain if it all fell)', '0 (no air)', f(ann('PW') != null ? ann('PW') * 10 : null, 1)],
    ['UV shield (ozone)', 'none', 'about 300 DU (Earth average)'],
  ] : [
    ['Dust haze (column optical depth)', `${f(mars.mean.dust)} <span class="muted">(up to ${f(mars.max.dust)})</span>`, f(ann('AOD_55'))],
    ['Water vapour (mm of rain if it all fell)', `${f(mars.mean.water_mm, 3)}`, f(ann('PW') != null ? ann('PW') * 10 : null, 1)],
    ['UV shield (ozone, Dobson units)', `${f(mars.mean.ozone_du, 2)}`, 'about 300 (Earth average)'],
  ];
  const uv = ann('ALLSKY_SFC_UV_INDEX');
  const nearTxt = mars?.nearKm != null ? `<p class="loc-note">Mars values from the nearest modelled point, ${P.esc(mars.name)}, ${Math.round(mars.nearKm).toLocaleString()} km away.</p>` : '';
  card.innerHTML = `<h3>Sky: dust, water, UV</h3>${nearTxt}
    <table class="kv"><tr><th></th><th style="color:#e0703a">${tName}</th><th style="color:#4aa3ff">${P.esc(place || 'Earth place')}</th></tr>
    ${rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('')}</table>
    <p class="normal-only">${moon ? 'The Moon has no air: no dust haze, no water, nothing to block ultraviolet light.' : `${ann('AOD_55') != null && mars.mean.dust > ann('AOD_55') ? 'Dust haze here is thicker than at this Earth place' : 'Dust haze here is lighter than at this Earth place, though Mars dust storms can raise it far higher'}, the air holds hundreds of times less water than even Earth\u2019s driest places, and with almost no ozone the ground gets the Sun\u2019s UV nearly unfiltered.`} ${uv != null ? `The Earth place averages UV index ${f(uv, 1)}.` : ''} Earth cannot reproduce ${moon ? 'airlessness' : 'the missing ozone'} outdoors: test UV damage in a lamp chamber.</p>
    ${err ? `<p class="muted">Earth data unavailable: ${P.esc(err)}</p>` : ''}
    <p class="muted nerd-only">${moon ? '' : `Mars: ${P.esc(state.sky.data.source)}; dust = column optical depth in the visible, water = column vapour (1 kg/m\u00b2 = 1 mm), ozone = O\u2083 column / 2.1415e-5 kg m\u207b\u00b2 per DU; mean of 24 seasons. `}Earth: NASA POWER climatology 2001\u20132025 at the place, annual mean: MERRA-2 aerosol optical depth at 550 nm, precipitable water, all-sky UV index. Earth ozone: global average, not this place.</p>
    <span class="src">NASA POWER (power.larc.nasa.gov)${moon ? '' : '; Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES)'}</span>`;
}

// ---------- Ground type: model thermal inertia, same model on every world ----------
const _tiIdx = {};
async function tiAt(world, lat, lon) {
  const TI = state.ti.data;
  if (!_tiIdx[world]) {
    const g = await load(`${world}_grid.json`);
    if (!g.ok) return null;
    const f = g.data.fields, ia = f.indexOf('lat'), io = f.indexOf('lon'), res = g.data.resolution_deg || (world === 'earth' ? 0.5 : 1);
    const m = new Map();
    g.data.cells.forEach((r, i) => m.set(cellKey(r[ia], r[io], res), i));
    _tiIdx[world] = { m, res };
  }
  const { m, res } = _tiIdx[world];
  const i = m.get(cellKey(lat, lon, res));
  return i == null ? null : TI.grids[world][i];
}

async function renderGround() {
  if (!tabOpen('science')) { _dirty.add('renderGround'); return; }
  const card = $('card-ground');
  if (!state.target) { card.hidden = true; return; }
  state.ti ||= await load('thermal_inertia.json');
  if (!state.ti.ok) { card.hidden = true; return; }
  const TI = state.ti.data;
  const t = state.target;
  const tt = TI.targets[t.id];
  const noNight = t.features?.lst_swing_c?.status === 'not_applicable';
  let tv = noNight ? null : tt ? tt.ti : await tiAt(state.world, t.lat, t.lon);
  const spot = state.cell || (state.heat?.ranked?.[0] && { lat: state.heat.ranked[0].lat, lon: state.heat.ranked[0].lon });
  const ev = spot ? await tiAt('earth', spot.lat, spot.lon) : null;
  const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' ? +v.slice(1) : null);
  const cls = (v) => { const n = num(v); return n == null ? '\u2014' : (TI.classes.find(([a, b]) => n >= a && n < b) || [])[2]; };
  const pos = (v) => { const n = num(v); return n == null ? null : Math.max(0, Math.min(100, (Math.log(n) - Math.log(15)) / (Math.log(4000) - Math.log(15)) * 100)); };
  const bands = TI.classes.map(([a, b, n]) => { const l = pos(Math.max(a, 15)), r = pos(Math.min(b, 4000)); return `<span class="ti-band" style="left:${l}%;width:${r - l}%">${P.esc(n)}</span>`; }).join('');
  const mk = (v, c, label) => (pos(v) == null ? '' : `<span class="ti-mark" style="left:${pos(v)}%;background:${c}" title="${P.esc(label)}"></span>`);
  const place = spot ? (P.placeName(spot.lat, spot.lon) || `${spot.lat.toFixed(2)}, ${spot.lon.toFixed(2)}`) : null;
  const pub = tt?.published?.range ? `Published for ${P.esc(t.name)}: <b>${tt.published.range[0]} to ${tt.published.range[1]}</b> (${P.esc((tt.published.source || '').split(',')[0])}). Our model: <b>${tt.ti}</b>, ${tt.ti >= tt.published.range[0] && tt.ti <= tt.published.range[1] ? 'inside' : 'outside'} that range.` : '';
  const world = state.world === 'moon' ? 'Moon' : 'Mars';
  card.hidden = false;
  card.innerHTML = `<h3>Ground type</h3>
    <p class="normal-only">How fast the ground heats by day and cools at night says whether it is loose dust, sand or solid rock (dust swings wildly, rock holds its heat). We work it out the same way on both worlds.</p>
    <div class="ti-scale">${bands}${mk(tv, '#e0703a', world)}${mk(ev, '#4aa3ff', 'Earth')}</div>
    <table class="kv"><tr><td><span style="color:#e0703a">\u25cf</span> ${P.esc(t.name)}</td><td>${noNight ? '<span class="muted">not defined: no regular night here, so no day-night swing</span>' : `<b>${P.esc(cls(tv))}</b> <span class="muted">(${tv ?? 'n/a'})</span>`}</td></tr>
    ${place ? `<tr><td><span style="color:#4aa3ff">\u25cf</span> ${P.esc(place)}</td><td><b>${P.esc(cls(ev))}</b>* <span class="muted">(${ev ?? 'n/a'})</span></td></tr>` : ''}</table>
    ${pub ? `<p class="muted">${pub}</p>` : ''}
    <p class="muted">* Earth\u2019s air and moisture damp its temperature swing, so Earth values read high (\u201capparent\u201d). Compare Earth places with each other; compare ${world} with its published values.</p>
    <p class="muted nerd-only">${P.esc(TI.method)} Units: ${P.esc(TI.units)}. Inputs: ${P.esc(Object.entries(TI.worlds).map(([k, v]) => `${k}: ${v}`).join('; '))}. ${P.esc(TI.classes_note)}</p>
    <span class="src">Inputs: albedo and 10:30 / 22:30 ground temperatures already in TwinWorlds (MODIS on Earth; TES and Mars Climate Database on Mars; LRO LOLA and Diviner on the Moon). Model: pipeline/thermal_inertia.py.</span>`;
}

// ---------- Live: most Mars-like place right now ----------
let _nowSeq = 0;
async function renderNow() {
  const card = $('card-now');
  const seq = ++_nowSeq;
  if (!state.target || state.target.live || state.world !== 'mars' || !apiEnabled()) { card.hidden = true; return; }
  card.hidden = false;
  card.innerHTML = '<h3>\ud83d\udd34 Right now</h3><p class="muted">Checking live ground temperatures\u2026</p>';
  try {
    const n = await liveNow(state.target.id);
    if (seq !== _nowSeq) return;
    const b = n.best;
    const hh = (h) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
    card.innerHTML = `<h3>\ud83d\udd34 Right now</h3>
      <p>It is <b>${hh(n.mars.local_solar_time_h)}</b> at ${P.esc(n.target.name)} and the ground is about <b>${Math.round(n.mars.ground_c)} \u00b0C</b>.
      Of its best Earth matches, <b>${P.esc(b.name)}</b> is closest this hour: <b>${Math.round(b.ground_c)} \u00b0C</b> at ${hh(b.local_solar_hour)} local (${b.diff_c} \u00b0C apart).</p>
      <button class="mini" id="now-go">Show it</button>
      <table class="kv nerd-only">${n.places.slice(0, 6).map((p) => `<tr><td>${P.esc(p.name)}</td><td>${p.ground_c ?? '\u2014'} \u00b0C \u00b7 ${p.diff_c ?? '\u2014'} apart</td></tr>`).join('')}</table>
      <span class="src">${P.esc(n.method)} Updated ${new Date(n.computed_at).toLocaleTimeString()}${n.cached ? ' (cached)' : ''}.</span>`;
    $('now-go').addEventListener('click', () => selectCell(b.lat, b.lon, true));
  } catch (e) {
    if (seq !== _nowSeq) return;
    card.innerHTML = `<h3>\ud83d\udd34 Right now</h3><p class="muted">Live data unavailable: ${P.esc(e.message)}</p>`;
  }
}

// ---------- Nerd Mode panel ----------
function zoneHtml() {
  const site = state.zones?.sites?.[0] || state.heat?.ranked?.[0];
  if (!site || !state.heat) return '';
  const prof = zoneProfile(state.heat, site);
  const dims = [...new Set(prof.flatMap((b) => Object.keys(b.mean)))];
  const f = (x) => (typeof x === 'number' ? x.toFixed(2) : '\u2014');
  return `<h4>Match zones around ${P.esc(P.placeName(site.lat, site.lon) || 'the best match')}</h4>
    <p class="muted">Contours of the real score, not drawn radii. Mean per-dimension similarity of the cells in each band (within 6\u00b0), centre outward:</p>
    <div class="nerd-table-wrap"><table class="kv nerd-table"><tr><th>Zone</th><th>Cells</th>${dims.map((d) => `<th>${P.esc(P.featureMeta(d).nerd || d)}</th>`).join('')}</tr>
    ${prof.map((b) => `<tr><td>${b.name} (top ${b.top}%)</td><td>${b.n}</td>${dims.map((d) => `<td>${f(b.mean[d])}</td>`).join('')}</tr>`).join('')}</table></div>`;
}

let _nerdSeq = 0;
async function renderNerd() {
  const card = $('card-nerd');
  if (!document.body.classList.contains('mode-nerd') || !state.target || !state.gridRaw) { card.hidden = true; return; }
  const seq = ++_nerdSeq;
  state.nerdCharts.forEach((c) => c.destroy());
  state.nerdCharts = [];
  card.hidden = false;
  state.earthModel ||= buildEarthModel(state.gridRaw);
  const model = state.earthModel;
  const spot = state.cell || (state.heat?.ranked?.[0] && { lat: state.heat.ranked[0].lat, lon: state.heat.ranked[0].lon });
  const row = spot ? state.grid?.get(spot.lat, spot.lon) : null;
  const place = spot ? (P.placeName(spot.lat, spot.lon) || `${spot.lat.toFixed(2)}, ${spot.lon.toFixed(2)}`) : null;
  const target = { ...baseValues(), ...(state.whatIf || {}) };
  const gaps = state.scores?.earth_gaps || {};
  const rows = N.mathRows(model, target, row, state.weights, gaps);
  const voting = rows.filter((r) => r.w > 0 && r.sim != null);
  const wsum = voting.reduce((a, r) => a + r.w, 0);
  const score = wsum ? Math.exp(voting.reduce((a, r) => a + r.w * Math.log(Math.max(r.sim, 0.01)), 0) / wsum) : null;
  const f = (x, k = 2) => (x == null || !Number.isFinite(x) ? '\u2014' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(k));
  const table = rows.map((r) => `<tr class="${r.beyond ? 'beyond' : ''}"><td>${P.esc(P.featureMeta(r.d).nerd)}</td><td>${f(r.t)}</td><td>${f(r.e)}</td>
      <td>${r.log ? 'ln(1+x)' : 'x'}</td><td>${f(r.sigma, 3)}</td><td>${r.beyond ? 'rank' : f(r.z)}</td><td>${f(r.sim, 3)}</td><td>${r.w ? f(r.w, 2) : '0 (beyond Earth)'}</td></tr>`).join('');
  const hists = rows.map((r, i) => `<div class="nerd-hist"><div class="muted">${P.esc(P.featureMeta(r.d).nerd)}${P.featureMeta(r.d).unit ? ` (${P.esc(P.featureMeta(r.d).unit)})` : ''}</div><div class="hist-wrap"><canvas id="nh-${i}"></canvas></div></div>`).join('');
  const isMars = state.world === 'mars';
  card.innerHTML = `<h3>\ud83e\udd13 Nerd view${place ? `: ${P.esc(state.target.name)} vs ${P.esc(place)}` : ''}</h3>
    <h4>The maths</h4>
    <pre class="formula">s\u1d62 = exp(\u2212(x\u1d07 \u2212 x\u209c)\u00b2 / 2\u03c3\u1d62\u00b2)    \u03c3\u1d62 = \u00bc (p95 \u2212 p5) of Earth\nscore = exp( \u03a3 w\u1d62 ln max(s\u1d62, 0.01) / \u03a3 w\u1d62 )\nw: temperature family shares one vote (\u2153 each); beyond-Earth dims get w = 0</pre>
    ${row ? `<div class="nerd-table-wrap"><table class="kv nerd-table"><tr><th>Measurement</th><th>Target</th><th>Earth</th><th>Scale</th><th>\u03c3</th><th>z</th><th>s</th><th>w</th></tr>${table}</table></div>
      <p class="muted">Score from these rows: <b>${f(score, 3)}</b>${state.weights ? ` (lens: ${P.esc(state.lensLabel || 'custom')})` : ''}. Earth values are 2023 yearly means; \u03c3 and ranks come from all ${model.n.toLocaleString()} Earth land cells.</p>`
      : '<p class="empty">No land data at this spot (ocean or no terrain data).</p>'}
    ${zoneHtml()}
    <h4>Where the target sits in Earth\u2019s range</h4>
    <p class="muted">Grey: all ${model.n.toLocaleString()} Earth land cells. <span style="color:#e0703a">\u25A0</span> ${isMars ? 'Mars' : 'Moon'} target \u00b7 <span style="color:#4aa3ff">\u25A0</span> ${P.esc(place || 'Earth place')}. Slope and relief on a log scale.</p>
    <div class="nerd-hists">${hists}</div>
    ${isMars ? '<h4>Through the year (next Mars year)</h4><div class="time-chart"><canvas id="nerd-year"></canvas></div><p class="muted" id="nerd-year-note"></p>' : ''}
    ${isMars ? '<h4>Through a day (today)</h4><div class="time-chart"><canvas id="nerd-day"></canvas></div><p class="muted" id="nerd-day-note"></p>' : '<p class="muted">The Moon\u2019s day lasts 29.5 Earth days, so day and year curves are shown for Mars targets only.</p>'}
    <span class="src">Earth: NASA MODIS (MOD11A2, MCD43A3, MOD13A2 yearly; MOD11A2, MCD43A3, MOD13A3 monthly, 2023), USGS GMTED2010, NOAA ETOPO1. ${isMars ? 'Mars: MGS MOLA, TES, Mars Climate Database v6.2 (ESA/CNES/LMD). Earth hourly: Open-Meteo forecast.' : 'Moon: LRO LOLA, LRO Diviner.'}</span>`;
  rows.forEach((r, i) => state.nerdCharts.push(N.histChart($(`nh-${i}`), N.histSpec(model, r.d, r.log, [
    { value: r.t, label: isMars ? 'Mars' : 'Moon', color: '#e0703a' },
    { value: r.e, label: 'Earth', color: '#4aa3ff', dash: true },
  ]))));
  if (!isMars) return;
  try {
    await travelData();
    if (seq !== _nerdSeq) return;
    const gf = state.gridRaw.fields, iLa = gf.indexOf('lat'), iLo = gf.indexOf('lon'), res = state.gridRaw.resolution_deg || 0.5;
    const want = spot ? cellKey(spot.lat, spot.lon, res) : null;
    const k = want ? state.gridRaw.cells.findIndex((c) => cellKey(c[iLa], c[iLo], res) === want) : -1;
    const months = k >= 0 ? N.cellMonths(state.monthly, k) : null;
    state.nerdCharts.push(N.overlayChart($('nerd-year'), { x: { label: 'Weeks from now', unit: 'wk' }, y: { label: 'Ground temperature', unit: '\u00b0C' },
      series: N.yearSeries(state.marsSeasonal, state.target, months) }));
    $('nerd-year-note').textContent = 'Solid: 10:30 local time, dashed: 22:30. Mars: Mars Climate Database by season (Ls). Earth: NASA MODIS 2023 monthly, by calendar month.';
  } catch (e) { const n = $('nerd-year-note'); if (n) n.textContent = e.message; }
  try {
    const D = await load('mars_diurnal.json');
    const ds = await N.daySeries(D.ok ? D.data : null, state.target, spot);
    if (seq !== _nerdSeq || !$('nerd-day')) return;
    state.nerdCharts.push(N.overlayChart($('nerd-day'), { x: { label: 'Local time', unit: 'h' }, y: { label: 'Ground temperature', unit: '\u00b0C' }, series: ds }));
    $('nerd-day-note').textContent = 'Same local time on both worlds (a sol is 24 h 39 min). Mars: MCD maps every 3 h, interpolated. Earth: Open-Meteo soil temperature at 0 cm.';
  } catch (e) { const n = $('nerd-day-note'); if (n) n.textContent = `Hourly Earth data unavailable: ${e.message}`; }
}

// ---------- Mission Twin ----------
function stopMission() {
  state.mt?.clear();
  state.mt = null;
  $('mt-play').hidden = true;
  $('mt-seek').hidden = true;
  $('card-mission').hidden = true;
}

function pathExtentM(world, path) {
  const R = WORLDS[world].ellipsoid.maximumRadius;
  const [lon0, lat0] = path[0];
  let max = 0;
  for (const [lon, lat] of path) {
    const dLat = ((lat - lat0) * Math.PI) / 180;
    const dLon = ((lon - lon0) * Math.PI) / 180 * Math.cos((lat0 * Math.PI) / 180);
    max = Math.max(max, R * Math.hypot(dLat, dLon));
  }
  return max;
}

// Mission Twin only makes sense on its own world; invite from its target's card.
/** The Mission Twin for the selected site or mission, if one exists. */
function twinForTarget() {
  const t = state.target;
  if (!t) return null;
  return (state.missionTwins || []).find((m) =>
    m.planet.target === t.id || m.id === t.mission?.id || (t.mission?.twin && m.planet.target === t.mission.twin)) || null;
}
function updateMissionButton() {
  const m = twinForTarget();
  $('mt-btn').hidden = !m || (m.planet.world || 'mars') !== state.world;
  if (m) $('mt-btn').title = `Rehearse ${m.planet.rover}'s real drive on a matched path on Earth (${m.earth.site})`;
}
function addMissionInvite() {
  updateMissionButton();
  const m = twinForTarget();
  const card = $('card-target');
  if (!m || card.querySelector('.mt-invite')) return;
  const div = document.createElement('div');
  div.className = 'mt-invite';
  div.innerHTML = `<b>Mission Twin:</b> rehearse ${P.esc(m.planet.rover || 'the rover')}'s real ${m.distance_km ? `${m.distance_km} km ` : ''}drive here on a matched path on Earth (${P.esc(m.earth.site || '')}).<br><button class="mt-start">▶ Rehearse the drive</button>`;
  div.querySelector('.mt-start').onclick = () => startMission();
  card.appendChild(div);
}

async function startMission() {
  showTab('match');
  const m = twinForTarget();
  if (!m) return toast('Pick a mission with a rover route (Perseverance or Curiosity) first.');
  if (m.planet.world && m.planet.world !== state.world) await setWorld(m.planet.world);
  stopMission();
  const card = $('card-mission');
  const mt = new MissionTwin(state.planet, state.earth, m, {
    onSegment: (i) => {
      card.innerHTML = P.missionCard(m, i);
    },
  });
  state.mt = mt;
  card.innerHTML = P.missionCard(m, 0);
  card.hidden = false;
  $('mt-play').hidden = false;
  $('mt-seek').hidden = false;
  const s = state.mt.centers();
  const extent = Math.max(pathExtentM(state.world, m.planet.path), pathExtentM('earth', m.earth.path));
  const range = Math.min(60_000, Math.max(800, extent * 1.8));
  $('earth-site').textContent = m.earth.site || 'matched path';
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Fly in first, so the ground under both routes is loaded; then measure it and draw on it.
  await Promise.race([state.dive.start(s.planet, s.earth, { ...DIVE_VIEW, range }), new Promise((r) => setTimeout(r, 8000))]);
  if (state.mt !== mt) return; // stopped or restarted meanwhile
  toast('Placing both routes on the real ground…', 2500);
  await mt.draw();
  if (state.mt === mt) mt.play();
}

// ---------- Time travel: watch Earth's matches change through the seasons ----------
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
async function travelData() {
  if (!state.monthly) {
    const idx = await dataIndex();
    if (!idx.has('earth_monthly.json')) throw new Error('Monthly Earth data (earth_monthly.json) is not published yet.');
    state.monthly = await loadEarthMonthly();
  }
  if (state.world === 'mars' && !state.marsSeasonal) {
    const r = await load('mars_seasonal.json');
    if (!r.ok) throw new Error('mars_seasonal.json is not published yet.');
    state.marsSeasonal = r.data;
  }
}
/** Target values on a date: Mars temperatures follow the Mars season; terrain, albedo, plants stay. */
function targetValuesAt(date) {
  const v = { ...baseValues(), ...(state.whatIf || {}) };
  let mars = null;
  if (state.world === 'mars' && state.marsSeasonal) {
    mars = marsTempsAt(state.marsSeasonal, state.target.lat, state.target.lon, date);
    if ('lst_day_c' in v) v.lst_day_c = mars.day;
    if ('lst_night_c' in v) v.lst_night_c = mars.night;
    if ('lst_swing_c' in v) v.lst_swing_c = mars.swing;
  }
  return { v, mars };
}
function scoreAt(date) {
  const model = buildEarthModel(earthGridAt(state.gridRaw, state.monthly, date));
  const { v, mars } = targetValuesAt(date);
  const res = scoreLive(model, v, { id: state.target.id, world: state.world, name: `${state.target.name}, ${fmtDate(date)}` });
  return { res, mars, v };
}
function resetTravel() {
  const card = $('card-travel');
  if (!state.target || !state.gridRaw) { card.hidden = true; return; }
  card.hidden = false;
  state.travelPlaying = false;
  state.travelDates = timeline(new Date(), state.world === 'mars' ? 100 : 52);
  const n = state.travelDates.length - 1;
  const cell = state.cell ? (P.placeName(state.cell.lat, state.cell.lon) || 'the selected spot') : null;
  card.innerHTML = `<h3>Time travel</h3>
    <p class="muted">Earth changes with its seasons${state.world === 'mars' ? ', and so does Mars' : ''}. Drag or play to watch every place on Earth re-colour as its match to ${P.esc(state.target.name)} changes${state.world === 'mars' ? ' over the next Mars year (about 23 months)' : ' over the next year (the Moon has almost no seasons, so only Earth changes)'}.</p>
    <div class="tt-row"><button id="tt-play" aria-label="Play">▶</button><input id="tt-slider" type="range" min="0" max="${n}" value="0" step="1"><span id="tt-date">${fmtDate(state.travelDates[0])}</span></div>
    <p id="tt-info" class="muted"></p>
    <h4>When is a place most ${state.world === 'moon' ? 'Moon' : 'Mars'}-like?</h4>
    ${cell ? `<p>Find the best time this ${state.world === 'mars' ? 'Mars year' : 'year'} to rehearse at <b>${P.esc(cell)}</b>.</p><button id="tt-when">Find the best time</button>`
      : '<p class="muted">Click a place on Earth first, then come back here.</p>'}
    <div id="tt-when-out"></div>`;
  $('tt-slider').oninput = (e) => travelTo(+e.target.value);
  $('tt-play').onclick = toggleTravel;
  const w = $('tt-when'); if (w) w.onclick = findBestTime;
}
let _ttBusy = false, _ttWant = null;
async function travelTo(i) {
  _ttWant = i;
  if (_ttBusy) return;
  _ttBusy = true;
  try {
    await travelData();
    while (_ttWant != null) {
      const k = _ttWant; _ttWant = null;
      const d = state.travelDates[k];
      $('tt-date').textContent = fmtDate(d);
      const { res, mars } = scoreAt(d);
      if (res.error) { toast(res.error, 4000); break; }
      state.scores = res;
      await drawHeat();
      const top = topPlaces(state.heat, 3).map((x) => x.place).join(', ');
      $('tt-info').innerHTML = `Earth: ${MONTHS[d.getUTCMonth()]} conditions (NASA MODIS monthly)${mars ? ` · Mars: Ls ${mars.ls.toFixed(0)}°, ${seasonName(mars.ls, state.target.lat)}, ${mars.day.toFixed(0)} °C by day / ${mars.night.toFixed(0)} °C at night` : ''}<br>Top matches now: <b>${P.esc(top)}</b>`;
    }
  } catch (e) {
    toast(e.message, 5000);
    $('tt-info').textContent = e.message;
  } finally {
    _ttBusy = false;
  }
}
async function toggleTravel() {
  state.travelPlaying = !state.travelPlaying;
  $('tt-play').textContent = state.travelPlaying ? '❚❚' : '▶';
  const s = $('tt-slider');
  while (state.travelPlaying && document.body.contains(s)) {
    const next = (+s.value + 1) % (+s.max + 1);
    s.value = String(next);
    await travelTo(next);
    await new Promise((r) => setTimeout(r, 120));
  }
}
async function findBestTime() {
  const out = $('tt-when-out');
  const c = state.cell;
  const place = P.placeName(c.lat, c.lon) || `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`;
  try { await travelData(); } catch (e) { out.innerHTML = `<p class="empty">${P.esc(e.message)}</p>`; return; }
  const dates = state.travelDates.filter((_, k) => k % 2 === 0); // every 2 weeks
  const series = [];
  const key = cellKey(c.lat, c.lon, 0.5);
  for (let k = 0; k < dates.length; k++) {
    out.innerHTML = `<p class="empty">Simulating ${fmtDate(dates[k])} (${k + 1} of ${dates.length})…</p>`;
    await new Promise((r) => setTimeout(r, 0));
    const { res, v } = scoreAt(dates[k]);
    if (res.error) { out.innerHTML = `<p class="empty">${P.esc(res.error)}</p>`; return; }
    const cellRes = res.cells.find((x) => cellKey(x.lat, x.lon, 0.5) === key);
    if (!cellRes) { out.innerHTML = '<p class="empty">No land data at the selected spot.</p>'; return; }
    const better = res.cells.reduce((a, x) => a + (x.score > cellRes.score ? 1 : 0), 0);
    const g = earthGridAt({ fields: state.gridRaw.fields, cells: [state.gridRaw.cells.find((r) => cellKey(r[0], r[1], 0.5) === key)] }, sliceMonthly(key), dates[k]);
    series.push({ date: dates[k], score: cellRes.score, top: (100 * better) / res.cells.length, dims: cellRes.dims, target: v,
      earth: Object.fromEntries(g.fields.map((f, i) => [f, g.cells[0][i]])), gaps: Object.keys(res.earth_gaps || {}) });
  }
  const best = series.reduce((a, s) => (s.score > a.score ? s : a), series[0]);
  const worst = series.reduce((a, s) => (s.score < a.score ? s : a), series[0]);
  const now = series[0];
  const weeks = Math.round((best.date - now.date) / (7 * 86400000));
  const round = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'lat' && k !== 'lon').map(([k, x]) => [k, typeof x === 'number' ? +x.toFixed(2) : x]));
  out.innerHTML = `<div class="time-chart"><canvas id="tt-canvas"></canvas></div>
    <p><b>Best time:</b> ${fmtDate(best.date)}${weeks > 0 ? `, ${weeks} weeks from now` : ' (now)'}: match ${best.score.toFixed(2)}, ${best.top < 0.05 ? 'the best place on Earth that week' : `top ${best.top.toFixed(1)}% of Earth`}. <b>Worst:</b> ${fmtDate(worst.date)} (${worst.score.toFixed(2)}). Today: ${now.score.toFixed(2)}.</p>
    ${apiEnabled() ? '<button id="tt-ai">Explain with AI</button>' : ''}<div id="tt-ai-out"></div>
    <span class="src nerd-only">Simulated every 2 weeks. Earth: NASA MODIS 2023 monthly data by calendar month (MOD11C3, MOD13C2, MCD43C3). Mars: Mars Climate Database v6.2 by season (Ls). Terrain stays fixed.</span>`;
  state.ttChart?.destroy();
  state.ttChart = overlayChart($('tt-canvas'), {
    x: { label: 'Weeks from now', unit: 'wk' }, y: { label: 'Match score', unit: '0-1' },
    series: [{ world: 'earth', label: `${place} vs ${state.target.name}`, points: series.map((s) => [Math.round((s.date - now.date) / (7 * 86400000)), +s.score.toFixed(3)]) }],
  });
  const ai = $('tt-ai');
  if (ai) ai.onclick = async () => {
    const o = $('tt-ai-out');
    o.innerHTML = '<p class="empty">Writing\u2026</p>';
    const pick = (s) => ({ date: fmtDate(s.date), weeks_from_now: Math.round((s.date - now.date) / (7 * 86400000)), match_score: +s.score.toFixed(3), top_percent_of_earth: +s.top.toFixed(1), dimension_scores: round(s.dims), earth_values: round(s.earth), target_values: round(s.target), beyond_anything_on_earth: s.gaps });
    try {
      const r = await whenBest({ place, target: state.target.name, world: state.world, today: pick(now), best: pick(best), worst: pick(worst),
        timeline: series.filter((_, k) => k % 2 === 0).map((s) => ({ date: fmtDate(s.date), match_score: +s.score.toFixed(3) })) });
      o.innerHTML = `<p>${P.esc(r.text)}</p><p class="ai-label">AI-generated from the simulated numbers (Gemini)</p>`;
    } catch (e) { o.innerHTML = `<p class="empty">${P.esc(e.message)}</p>`; }
  };
}
/** Monthly values for one cell, as a tiny earth_monthly object (for the earth_values shown to Gemini). */
function sliceMonthly(key) {
  const M = state.monthly;
  const k = state.gridRaw.cells.findIndex((r) => cellKey(r[0], r[1], 0.5) === key);
  const nv = M.vars.length, data = new Int16Array(12 * nv);
  for (let m = 0; m < 12; m++) for (let v = 0; v < nv; v++) data[m * nv + v] = M.data[(m * nv + v) * M.cells + k];
  return { ...M, cells: 1, data };
}

// ---------- Time factor: a week on Mars vs a week at its Earth twin ----------
function timeEarthSpot() {
  if (state.cell) return { lat: state.cell.lat, lon: state.cell.lon, name: P.placeName(state.cell.lat, state.cell.lon) || 'selected spot' };
  const b = state.heat?.ranked?.[0];
  return b ? { lat: b.lat, lon: b.lon, name: P.placeName(b.lat, b.lon) || 'best match' } : null;
}
function resetTime() {
  if (!state.travelPlaying && !_ttBusy) resetTravel();
  const card = $('card-time');
  const e = timeEarthSpot();
  if (state.world !== 'mars' || !state.target || !e) { card.hidden = true; return; }
  card.hidden = false;
  state.timeChart?.destroy(); state.timeChart = null;
  const ls = marsLs();
  card.innerHTML = `<h3>A week on Mars vs Earth</h3>
    <p class="muted">Compare the next 7 days at <b>${P.esc(e.name)}</b> with a week at <b>${P.esc(state.target.name)}</b>, hour by hour at the same local time. Mars today: Ls ${ls.toFixed(0)}° (${seasonName(ls, state.target.lat)}).</p>
    <button id="time-run">▶ Simulate a week</button><div id="time-out"></div>`;
  $('time-run').onclick = runTime;
}
async function runTime() {
  const out = $('time-out');
  const e = timeEarthSpot();
  out.innerHTML = '<p class="empty">Loading Mars hours and Earth’s forecast…</p>';
  try {
    const d = await load('mars_diurnal.json');
    if (!d.ok) throw new Error('mars_diurnal.json is not published yet');
    const week = await earthWeek(e.lat, e.lon);
    const c = compareWeek(d.data, { lat: state.target.lat, lon: state.target.lon }, week);
    const fmtT = (r) => `${new Date(r.t).toLocaleDateString('en-GB', { weekday: 'short' })} ${r.t.slice(11, 16)}`;
    const nightGap = c.coldestEarth.earth - c.coldestMars.mars;
    out.innerHTML = `<div class="time-chart"><canvas id="time-canvas"></canvas></div>
      <p><b>Best rehearsal hour this week:</b> ${fmtT(c.best)} local, ground ${c.best.earth.toFixed(0)} °C on Earth vs ${c.best.mars.toFixed(0)} °C on Mars at the same local time (gap ${c.best.gap.toFixed(0)} °C).</p>
      <p><b>Closest hour each day:</b> ${c.perDay.map((r) => `${fmtT(r)} (gap ${r.gap.toFixed(0)} °C)`).join(' · ')}</p>
      <p class="muted">Earth’s coldest hour this week is ${c.coldestEarth.earth.toFixed(0)} °C; Mars here drops to ${c.coldestMars.mars.toFixed(0)} °C each night, ${nightGap.toFixed(0)} °C colder. That gap is what cold chambers have to fake. A sol is 24 h 39 min, so we compare by local time, not clock time.</p>
      <span class="src nerd-only">Mars: ${P.esc(d.data.source || 'Mars Climate Database v6.2')} Maps every 3 hours of local time, interpolated in between (smooths the morning warm-up by a few degrees). Season advances ~0.52° Ls per Earth day.</span>
      <span class="src nerd-only">Earth: Open-Meteo hourly forecast, soil temperature at 0 cm (ground surface), ${P.esc(week.tz)} local time.</span>`;
    state.timeChart?.destroy();
    state.timeChart = overlayChart($('time-canvas'), {
      x: { label: 'Hours from now', unit: 'h' }, y: { label: 'Ground temperature', unit: '°C' },
      series: [
        { world: 'earth', label: `Earth: ${e.name}`, points: c.rows.map((r, k) => [k, r.earth]) },
        { world: 'mars', label: `Mars: ${state.target.name}`, points: c.rows.map((r, k) => [k, +r.mars.toFixed(1)]) },
      ],
    });
  } catch (err) {
    out.innerHTML = `<p class="empty">${P.esc(err.message)}</p>`;
  }
}

// ---------- What if... (change the target, watch Earth's matches move) ----------
const WHATIF_RANGE = {
  slope_deg: [0, 15, 0.1], relief_55km_m: [0, 2500, 10], lst_day_c: [-150, 130, 1], lst_night_c: [-200, 40, 1],
  lst_swing_c: [0, 300, 1], albedo: [0, 0.8, 0.01], ndvi: [0, 0.9, 0.01],
};
function baseValues() {
  return Object.fromEntries(Object.entries(state.target?.features || {})
    .filter(([k, f]) => k in WHATIF_RANGE && f?.status === 'sourced' && typeof f.value === 'number').map(([k, f]) => [k, f.value]));
}
/** Best cell in each of n different named places. */
function topPlaces(heat, n = 5) {
  const seen = new Set(); const out = [];
  for (const c of heat?.ranked || []) {
    const p = P.placeName(c.lat, c.lon) || `${c.lat.toFixed(1)}, ${c.lon.toFixed(1)}`;
    if (seen.has(p)) continue;
    seen.add(p); out.push({ place: p, score: +c.score.toFixed(3) });
    if (out.length === n) break;
  }
  return out;
}
function renderWhatIf() {
  const card = $('card-whatif');
  const base = baseValues();
  if (!state.target || !Object.keys(base).length) { card.hidden = true; return; }
  card.hidden = false;
  const cur = { ...base, ...(state.whatIf || {}) };
  const rows = Object.keys(WHATIF_RANGE).filter((k) => k in base).map((k) => {
    const [lo, hi, st] = WHATIF_RANGE[k];
    const m = P.featureMeta(k);
    const changed = state.whatIf && k in state.whatIf && state.whatIf[k] !== base[k];
    return `<div class="wi-row${changed ? ' changed' : ''}"><label for="wi-${k}">${P.esc(m.normal)}</label>
      <input type="range" id="wi-${k}" data-dim="${k}" min="${Math.min(lo, base[k])}" max="${Math.max(hi, base[k])}" step="${st}" value="${cur[k]}">
      <span class="wi-val">${P.esc(String(+(+cur[k]).toFixed(st < 1 ? 2 : 0)))}${m.unit ? ' ' + P.esc(m.unit) : ''}</span>
      <span class="wi-base muted">real: ${P.esc(String(+base[k].toFixed(st < 1 ? 2 : 0)))}</span></div>`;
  }).join('');
  const diff = state.whatIfDiff;
  const diffHtml = diff ? `<div class="wi-diff"><div><h4>Before</h4><ol>${diff.before.map((x) => `<li class="${diff.after.some((y) => y.place === x.place) ? '' : 'out'}">${P.esc(x.place)}</li>`).join('')}</ol></div>
    <div><h4>After</h4><ol>${diff.after.map((x) => `<li class="${diff.before.some((y) => y.place === x.place) ? '' : 'in'}">${P.esc(x.place)}</li>`).join('')}</ol></div></div>
    <p class="muted"><span class="in">● new</span> · <span class="out">● dropped out</span></p>` : '<p class="muted">Move a slider: all of Earth is re-scored live and the heatmap redraws.</p>';
  card.innerHTML = `<h3>What if…</h3>
    <p class="muted">Change ${P.esc(state.target.name)}'s measurements and see which places on Earth would match instead.</p>
    ${rows}${diffHtml}
    <div class="row"><button id="wi-reset"${state.whatIf ? '' : ' disabled'}>Reset to real values</button>${apiEnabled() ? `<button id="wi-explain"${diff ? '' : ' disabled'}>Explain with AI</button>` : ''}</div>
    <div id="wi-ai"></div>`;
  card.querySelectorAll('input[type=range]').forEach((el) => el.addEventListener('input', onWhatIfInput));
  $('wi-reset').onclick = () => { state.whatIf = null; state.whatIfDiff = null; loadScores().then(renderWhatIf); };
  const ex = $('wi-explain');
  if (ex) ex.onclick = explainWhatIf;
}
let _wiTimer = null;
function onWhatIfInput(e) {
  const k = e.target.dataset.dim;
  const v = +e.target.value;
  const base = baseValues();
  state.whatIf = { ...(state.whatIf || {}), [k]: v };
  // Keep the swing consistent with day and night (swing = day - night).
  if ((k === 'lst_day_c' || k === 'lst_night_c') && 'lst_swing_c' in base) {
    const cur = { ...base, ...state.whatIf };
    state.whatIf.lst_swing_c = +(cur.lst_day_c - cur.lst_night_c).toFixed(1);
  }
  e.target.parentElement.querySelector('.wi-val').textContent = `${+v.toFixed(e.target.step < 1 ? 2 : 0)}${P.featureMeta(k).unit ? ' ' + P.featureMeta(k).unit : ''}`;
  clearTimeout(_wiTimer);
  _wiTimer = setTimeout(applyWhatIf, 250);
}
async function applyWhatIf() {
  if (!state.gridRaw || !state.target) return;
  const before = state.whatIfBefore || topPlaces(state.heat);
  state.whatIfBefore = before;
  state.earthModel ||= buildEarthModel(state.gridRaw);
  const vals = { ...baseValues(), ...state.whatIf };
  const res = scoreLive(state.earthModel, vals, { id: state.target.id, world: state.world, name: `${state.target.name} (what if)` });
  if (res.error) return toast(res.error, 4000);
  state.scores = res;
  await drawHeat();
  state.whatIfDiff = { before, after: topPlaces(state.heat), gaps: Object.keys(res.earth_gaps || {}) };
  renderWhatIf();
}
async function explainWhatIf() {
  const out = $('wi-ai');
  const base = baseValues();
  const changes = Object.entries(state.whatIf || {}).filter(([k, v]) => v !== base[k])
    .map(([k, v]) => ({ dim: k, label: P.featureMeta(k).normal, unit: P.featureMeta(k).unit || '', from: base[k], to: v }));
  out.innerHTML = '<p class="empty">Writing…</p>';
  try {
    const r = await whatIf({ target: state.target.name, world: state.world, changes, before: state.whatIfDiff.before, after: state.whatIfDiff.after, beyond_earth_after: state.whatIfDiff.gaps });
    out.innerHTML = `<p>${P.esc(r.text)}</p><p class="ai-label">AI-generated from the numbers above (Gemini)</p>`;
  } catch (e) {
    out.innerHTML = `<p class="empty">${P.esc(e.message)}</p>`;
  }
}

// ---------- Ask the Planet + Analyst ----------
async function ask(question) {
  showTab('match');
  if (!apiEnabled()) return toast('Ask the Planet needs the backend. It is not connected yet.');
  const dims = state.scores?.cells?.[0]?.dims ? Object.keys(state.scores.cells[0].dims) : [];
  if (!dims.length) return toast('Ask the Planet needs scores with per-dimension values first.');
  const card = $('card-ask');
  card.hidden = false;
  card.innerHTML = '<h3>Ask the Planet</h3><p class="empty">Thinking…</p>';
  try {
    const r = await askPlanet({ question, target: state.target?.id, dims, lenses: state.lenses?.lenses });
    state.weights = r.weights;
    state.lensLabel = r.label || 'Ask the Planet';
    // Show the Ask lens in the dropdown too, so the screen never disagrees with itself.
    const sel = $('lens-select');
    let opt = sel.querySelector('option[value="__ask"]');
    if (!opt) { opt = new Option('', '__ask'); sel.add(opt); }
    opt.textContent = `Ask: ${state.lensLabel}`;
    state.askLens = { name: state.lensLabel, weights: r.weights };
    sel.value = '__ask';
    await drawHeat();
    card.innerHTML = `<h3>Ask the Planet</h3><p>${P.esc(r.explanation || '')}</p>
      <table class="kv nerd-only">${Object.entries(r.weights).map(([k, w]) => `<tr><td>${P.esc(k)}</td><td>${w.toFixed(2)}</td></tr>`).join('')}</table>
      <p class="ai-label">AI-generated lens weights (Gemini). The scores themselves are computed from measured data.</p>`;
  } catch (e) {
    card.innerHTML = `<h3>Ask the Planet</h3><p class="empty">${P.esc(e.message)}</p>`;
  }
}

async function explain(cell, earthRow) {
  const out = $('analyst-out');
  out.innerHTML = '<p class="empty">Writing…</p>';
  try {
    const gapsSet = new Set(Object.keys(state.scores?.earth_gaps || {}));
    cell = { ...cell, dims: Object.fromEntries(Object.entries(cell.dims || {}).filter(([d]) => !gapsSet.has(d))) };
    const r = await analyst({ target: state.target, cell, earth: earthRow, earthSources: state.grid?.sources, earthYear: state.grid?.year,
      place: P.placeName(cell.lat, cell.lon) || null, beyondEarth: state.scores?.earth_gaps || null });
    out.innerHTML = `<p>${P.esc(r.text)}</p><p class="ai-label">AI-generated from measured data (Gemini)</p>`;
  } catch (e) {
    out.innerHTML = `<p class="empty">${P.esc(e.message)}</p>`;
  }
}

// ---------- side cards ----------
function renderGaps() {
  if (!state.gaps) return;
  $('card-gaps').innerHTML = P.gapsCard(state.gaps.data, state.world, state.gaps.ok ? null : state.gaps.error);
  renderMinerals();
}

async function renderMinerals() {
  if (!tabOpen('science')) { _dirty.add('renderMinerals'); return; }
  const card = $('card-minerals');
  if (state.world !== 'mars') { card.hidden = true; return; }
  state.minerals ||= await load('minerals.json');
  if (!state.minerals.ok) { card.hidden = true; return; }
  const t = state.target;
  const gale = { lat: -4.59, lon: 137.44 };
  const dGale = t ? marsKm(t, gale) : null;
  const chemNote = dGale == null ? '' : dGale < 60
    ? `<p class="loc-note">This is Gale crater: the rover chemistry below was measured here.</p>`
    : `<p class="loc-note">Rover chemistry exists for one Mars site, Gale crater (Rocknest), <b>${Math.round(dGale).toLocaleString()} km</b> from ${P.esc(t.name)}. Martian soil is wind-mixed basaltic sand planet-wide, so it is the standard reference; the spectra below are matched to ${P.esc(t.name)} itself.</p>`;
  const sn = state.minerals.data.site_notes?.[t?.id];
  const siteNote = sn ? `<p class="loc-note">${P.esc(sn.text)}</p><span class="src">${P.esc(sn.source)}</span>` : '';
  card.innerHTML = P.mineralsCard(state.minerals.data).replace('</h3>', `</h3>${chemNote}${siteNote}`) + `<div id="spec-box"></div>`;
  card.hidden = false;
  state.spectra ||= await load('spectra.json');
  if (!state.spectra.ok) return;
  // Location-aware: default to the orbital mineral detection nearest this site; list the rest by distance.
  if (state.specFor !== t?.id) {
    state.specFor = t?.id;
    const near = t ? [...state.spectra.data.spectra].sort((a, b) => marsKm(t, a.mars) - marsKm(t, b.mars))[0] : null;
    state.specPick = near ? near.id : 'fe_olivine';
  }
  renderSpectrum(state.specPick);
}

/** Great-circle distance on Mars (km). */
function marsKm(a, b) {
  const r = Math.PI / 180, R = 3389.5;
  const s = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Mars (CRISM, from orbit) vs Earth (EMIT from orbit, or RELAB lab) spectrum of one mineral, continuum removed. */
function renderSpectrum(id) {
  const S = state.spectra.data;
  const sp = S.spectra.find((x) => x.id === id) || S.spectra.find((x) => x.pair === 'orbit') || S.spectra[0];
  state.specPick = sp.id;
  state.specChart?.destroy();
  const pts = (arr) => sp.x.map((x, i) => [x, arr[i]]);
  const e = sp.earth, m = sp.mars;
  const orbit = e.kind === 'orbit';
  const lunar = e.type === 'Returned Lunar Sample';
  const earthWhat = orbit ? `NASA\u2019s EMIT, looking down from the ISS at ${e.where}` : lunar ? 'a Moon rock (Apollo 17) in the lab' : `an Earth sample${e.where ? ` from ${e.where}` : ''} in the lab`;
  const t = state.target;
  const km = (x) => (t ? marsKm(t, x.mars) : null);
  const byDist = (a, b) => (km(a) ?? 0) - (km(b) ?? 0);
  const opt = (x) => `<option value="${x.id}" ${x.id === sp.id ? 'selected' : ''}>${P.esc(x.mineral)} \u00b7 ${km(x) != null ? `${Math.round(km(x)).toLocaleString()} km away` : ''} (r = ${x.shape_r.toFixed(2)})</option>`;
  const orbitOpts = S.spectra.filter((x) => x.pair === 'orbit').sort(byDist);
  const labOpts = S.spectra.filter((x) => x.pair !== 'orbit').sort(byDist);
  const nearNote = t ? `<p class="loc-note">CRISM saw <b>${P.esc(sp.mineral.toLowerCase())}</b> in ${P.esc(m.where.replace(/, Mars$/, '').replace(/^.*? from /, ''))}, <b>${Math.round(km(sp)).toLocaleString()} km</b> from ${P.esc(t.name)}${state.specPick === sp.id && [...S.spectra].sort(byDist)[0].id === sp.id ? ' (the nearest of the 12 reference detections in our CRISM library)' : ''}.</p>` : '';
  const verdict = sp.shape_r >= 0.85 ? 'a strong match' : sp.shape_r >= 0.6 ? 'a partial match' : 'a weak match';
  $('spec-box').innerHTML = `<h4>Spectra: Mars from orbit vs ${orbit ? 'Earth from orbit' : 'Earth in the lab'}</h4>
    <label class="muted">Mineral <select id="spec-pick">${orbitOpts.length ? `<optgroup label="Earth from orbit (EMIT)">${orbitOpts.map(opt).join('')}</optgroup>` : ''}<optgroup label="Earth in the lab (RELAB)">${labOpts.map(opt).join('')}</optgroup></select></label>
    ${nearNote}
    <div class="time-chart"><canvas id="spec-chart"></canvas></div>
    <p class="normal-only">Minerals absorb light at their own wavelengths, like a fingerprint. <span style="color:#e0703a">NASA\u2019s CRISM spectrum of ${P.esc(m.where)}</span> vs <span style="color:#4aa3ff">${P.esc(earthWhat)}</span>: shape match <b>r = ${sp.shape_r.toFixed(2)}</b>, ${verdict} (1 = identical).${sp.id === 'fe_ca_carbonate' ? ' The Mars carbonate contains iron and the lab calcite has none, so the 2.3 \u00b5m band lines up but the band shapes differ.' : ''}</p>
    <p class="muted nerd-only">Compared over ${sp.window_um[0]}\u2013${sp.window_um[1]} \u00b5m (${P.esc(sp.window_why || '')}). ${P.esc(S.method)} ${P.esc(S.note)} ${orbit ? `EMIT scene ${P.esc(e.scene)} (${P.esc(e.date)}), ${P.esc(e.pixels)}, centred ${e.lat.toFixed(3)}\u00b0, ${e.lon.toFixed(3)}\u00b0.` : `Lab specimen ${P.esc(e.sample || '')} ${P.esc(e.name || '')}${e.description ? `: ${P.esc(e.description.replace(/&lt;/g, '<'))}` : ''}${e.where ? `, ${P.esc(e.where)}` : ''}.`} Mars: ${P.esc(m.product || '')} at ${m.lat.toFixed(2)}\u00b0, ${m.lon.toFixed(2)}\u00b0. Gaps: masked bands.</p>
    <span class="src">Mars: ${P.esc(m.source)}</span><span class="src">Earth: ${P.esc(e.source)}</span>`;
  state.specChart = overlayChart($('spec-chart'), {
    x: { label: 'Wavelength', unit: '\u00b5m' }, y: { label: 'Reflectance, continuum removed', unit: '' },
    series: [
      { world: 'mars', label: `Mars, CRISM: ${m.where}`, points: pts(sp.mars_cr) },
      { world: 'earth', label: orbit ? `Earth, EMIT: ${e.where}` : `Lab: ${e.sample || 'sample'}`, points: pts(sp.earth_cr) },
    ],
  });
  $('spec-pick').addEventListener('change', (ev) => renderSpectrum(ev.target.value));
}

function renderSources() {
  if (state.planet) $('planet-source').textContent = state.planet.sources.join(' · ');
  const earth = [...(state.earth?.sources || [])];
  if (state.grid?.year) earth.push(`Earth data: ${state.grid.year}`);
  $('earth-source').textContent = earth.join(' · ');
}

async function refreshStatus() {
  const files = await dataIndex();
  const wanted = [...WANTED, ...state.targets.map((t) => `scores_${t.id}.json`)];
  $('card-status').innerHTML = P.statusCard(files, wanted);
}

// ---------- UI ----------
function wireUi() {
  document.querySelectorAll('.seg button').forEach((b) =>
    b.addEventListener('click', () => b.dataset.world !== state.world && setWorld(b.dataset.world)),
  );
  $('target-select').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v.startsWith('mission:')) selectMission(v.slice(8));
    else selectTarget(v);
  });
  $('lens-select').addEventListener('change', async (e) => {
    const lens = e.target.value === '__ask' ? state.askLens : state.lenses?.lenses?.find((l) => l.id === e.target.value);
    state.weights = lens ? lens.weights : null;
    state.lensLabel = lens ? lens.name || lens.id : '';
    await drawHeat();
  });
  $('reh-btn').addEventListener('click', () => toggleRehearse(!state.rehOn));
  $('story-btn').addEventListener('click', playStory);
  const sunApply = () => {
    const on = $('sun-on').checked;
    $('sun-hour').disabled = !on;
    if (!on || !state.target) { clearSun({ planet: state.planet, earth: state.earth }); $('sun-label').textContent = 'off'; return; }
    const h = +$('sun-hour').value;
    const spot = diveEarthSite() || { lat: 0, lon: 0 };
    setSun({ planet: state.planet, earth: state.earth, world: state.world, target: state.target, earthSpot: spot, hour: h });
    for (const v of [state.planet.viewer, state.earth.viewer]) {
      if (v._twSun) continue;
      v._twSun = true;
      v.camera.moveEnd.addEventListener(() => { if ($('sun-on').checked) sunApply(); });
    }
    $('sun-label').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')} local`;
  };
  $('sun-on').addEventListener('change', sunApply);
  $('sun-hour').addEventListener('input', sunApply);
  $('undisc-btn').addEventListener('click', () => {
    state.undiscovered = !state.undiscovered;
    $('undisc-btn').setAttribute('aria-pressed', String(state.undiscovered));
    for (const s of state.sites?.sites || []) state.earth.viewer.entities.removeById(`site:${s.id}`);
    drawSites();
    renderMatch();
    toast(state.undiscovered ? 'Undiscovered: famous analog sites hidden; top places skip anywhere within 3\u00b0 of them.' : 'Showing all sites.', 4000);
  });
  $('zones-btn').addEventListener('click', () => {
    state.showZones = state.showZones === false;
    $('zones-btn').setAttribute('aria-pressed', String(state.showZones));
    state.zones?.remove();
    state.zones = state.showZones && state.heat ? drawZones(state.earth.viewer, state.heat) : null;
  });
  $('mode-toggle').addEventListener('click', () => {
    const nerd = document.body.classList.toggle('mode-nerd');
    document.body.classList.toggle('mode-normal', !nerd);
    $('mode-toggle').setAttribute('aria-pressed', String(nerd));
    renderNerd();
  });
  $('ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('ask-input').value.trim();
    if (q) ask(q);
  });
  $('dive-btn').addEventListener('click', () => startDive());
  $('mt-btn').addEventListener('click', () => startMission());
  $('card-mission').addEventListener('click', (e) => {
    const b = e.target.closest?.('.seg[data-seg]');
    if (!b || !state.mt) return;
    const n = state.mt.segments.length;
    state.mt.pause();
    state.mt.seek((+b.dataset.seg + 0.02) / n);
  });
  $('mt-play').addEventListener('click', () => (state.mt?.playing ? state.mt.pause() : state.mt?.play()));
  $('mt-seek').addEventListener('input', (e) => {
    state.mt?.pause();
    state.mt?.seek(+e.target.value / 1000);
  });
  $('reset-btn').addEventListener('click', () => {
    state.dive?.stop();
    stopMission();
    $('dive-readout').textContent = '';
    // Fly back to the whole globe, but keep the chosen target and best match centred.
    const t = state.target;
    const best = state.heat?.ranked?.[0];
    if (t) flyToPoint(state.planet.viewer, state.world, t.lon, t.lat, null, 1.2);
    else flyHome(state.planet.viewer, state.world, 1.2);
    if (best) flyToPoint(state.earth.viewer, 'earth', best.lon, best.lat, null, 1.2);
    else flyHome(state.earth.viewer, 'earth', 1.2);
  });
  document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  showTab('match');
  $('drawer-toggle').addEventListener('click', () => {
    document.querySelector('.stage').classList.toggle('drawer-closed');
    // Cesium resizes on the next frame; nudge both canvases after the transition.
    setTimeout(() => { state.planet?.viewer.resize(); state.earth?.viewer.resize(); }, 300);
  });
  document.querySelector('.legend-bar').style.background = rampCss();
}

let toastTimer = null;
function toast(msg, ms = 3500) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.querySelector('.stage').appendChild(el);
  }
  el.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), ms);
}

// Exposed for headless tests and debugging in the console.
// Source lines are one line with "…"; click to read the full source.
document.addEventListener('click', (e) => {
  const src = e.target.closest?.('.src');
  if (src) src.classList.toggle('open');
});

window.twinworlds = { state, selectTarget, selectCell, startDive, setWorld, startMission, loadNerd };

boot().catch((e) => {
  console.error(e);
  toast(`Startup failed: ${e.message}`, 10000);
});

