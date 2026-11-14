# Tasks: Zohaib Riaz

**Role: 3D + Frontend Lead, and Backend + Integrations Lead**

You own everything the judges see and click: the CesiumJS Twin Globes, Twin Dive, Mission Twin playback, the Normal/Nerd UI, the Cloudflare backend, Gemini and deployment. You also own the 30-second demo video, since it's recorded from your app.

Ibrahim owns the data, the similarity engine, the blind test and the numbers. See `TASKS-IBRAHIM.md`.

---

## Folders you own

```
frontend/   CesiumJS app (Twin Globes, Twin Dive, Mission Twin, Normal/Nerd UI)
worker/     Cloudflare Workers backend + API
docs/api/   API docs page
```

Do not edit `pipeline/` or `data/processed/` without telling Ibrahim first. Read the data files; don't rewrite them.

---

## Before kickoff (now until 8:00 PM PKT)

Setup only. No project code before 8 PM. The earlier prototype stays private as inspiration; don't copy its code into this repo.

- [ ] Clone `Fullbuild`, open it in VS Code
- [ ] Install **Node.js LTS** (`winget install OpenJS.NodeJS.LTS`), restart VS Code, check `node --version`
- [ ] **Cloudflare** account for the team; install Wrangler (`npm install -g wrangler`), run `wrangler login`
- [ ] **Cesium ion** free account (for Cesium World Terrain token)
- [ ] **GoDaddy Registry** free domain (non-premium), e.g. `twinworlds.<something>`
- [ ] **Tiger Data** account (only used if time)
- [ ] Get the Gemini key from Ibrahim, store it only in `.env` / Wrangler secrets
- [ ] Skim: CesiumJS quickstart, how to load a custom ellipsoid + imagery layer (for Mars/Moon), NASA Mars Trek and Moon Trek layer services
- [ ] Ask in the NYC Discord when AMNH's OpenSpace demo is, convert to PKT
- [ ] Sleep until ~3 PM

---

## Build tasks (in order)

Hour 0 = Sat 8:00 PM PKT. Do not start a task until the one above it works.

### Block 1: Hours 0 to 2 (Sat 8 to 10 PM)
- [ ] Scaffold `frontend/` (Vite + plain JS or React, your call, keep it simple)
- [ ] **CesiumJS split screen:** Earth on the right (Cesium World Terrain), Mars on the left (Mars Trek imagery + elevation on a Mars ellipsoid). Both render and rotate
- [ ] Create the Cloudflare Pages project, first deploy of the empty app

### Block 2: Hours 2 to 8 (to Sun 4 AM)
- [ ] **Twin Globes:** click a target on Mars, load Ibrahim's sample `scores_<target>.json`, draw the Earth heatmap. Show an "illustrative data" badge while the data is sample
- [ ] **Twin Dive:** Dive button flies both cameras down together, synced altitude, pitch and heading. Start with one pair: Hingol vs Acidalia Planitia
- [ ] Moon globe works too (Moon Trek), for the lunar targets
- [ ] Sleep shift (coordinate with Ibrahim)

### Block 3: Hours 8 to 12 (to Sun 8 AM)
- [ ] **Analog Fingerprint:** site panel with radar chart of per-dimension match + plain-English verdict
- [ ] **Normal / Nerd toggle (😎 / 🤓)** at the top, global
- [ ] **"Earth Can't Do This" + "How to Fake It"** panel from `gaps.json`
- [ ] Benchmark vs Emerging tags on site markers
- [ ] Mission Lens switcher (3 lenses), heatmap reloads per lens

### Block 4: Hours 12 to 18 (to Sun 2 PM)
- [ ] **Mission Twin playback:** load `mission_twin.json`, draw both paths on the terrain, animate a rover marker along each, synchronized
- [ ] Pause anywhere: show that segment's fingerprint and **match quality bar**
- [ ] Rehearsal Itinerary panel
- [ ] **Worker backend:** `/ask` endpoint with Gemini "Ask the Planet" (natural language to lens weights + filters, JSON only), globe re-lights from the result. Key as a Wrangler secret, never in frontend code

