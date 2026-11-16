// AI-assisted (Claude): TwinWorlds backend on Cloudflare Workers.
//
// Routes
//   GET  /health        backend status (no secrets in the output)
//   GET  /v1/targets    Mars/Moon targets (targets.json passthrough)
//   POST /v1/analogs    ranked Earth cells for a target, optional lens / weights / needs
//   POST /ask           Gemini "Ask the Planet": plain English -> lens weights (JSON only)
//   POST /analyst       Gemini "Analog Analyst": explanation grounded in the numbers sent
//   POST /brief         Gemini Field Brief: a one-page test plan for one Earth place, from measured data only
//   GET  /v1/now        live: which candidate Earth place is closest to the Mars target's ground
//                       temperature at this very moment (Cron Trigger refreshes it hourly)
//
// The Gemini key is a Wrangler secret (GEMINI_API_KEY). It never reaches the browser.
// Data comes from the deployed frontend's /data folder (DATA_BASE_URL), so the API
// and the app always read the same files.

const MAX_BODY = 20_000;
const ID_RE = /^[a-z0-9_]{1,64}$/;

export default {
  // Cron Trigger (wrangler.jsonc "triggers"): refresh the live answer for every Mars target each hour,
  // so visitors get a cached result instead of waiting on Open-Meteo.
  async scheduled(event, env, ctx) {
    const live = await loadData(env, ctx, 'live_candidates.json');
    for (const id of Object.keys(live.targets || {})) {
      const body = await computeNow(env, ctx, id);
      const key = new Request(`https://twinworlds-cache.internal/v1/now?target=${id}`);
      ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const route = `${request.method} ${url.pathname.replace(/\/$/, '') || '/'}`;
      let res;
      switch (route) {
        case 'GET /':
          res = json({
            name: 'TwinWorlds API',
            endpoints: ['GET /health', 'GET /v1/targets', 'GET /v1/now', 'POST /v1/analogs', 'POST /ask', 'POST /analyst', 'POST /brief', 'POST /whatif', 'POST /when'],
            docs: env.DOCS_URL || null,
          });
          break;
        case 'GET /health':
          res = json({ ok: true, gemini: !!env.GEMINI_API_KEY, model: env.GEMINI_MODEL, data: env.DATA_BASE_URL || null });
          break;
        case 'GET /v1/targets':
          res = json(await loadData(env, ctx, 'targets.json'));
          break;
        case 'POST /v1/analogs':
          res = json(await analogs(env, ctx, await readBody(request)));
          break;
        case 'GET /v1/analogs':
          res = json(await analogs(env, ctx, Object.fromEntries(url.searchParams)));
          break;
        case 'GET /v1/now':
          res = await nowRoute(env, ctx, url.searchParams.get('target') || 'jezero', request.url);
          break;
        case 'POST /ask':
          res = json(await ask(env, await readBody(request)));
          break;
        case 'POST /analyst':
          res = json(await analystRoute(env, await readBody(request)));
          break;
        case 'POST /brief':
          res = json(await briefRoute(env, await readBody(request)));
          break;
        case 'POST /whatif':
          res = json(await whatIfRoute(env, await readBody(request)));
          break;
        case 'POST /when':
          res = json(await whenRoute(env, await readBody(request)));
          break;
        default:
          res = json({ error: `No route ${route}` }, 404);
      }
      return withHeaders(res, cors);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error(e);
      return withHeaders(json({ error: e.publicMessage || e.message || 'Server error' }, status), cors);
    }
  },
};

// ---------- helpers ----------
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
function withHeaders(res, headers) {
  const r = new Response(res.body, res);
  for (const [k, v] of Object.entries(headers)) r.headers.set(k, v);
  return r;
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  e.publicMessage = message;
  return e;
}
function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = request.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}
async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw httpError(413, 'Request too large');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw httpError(400, 'Body must be JSON');
  }
}

