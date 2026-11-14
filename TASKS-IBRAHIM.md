# Tasks: Ibrahim Sadat

**Role: Data + Science Lead, and Submission Lead**

You own everything the judges will poke at scientifically: the data, the similarity engine, the blind test, Mission Twin path matching and the numbers behind Nerd Mode. You also own the one-pager and the written submission. As the maths major, you are the person who explains the scoring on stage.

Zohaib owns the 3D app, backend and integrations. See `TASKS-ZOHAIB.md`.

---

## Folders you own

```
pipeline/        all Python: data pulls, features, scoring, blind test, path matching
data/processed/  the output files Zohaib's app reads (small files only)
data/SOURCES.md  every dataset: link, version, license
docs/            one-pager, screenshots for the submission
```

Do not edit `frontend/` or `worker/` without telling Zohaib first. This is how we avoid merge conflicts.

---

## Before kickoff (now until 8:00 PM PKT)

Setup only. No project code before 8 PM.

- [ ] Open the `Fullbuild` folder in VS Code
- [ ] Create and activate `.venv`, install Python packages, select the `.venv` interpreter
- [ ] **Google Earth Engine** signup + Google Cloud project (approval can take time, do it first)
- [ ] **Gemini API key** from aistudio.google.com, send privately to Zohaib (never in the repo or chat logs)
- [ ] **Meteomatics** credentials
- [ ] Check Planetary Computer works: open the Data Catalog in the browser
- [ ] Skim: Planetary Computer quickstart, Earth Engine `reduceRegions` docs
- [ ] Read Section 12 of `PROJECT.md` (Similarity and Matching Methods) until you can explain it out loud
- [ ] Sleep until ~3 PM

---

## Build tasks (in order)

Hour 0 = Sat 8:00 PM PKT. Do not start a task until the one above it works.

### Block 1: Hours 0 to 2 (Sat 8 to 10 PM)
- [ ] Start the **global 0.5° Earth feature export** (Earth Engine): elevation/slope, roughness, MODIS day and night land surface temperature, albedo, NDVI, aerosol depth, soil moisture. Let it run in the background
- [ ] Pull elevation + temperature for the **hero regions** (Planetary Computer): Hingol, one basalt plain, Makgadikgadi
- [ ] Commit a tiny **sample** `earth_grid.json` (10 to 20 cells, labeled `"illustrative": true`) so Zohaib can build against it right away

### Block 2: Hours 2 to 8 (to Sun 4 AM)
- [ ] Build `targets.json`: feature values for Jezero, Acidalia Planitia, Arcadia Planitia, Shackleton rim, Mare Tranquillitatis pit (MOLA/LOLA slope, TES/Diviner temperature, TES thermal inertia, albedo). Every value gets a source tag
- [ ] **Similarity engine v1** (`pipeline/score.py`): normalize, per-dimension Gaussian similarity, weighted mean, tiers. Exactly as Section 12 of PROJECT.md
- [ ] Mission Lens weights (`lenses.json`): Lunar Base Builder, Landing + PSI, Rover Testing
- [ ] Sleep shift: sleep while the global export finishes (coordinate with Zohaib, one of you awake)

### Block 3: Hours 8 to 12 (to Sun 8 AM)
- [ ] Score the full global grid against every target, export `scores_<target>.json`
- [ ] **Blind test** (`pipeline/blind_test.py`): with no site names given, where do Atacama, Haughton, Dry Valleys, Mauna Kea, Devon Island, Rio Tinto, Mojave, Utah MDRS rank? Save results to `blind_test.json`. Record the honest number, good or bad
- [ ] Score the **Pakistan sites** (Hingol, Khewra, Karakoram, Chagai, Thar/Cholistan) and build `sites.json` with Benchmark vs Emerging tags
- [ ] **Submit the first draft** on the Space Apps project page (name, summary, rough description). Lock ON while editing

### Block 4: Hours 12 to 18 (to Sun 2 PM)
- [ ] **Mission Twin data:** get a short stretch of Perseverance's real Jezero route. Split into ~100 m segments, fingerprint each (slope, roughness, albedo, ground type) from Mars Trek / MOLA data
- [ ] Find the matching Earth path in the best candidate region with **Dynamic Time Warping** on the segment feature sequence. Per-segment match quality score
- [ ] Timing match: for each segment, find the Earth dates and hours (Meteomatics or Open-Meteo history) closest in temperature and sun angle. Write the **Rehearsal Itinerary**
- [ ] Export `mission_twin.json`
- [ ] If the real route is hard to get, hand-digitize a short documented segment from published maps and **say so** in SOURCES.md

