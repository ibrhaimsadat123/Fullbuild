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
import { DIVE_PAIRS, DIVE_VIEW, WORLDS } from './config.js';
import { radarChart, overlayChart, sourcesHtml } from './charts.js';
import { apiEnabled, askPlanet, analyst, whatIf } from './api.js';
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
    if (state.target) { renderMatch(); resetTime(); }
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

async function drawHeat() {
  removeHeat();
  if (!state.scores) { resetTime(); return; }
  state.heat = buildHeat(state.scores, state.weights, state.lenses?.tier_thresholds || state.scores?.tiers);
  const credit = `TwinWorlds similarity scores, ${state.target.name}${state.weights ? ` (${state.lensLabel})` : ''}`;
  state.heatLayer = await addHeatLayer(state.earth.viewer, state.heat, credit);
  $('legend').hidden = false;
  renderBadges();
  renderMatch();
  resetTime();
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
  if (!state.time_lock) queueMicrotask(resetTime);
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

async function selectLiveSpot(lat, lon, meta = {}) {
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

// ---------- Time factor: a week on Mars vs a week at its Earth twin ----------
function timeEarthSpot() {
  if (state.cell) return { lat: state.cell.lat, lon: state.cell.lon, name: P.placeName(state.cell.lat, state.cell.lon) || 'selected spot' };
  const b = state.heat?.ranked?.[0];
  return b ? { lat: b.lat, lon: b.lon, name: P.placeName(b.lat, b.lon) || 'best match' } : null;
}
function resetTime() {
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