async function loadData(env, ctx, name, { optional = false } = {}) {
  if (!env.DATA_BASE_URL) throw httpError(503, 'DATA_BASE_URL is not configured');
  const r = await fetch(`${env.DATA_BASE_URL.replace(/\/$/, '')}/${name}`, { cf: { cacheTtl: 300, cacheEverything: true } });
  const type = r.headers.get('Content-Type') || '';
  if (!r.ok || !type.includes('json')) {
    if (optional) return null;
    throw httpError(404, `${name} is not published yet`);
  }
  return r.json();
}

// ---------- /v1/analogs ----------
// Same reader as frontend/src/data.js normalizeScores (compact table -> object cells).

/**
 * scores_<target>.json comes as a compact table: `fields` + rows, per-feature
 * similarities in `s_<feature>` columns, tier cut-offs in `tiers`. Column order is
 * read from `fields`. Returns the same file with cells as objects:
 * { lat, lon, score, tier, dims: { <feature>: similarity } }.
 * Files already in object form pass through unchanged.
 */
function normalizeScores(raw) {
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

const NEED_ALIASES = {
  slope: 'slope_deg',
  roughness: 'roughness_m',
  elevation: 'elevation_m',
  altitude: 'elevation_m',
  day_temp: 'lst_day_c',
  night_temp: 'lst_night_c',
  temp_swing: 'lst_swing_c',
};

async function analogs(env, ctx, q) {
  const targets = (await loadData(env, ctx, 'targets.json')).targets || [];
  const wanted = String(q.target || '').trim().toLowerCase();
  const target = targets.find((t) => t.id === wanted || t.name.toLowerCase() === wanted || t.name.toLowerCase().includes(wanted));
  if (!wanted || !target) throw httpError(400, `Unknown target. Use one of: ${targets.map((t) => t.id).join(', ')}`);
  if (!ID_RE.test(target.id)) throw httpError(400, 'Bad target id');
  const limit = Math.max(1, Math.min(100, parseInt(q.limit, 10) || 10));

  // Prefer a precomputed top list (small, fast); fall back to the full scores file.
  const scores = normalizeScores(
    (await loadData(env, ctx, `top_${target.id}.json`, { optional: true })) || (await loadData(env, ctx, `scores_${target.id}.json`)),
  );

  let weights = null;
  let lensLabel = scores.lens || null;
  if (q.weights && typeof q.weights === 'object') {
    weights = cleanWeights(q.weights);
    lensLabel = 'custom';
  } else if (q.lens) {
    const lenses = await loadData(env, ctx, 'lenses.json', { optional: true });
    const lens = lenses?.lenses?.find((l) => l.id === q.lens);
    if (!lens) throw httpError(400, `Unknown lens ${q.lens}`);
    weights = lens.weights;
    lensLabel = lens.id;
  }

  // "needs" like "slope < 10" filter on Earth grid values (same field names as earth_grid.json).
  const needs = Array.isArray(q.needs) ? q.needs.slice(0, 10) : q.needs ? [String(q.needs)] : [];
  const parsed = [];
  const ignored = [];
  for (const n of needs) {
    const m = String(n).trim().match(/^([a-z_]+)\s*(<=|>=|<|>)\s*(-?\d+(?:\.\d+)?)$/i);
    if (m) parsed.push({ field: NEED_ALIASES[m[1].toLowerCase()] || m[1].toLowerCase(), op: m[2], value: +m[3], text: n });
    else ignored.push(n);
  }
  let grid = null;
  if (parsed.length) {
    const g = await loadData(env, ctx, 'earth_grid.json', { optional: true });
    if (!g) {
      ignored.push(...parsed.map((p) => p.text));
      parsed.length = 0;
    } else {
      grid = gridLookup(g);
      for (const p of [...parsed]) {
        if (!g.fields.includes(p.field)) {
          ignored.push(p.text);
          parsed.splice(parsed.indexOf(p), 1);
        }
      }
    }
  }

  const results = [];
  const beyond = new Set(Object.keys(scores.earth_gaps || {}));
  for (const c of scores.cells || []) {
    const wm = weights ? weightedMean(c.dims, weights, beyond) : null;
    const score = weights ? (wm == null ? null : wm * (c.land ?? 1)) : c.score;
    if (typeof score !== 'number') continue;
    if (parsed.length) {
      const row = grid.get(c.lat, c.lon);
      if (!row || !parsed.every((p) => compare(row[p.field], p.op, p.value))) continue;
    }
    results.push({ lat: c.lat, lon: c.lon, score: round(score), tier: weights ? null : c.tier || null, dims: c.dims || {} });
  }
  results.sort((a, b) => b.score - a.score);

  return {
    target: { id: target.id, name: target.name, world: target.world },
    lens: lensLabel,
    weights,
    needs_applied: parsed.map((p) => p.text),
    needs_ignored: ignored,
    illustrative: !!scores.illustrative,
    dims_used: scores.dims_used || null,
    dims_missing: scores.dims_missing || null,
    earth_gaps: scores.earth_gaps || null,
    count: Math.min(limit, results.length),
    results: results.slice(0, limit),
    method: 'Per-dimension Gaussian similarity, combined as a weighted geometric mean; temperature family shares one vote; beyond-Earth dimensions do not vote (pipeline/score.py).',
  };
}

function gridLookup(g) {
  const iLat = g.fields.indexOf('lat');
  const iLon = g.fields.indexOf('lon');
  const res = g.resolution_deg || 0.5;
  const key = (lat, lon) => `${Math.floor((lat + 90) / res)}:${Math.floor((lon + 180) / res)}`;
  const map = new Map();
  for (const row of g.cells) map.set(key(row[iLat], row[iLon]), row);
  return {
    get(lat, lon) {
      const row = map.get(key(lat, lon));
      return row ? Object.fromEntries(g.fields.map((f, i) => [f, row[i]])) : null;
    },
  };
}
function compare(v, op, x) {
  if (typeof v !== 'number') return false;
  return op === '<' ? v < x : op === '<=' ? v <= x : op === '>' ? v > x : v >= x;
}
const FAMILY_W = { lst_day_c: 1 / 3, lst_night_c: 1 / 3, lst_swing_c: 1 / 3 };
function weightedMean(dims, weights, skip = new Set()) {
  // Weighted GEOMETRIC mean, each dimension floored at 0.01: same rule as pipeline/score.py
  // and the app (frontend/src/heatmap.js), so one badly failed dimension pulls the score down.
  let s = 0;
  let w = 0;
  for (const [k, lensW] of Object.entries(weights)) {
    const wt = skip.has(k) ? 0 : lensW * (FAMILY_W[k] ?? 1);
    if (typeof dims?.[k] === 'number' && wt > 0) {
      s += Math.log(Math.max(dims[k], 0.01)) * wt;
      w += wt;
    }
  }
  return w > 0 ? Math.exp(s / w) : null;
}
function cleanWeights(obj, allowed = null) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (allowed && !allowed.includes(k)) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = Math.min(1, n);
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (!sum) throw httpError(422, 'No usable weights');
  for (const k of Object.keys(out)) out[k] = round(out[k] / sum);
  return out;
}
const round = (n) => Math.round(n * 1e4) / 1e4;

