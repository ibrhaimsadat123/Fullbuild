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
| LRO LOLA LDEM, 16 pixels/degree | Slope and relief at Mare Tranquillitatis and Shackleton (Shackleton re-gridded to a flat polar grid) | NASA PDS Geosciences Node: `pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img` |
| LRO Diviner, Mare Tranquillitatis pit temperatures (Horvath et al. 2022, GRL, doi:10.1029/2022GL099710) | Pit surroundings +127 C day, -173 C night; shaded pit ~17 C | Published paper / NASA release |
| Shackleton rim temperature estimate, -50 +/- 10 C (Bussey, Robinson & Spudis 2004, LPSC XXXV) and rim illumination 80 to 90% (Spudis et al. 1995, LPSC XXVI) | Shackleton rim temperature (labeled as a literature estimate, not a direct Diviner measurement) | As cited in Wikipedia "Shackleton (crater)" |

## Space agency partners

| Dataset | Used for | Access |
| --- | --- | --- |
| Mars Climate Database v6.2 (LMD / OU / IAA / **ESA** / **CNES**), climatology average solar scenario | Mars surface temperature at local times 10.5 h and 22.5 h (matched to NASA Terra overpass times), averaged over the Mars year | `www-mars.lmd.jussieu.fr/mcd_python/` (raw files in `data/sources/mcd/`) |

## Other open data

| Dataset | Used for | Access |
| --- | --- | --- |
| USGS GMTED2010 (7.5 arc-second) | Earth elevation, slope (5.55 km spacing), 55 km relief, roughness (display only) north of ~56 S | Google Earth Engine `USGS/GMTED2010_FULL` |
| NOAA ETOPO1 (ice surface) | Antarctic terrain, 56 S to 85 S | Google Earth Engine `NOAA/NGDC/ETOPO1` |

## Tools

Google Earth Engine (processing), Google Colab, Python (NumPy, SciPy, rasterio), CesiumJS, Vite, Cloudflare, Gemini API. AI assistants (Claude, GitHub Copilot) helped write code; AI-assisted code is marked in comments.

## Known analog site coordinates (blind test only)

Approximate public coordinates for Atacama (Yungay), Haughton Crater, McMurdo Dry Valleys, Icelandic highlands (Askja), Mauna Kea, Rio Tinto, Mojave, Mars Desert Research Station, Svalbard (AMASE), Qaidam Basin, Death Valley, Danakil Depression, Pilbara and Lanzarote. These are never used in scoring.