### Block 5: Hours 18 to 22 (to Sun 6 PM)
- [ ] Nerd Mode data for **terrain** (slope histograms Earth vs Mars), **temperature** (24-hour curves), **minerals** (mineral cards + oxide values for 3 to 5 sites + ONE spectral pair EMIT vs CRISM). Export `nerd_<site>.json`
- [ ] "How to Fake It" hardware text for each gap (`gaps.json`)
- [ ] Write `data/SOURCES.md` completely

### Block 6: Hours 22 to 26 (to **Sun 10 PM**, local deadline)
- [ ] Sanity check every number shown in the app. Remove or label anything illustrative
- [ ] Write the **local one-pager** (template in PROJECT.md Section 20). Real numbers: blind test score, dimensions compared, datasets
- [ ] **Submit the one-pager by 9:30 PM** (30 minutes buffer)

### Block 7: Hours 26 to 38 (to **Mon 9:59 AM**, global deadline)
- [ ] Present remotely if selected (you lead the science part)
- [ ] Project page: detailed description, NASA data, partner data, references (every library and dataset)
- [ ] Use of AI section: honest and specific
- [ ] README: how it works, data sources, limitations, AI use
- [ ] Make the repo **Public**, test every link in incognito
- [ ] **Final submit by Mon 8:00 AM PKT**

---

## Your stretch tasks (only if everything above works)
- Nerd Mode for dust, water/ice, sunlight
- Extra lenses: Astrobiology, Botany/ISRU, Resource Hunting
- Landsat 1985 vs now for one hero site
- Upgrade the global grid to 0.25°

---

## Questions you must be able to answer cold
1. Why compare only same-measurement data?
2. How is one dimension's similarity computed? Why a Gaussian?
3. What happens when Mars is outside Earth's range (e.g. temperature)?
4. What did the blind test show, and what's its weakness?
5. How does Dynamic Time Warping match a rover route?
6. What can Earth never simulate, and how do teams fake it?

---

## The data contract (shared with Zohaib)

These are the files you produce and Zohaib's app reads. **Do not change a field name without telling him.**

All files live in `data/processed/`. Every number has a source.

**`earth_grid.json`**
```json
{
  "illustrative": false,
  "resolution_deg": 0.5,
  "cells": [
    { "lat": 25.25, "lon": 65.75,
      "slope_deg": 4.2, "roughness": 0.31,
      "lst_day_c": 41.0, "lst_night_c": 18.5,
      "albedo": 0.27, "ndvi": 0.05, "aod": 0.42, "soil_moisture": 0.04 }
  ],
  "sources": { "slope_deg": "NASADEM", "lst_day_c": "MODIS MOD11A2" }
}
```

**`targets.json`**
```json
[
  { "id": "jezero", "world": "mars", "name": "Jezero crater",
    "lat": 18.38, "lon": 77.58,
    "features": { "slope_deg": 3.1, "thermal_inertia": 350 },
    "sources": { "slope_deg": "MOLA", "thermal_inertia": "THEMIS" } }
]
```

**`scores_<target>.json`**
```json
{ "target": "jezero", "lens": "rover_testing",
  "cells": [ { "lat": 25.25, "lon": 65.75, "score": 0.82, "tier": "strong",
               "dims": { "terrain": 0.91, "temperature": 0.34 } } ] }
```

**`sites.json`**, **`blind_test.json`**, **`mission_twin.json`**, **`nerd_<site>.json`**, **`gaps.json`**, **`lenses.json`**: shapes agreed with Zohaib at hour 2. Write each example into this file once fixed.

---

## Check-ins with Zohaib
| When (PKT) | Topic |
| --- | --- |
| Sat 8:00 PM | Kickoff call, confirm data contract |
| Sat 10:00 PM | Sample data works in his globe? |
| Sun 4:00 AM | Sleep handover |
| Sun 8:00 AM | First draft submitted, real scores loaded |
| Sun 2:00 PM | Mission Twin data handed over |
| Sun 6:00 PM | Feature freeze for local judging |
| Sun 9:30 PM | One-pager submitted |
| Mon 8:00 AM | Final submit |

## Git rules
- `git pull` before you start, `git pull` before you push
- Small commits, clear messages ("add blind test results")
- Never commit `data/raw/`, `.env` or anything over a few MB
- Mark AI-assisted code with a comment