// ---------- Gemini ----------
async function gemini(env, { system, user, schema, temperature = 0.2 }) {
  if (!env.GEMINI_API_KEY) throw httpError(503, 'Gemini is not configured on the backend yet');
  // GEMINI_MODEL may list several names, comma-separated. If Google has retired one
  // (404) or a model is busy (429/5xx), the next is tried, so a renamed model does not break the app.
  const models = String(env.GEMINI_MODEL || 'gemini-flash-latest').split(',').map((m) => m.trim()).filter(Boolean);
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: schema
      ? { temperature, responseMimeType: 'application/json', responseSchema: schema }
      : { temperature, responseMimeType: 'text/plain' },
  };
  // GEMINI_BASE_URL is only for local tests against a mock server.
  const base = env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  let lastStatus = 0;
  for (const model of models) {
    // A model that hangs is treated like a busy one: move on after 12 s.
    let r;
    try {
      r = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      });
    } catch (e) {
      lastStatus = 504;
      console.error('Gemini timeout/network', model, String(e));
      continue;
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      lastStatus = r.status;
      console.error('Gemini error', model, r.status, JSON.stringify(j).slice(0, 500));
      // 404 = retired name; 429/5xx = busy or not served on this plan. Try the next model.
      if (r.status === 404 || r.status === 429 || r.status >= 500) continue;
      throw httpError(502, `Gemini returned ${r.status}`);
    }
    const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
    if (!text) throw httpError(502, 'Gemini returned no text');
    return { text, model };
  }
  throw httpError(502, `Gemini returned ${lastStatus} for every model name tried`);
}

