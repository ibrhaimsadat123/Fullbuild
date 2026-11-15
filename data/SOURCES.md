# TwinWorlds data sources

Every number in TwinWorlds comes from one of the datasets below. Anything computed by us says so in the `source` field of the data files.
Rule: no Chinese mission data is used (NASA China funding restriction).

## NASA: Earth

| Dataset | Used for | Access |
| --- | --- | --- |
| MODIS Terra MOD11A2 v061, land surface temperature (8-day, 1 km) | Day (~10:30) and night (~22:30) surface temperature, 2023 yearly mean; day-night swing | Google Earth Engine `MODIS/061/MOD11A2` |
| MODIS MCD43A3 v061, albedo (daily, 500 m) | White-sky shortwave albedo, 2023 yearly mean | Google Earth Engine `MODIS/061/MCD43A3` |
| MODIS Terra MOD13A2 v061, vegetation indices (16-day, 1 km) | NDVI, 2023 annual maximum (growing-season peak) | Google Earth Engine `MODIS/061/MOD13A2` |

## NASA: Mars

| Dataset | Used for | Access |
| --- | --- | --- |
| Mars Global Surveyor MOLA MEGDR, 16 pixels/degree | Slope and 55 km relief at Jezero, Acidalia, Arcadia (resampled to 5.55 km) | NASA PDS Geosciences Node: `pds-geosciences.wustl.edu/mgs/mgs-m-mola-5-megdr-l3-v1/mgsl_300x/meg016/` |
| Mars Global Surveyor TES Lambert albedo mosaic (7410 m) | Albedo at the Mars targets (~55 km box mean) | USGS Astrogeology: `planetarymaps.usgs.gov/mosaic/Mars_MGS_TES_Albedo_mosaic_global_7410m.tif` |
| Mars 2020 MEDA thermal inertia (Martinez et al. 2023, JGR Planets) | Jezero thermal inertia range 180 to 605 SI (context; not scored, no Earth equivalent yet) | Published paper |

## NASA: Moon

