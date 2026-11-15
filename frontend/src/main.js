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
import { DIVE_PAIRS, DIVE_VIEW, WORLDS } from './config.js';
import { radarChart, overlayChart, sourcesHtml } from './charts.js';
import { apiEnabled, askPlanet, analyst } from './api.js';
import * as P from './panels.js';

const $ = (id) => document.getElementById(id);

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

const WANTED = ['targets.json', 'earth_grid.json', 'lenses.json', 'sites.json', 'gaps.json', 'blind_test.json', 'mission_twin.json'];

// ---------- boot ----------
async function boot() {
  const targets = await load('targets.json');
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
  const [lenses, gaps, blind, sites, grid, mission] = await Promise.all(
    ['lenses.json', 'gaps.json', 'blind_test.json', 'sites.json', 'earth_grid.json', 'mission_twin.json'].map(load),
  );
  // Place names (optional file): same cell order as earth_grid.json.
  load('earth_places.json').then((pl) => {
    if (!pl.ok || !grid.ok) return;
    const f = grid.data.fields, iLa = f.indexOf('lat'), iLo = f.indexOf('lon');
    const res = grid.data.resolution_deg || 0.5;
    const m = new Map();
    grid.data.cells.forEach((r, i) => m.set(cellKey(r[iLa], r[iLo], res), pl.data.names[pl.data.cells[i]]));
    P.setPlaceLookup((lat, lon) => m.get(cellKey(lat, lon, res)) || '');
    if (state.target) renderMatch();
  });
  if (mission.ok && mission.data?.planet?.path?.length && mission.data?.earth?.path?.length) {
    state.mission = mission.data;
    $('mt-btn').hidden = false;
  }
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
  wireFarSideCulling(state.planet.viewer);
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
  for (const t of list) sel.add(new Option(t.name, t.id));
  await selectTarget(list[0]?.id || null);
}

function drawTargets() {
  const v = state.planet.viewer;
  v.entities.removeAll();
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
    const on = state.target && e.id === `target:${state.target.id}`;
    e.point.pixelSize = on ? 15 : 10;
    e.point.color = Color.fromCssColorString(on ? '#ffb000' : '#d9d9d9');
  }
}

