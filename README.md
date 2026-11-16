# TwinWorlds

**Which parts of the Moon and Mars can we rehearse on Earth, and which can't we?**

TwinWorlds scores every land place on Earth by how closely it matches a real site on the Moon or Mars, using measurements taken the same way on both worlds. It shows the best Earth analogs on two linked 3D globes and says plainly what Earth can never reproduce.

Built by team **Connected, No Internet** for **NASA Space Apps Challenge 2026** (New York City Local Event, virtual), challenge: *Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*.

- **Live site:** https://twinworlds.us (mirror: https://twinworlds.pages.dev)
- **Public API:** https://twinworlds-api.ibisadatgamer.workers.dev (docs: https://twinworlds.us/api.html)

---

## The problem

Rovers, habitats, drills and crews are tested on Earth before they fly. But the well-known analog sites (Atacama, Devon Island, Utah's Mars Desert Research Station) were picked mostly by eye and described in words. Nobody can easily answer: for *this* landing site, *this* mission, which places on Earth are measurably closest, and on which conditions do they fall short?

## What TwinWorlds does

**Match**
- **Twin Globes:** pick a target on Mars or the Moon and the whole Earth lights up as a heatmap of match scores, with match zones outlined. Click anywhere on either globe.
- **Analog Fingerprint:** a per-condition breakdown (slope, hilliness, day and night temperature, day-night swing, brightness, plant cover) for any Earth place.
- **Mission Lenses:** rescore Earth for a goal: balanced, landing, rover driving, lunar base, thermal testing or astrobiology.
- **Closest / Spread worldwide:** the top-places list can show the best region only, or the best option on every continent (picks at least 2,000 km apart).
- **Undiscovered toggle:** hides everywhere near a famous analog, to surface strong places nobody uses yet.

**Explore**
- **Missions:** Curiosity, Perseverance, InSight, Phoenix, Apollo sites and others, with rover routes.
- **Mission Twin:** replays a rover's whole drive and finds the Earth route whose conditions change the same way, with matched timing.
- **Rehearsability Map:** colours all of Mars and the Moon by how well Earth can rehearse each spot.
- **Landsat then and now:** 1985 vs 2024 imagery of hero analog sites, so you can see whether a site has changed.
- **Sun slider and Story mode:** real sun angle and shadows on each world, and a guided tour.

**Science**
- **Minerals:** Curiosity's measured Mars soil chemistry and mineralogy compared with Earth rocks, simulants and a Martian meteorite. Orbital spectra from Mars (CRISM) are matched against lab spectra (RELAB) and Earth from orbit (NASA EMIT). Jezero shows Perseverance's own crater-floor chemistry.
- **Ground type:** a heat-flow model turns day and night temperatures into thermal inertia (sand vs rock), on every world.
- **Sky:** dust, water vapour and UV shielding on Mars vs the matched Earth place.
- **Right now:** live Mars local time, season and modelled temperature at the target.

**Proof**
- **Blind test:** famous analog sites are never used in scoring, then we check where they rank. For Jezero the median famous site lands in the top 5.8% of Earth's land; Utah's Mars Desert Research Station, the Mojave, Danakil, Atacama and Iceland all land in the top 1.5%. Random would be top 50%.
- **Nerd mode:** every number shows its maths, histograms and source.
- **What Earth can't do:** gravity, vacuum or thin CO2 air, radiation and ozone-free UV are shown on every site as permanent gaps, never hidden.

**AI (clearly labelled as AI-generated)**
- **Explain**, **Ask**, **What-if** and **Field Brief** use Google Gemini to explain a match in plain words. The AI receives only measured values and never changes a score.

## How it works

1. **Same measurements on both worlds.** Elevation gives slope and hilliness (MOLA, LOLA, USGS GMTED2010). Thermal instruments give day and night surface temperature (TES and the Mars Climate Database, Diviner, MODIS). Albedo and plant cover come from matching instruments.
2. **Similarity per condition.** Each condition is scored with a Gaussian, with width set by Earth's own spread (a quarter of the 5th to 95th percentile range).
3. **Combine.** A weighted geometric mean, so one terrible condition cannot be hidden by good ones. Lenses change the weights.
4. **Honesty rules.** A condition where the target is outside anything on Earth does not vote; it is listed as a gap instead. Tiers are relative (top 0.5, 2, 5 and 10% of Earth's land).
5. **Validate.** The blind test above, plus a known-bias check: high, cold, dry Asian plateaus win often for Mars and the Moon, the app says so, and Spread view shows the best alternative everywhere else.

The full method, every dataset and version are in [`data/SOURCES.md`](data/SOURCES.md). The judge-style test reports are in [`docs/QA_REPORT.md`](docs/QA_REPORT.md).

## Data

**NASA:** MODIS land surface temperature, albedo and NDVI; Landsat 5 and 8/9 Collection 2; EMIT L2A surface reflectance; NASA POWER climatology; MGS MOLA and TES; MRO CRISM type spectra; LRO LOLA and Diviner; Curiosity APXS and CheMin; Perseverance SuperCam (published values); mission traverses from MMGIS; RELAB spectral library (via the PDS); Mars24 time algorithm.

**Partners and other open data:** Mars Climate Database v6.2 (LMD, ESA, CNES), ERA5 via Open-Meteo, USGS GMTED2010 elevation, USGS BHVO-2 reference basalt, Natural Earth place names, Cesium World Terrain and imagery.

## Limitations

- No place on Earth reproduces reduced gravity, the lunar vacuum, the thin Martian air or their radiation. These appear as gaps on every result.
- The Earth grid is 0.5 degrees (about 55 km), so the app finds regions to scout, not exact test pads.
- Satellites cannot map rock chemistry on Earth pixel by pixel, so mineral comparisons use rover, lab and meteorite samples, tagged as such.
- Some Mars values are model outputs (Mars Climate Database). They are labelled as modelled.

## Tech stack

- **Frontend:** CesiumJS (3D globes), Chart.js, plain JavaScript, Vite.
- **Data pipeline:** Python with NumPy; Google Earth Engine (Python API) for Landsat and EMIT.
- **Backend:** Cloudflare Worker (API, hourly cron for live Mars conditions, cached), Gemini API for explanations.
- **Hosting:** Cloudflare Pages, domain twinworlds.us.

## Run it locally

You need Node.js 20 or newer.

```bash
git clone https://github.com/ibrhaimsadat123/Fullbuild.git
cd Fullbuild/frontend
npm install
cp .env.example .env     # optional: add your own free Cesium ion token
npm run dev              # open http://localhost:5173
```

The processed data is already in `data/processed`, so the app runs without re-running the pipeline. To rebuild the data, install `numpy` (and `earthengine-api` for the Earth Engine scripts) and run the scripts in `pipeline/`; `score.py` produces the match scores.

To run your own API, deploy `worker/` with Wrangler and add your own Gemini key as a secret (`npx wrangler secret put GEMINI_API_KEY`). No keys are stored in this repository.

## API

| Route | What it returns |
|---|---|
| `GET /v1/targets` | Moon and Mars targets |
| `GET /v1/analogs?target=jezero` | Best Earth analogs for a target |
| `GET /v1/now?target=jezero` | Live Mars local time, season and modelled temperature |
| `POST /brief`, `/ask`, `/whatif`, `/when` | AI explanations (labelled AI-generated) |

Try it in the browser at https://twinworlds.us/api.html.

## Use of AI tools

- Claude (Anthropic) assisted with code, data processing and testing. Files with AI-assisted code say so in a comment at the top.
- Google Gemini powers the in-app explanations. Every AI answer is labelled as AI-generated and is built only from measured values.
- The idea, the scoring rules and the design decisions are the team's. Every number shown in the app comes from a cited dataset, not from an AI.

## Team

**Connected, No Internet**
- Ibrahim Sadat (team lead)
- Zohaib Riaz

## References

Full list with links and versions: [`data/SOURCES.md`](data/SOURCES.md). Key references:

- Mars Climate Database v6.2: Forget et al. and Millour et al., LMD/ESA/CNES.
- CRISM type spectra: Viviano-Beck et al. (2014), JGR Planets.
- Curiosity Rocknest mineralogy and chemistry: Achilles et al. (2017); Cannon et al. (2019), Icarus.
- Shergotty composition: Dreibus et al. (1982), via the NASA Mars Meteorite Compendium.
- Perseverance Máaz chemistry: Udry et al. (2022), LPSC 53.
- Mars time: Allison and McEwen (2000), Mars24 algorithm.
- RELAB spectral library, Brown University, via NASA PDS.
- Libraries: CesiumJS (Apache 2.0), Chart.js (MIT), Vite (MIT), NumPy (BSD).
