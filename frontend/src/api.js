// AI-assisted (Claude): calls to the Cloudflare Worker. The Gemini key lives only
// in the Worker as a secret; the browser never sees it.
import { API_BASE } from './config.js';

export const apiEnabled = () => !!API_BASE;

async function post(path, body) {
  if (!API_BASE) throw new Error('Backend not connected (VITE_API_BASE is not set)');
  const r = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
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