### Block 5: Hours 18 to 22 (to Sun 6 PM)
- [ ] **One reusable overlay chart component** (Earth line vs Mars line, source tag under each number)
- [ ] Nerd charts for terrain, temperature, minerals (incl. the one spectral overlay) from `nerd_<site>.json`
- [ ] `/analyst` endpoint: Gemini explanation grounded in the fingerprint numbers, labeled "AI-generated from measured data"
- [ ] Deploy to Cloudflare, connect the GoDaddy domain, test on phone + incognito
- [ ] Submit the FortiGuard Web Filter Classification for the domain

### Block 6: Hours 22 to 26 (to **Sun 10 PM**, local deadline)
- [ ] **Feature freeze at 6 PM.** Only bug fixes after
- [ ] Two clean screenshots for Ibrahim's one-pager (Twin Dive, Mission Twin)
- [ ] Make sure the live site works without a login

### Block 7: Hours 26 to 38 (to **Mon 9:59 AM**, global deadline)
- [ ] Present remotely if selected (you lead the live demo)
- [ ] **Story Mode** camera path for the video
- [ ] Record and edit the **30-second video** (script in PROJECT.md Section 21). Hard limit: 30 seconds. English subtitles if needed. Upload to YouTube (unlisted is fine if public link works)
- [ ] Optional 7-slide backup deck
- [ ] `/v1/analogs` API endpoint + short docs page (helps the Cloudflare prize)
- [ ] Help Ibrahim finish the project page; **final submit by Mon 8:00 AM PKT**

---

## Your stretch tasks (only if everything above works)
- Sun and shadow time slider on both worlds
- Similarity-contour match zones drawn around top sites
- Extra Twin Dive pairs (Makgadikgadi vs Jezero, Lanzarote vs Mare Tranquillitatis pit)
- Field Brief export (Gemini)
- Cron Trigger weather refresh + Tiger Data via Hyperdrive
- Undiscovered toggle

---

## Questions you must be able to answer cold
1. Why CesiumJS and NASA Trek instead of Google Earth?
2. How are the two cameras kept in sync during Twin Dive?
3. Where does every number on screen come from? (Point to the source tag)
4. Why is the Gemini key safe? (Worker secret, never shipped to the browser)
5. How is Gemini kept from making things up? (Grounded in measured numbers, labeled)

---

## The data contract (shared with Ibrahim)

Ibrahim produces these files in `data/processed/`, your app reads them. **If you need a new field, ask him; don't invent it in the frontend.** Until real data lands, use his sample files and show the "illustrative data" badge whenever `"illustrative": true`.

| File | Used for |
| --- | --- |
| `earth_grid.json` | Base grid |
| `targets.json` | Mars/Moon target markers + values |
| `scores_<target>.json` | Heatmap, tiers, fingerprint dims |
| `lenses.json` | Lens switcher weights and labels |
| `sites.json` | Named site markers, Benchmark/Emerging tags, Pakistan sites |
| `blind_test.json` | Blind test result panel |
| `mission_twin.json` | Paths, segments, match quality, itinerary |
| `nerd_<site>.json` | Nerd Mode charts |
| `gaps.json` | Earth Can't Do This + How to Fake It |

Example shapes are in `TASKS-IBRAHIM.md`. The remaining shapes get fixed together at the 10 PM check-in.

---

## Check-ins with Ibrahim
| When (PKT) | Topic |
| --- | --- |
| Sat 8:00 PM | Kickoff call, confirm data contract |
| Sat 10:00 PM | Sample data works in the globe? |
| Sun 4:00 AM | Sleep handover |
| Sun 8:00 AM | First draft submitted, real scores loaded |
| Sun 2:00 PM | Mission Twin data handed over |
| Sun 6:00 PM | Feature freeze for local judging |
| Sun 9:30 PM | One-pager submitted |
| Mon 8:00 AM | Final submit |

## Git rules
- `git pull` before you start, `git pull` before you push
- Small commits, clear messages ("add twin dive camera sync")
- Never commit `.env`, API keys, `node_modules/` or `.wrangler/`
- Mark AI-assisted code with a comment
