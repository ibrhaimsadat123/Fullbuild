# TwinWorlds API (Cloudflare Workers)

| Route | What |
| --- | --- |
| `GET /health` | Status. Says whether Gemini is configured; never shows the key. |
| `GET /v1/targets` | Mars/Moon targets (`targets.json`) |
| `POST /v1/analogs` | Ranked Earth cells for a target. Body: `{ "target": "jezero", "lens": "rover_testing", "limit": 10, "needs": ["slope < 10"] }`. `target` can be an id or a name. `needs` filter on `earth_grid.json` fields; anything unparseable is returned in `needs_ignored`. |
| `POST /ask` | Gemini "Ask the Planet". `{ question, target, dims }` returns `{ label, weights, explanation }`. Weights only use the `dims` sent and are normalised. |
| `POST /analyst` | Gemini "Analog Analyst". It explains a cell using only the numbers sent, and the reply is labelled "AI-generated from measured data". |

Data comes from the deployed frontend's `/data` folder (`DATA_BASE_URL`), so the app and the API always read the same files.

## Run locally

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars    # put the Gemini key here, local only
npm run dev                        # http://127.0.0.1:8787
```

The frontend's dev server must also be running (`DATA_BASE_URL=http://localhost:5173/data`). Point the frontend at the Worker with `VITE_API_BASE=http://127.0.0.1:8787` in `frontend/.env`.

## Deploy

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY     # paste the key when asked; it is stored by Cloudflare, not in git
npm run deploy
```

Then set `VITE_API_BASE` in the frontend to the `workers.dev` URL that the deploy prints, and rebuild the frontend.

## Notes

- `GEMINI_MODEL` in `wrangler.jsonc` is a comma-separated list. Models are tried in order; a retired (404) or busy (429/5xx) model falls through to the next.
- Free Workers plans allow little CPU per request. Parsing a full 60k-cell `scores_<target>.json` can exceed it, so `/v1/analogs` uses `top_<target>.json` when it exists (see `frontend/DATA-SHAPES.md`).
- `GEMINI_BASE_URL` is only for local tests against a mock server. Leave it unset in production.