// ---------- /ask ----------
async function ask(env, b) {
  const question = String(b.question || '').trim().slice(0, 300);
  if (!question) throw httpError(400, 'question is required');
  const dims = (Array.isArray(b.dims) ? b.dims : []).map(String).filter((d) => ID_RE.test(d)).slice(0, 20);
  if (!dims.length) throw httpError(400, 'dims (the score dimensions available) is required');
  const lenses = (Array.isArray(b.lenses) ? b.lenses : []).slice(0, 10).map((l) => ({ id: l.id, name: l.name, weights: l.weights }));

  const system = [
    'You help mission planners score places on Earth as analogs for Moon and Mars sites.',
    'Turn the request into weights over the score dimensions listed. Use only those dimension names.',
    'A weight is 0 to 1; 0 means ignore. Give higher weight to what the request cares about most.',
    'Do not invent data, places or numbers. You only choose weights; the scores come from measured data.',
    'label: 2 to 4 words naming the lens. explanation: one or two plain sentences on why these weights.',
  ].join(' ');
  const user = JSON.stringify({ request: question, target: b.target || null, dimensions: dims, existing_lenses: lenses });
  const schema = {
    type: 'OBJECT',
    properties: {
      label: { type: 'STRING' },
      weights: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { dim: { type: 'STRING', enum: dims }, weight: { type: 'NUMBER' } },
          required: ['dim', 'weight'],
        },
      },
      explanation: { type: 'STRING' },
    },
    required: ['label', 'weights', 'explanation'],
  };
  const { text, model } = await gemini(env, { system, user, schema });
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw httpError(502, 'Gemini did not return JSON');
  }
  const weights = cleanWeights(Object.fromEntries((parsed.weights || []).map((w) => [w.dim, w.weight])), dims);
  return {
    label: String(parsed.label || 'Ask the Planet').slice(0, 40),
    weights,
    explanation: String(parsed.explanation || '').slice(0, 400),
    model,
    ai_generated: true,
  };
}

// ---------- /analyst ----------
async function analystRoute(env, b) {
  const t = b.target || {};
  const cell = b.cell || {};
  if (typeof cell.lat !== 'number' || typeof cell.lon !== 'number') throw httpError(400, 'cell.lat and cell.lon are required');
  const facts = {
    target: { name: t.name, world: t.world, features: t.features },
    earth_cell: { place: typeof b.place === 'string' ? b.place.slice(0, 120) : null, lat: cell.lat, lon: cell.lon, overall_score: cell.score, tier: cell.tier, dimension_scores: cell.dims },
    beyond_earth: b.beyondEarth || null,
    earth_values: b.earth || null,
    earth_sources: b.earthSources || null,
    earth_data_year: b.earthYear || null,
  };
  const system = [
    'You are the Analog Analyst for TwinWorlds. Explain, in plain English for a general audience, how well this place on Earth matches the Moon or Mars site.',
    'Use ONLY the numbers in the data given. Do not add facts, places, history or numbers that are not in it.',
    'Scores run 0 to 1 (1 = identical). If a value is null or its status is "pending", say it has not been measured yet.',
    'Say which dimensions match well and which do not. 3 to 5 sentences. No headings, no lists.',
    'Call the place by earth_cell.place if it is given, with no coordinates.',
    'beyond_earth lists dimensions where the target lies outside anything on Earth. For those, a high score only means this place is among the closest Earth gets; never call it a match. Say plainly that no place on Earth reaches the target value there.',
    'Ignore dimensions that were not scored (for example thermal inertia); do not mention them.',
  ].join(' ');
  const { text, model } = await gemini(env, { system, user: JSON.stringify(facts).slice(0, 12_000), temperature: 0.3 });
  return { text: text.trim(), label: 'AI-generated from measured data', model, ai_generated: true };
}

