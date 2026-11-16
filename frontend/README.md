# TwinWorlds frontend

CesiumJS app: Twin Globes, Twin Dive, Mission Twin, Normal/Nerd Mode. Vite, plain JavaScript, and Chart.js for the radar and overlay charts.

## Run

```bash
cd frontend
npm install
cp .env.example .env     # then fill in the values (optional for a first look)
npm run dev              # http://localhost:5173
```

The app reads `../data/processed/` directly at `/data/...`. Ibrahim's new files show up after a page reload; no copying needed.

## Environment (`frontend/.env`, never committed)

| Variable | What it does | Without it |
| --- | --- | --- |
| `VITE_CESIUM_ION_TOKEN` | Cesium World Terrain on Earth, Cesium Mars 3D Tiles (asset 3644333) and Cesium Moon Terrain (asset 2684829) | Earth uses the CesiumJS demo token and shows a banner. Mars and Moon show NASA Trek imagery on a smooth globe with no 3D relief. |
| `VITE_API_BASE` | URL of the Worker, e.g. `https://twinworlds-api.<account>.workers.dev` | Ask the Planet and Explain (AI) say the backend is not connected. |

The ion token is meant to sit in the browser (Cesium tokens are public). In the ion dashboard, limit it to our domains. Add the Mars and Moon assets to the account from the ion **Asset Depot**, or those globes stay flat.

## Build and deploy (Cloudflare Pages)

From the repo root on Windows, one command deploys the Worker, builds the app, deploys it to Cloudflare Pages, then commits and pushes:

```powershell
.\deploy "what changed"
```

By hand:

```bash
npm run build                      # writes dist/, including dist/data/ from data/processed
cd ../worker                       # Wrangler is installed there
npx wrangler pages deploy ../frontend/dist --project-name twinworlds
```

Live at https://twinworlds.us (custom domain on the `twinworlds` Pages project; also https://twinworlds.pages.dev).

## Where things are

| File | What |
| --- | --- |
| `src/globes.js` | One Cesium viewer per world. Mars/Moon use `Ellipsoid.MARS` / `MOON`, with NASA Trek imagery and optional ion terrain. |
| `src/dive.js` | Twin Dive camera sync (below) |
| `src/heatmap.js` | `scores_<target>.json` drawn as one image draped on Earth; lens rescoring |
| `src/mission.js` | Mission Twin playback |
| `src/panels.js` | Side cards (target, match, gaps, blind test, Mission Twin) |
| `src/charts.js` | Fingerprint radar + the one reusable overlay chart |
| `src/api.js` | Calls to the Worker |
| `src/zones.js` | Match-zone outlines (marching squares on the score grid) |
| `src/rehearse.js` | Rehearsability Map layer for Mars and the Moon |
| `src/sun.js` | Sun slider: real sun direction and shadows on each world |
| `src/nerd.js` | Nerd Mode maths table, histograms and day/year charts |
| `src/timetravel.js`, `src/timesim.js` | Seasons on both worlds, month by month |
| `src/livescore.js` | Scores for any clicked Mars or Moon spot, in the browser |
| `src/main.js` | App wiring: tabs, cards, lazy loading, splash |
| `public/api.html` | Public API docs with "Try it" |
| `public/landsat/` | Landsat 1985 vs 2024 images for hero sites |
| `DATA-SHAPES.md` | The file shapes this app reads |

## How Twin Dive keeps the cameras in sync

Each world has an anchor: the Mars or Moon target, and the matched Earth site. Every frame, the leading camera's position, direction and up vector are converted into its anchor's local East-North-Up frame, in metres. The same local pose is then applied in the other anchor's frame. Both cameras end up at the same height above their site, with the same heading, pitch and roll, at true scale. Whichever globe you touch leads. During the dive only the Mars/Moon camera flies; Earth copies it every frame, so the two descents are identical.

## Honesty rules in the UI

- Every number has a source tag (Nerd Mode shows the full citation).
- `null` shows as "pending", never 0. Missing files show as "waiting for <file>".
- `"illustrative": true` in any file shows a yellow badge.
- Gemini output is labelled "AI-generated", and it only ever chooses lens weights or explains numbers we pass it.

## Known limits

- NASA Trek tiles stop at level 7 (Mars) and level 8 (Moon), so close-up imagery is soft until the ion 3D assets are on.
- Trek's global mosaics are equirectangular, so the lunar south pole (Shackleton) looks smeared.
