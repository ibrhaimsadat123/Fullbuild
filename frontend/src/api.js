// AI-assisted (Claude): calls to the Cloudflare Worker. The Gemini key lives only
// in the Worker as a secret; the browser never sees it.
import { API_BASE } from './config.js';

export const apiEnabled = () => !!API_BASE;

async function post(path, body) {
  if (!API_BASE) throw new Error('Backend not connected (VITE_API_BASE is not set)');
  // Never leave the card on "Thinking…": give up after 40 s with a clear message.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40_000);
  let r;
  try {
    r = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'Gemini is busy right now. Please try again in a moment.' : 'Could not reach the backend. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Backend error ${r.status}`);
  return j;
}

/** Ask the Planet: plain English -> lens weights over the dims we actually have. */
export function askPlanet({ question, target, dims, lenses }) {
  return post('/ask', { question, target, dims, lenses });
}

/** Analog Analyst: an explanation grounded only in the numbers we pass. */
export function analyst(payload) {
  return post('/analyst', payload);
}

/** What-if: Gemini explains how changing target values changed Earth's best matches (numbers only). */
export function whatIf(payload) {
  return post('/whatif', payload);
}

/** When: Gemini explains when an Earth place is closest to the target, from the computed timeline. */
export function whenBest(payload) {
  return post('/when', payload);
}

/** Live: the candidate Earth place closest to the Mars target's ground temperature right now. */
export async function liveNow(target) {
  if (!API_BASE) throw new Error('Backend not connected');
  const r = await fetch(`${API_BASE}/v1/now?target=${encodeURIComponent(target)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Backend error ${r.status}`);
  return j;
}

/** Field Brief: a one-page Gemini test plan for one Earth place, from measured data only. */
export function fieldBrief(payload) {
  return post('/brief', payload);
}