// ---------- /brief ----------
// Field Brief: a short mission test plan for one Earth place, written ONLY from the data the app sends.
async function briefRoute(env, b) {
  const t = b.target || {};
  const facts = {
    target: { name: t.name, world: t.world, features: t.features },
    earth_place: { name: typeof b.place === 'string' ? b.place.slice(0, 120) : null, overall_score: b.cell?.score, rank_top_percent: b.cell?.top, dimension_scores: b.cell?.dims },
    earth_values: b.earth || null,
    beyond_earth: b.beyondEarth || null,
    cannot_simulate_and_how_to_fake_it: Array.isArray(b.gaps) ? b.gaps.slice(0, 8) : null,
    ground_type: b.ground || null,
    best_months: b.months || null,
  };
  const schema = {
    type: 'OBJECT',
    properties: {
      title: { type: 'STRING' },
      why_here: { type: 'STRING' },
      what_matches: { type: 'ARRAY', items: { type: 'STRING' } },
      what_does_not: { type: 'ARRAY', items: { type: 'STRING' } },
      tests_to_run: { type: 'ARRAY', items: { type: 'STRING' } },
      hardware_for_the_gaps: { type: 'ARRAY', items: { type: 'STRING' } },
      when_to_go: { type: 'STRING' },
    },
    required: ['title', 'why_here', 'what_matches', 'what_does_not', 'tests_to_run', 'hardware_for_the_gaps', 'when_to_go'],
  };
  const system = [
    'You write a one-page Field Brief for a mission team planning to test hardware at a place on Earth that resembles a Mars or Moon site.',
    'Use ONLY the data given. Never invent numbers, places, people, permits, logistics or facts that are not in it. Quote numbers exactly as given, with units.',
    'Scores run 0 to 1 (1 = identical). Dimensions in beyond_earth are outside anything on Earth: say so; never call them a match.',
    'tests_to_run: 3 to 5 concrete tests the matching dimensions make sensible (rover mobility on similar slopes, thermal cycling, instrument calibration on similar albedo), each one sentence tied to a number.',
    'hardware_for_the_gaps: one line per item in cannot_simulate_and_how_to_fake_it, from that list only.',
    'when_to_go: from best_months if given, else say timing data was not provided. Plain English, short sentences.',
  ].join(' ');
  const { text, model } = await gemini(env, { system, user: JSON.stringify(facts).slice(0, 14_000), schema, temperature: 0.3 });
  let brief;
  try { brief = JSON.parse(text); } catch { throw httpError(502, 'Gemini returned an unreadable brief; try again'); }
  return { brief, label: 'AI-generated from measured data', model, ai_generated: true, facts };
}

// ---------- /whatif ----------
// The app changed some target values, re-scored all of Earth, and sends the top places before and after.
async function whatIfRoute(env, b) {
  const clip = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const facts = {
    target: String(b.target || '').slice(0, 120),
    world: String(b.world || '').slice(0, 10),
    changes: clip(b.changes, 7).map((c) => ({ measurement: String(c.label || c.dim).slice(0, 60), unit: String(c.unit || '').slice(0, 10), real_value: c.from, what_if_value: c.to })),
    top_places_before: clip(b.before, 5),
    top_places_after: clip(b.after, 5),
    beyond_anything_on_earth_after: clip(b.beyond_earth_after, 7),
  };
  if (!facts.changes.length) throw httpError(400, 'No changes to explain');
  const system = [
    'You explain a what-if experiment in TwinWorlds, a tool that finds places on Earth that match a site on Mars or the Moon.',
    'The user changed some measurements of the site; all of Earth was re-scored. Explain in plain English why the best-matching Earth places changed.',
    'Use ONLY the data given. Do not invent places, numbers or facts not in it. Mention which places entered or left the top list.',
    'If a changed value is beyond anything on Earth, say no place on Earth can match it, so it no longer helps choose between places.',
    '3 to 4 sentences. No headings, no lists.',
  ].join(' ');
  const { text, model } = await gemini(env, { system, user: JSON.stringify(facts), temperature: 0.3 });
  return { text: text.trim(), label: 'AI-generated from the numbers given', model, ai_generated: true };
}