// ---------- scores / heatmap ----------
async function loadScores() {
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

async function drawHeat() {
  removeHeat();
  if (!state.scores) return;
  state.heat = buildHeat(state.scores, state.weights, state.lenses?.tier_thresholds || state.scores?.tiers);
  const credit = `TwinWorlds similarity scores, ${state.target.name}${state.weights ? ` (${state.lensLabel})` : ''}`;
  state.heatLayer = await addHeatLayer(state.earth.viewer, state.heat, credit);
  $('legend').hidden = false;
  renderBadges();
  renderMatch();
}

function removeHeat() {
  if (state.heatLayer) state.earth.viewer.imageryLayers.remove(state.heatLayer, true);
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
  $('dive-here').onclick = () => startDive({ lat, lon, name: `${lat.toFixed(2)}, ${lon.toFixed(2)}` });
  const ex = $('explain-btn');
  if (ex) ex.onclick = () => explain(cell, earthRow);
}

function renderMatch() {
  if (state.cell && (state.scores || state.grid)) return selectCell(state.cell.lat, state.cell.lon);
  state.radar?.destroy();
  state.radar = null;
  $('card-match').innerHTML = P.matchEmpty({ target: state.target, scoresError: state.scoresError, heat: state.heat, scores: state.scores });
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

function drawSites() {
  for (const s of state.sites?.sites || []) {
    const tag = String(s.tag || '').toLowerCase();
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
async function selectLiveSpot(lat, lon) {
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
    id: 'live', live: true, world: state.world, lat: cell.lat, lon: cell.lon,
    name: `${state.world === 'moon' ? 'Moon' : 'Mars'} spot ${label}`,
    why: `Any spot you click is scored live against all of Earth (${g.res}° cell).`,
    features,
  };
  $('target-select').value = '';
  $('planet-site').textContent = state.target.name;
  $('card-target').innerHTML = P.targetCard(state.target, state.world);
  placeLiveMarker(cell.lat, cell.lon);
  highlightTarget();
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
function diveEarthSite() {
  if (state.cell) return { ...state.cell, name: $('earth-site').textContent };
  const pair = state.target && DIVE_PAIRS[state.target.id];
  if (pair) return pair.earth;
  const top = state.heat?.ranked?.[0];
  if (top) return { lat: top.lat, lon: top.lon, name: 'best-scoring cell' };
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
async function loadNerd(site) {
  const card = $('card-nerd');
  state.nerdCharts.forEach((c) => c.destroy());
  state.nerdCharts = [];
  const r = await load(`nerd_${site.id}.json`);
  card.hidden = false;
  if (!r.ok) {
    card.innerHTML = `<h3>${P.esc(site.name)}</h3><p class="empty">Waiting for <code>nerd_${P.esc(site.id)}.json</code>.</p>`;
    return;
  }
  const d = r.data;
  const cards = (d.cards || [])
    .map((c) => `<div class="gap"><b>${P.esc(c.title)}</b><p>${P.esc(c.text || '')}</p><span class="src nerd-only">${P.esc(c.source || '')}</span></div>`)
    .join('');
  const charts = (d.charts || [])
    .map((c, i) => `<h4>${P.esc(c.title || '')}</h4><div class="chart-wrap"><canvas id="nerd-chart-${i}"></canvas></div>${sourcesHtml(c, P.esc)}`)
    .join('');
  card.innerHTML = `<h3>${P.esc(site.name)}${d.illustrative ? ' <span class="chip">illustrative</span>' : ''}</h3>
    ${cards}<div class="nerd-only">${charts || '<p class="empty">No charts in this file.</p>'}</div>
    ${charts ? '<p class="normal-only muted">Switch to 🤓 Nerd Mode for the Earth vs target charts.</p>' : ''}`;
  (d.charts || []).forEach((c, i) => state.nerdCharts.push(overlayChart($(`nerd-chart-${i}`), c)));
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

async function startMission() {
  const m = state.mission;
  if (!m) return;
  if (m.planet.world && m.planet.world !== state.world) await setWorld(m.planet.world);
  stopMission();
  const card = $('card-mission');
  state.mt = new MissionTwin(state.planet, state.earth, m, {
    onSegment: (i) => {
      card.innerHTML = P.missionCard(m, i);
    },
  });
  state.mt.draw();
  card.hidden = false;
  $('mt-play').hidden = false;
  $('mt-seek').hidden = false;
  const s = state.mt.centers();
  const extent = Math.max(pathExtentM(state.world, m.planet.path), pathExtentM('earth', m.earth.path));
  const range = Math.min(60_000, Math.max(800, extent * 1.8));
  $('earth-site').textContent = m.earth.site || 'matched path';
  await state.dive.start(s.planet, s.earth, { ...DIVE_VIEW, range });
}

// ---------- Ask the Planet + Analyst ----------
async function ask(question) {
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
    const r = await analyst({ target: state.target, cell, earth: earthRow, earthSources: state.grid?.sources, earthYear: state.grid?.year });
    out.innerHTML = `<p>${P.esc(r.text)}</p><p class="ai-label">AI-generated from measured data (Gemini)</p>`;
  } catch (e) {
    out.innerHTML = `<p class="empty">${P.esc(e.message)}</p>`;
  }
}

// ---------- side cards ----------
function renderGaps() {
  if (!state.gaps) return;
  $('card-gaps').innerHTML = P.gapsCard(state.gaps.data, state.world, state.gaps.ok ? null : state.gaps.error);
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
  $('target-select').addEventListener('change', (e) => selectTarget(e.target.value));
  $('lens-select').addEventListener('change', async (e) => {
    const lens = state.lenses?.lenses?.find((l) => l.id === e.target.value);
    state.weights = lens ? lens.weights : null;
    state.lensLabel = lens ? lens.name || lens.id : '';
    await drawHeat();
  });
  $('mode-toggle').addEventListener('click', () => {
    const nerd = document.body.classList.toggle('mode-nerd');
    document.body.classList.toggle('mode-normal', !nerd);
    $('mode-toggle').setAttribute('aria-pressed', String(nerd));
  });
  $('ask-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('ask-input').value.trim();
    if (q) ask(q);
  });
  $('dive-btn').addEventListener('click', () => startDive());
  $('mt-btn').addEventListener('click', () => startMission());
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
window.twinworlds = { state, selectTarget, selectCell, startDive, setWorld, startMission, loadNerd };

boot().catch((e) => {
  console.error(e);
  toast(`Startup failed: ${e.message}`, 10000);
});