| Dataset | Used for | Access |
| --- | --- | --- |
| LRO LOLA LDEM, 16 pixels/degree | Slope and relief at Mare Tranquillitatis and Shackleton (Shackleton re-gridded to a flat polar grid), and for every 1 deg cell of the Moon (`moon_grid.json`) | NASA PDS Geosciences Node: `pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img` |
| LRO LOLA LDAM, 4 pixels/degree normal albedo at 1064 nm (Lemelin et al. 2016) | Moon albedo for every 1 deg cell (single wavelength: approximate comparison with Earth/Mars broadband albedo) | NASA PDS Geosciences Node: `.../lola_gdr/cylindrical/float_img/ldam_4_float.img` |
| LRO Diviner Global Cumulative Product (Williams et al. 2017, Icarus 283) | Moon surface temperature at ~10:30 and ~22:30 local time for every 1 deg cell (same times as Earth's MODIS Terra overpass) | NASA PDS Geosciences Node: `lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/` (see `data/sources/moon/README.md`) |
| LRO Diviner, Mare Tranquillitatis pit temperatures (Horvath et al. 2022, GRL, doi:10.1029/2022GL099710) | Pit surroundings +127 C day, -173 C night; shaded pit ~17 C | Published paper / NASA release |
| Shackleton rim temperature estimate, -50 +/- 10 C (Bussey, Robinson & Spudis 2004, LPSC XXXV) and rim illumination 80 to 90% (Spudis et al. 1995, LPSC XXVI) | Shackleton rim temperature (labeled as a literature estimate, not a direct Diviner measurement) | As cited in Wikipedia "Shackleton (crater)" |

## Space agency partners

| Dataset | Used for | Access |
| --- | --- | --- |
| Mars Climate Database v6.2 (LMD / OU / IAA / **ESA** / **CNES**), climatology average solar scenario | Mars surface temperature at local times 10.5 h and 22.5 h (matched to NASA Terra overpass times), averaged over the Mars year. Point values for the 3 Mars targets, plus whole-planet maps (5.7 x 3.8 deg) interpolated to every 1 deg cell of `mars_grid.json` for click-anywhere (`pipeline/mars_temps.py`) | `www-mars.lmd.jussieu.fr/mcd_python/` (raw files in `data/sources/mcd/`, maps in `mcd_tsurf_maps.txt`) |

## Other open data

| Dataset | Used for | Access |
| --- | --- | --- |
| USGS GMTED2010 (7.5 arc-second) | Earth elevation, slope (5.55 km spacing), 55 km relief, roughness (display only) north of ~56 S | Google Earth Engine `USGS/GMTED2010_FULL` |
| Natural Earth 1:10m geography regions + 1:50m countries (public domain) | Place names for Earth cells (`earth_places.json`): smallest named region containing each cell centre, plus country | `naturalearthdata.com` (GeoJSON from `github.com/nvkelso/natural-earth-vector`) |
| NOAA ETOPO1 (ice surface) | Antarctic terrain, 56 S to 85 S | Google Earth Engine `NOAA/NGDC/ETOPO1` |

## Missions, rover routes and time (added Sun 15 Nov)

| Dataset | Used for | Access |
| --- | --- | --- |
| NASA/JPL-Caltech Mars 2020 traverse (`M20_traverse.json`) | Perseverance's real route, sols 388-420 (Mission Twin), with rover-localization elevations | `mars.nasa.gov/mmgis-maps/M20/Layers/json/M20_traverse.json` (copy in `data/sources/mission/`) |
| NASA/JPL-Caltech MSL waypoints (`MSL_waypoints.json`) | Curiosity's real route, 14-18 km of total drive, climbing Mount Sharp (Mission Twin) | `mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json` (copy in `data/sources/mission/`) |
| Cesium World Terrain (Cesium ion) | Earth terrain grids (16 x 16 km, 50 m) where Mission Twin searches for the matching path | Sampled in the browser with CesiumJS `sampleTerrainMostDetailed`; grids in `data/raw/mission/` (not in git) |
| NASA landing site coordinates (Viking 1-2, Pathfinder, Spirit, Opportunity, Phoenix, Curiosity, InSight, Perseverance, Apollo 11-17) | Missions dropdown (`missions.json`) | As listed in Wikipedia, "List of landings on extraterrestrial bodies" |
| Mars Climate Database v6.2 (**ESA**, **CNES**, LMD), 32 maps | Mars surface temperature at 8 local times x 4 seasons (time factor, `mars_diurnal.json`) | `www-mars.lmd.jussieu.fr/mcd_python/` (raw: `data/sources/mcd/mcd_tsurf_diurnal.json`) |
| Mars season (Ls) for a date | Which Mars season it is today | Allison & McEwen (2000), Planetary and Space Science 48, 215-235 |
| Open-Meteo forecast API | Next 7 days of hourly ground temperature (soil temperature at 0 cm) at the Earth twin | `api.open-meteo.com/v1/forecast`, fetched live in the browser |

## Tools

Google Earth Engine (processing), Google Colab, Python (NumPy, SciPy, rasterio), CesiumJS, Vite, Cloudflare, Gemini API. AI assistants (Claude, GitHub Copilot) helped write code; AI-assisted code is marked in comments.

## Known analog site coordinates (blind test only)

Approximate public coordinates for Atacama (Yungay), Haughton Crater, McMurdo Dry Valleys, Icelandic highlands (Askja), Mauna Kea, Rio Tinto, Mojave, Mars Desert Research Station, Svalbard (AMASE), Qaidam Basin, Death Valley, Danakil Depression, Pilbara and Lanzarote. These are never used in scoring.

## Mission Twin timing (added Sun 15 Nov)

- **ERA5 hourly reanalysis, 2023** (Copernicus Climate Change Service / ECMWF), via the Open-Meteo Historical Weather API (`archive-api.open-meteo.com`), `soil_temperature_0_to_7cm` and `temperature_2m`, UTC, at each Earth twin site. Saved as `data/sources/mission/era5_<mission>_2023.json`. Licence: CC BY 4.0 (Open-Meteo), Copernicus licence for ERA5.
- Mars side: Mars Climate Database v6.2 surface temperature (`mars_diurnal.json`), season from the sol (landing date + sol x 88,775.244 s, Ls by Allison & McEwen 2000), sun height from Mars' obliquity (25.19 deg).
- Script: `pipeline/mission_timing.py` (run after `mission_twin.py`, which rewrites the itinerary). Writes `timing` and a dated `itinerary` into `mission_twin_<mission>.json`.
- Limits: Earth is soil 0-7 cm, Mars is the ground surface; local solar time uses lon/15 with no equation of time; 2023 is one year, not a climatology.

## Minerals (added Sun 15 Nov)

`data/processed/minerals.json`. Oxide wt%, total iron as FeO (FeOT = 0.8998 x Fe2O3T where only Fe2O3 is given).

- Rocknest soil, Gale crater (Curiosity APXS bulk) and Rocknest minerals (CheMin XRD): Achilles et al. (2017), reprinted in Cannon, K. M. et al. (2019), "Mars global simulant MGS-1: A Rocknest-based open standard for basaltic martian regolith simulants", Icarus 317, 470-478, Tables 1 and 2.
- MGS-1 prototype (XRF): Cannon et al. (2019), Table 2.
- BHVO-2 Hawaiian basalt: USGS Certificate of Analysis, Basalt, Hawaiian Volcanic Observatory, BHVO-2 (1998), recommended values.
- JSC Mars-1 (Pu'u Nene, Mauna Kea): NASA MSFC presentation, Carpenter, Sibille et al. (nasa.gov/wp-content/uploads/2019/04/carpenterm_m2003.pdf). Fe2O3 assumed to be total iron.
- Shergotty: Dreibus et al. (1982) whole-rock analysis, as compiled in Meyer, C. (2012) Martian Meteorite Compendium (NASA JSC), Shergotty chapter, Table 1a.

## Lenses

- `lunar_base` (Lunar Base Builder) added: slope 3, relief 2, day and night temperature 2, swing 1, albedo 1.5, NDVI 1. Sun angle and ice access are not in the Earth grid, so not weighted. `sites.json` regenerated.

## Spectra (added Sun 15 Nov)

`data/processed/spectra.json`, made by `pipeline/spectra.py` from raw files in `data/sources/spectra/`.

- Mars: MRO CRISM type spectra library, Viviano-Beck, C. E. et al. (2014), JGR Planets 119, PDS data set MRO-M-CRISM-4-TYPESPEC-V1.0 (pds-geosciences.wustl.edu/mro/mro-m-crism-4-typespec-v1/). Column used: ratioed I/F, corrected.
- Lab: RELAB spectral library (NASA/Keck Reflectance Experiment Laboratory, Brown University), PDS bundle urn:nasa:pds:relab, the specimen each CRISM label names as its lab analog: casc02 (San Carlos AZ olivine), capo05 (fayalite, Crystal Park CO), c1pp22 (diopside, Hawaii), capp47 (bronzite, locality unknown), c1ls04 (plagioclase, Apollo 17 lunar sample).
- Method: continuum removed (upper convex hull, 0.75-2.6 um); Pearson r, masking 1.62-1.70 um and 1.95-2.08 um.
- Left out: Fe/Ca carbonate and Fe-smectite (RELAB spectra resolved for CAGR01 and NCJB26 not clearly the named specimens; r 0.13 and 0.46).
- Not used: NASA EMIT orbital spectra of Earth (Earthdata login required, 1-2 GB per scene). Roadmap.

## EMIT (Earth from orbit) spectra (added Sun 15 Nov)

- NASA EMIT L2A Estimated Surface Reflectance 60 m V001 (LP DAAC), via Google Earth Engine `NASA/EMIT/L2A/RFL`. Script: `pipeline/emit_colab.py` (+ `emit_colab_fix.py` for gypsum and alunite, using their 2.2 um bands because 1.75 um borders EMIT's blank water-vapour bands). Output: `data/sources/spectra/emit_spectra.json` (+ `_fix`).
- Pixel choice: the 25 of up to 1,500 sampled pixels with the deepest diagnostic band (band depth only, never similarity to Mars).
- CRISM type spectra for gypsum, kaolinite, alunite, hematite, Al-smectite saved as `data/sources/spectra/crism_*.json`.

## Match zones, hero pairs, live job (added Sun 15 Nov)

- Match zones: contours (marching squares) of the score rank field at top 0.5 / 2 / 5 / 10 % around the best places (`frontend/src/zones.js`). No hand-drawn radii.
- Hero dive pairs (hand-picked process analogs, labelled as not score-based): Makgadikgadi Pan 20°48'S 25°20'E (Wikipedia); Cueva de los Verdes 29.16111N 13.43889W (Wikipedia); Haughton 75.4N 89.7W (Earth Impact Database, NASA ARES); Hingol (Wikipedia).
- Live "right now" (`GET /v1/now`, hourly Cloudflare Cron Trigger): Mars ground temperature from the Mars Climate Database at the target's current season and local mean solar time (Mars24 / Allison & McEwen 2000); Earth current soil temperature 0 cm from the Open-Meteo forecast API at each target's 12 best places (`data/processed/live_candidates.json`, from `pipeline/live_candidates.py`).

## Ground type: model thermal inertia (added Sun 15 Nov)

- `data/processed/thermal_inertia.json`, from `pipeline/thermal_inertia.py` (tables cached in data/raw/ti_tables.npz).
- Same 1-D heat-conduction model on all worlds (sun in, radiation out, equinox, no atmosphere, emissivity 0.95, rho*c 1.2e6 J m-3 K-1), inverted against each cell's existing albedo and 10:30 minus 22:30 ground temperature. Earth flux 1361 x 0.75; Mars 1361/1.524^2; Moon 1361.
- Check: Jezero model 443 vs published 180-605 (Martinez et al. 2023, Mars 2020 MEDA). Earth values are apparent (air and moisture damp the swing) and read high.
- Classes: Mellon, M. T. et al. (2000), High-Resolution Thermal Inertia Mapping from the MGS TES, Icarus 148, 437-455.