// ---------- /when ----------
// The app simulated an Earth place every 2 weeks (Earth monthly climate + the Mars season) and
// sends the result. Gemini says when the place is most like the target, how long until then, and why.
async function whenRoute(env, b) {
  const clip = (a, n) => (Array.isArray(a) ? a.slice(0, n) : []);
  const facts = {
    earth_place: String(b.place || '').slice(0, 120),
    target: String(b.target || '').slice(0, 120),
    world: String(b.world || '').slice(0, 10),
    today: b.today || null, best: b.best || null, worst: b.worst || null,
    timeline: clip(b.timeline, 40),
  };
  if (!facts.best) throw httpError(400, 'best is required');
  const system = [
    'You are the timing analyst for TwinWorlds. The app simulated how closely an Earth place matches a site on Mars or the Moon over time,',
    'using Earth monthly climate and the Mars season. Using ONLY the numbers given, say: when the place is most like the target, how many weeks from now that is,',
    'and why (which measurements move closer or further, comparing earth_values with target_values and the dimension_scores at best vs today).',
    'Name what never matches (beyond_anything_on_earth). Match scores run 0 to 1. Do not invent facts, places or numbers.',
    '4 to 5 plain sentences. No headings, no lists.',
  ].join(' ');
  const { text, model } = await gemini(env, { system, user: JSON.stringify(facts).slice(0, 14000), temperature: 0.3 });
  return { text: text.trim(), label: 'AI-generated from the simulated numbers', model, ai_generated: true };
}


// ---------- live: most Mars-like place right now ----------
// Mars ground temperature now: Mars Climate Database v6.2 (mars_diurnal.json) at the target, today's
// season (Ls, Allison & McEwen 2000) and the target's local mean solar time right now (Mars24 method).
// Earth ground temperature now: Open-Meteo current soil temperature at 0 cm, for the target's top places.
async function nowRoute(env, ctx, target, reqUrl) {
  if (!ID_RE.test(target)) throw httpError(400, 'Bad target id');
  const key = new Request(`https://twinworlds-cache.internal/v1/now?target=${target}`);
  const hit = await caches.default.match(key);
  if (hit) {
    const body = await hit.json();
    if (Date.now() - Date.parse(body.computed_at) < 60 * 60 * 1000) return json({ ...body, cached: true });
  }
  const body = await computeNow(env, ctx, target);
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } })));
  return json(body);
}

