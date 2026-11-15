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
