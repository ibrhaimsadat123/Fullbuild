# TwinWorlds

**Before a rover drives a single meter on Mars, drive the same route on Earth.**

TwinWorlds finds the places on Earth that best match real sites on the Moon and Mars, using only measurements taken the same way on both worlds. You can dive into both in synchronized 3D, compare them dimension by dimension in plain language or full scientific detail, and rehearse a real mission traverse on a matched Earth path, step by step.

Built for **NASA Space Apps Challenge 2026**, NYC Local Event (virtual).
Team: **Ibrahim Sadat**, **Zohaib Riaz** (+ teammates).

> One sentence a judge can repeat: *"TwinWorlds lets mission teams rehearse a Moon or Mars mission on matched terrain on Earth, and shows honestly where Earth can't prepare us."*

---

## Table of Contents

1. [Deadlines (Lahore time)](#1-deadlines-lahore-time)
2. [The Challenge](#2-the-challenge)
3. [How We Get Judged](#3-how-we-get-judged)
4. [Scope Lock](#4-scope-lock)
5. [The Story Arc](#5-the-story-arc)
6. [The Honest Cut](#6-the-honest-cut)
7. [Core Idea: Same Measurement, Both Worlds](#7-core-idea-same-measurement-both-worlds)
8. [Hero Features](#8-hero-features)
9. [Normal Mode and Nerd Mode](#9-normal-mode-and-nerd-mode)
10. [Supporting Features](#10-supporting-features)
11. [Roadmap Features](#11-roadmap-features)
12. [Similarity and Matching Methods](#12-similarity-and-matching-methods)
13. [Architecture](#13-architecture)
14. [Sponsors and Free Resources](#14-sponsors-and-free-resources)
15. [Data Sources](#15-data-sources)
16. [Repo Structure and Rules](#16-repo-structure-and-rules)
17. [Team Roles](#17-team-roles)
18. [Build Timeline](#18-build-timeline)
19. [Submission Checklist](#19-submission-checklist)
20. [Local One-Pager Template](#20-local-one-pager-template)
21. [Global Demo: 30-Second Video and 7-Slide Backup](#21-global-demo-30-second-video-and-7-slide-backup)
22. [Use of AI Tools](#22-use-of-ai-tools)
23. [Risks and Mitigations](#23-risks-and-mitigations)

---

## 1. Deadlines (Lahore time)

NYC is 10 hours behind Lahore (PKT).

| Milestone | NYC | Lahore (PKT) | Build hour |
| --- | --- | --- | --- |
| Hacking starts (no work before this) | Sat 10:00 AM | **Sat 8:00 PM** | 0 |
| Submit first draft on Space Apps site | Sat evening | **Sun ~8:00 AM** | 12 |
| **Local one-pager due** | **Sun 12:00 PM** | **Sun 10:00 PM** | **26** |
| Local judging + selected presentations (remote allowed) | Sun afternoon | Sun night / late night | 26 to 32 |
| **Global submission closes** | **Sun 11:59 PM** | **Mon 9:59 AM** | **38** |

Rules from orientation:
- No work before 10:00 AM NYC Saturday.
- Submit a draft early and keep revising. Only the last save counts. 12:01 is too late.
- Judges read every one-pager, then pick some teams to present. Remote presentations are allowed.

---

## 2. The Challenge

Use open Earth, Moon and Mars data from NASA and other space agencies to identify and characterize terrestrial analogs for future Moon bases and Mars landing sites, then present findings as a map, visualization or tool.

| Challenge asks for | TwinWorlds answer |
| --- | --- |
| Think beyond visual similarity | Same-measurement comparison (Section 7) |
| Explain what is similar and where the analogy breaks | Analog Fingerprint + "Earth Can't Do This" panel |
| Look beyond well-known sites | Undiscovered Analogs toggle, Pakistan case study |
| Processes, not just places | Hingol mud volcanoes, dust and weather windows |
| Consider scale | Grid cells and path segments, not whole deserts |
| Connect to exploration | **Mission Twin**, Twin Dive, Mission Lenses, Field Briefs |
| Remember Earth's limits | Permanent gaps shown on every site and every segment |
| Surprise us | Mission Twin rehearsal, blind test, Pakistan sites |
| Educate the public | Normal Mode, Story Mode, DEV write-up |

---

## 3. How We Get Judged

### Local (NYC) categories
Judge captain: **Steven Jaret**, Earth and Planetary Sciences professor, research associate at the American Museum of Natural History, works with NASA data and Martian meteorites.

1. **Relevance:** did we do exactly what the challenge asked? (clear yes / partly / no)
2. **Science:** is the science real, useful, exciting?
3. **Coding:** innovative tech, appropriate APIs
4. **Presentation:** visual, clear, well communicated
5. **Creativity**

### Global categories (scored 1 to 5)
Impact, Creativity, Validity, Relevance (NASA data must be core, not decoration), Presentation.

### What this means for us
- **Science rigor wins this room.** Blind test, honest limits and source tags matter more than extra integrations.
- The judge said handling **data with dozens of variables** is hard and worth hackathon effort. Our multi-dimensional Fingerprint is exactly that. Say it.
- He showed **element maps** and **reflectance spectra matching**. Our Nerd Mode mineral spectra overlay speaks his language.
- Global awards we naturally fit: **Best Use of Science**, **Best Use of Data**, **Best Mission Concept**, **Local Impact** (Pakistan sites), **Global Connection** (international virtual team).

---

## 4. Scope Lock

A polished core beats ten half-features. Do not start a lower tier until the tier above works.

| Tier | Features |
| --- | --- |
| **HERO** | Global similarity engine (whole Earth, coarse grid), **Twin Dive 3D** (CesiumJS), **Mission Twin** (one Perseverance traverse segment) |
| **MUST** | Analog Fingerprint, Normal/Nerd toggle (Nerd charts for terrain, temperature, minerals), "Earth Can't Do This" panel **with "How to Fake It" hardware badges**, blind test, Pakistan case study, 3 Mission Lenses, Benchmark vs Emerging tags |
| **SHOULD** | Weather Window + Rehearsal Itinerary timing, Gemini "Ask the Planet" + Analyst, Cloudflare live job, TwinWorlds API, mineral spectral overlay, similarity-contour match zones, domain, extra target sites (Mare Tranquillitatis pit, Arcadia Planitia) |
| **NICE** | Nerd charts for dust, water/ice, sunlight; sun/shadow time slider; Undiscovered toggle; Field Brief export; Tiger Data history; **Landsat 1985 vs now comparison**; extra lenses (Lava Tube, Magnetometer) |
| **ROADMAP (slide only)** | Flight Twin (Ingenuity), Crash Replay simulation, Rehearsability Map, Rosalind Franklin + Artemis + Apollo missions, Analog Portfolio, Live "Most Martian Place", Twilio alerts, Auth0 accounts, OpenSpace export |

---

## 5. The Story Arc

1. **Pick a target** on Mars or the Moon. Earth lights up with matches.
2. **Prove it works:** blind test. The engine was never told about the Atacama and still ranked it near the top.
3. **Discover:** new candidates nobody studies, led by Pakistan.
4. **Dive:** Twin Dive into both surfaces in synchronized 3D.
5. **Rehearse:** Mission Twin. Perseverance's route on Mars, its matched twin on Earth, rovers driving side by side.
6. **Be honest:** what Earth can never simulate, segment by segment.
7. **Future:** API, Flight Twin, more missions.

---

## 6. The Honest Cut

| Original idea | Problem | Decision |
| --- | --- | --- |
| Gravity filter | Varies under 1% across Earth; every site matches equally | Shown as permanent gap |
| Magnetic field filter | Barely changes surface conditions | Shown as permanent gap |
| Pressure filter | Even Everest has ~50x Mars pressure | Replaced with **altitude** |
| Exoplanet upload | No exoplanet surface data exists | Reframed as Custom Target (roadmap) |
| "Launch Conditions" template | Nobody launches from analog sites | Replaced with Landing and Mobility lens |
| Google Earth / Google Mars hookup | No embeddable Google Earth API; no Google Mars 3D API | **CesiumJS + NASA Trek** instead |
| Real drone flown to replicate a crash | Safety, airspace and liability risk | **Simulation only** (roadmap) |
| Solana | No scientific fit | Skipped |
| Chang'e / Tianwen-1 data | NASA China funding restriction can affect eligibility | **Never use** |
| Hand-typed match radii (e.g. 12 / 38 / 85 km) | Not derived from data; indefensible | Zones drawn as **contours of real similarity scores** |
| AI-written "realistic" site dataset | Fabricated numbers presented as data | **Real pulled values only; anything illustrative is labeled** |
| Labeling Lanzarote, Danakil, Lonar, Qaidam as "unrecognized" | All are known, studied analogs (Lanzarote hosts ESA astronaut geology training) | Tagged **Benchmark**; Pakistan sites carry the discovery angle |
| Simulated paleo / +1,000-year satellite imagery | Fiction presented as imagery | Past = cited narrative; near future = labeled climate projection; real Landsat for 1985 vs now |
| Gravity / pressure / magnetic sliders that filter Earth | Earth cannot vary them | Shown as gaps with **How to Fake It** hardware |

### "Earth Can't Do This" panel + "How to Fake It" badges
On every site and every Mission Twin segment, each permanent gap is paired with the test hardware that compensates for it. This turns a list of limits into a practical test plan.

| Gap | How to fake it |
| --- | --- |
| Reduced gravity (0.16 g Moon, 0.38 g Mars) | Gravity offloading rigs, counterweight harnesses, parabolic flights |
| Vacuum (Moon) | Thermal vacuum chambers |
| Thin CO2 atmosphere (Mars) | Mars environment chambers |
| No global magnetic field | Helmholtz coil cages to cancel Earth's field for magnetometer tests |
| Surface radiation | Particle beam facilities, shielding tests in caves and lava tubes |
| Extreme cold beyond Earth's range | Cryogenic chambers |

Recognizing Earth's limits is part of good science, and the judges know it.

---

## 7. Core Idea: Same Measurement, Both Worlds

We only compare quantities measured the same way on Earth and on the Moon or Mars.

| Dimension | Earth data | Moon / Mars data |
| --- | --- | --- |
| Slope and roughness | Copernicus DEM / NASADEM / SRTM | LOLA (Moon), MOLA + Mars Trek DEMs (Mars) |
| Surface temperature and day-night swing | MODIS land surface temperature | Diviner (Moon), TES / Mars Climate Database |
| **Thermal inertia** (dust vs sand vs bedrock) | Derived from MODIS day/night temperatures | THEMIS / TES (Mars) |
| Albedo | MODIS | LRO, TES |
| **Mineralogy** | **NASA EMIT**, ASTER | CRISM (Mars), Moon Mineralogy Mapper |
| Elements (Nerd Mode) | Rock sample databases at top sites | Mars rover measurements, Mars Odyssey GRS, Lunar Prospector, Martian meteorites |
| Dust and aerosols | MERRA-2, MODIS aerosol optical depth | Mars dust opacity (MCD) |
| Water, ice, permafrost | SMAP soil moisture, permafrost maps | SHARAD, LRO LEND, Diviner cold traps |
| Barrenness | NDVI | Target value: zero |
| UV exposure | UV index, altitude | Mars surface UV |
| Sun angle and illumination | Computed from latitude and date | Lunar south pole lighting |
| Visual texture (for drones) | Satellite imagery texture metrics | HiRISE / Mars Trek imagery |

---

## 8. Hero Features

### 8.1 Similarity Engine + Twin Globes
- Moon or Mars globe on the left, Earth on the right.
- Click a real target. Earth lights up with a similarity heatmap that follows real terrain.
- Match zones (**Exact, Strong, Moderate, Variable**) are **contours of the actual score**, drawn as bullseye-style bands around each top site. Click a band to see what changes from center outward.

Target sites:
| Target | Why |
| --- | --- |
| Mars: **Jezero crater** | Perseverance site; ancient lake and river delta |
| Mars: **Arcadia Planitia** | Shallow buried ice; candidate for human landings |
| Mars: **Acidalia Planitia** | Mounds proposed as mud volcanoes |
| Moon: **Shackleton crater rim** (south pole) | Artemis base candidate; low sun, cold traps |
| Moon: **Mare Tranquillitatis pit** | Lava tube skylight; sheltered base candidate |

**Whole Earth, at three zoom levels:**
| Level | Coverage | Data | Used for |
| --- | --- | --- | --- |
| 1. Global | Every land cell, start at 0.5° (~65k cells), upgrade to 0.25° if time | Global datasets: elevation, MODIS temperature, albedo, NDVI, aerosols, soil moisture | Heatmap, blind test, Undiscovered toggle |
| 2. Regional | Promising regions on zoom | 30 to 90 m elevation, regional data | Sharper scoring |
| 3. Hero sites | 2 to 3 pairs | Full depth: 3D, spectra, samples, paths | Twin Dive, Mission Twin, Nerd Mode |

Datasets that are not global (e.g. EMIT minerals, mostly dry and dusty regions) show "no data" outside their coverage instead of guesses.

### 8.2 Twin Dive (3D)
Built on **CesiumJS** with NASA Trek data.

| World | Terrain | Imagery |
| --- | --- | --- |
| Earth | Cesium World Terrain | Satellite imagery; optional Google Photorealistic 3D Tiles for hero sites (check key and billing limits) |
| Mars | NASA Mars Trek elevation | Mars Trek imagery |
| Moon | NASA Moon Trek (LOLA) elevation | Moon Trek imagery |

- Split screen. Press **Dive** and both cameras fly down together, synced in altitude, angle and heading.
- Land on Hingol on one side and Acidalia Planitia on the other, at the same scale.
- Data layers (heatmap, slope, minerals) draped on the 3D terrain.
- Sun and shadow time slider (NICE): drag through a day and compare shadows on both worlds. Key for lunar south pole planning.
- Scope: 2 to 3 hero site pairs, not every point on Earth.

Hero pairs (pick 2 to 3):
1. **Hingol mud volcanoes (Pakistan) vs Acidalia Planitia mounds (Mars)**
2. **A basalt plain vs Jezero crater floor (Mars)**
3. **Makgadikgadi Pan (Botswana, ancient lake) vs Jezero (ancient lake + delta)**: a process analog across time
4. **A high-latitude, low-sun site vs the lunar south pole (Moon)**
5. **Lanzarote lava tubes vs Mare Tranquillitatis pit (Moon)** (if the Lava Tube lens is built)

### 8.3 Mission Twin (the centerpiece)
Rehearse a real mission traverse on a matched Earth path.

1. **Load a mission path:** a short stretch of **Perseverance's real route in Jezero** (public).
2. **Fingerprint every segment** (~100 m): slope, roughness, ground type, albedo, texture.
3. **Find the matching Earth path** inside a candidate region: same length, same **sequence** of conditions (flat dusty stretch, then rocky climb, then soft sand) using **Dynamic Time Warping** or a cost-map path search.
4. **Match the timing:** mission day, local time and season mapped to the Earth dates and hours with the closest temperature, sun angle and light.
5. **Rehearsal Itinerary:** *"Day 1, 9 AM: segment A (flat, dusty). Day 2, 7 AM: segment B (rocky climb, 12° slope, low sun). Best season: March."*
6. **3D playback:** both rovers drive synchronized in Twin Dive. Pause anywhere to see that segment's Fingerprint and match quality bar.

Honest limits shown in-app:
- A Mars day is ~24h 39m and Mars seasons are about twice as long. We match conditions, not clocks.
- Every segment has a **match quality bar**; weak segments are visible, not hidden.
- Some segments have no good Earth match. We say so.

Future missions for the roadmap slide: **ESA Rosalind Franklin at Oxia Planum** (partner agency), **Artemis lunar south pole** moonwalk routes, **Apollo 15 Hadley Rille** (validation: Apollo crews trained at real Earth analogs).

---

## 9. Normal Mode and Nerd Mode

One global toggle (😎 / 🤓) changes how every dimension explains itself.

- **Normal Mode:** plain language, badges, fun one-liners. Public education.
- **Nerd Mode:** real data, overlay charts (Earth line vs Mars line), source tags on every number.
- **Build trick:** one reusable overlay chart component for every dimension.
- **Source tags:** `orbital`, `ground sample`, `rover measurement`, `model`, `lab`.

| Dimension | 😎 Normal | 🤓 Nerd | Tier |
| --- | --- | --- | --- |
| Terrain | Difficulty badge: Easy / Tricky / Rover Nightmare | Slope histogram overlay, elevation cross-section, multi-scale roughness | MUST |
| Temperature | "Swings 40°C a day. Mars swings ~100°C." | 24-hour curve Earth vs Mars vs Moon, diurnal and seasonal range, gap bar | MUST |
| **Minerals** | Mineral cards ("Basalt: same rock covering most of Mars"), match meter, "rusty" icons | **Spectral overlay EMIT vs CRISM**, oxide bar charts (SiO₂, FeO, MgO, CaO, Al₂O₃) vs rover data and Martian meteorites, ternary diagram, clickable periodic table with fun facts, RGB element map | MUST (cards + oxides + 1 spectral pair), rest NICE |
| Ground type | Soft dust 🟤 / sand 🟡 / bedrock ⚫ | Thermal inertia on a scale with Mars dust/sand/bedrock, day vs night curves | SHOULD |
| Dust and wind | Dusty Level out of 5 | Aerosol optical depth time series, wind rose, storm frequency | NICE |
| Water and ice | "Frozen ground a meter down" | Soil moisture series, permafrost depth, SHARAD / Diviner comparison | NICE |
| Sunlight | "Sun stays low all day, like the lunar south pole" | Sun path diagram, daylight hours, shadow length | NICE |
| UV and radiation | "Sunburn in 8 minutes. Mars: seconds." | UV curve, altitude effect, cosmic radiation gap bar | NICE |
| Life and barrenness | "Almost nothing grows here" | NDVI map and series, reported extremophiles with references | NICE |
| Subsurface | "Lava tube astronauts might shelter in" | Tube dimensions, underground temperature stability, Mars/Moon tube candidates | ROADMAP |

Honesty rule for elements: satellites do not give per-pixel element composition of Earth. Element panels appear only for top sites with sample data, tagged `lab sample` vs `orbital estimate`.

---

## 10. Supporting Features

### 10.1 Analog Fingerprint
Radar chart of per-dimension match per site, plain-English verdict (*"Excellent geological analog, poor thermal analog"*), "Earth Can't Do This" gaps underneath.

### 10.2 Blind Test (credibility weapon)
Run the engine with no knowledge of famous sites. Check whether it independently ranks Atacama, Haughton Crater, Antarctic Dry Valleys, Mauna Kea, Devon Island, Rio Tinto, Mojave, Utah MDRS highly. Report recall: "X of N known analogs in our top results." Pitch line: *"We never told our algorithm about the Atacama. It found it anyway."*

### 10.3 Mission Lenses
| Lens | Weighted on | Tier |
| --- | --- | --- |
| Lunar Base Builder | Flat terrain, extreme cold, low sun angle, ice access | MUST |
| **Landing + Plume-Surface Interaction** | Loose fine dust and sand that rocket exhaust can blast, flatness (slope < 3°), wind, thermal shock | MUST |
| Rover Testing | Roughness, boulders, crater walls, terrain variety in a small area | MUST |
| Astrobiology | Extreme dryness, high UV, salts, extremophiles | SHOULD |
| Botany + ISRU Agriculture | Soil mineralogy, salts and perchlorate-like toxicity, basaltic grain size, sunlight | SHOULD |
| Resource Hunting (ISRU) | Ice, permafrost, hydrated minerals | SHOULD |
| Habitat Construction | Basalt for regolith bricks, stable ground | NICE |
| **Lava Tube Shelter** | Caves and lava tubes, radiation shielding, stable underground temperature | NICE |
| **Magnetometer Calibration** | Basalts with remnant magnetism (Mars has patches of ancient magnetized crust) | NICE |

### 10.3b Benchmark vs Emerging tags
Every site is tagged **Benchmark** (already studied: Atacama, Haughton, Dry Valleys, Iceland, Hawaii, Lanzarote, Danakil, Lonar, Qaidam...) or **Emerging** (rarely or never used as an analog). The Undiscovered toggle hides Benchmarks.

### 10.3c Before / Now (Landsat)
For hero sites, real Landsat imagery from the mid-1980s next to today, showing changes in lakes, ice or dunes. Past processes beyond the satellite era are told as short narratives with cited papers; near-future changes only as labeled climate projections.

### 10.4 Pakistan Case Study
| Site | Analog for |
| --- | --- |
| Hingol mud volcanoes (Balochistan) | Proposed mud volcanoes in Mars' Acidalia Planitia; live process analog |
| Khewra Salt Mine | Mars chloride and evaporite deposits + subsurface |
| Karakoram glaciers ("Third Pole") | High-altitude ice, high UV, extreme cold |
| Chagai Hills / Koh-i-Sultan | Arid volcanic terrain in a hyper-dry desert |
| Thar and Cholistan deserts | Dunes, dust, aeolian processes |

Pitch line: *"The best unexplored analogs might be in places the space world never looked."*

### 10.5 Weather Window + Rehearsal Timing
When will a site next hit Mars-like conditions (humidity, wind, temperature)? Calendar strip of the best testing windows + best season historically. Powers Mission Twin timing.

### 10.6 Gemini Features
- **Ask the Planet:** natural language to structured JSON (lens weights + filters); globe re-lights.
- **Analog Analyst:** explanations grounded in the Fingerprint numbers; labeled "AI-generated from measured data."
- **Field Brief:** one-page mission brief per site.

### 10.7 TwinWorlds API
```
POST /v1/analogs
{
  "vehicle": "rover",
  "needs": ["slope < 10", "dust", "low texture terrain"],
  "target": "Jezero crater floor"
}
-> ranked Earth sites + fingerprints + best test windows
```
Runs on Cloudflare Workers. Short docs page. Turns the tool into infrastructure.

---

## 11. Roadmap Features

Shown on the final slide and in the README. Not built unless every tier above is done.

### 11.1 Flight Twin (Ingenuity)
- Replay Ingenuity's real flights over Jezero in 3D (flight log is public).
- Mars air is roughly 1% as dense as Earth's, so **air cannot be matched**. Show this in a Nerd Mode physics panel.
- What **can** be matched: the ground the drone sees. Ingenuity's final flight ended after its navigation struggled over featureless sand. Find Earth terrain with the same low visual texture to test drone vision navigation.
- Pitch line: *"Earth can't rehearse Martian air, but it can rehearse what a Mars drone sees."*

### 11.2 Crash Replay (simulation only)
User submits drone details via the API, receives matching low-texture Earth sites, and Gemini generates a **simulation setup** (for a standard drone simulator such as PX4 or ArduPilot software-in-the-loop) built from that site's terrain and imagery, plus a field test plan with a safety checklist. **No AI-generated code for real flights.**

### 11.3 Rehearsability Map
Run the engine backwards: color Mars and the Moon by how well Earth can rehearse each region. Green (strong analog), yellow (partial), red "Analog Deserts" (no match anywhere on Earth).

### 11.4 Other roadmap items
- Analog Portfolio: smallest set of Earth sites covering every dimension of a target (weighted set cover).
- Live "Most Martian Place on Earth, Right Now" ticker + Analog Availability Index (are analog sites losing Mars-like days over decades?).
- Autonomous Analog Hunter agent.
- Twilio field alerts when a test window opens.
- Auth0 mission planner accounts.
- OpenSpace export for planetarium domes.
- Custom Target upload.

---

## 12. Similarity and Matching Methods

### Site similarity
1. Features per cell (Section 7).
2. Normalize each feature to a common scale.
3. Per-dimension similarity: `s_i = exp(-(x_earth - x_target)^2 / (2 * sigma_i^2))`, `sigma_i` from each feature's natural spread.
4. Out-of-range features (Mars colder than anywhere on Earth): score by closeness to Earth's most extreme value and always display the absolute gap.
5. Overall score: weighted mean of `s_i`, weights from the active Mission Lens.
6. Tiers by score thresholds.
7. Validation: blind test recall on known analog sites.

### Mission Twin path matching
1. Split the mission path into segments; feature vector per segment.
2. Candidate Earth region from site similarity.
3. Build a cost map where cost = dissimilarity to the current target segment.
4. Find the Earth path whose segment sequence best matches (Dynamic Time Warping on the feature sequence, or A* on the cost map with a length constraint).
5. Per-segment match quality = segment similarity score.
6. Timing: for each segment's mission time and season, choose Earth dates/hours from weather data that minimize temperature and sun-angle difference.

**Everyone on the team must be able to explain steps 2 to 6 of site similarity and the idea of sequence matching.** Judges will ask.

---

## 13. Architecture

```
Browser (CesiumJS: Twin Globes, Twin Dive, Mission Twin, Normal/Nerd UI)
   hosted on Cloudflare Pages at our GoDaddy Registry domain
   |
   v
Cloudflare Workers (backend)
   |-- /v1/analogs      -> similarity engine (API)
   |-- /ask             -> Gemini (Ask the Planet)
   |-- /analyst         -> Gemini (grounded explanations)
   |-- /brief           -> Gemini (Field Brief)
   |-- /window          -> weather timing (Meteomatics / Open-Meteo)
   |-- /mission-twin    -> precomputed path match + itinerary
   |
   |-- R2: precomputed Earth grid, Mars/Moon target data, mission paths
   |-- D1 / KV: cached scores and API results
   |-- Cron Trigger: scheduled weather refresh
   |-- Hyperdrive -> Tiger Data (weather time series)

Offline pipeline (our laptops, Python)
   Planetary Computer / Earth Engine -> features -> scores -> path matching -> export to R2
```

Fallback: if Workers break near the deadline, the frontend still runs from precomputed files on Cloudflare Pages or GitHub Pages.

---

## 14. Sponsors and Free Resources

### Sponsors (MLH + local)
| Sponsor | Use | Priority |
| --- | --- | --- |
| **Gemini API** | Ask the Planet, Analyst, Field Briefs | Core |
| **Cloudflare** (local prize + intern interviews) | Pages, Workers, Cron Triggers, R2, D1/KV, Hyperdrive | Core |
| **Tiger Data** | Weather time series via Hyperdrive | Should |
| **GoDaddy Registry** | Free domain + SSL | Quick win |
| **DEV Writing Challenge** | Build story after submission | After event |
| **Cursor + Grok Bot raffle** | Only if we actually code in Cursor; describe honestly | Optional |
| **Twilio** ($20 credits, local prize) | Field test window alerts via Dev Phone | Roadmap |
| **AMNH OpenSpace** (local prize) | Planetarium export | Watch Micah's demo, then decide |
| **Auth0** | Accounts | Roadmap |
| Vultr | Not needed (Cloudflare covers backend) | Backup only |
| Solana | No fit | Skipped |

### Space Apps Global Offers
| Offer | Use |
| --- | --- |
| **Microsoft Planetary Computer** | Primary Earth data source (no account needed; Python STAC API) |
| Google Earth Engine + Google Cloud | Backup data processing |
| **Meteomatics** (1,000 queries/day) | Weather for timing; batch multiple coordinates per request |
| Open-Meteo, NASA POWER | Weather fallback |
| **GitHub Copilot Free** | Coding assistance in VS Code |
| GoDaddy Registry | Domain (see above) |
| Skipped | Azure, Teams, Microsoft Copilot chat, Miro |

---

## 15. Data Sources

**NASA (required: at least one for Global Awards)**
- NASA Mars Trek, Moon Trek (3D terrain and imagery)
- LRO: LOLA, Diviner, LEND
- MOLA (Mars Global Surveyor); TES, THEMIS; CRISM; SHARAD; Mars Odyssey GRS
- Perseverance traverse path; Ingenuity flight log (roadmap)
- MODIS, EMIT, ASTER, SMAP, MERRA-2, NASADEM / SRTM, NASA POWER
- Landsat archive (with USGS) for Before / Now
- Mars Global Surveyor magnetometer (Mars crustal magnetism, Magnetometer lens)
- Mars Climate Database (with ESA/CNES partners)

**Space Agency Partners (encouraged)**
- **ESA:** Mars Express HRSC, Copernicus DEM, Rosalind Franklin / Oxia Planum (roadmap)
- **ISRO:** Chandrayaan-2 lunar data
- **JAXA:** Kaguya / SELENE lunar topography

**Other**
- Microsoft Planetary Computer, Google Earth Engine
- Meteomatics, Open-Meteo
- USGS Astrogeology maps
- Rock sample geochemistry databases (top sites only)
- World Magnetic Model / IGRF (Earth's magnetic field, Magnetometer lens)
- Martian meteorite compositions

**Never use:** Chinese mission data (Chang'e, Tianwen-1) due to the NASA China funding restriction.

Every dataset's link, version and license goes in `data/SOURCES.md`, and every external resource goes in the submission References field.

---

## 16. Repo Structure and Rules

```
twinworlds/
  frontend/          CesiumJS app (Twin Globes, Twin Dive, Mission Twin, UI)
  worker/            Cloudflare Workers backend + API
  pipeline/          Python: data pulls, features, scoring, path matching
  data/
    raw/             NEVER committed
    processed/       small outputs only
    SOURCES.md       where every dataset came from
  docs/              screenshots, diagrams, API docs
  README.md
  PROJECT.md
  .env.example       variable names only
```

Rules:
- New repo; first real code commit **after 8:00 PM PKT Saturday**. The earlier prototype stays private and is inspiration only; no code copied.
- Real keys only in `.env`. Never in frontend code or commits.
- Big datasets in `data/raw/`. GitHub rejects files over 100 MB.
- Pull before you start, pull before you push. Small commits, clear messages.
- Split work by folder to avoid merge conflicts.
- Mark AI-assisted code in comments.
- **Data integrity rule: no fabricated numbers.** Every value in the app comes from a pulled dataset with a source tag. Anything illustrative (placeholders, sample data while the pipeline runs) is visibly labeled "illustrative" and replaced before submission.

`.gitignore` additions:
```
.env
.venv/
data/raw/
*.tif
*.tiff
*.img
*.hdf
*.h5
*.nc
*.zip
.DS_Store
Thumbs.db
.wrangler/
node_modules/
```

---

## 17. Team Roles

| Role | Owns |
| --- | --- |
| **Data + Science** | Data pulls, feature engineering, similarity engine, blind test, Mission Twin path matching, Nerd Mode numbers, SOURCES.md |
| **3D + Frontend** | CesiumJS, Twin Globes, Twin Dive, Mission Twin playback, Normal/Nerd UI, overlay chart component |
| **Backend + Integrations** (can merge with a role above) | Cloudflare Workers, API, Gemini, weather timing, domain |
| **Story + Submission** (shared, one lead) | One-pager, 30-second video, 7-slide backup, README, project page, Discord check-ins |

One person owns the 3D view from hour 0. Cesium has a learning curve.

---

## 18. Build Timeline

Hour 0 = Sat 8:00 PM PKT.

| Hours (PKT) | Data + Science | 3D + Frontend | Shared |
| --- | --- | --- | --- |
| 0 to 2 (Sat 8 to 10 PM) | Start global 0.5° feature export (Earth Engine); pull DEM + temperature for hero regions (Planetary Computer) | CesiumJS Earth + Mars split screen loading | Repo set up, Cloudflare project created |
| 2 to 8 (to Sun 4 AM) | Features for hero sites + Mars targets; similarity engine v1 | Twin Globes heatmap with sample data; Dive camera sync | Sleep in shifts |
| 8 to 12 (to Sun 8 AM) | Blind test; Pakistan sites scored | Fingerprint radar + Normal/Nerd toggle | **Submit first draft on Space Apps site** |
| 12 to 18 (to Sun 2 PM) | Perseverance segment fingerprints; Earth path match (DTW) | Mission Twin synchronized playback | Gemini Ask the Planet on Workers |
| 18 to 22 (to Sun 6 PM) | Nerd Mode data: terrain, temperature, minerals (1 spectral pair) | Nerd charts via overlay component | Deploy to Cloudflare + domain |
| 22 to 26 (to **Sun 10 PM**) | Numbers sanity check | Polish, bug fixes | **Write + submit local one-pager** |
| 26 to 32 (Sun night) | Fix anything judges might poke | Story Mode camera path | Local presentation if selected |
| 32 to 38 (to **Mon 9:59 AM**) | README, SOURCES.md, references | Screenshots, recordings | **30-second video**, project page, final submit by Mon ~8 AM |

---

## 19. Submission Checklist

**Team and eligibility**
- [ ] Every member registered for the **NYC Local Event**, not waitlisted, on the **Members** tab
- [ ] MLH/sponsor prize opt-ins selected where relevant

**Local (by Sun 10:00 PM PKT)**
- [ ] One-pager submitted (Section 20)
- [ ] Ready to present remotely if selected

**Global (by Mon 9:59 AM PKT)**
- [ ] Project page: name, high-level summary, demo link, final project link, detailed description, NASA data, partner data and references
- [ ] Demo: **30-second video** (or 7 slides max). Over the limit = ineligible
- [ ] English everywhere (subtitles if any other language is spoken)
- [ ] Repo switched to **Public**
- [ ] All links tested in an incognito window, no login needed
- [ ] Own domain: FortiGuard Web Filter Classification requested
- [ ] SI use disclosed; any AI-generated images or video carry a visible watermark
- [ ] No NASA logos or branding in AI-generated content
- [ ] No images, video or likeness of anyone under 18
- [ ] Every external resource listed in References
- [ ] No API keys in the repo history
- [ ] Both checkboxes ticked (terms + original work)
- [ ] Submitted with buffer; keep editing after

**After**
- [ ] DEV post
- [ ] Download participant certificates

---

## 20. Local One-Pager Template

Judges use this to choose who presents. Cover every category.

```
TWINWORLDS
Rehearse Moon and Mars missions on matched terrain on Earth.
Team: Ibrahim Sadat, Zohaib Riaz (+). Virtual team from Pakistan.
Challenge: [exact challenge name]

THE PROBLEM
Analog sites are few, described in words not measurements, and rarely
matched to a specific mission's conditions.

WHAT WE BUILT
- Similarity engine using same-measurement data on Earth, Moon and Mars
- Twin Dive: synchronized 3D on both worlds
- Mission Twin: Perseverance's route matched to an Earth path, segment by segment
- Normal / Nerd Mode: plain language or full scientific detail

SCIENCE
- Dimensions compared: [list]
- Blind test: rediscovered [X of N] known analogs without being told
- New candidates: Hingol mud volcanoes vs Acidalia Planitia, [others]
- Honest limits: gravity, vacuum, atmosphere, radiation shown on every site

DATA
NASA: [list]. Partners: [ESA / ISRO / JAXA]. Other: [list].

TECH
CesiumJS, Python, Cloudflare Workers/Pages/R2, Gemini API, [others]

IMPACT
[Who uses it: mission planners, field test teams, universities, public]

LINKS
Live: [url]   Repo: [url]   Demo: [url]

[1 screenshot: Twin Dive or Mission Twin split screen]
```

---

## 21. Global Demo: 30-Second Video and 7-Slide Backup

### 30-second video (hard limit)
| Time | Scene |
| --- | --- |
| 0:00 to 0:03 | "We're TwinWorlds, a team from Pakistan." Title card |
| 0:03 to 0:07 | Problem: "Rovers get one shot on Mars. Where on Earth do you practice?" |
| 0:07 to 0:12 | Click Jezero, Earth lights up. Blind test line on screen |
| 0:12 to 0:20 | Twin Dive: Mars left, Earth right; two rovers driving matched routes |
| 0:20 to 0:25 | Flip to Nerd Mode: spectral overlay + match quality bars. "Built on NASA data" |
| 0:25 to 0:30 | "Before a rover drives a meter on Mars, drive it on Earth." Logo + URL |

### 7-slide backup
1. Title: TwinWorlds, team names, challenge
2. Problem
3. Method: same measurement, both worlds + blind test
4. Twin Dive + Mission Twin (screenshots)
5. Discovery: Pakistan sites + Nerd Mode chart
6. Honest limits + data sources (NASA + partners)
7. Future: API, Flight Twin, Rehearsability Map, more missions

---

## 22. Use of AI Tools

Space Apps permits AI tools to accelerate work, but they should not be used to come up with the idea of how to solve the challenge. AI use must be disclosed, AI-generated images and video need a visible watermark, and AI-assisted code and data must be acknowledged.

Our approach:
- The core concept (3D globe, parameter filters, matched regions, time feature, Normal/Nerd mode, mission path rehearsal, drone and API ideas) came from the team.
- AI tools (Claude, GitHub Copilot, possibly Cursor) were used to critique and refine ideas, suggest datasets, and assist with code. **Before submission, the team decides together which features it fully owns and can defend, and cuts or discloses anything that feels AI-originated.**
- AI-assisted code is marked in comments and noted in the README.
- Gemini outputs inside the app are labeled as AI-generated from measured data.

---

## 23. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Overscoping | Scope Lock (Section 4). No lower tier until the tier above works |
| Cesium learning curve | One owner from hour 0; get Earth + Mars rendering first, styling later |
| NASA Trek layer setup is fiddly | Start with one Mars DEM + imagery layer for Jezero only |
| Perseverance path data hard to get | Use a short documented segment; hand-digitize from published maps if needed, and say so |
| Path matching too slow | Precompute offline for hero pairs; app plays back results |
| Data pulls slow | Hero regions only first; global grid later or never |
| Backend breaks near deadline | Static fallback from precomputed files |
| Gemini hallucination | Ground prompts in measured numbers; label AI text |
| Judges question the science | Everyone can explain scoring + sequence matching; source tags on every number |
| Time zone (NYC 10 hours behind) | Shift-based sleep; know presentation times in PKT |
| Missing the local deadline | First draft by hour 12; one-pager drafted by hour 20 |