async function computeNow(env, ctx, target) {
  const live = await loadData(env, ctx, 'live_candidates.json');
  const t = live.targets?.[target];
  if (!t) throw httpError(400, `Live data covers Mars targets only: ${Object.keys(live.targets || {}).join(', ')}`);
  const D = await loadData(env, ctx, 'mars_diurnal.json');
  const now = new Date();
  const ls = marsLsNow(now);
  const lmst = marsLmst(now, t.lon);
  const marsT = marsTempAt(D, t.lat, t.lon, ls, lmst);
  const lat = t.places.map((p) => p.lat.toFixed(3)).join(',');
  const lon = t.places.map((p) => p.lon.toFixed(3)).join(',');
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=soil_temperature_0cm,temperature_2m&timezone=GMT`);
  if (!r.ok) throw httpError(502, `Open-Meteo returned ${r.status}`);
  let om = await r.json();
  if (!Array.isArray(om)) om = [om];
  const places = t.places.map((p, i) => {
    const cur = om[i]?.current || {};
    const g = cur.soil_temperature_0cm;
    return { ...p, ground_c: g ?? null, air_c: cur.temperature_2m ?? null, diff_c: typeof g === 'number' ? Math.round(Math.abs(g - marsT) * 10) / 10 : null,
      local_solar_hour: Math.round((((now.getUTCHours() + now.getUTCMinutes() / 60 + p.lon / 15) % 24) + 24) % 24 * 10) / 10 };
  }).sort((a, b) => (a.diff_c ?? 1e9) - (b.diff_c ?? 1e9));
  return {
    target: { id: target, name: t.name, lat: t.lat, lon: t.lon },
    computed_at: now.toISOString(),
    mars: { ls: Math.round(ls * 10) / 10, local_solar_time_h: Math.round(lmst * 10) / 10, ground_c: Math.round(marsT * 10) / 10 },
    best: places[0],
    places,
    method: "Mars: Mars Climate Database v6.2 surface temperature at this season and the target's local mean solar time now. Earth: Open-Meteo current soil temperature at 0 cm at the target's 12 best-scoring places (by the TwinWorlds score). Closest = smallest absolute difference. Refreshed hourly by a Cloudflare Cron Trigger.",
    sources: ['Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES)', 'Open-Meteo forecast API (current conditions)', 'Mars24 time algorithm (Allison & McEwen 2000)'],
  };
}

function marsLsNow(date) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const dt = jd + 69.184 / 86400 - 2451545.0;
  const M = (19.3871 + 0.52402073 * dt) * rad;
  const a = 270.3871 + 0.524038496 * dt;
  const eoc = (10.691 + 3e-7 * dt) * Math.sin(M) + 0.623 * Math.sin(2 * M) + 0.05 * Math.sin(3 * M) + 0.005 * Math.sin(4 * M) + 0.0005 * Math.sin(5 * M);
  return (((a + eoc) % 360) + 360) % 360;
}

/** Local mean solar time (h) at an east longitude on Mars, now (Allison & McEwen 2000; Mars24). */
function marsLmst(date, lonEast) {
  const jdTT = date.getTime() / 86400000 + 2440587.5 + 69.184 / 86400;
  const msd = (jdTT - 2405522.0028779) / 1.0274912517;
  const mtc = (((24 * msd) % 24) + 24) % 24;
  return (((mtc + lonEast / 15) % 24) + 24) % 24;
}

function marsTempAt(d, lat, lon, ls, lt) {
  const { lats, lons, seasons, times, T } = d;
  const nLat = lats.length, nLon = lons.length;
  const x = ((((lon - lons[0]) % 360) + 360) % 360) / (360 / nLon);
  const i0 = Math.floor(x) % nLon, i1 = (i0 + 1) % nLon, fx = x - Math.floor(x);
  const dLat = (lats[nLat - 1] - lats[0]) / (nLat - 1);
  const y = Math.max(0, Math.min(nLat - 1 - 1e-9, (lat - lats[0]) / dLat));
  const j0 = Math.floor(y), j1 = j0 + 1, fy = y - j0;
  const at = (si, ti) => { const g = T[si][ti]; return (1 - fx) * (1 - fy) * g[i0 * nLat + j0] + fx * (1 - fy) * g[i1 * nLat + j0] + (1 - fx) * fy * g[i0 * nLat + j1] + fx * fy * g[i1 * nLat + j1]; };
  const per = (v, arr, period) => { const step = period / arr.length; const u = ((((v - arr[0]) % period) + period) % period) / step; const a = Math.floor(u) % arr.length; return [a, (a + 1) % arr.length, u - Math.floor(u)]; };
  const [s0, s1, fs] = per(ls, seasons, 360);
  const [t0, t1, ft] = per(lt, times, 24);
  return (1 - fs) * ((1 - ft) * at(s0, t0) + ft * at(s0, t1)) + fs * ((1 - ft) * at(s1, t0) + ft * at(s1, t1)) - 273.15;
}
