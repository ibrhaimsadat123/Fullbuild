# Moon grid inputs

`pipeline/moon_grid.py` builds `data/processed/moon_grid.json` (1 deg cells, same fields as `mars_grid.json`) from:

| File | Source | Notes |
| --- | --- | --- |
| `data/raw/moon/ldem_16.img` (not in git, 33 MB) | NASA PDS Geosciences: `lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/img/ldem_16.img` | LRO LOLA elevation, 16 ppd, int16 x 0.5 m. Label: `ldem_16.lbl` |
| `data/raw/moon/ldam_4_float.img` (not in git, 4 MB) | `.../lola_gdr/cylindrical/float_img/ldam_4_float.img` | LRO LOLA normal albedo at 1064 nm (Lemelin et al. 2016), 4 ppd. Label: `ldam_4_float.lbl` |
| `diviner_gcp_1deg.json` | NASA PDS: `lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/global_cumul_avg_cyl_*_002.tab` (18 files, 2.8 GB) | LRO Diviner Global Cumulative Product (Williams et al. 2017, Icarus 283, 300-325). Only the rows for local-time bins 9.88-11.12 h and 21.88-23.12 h were downloaded (HTTP range requests, fixed 113-byte records), for 2 of the 4 0.5 deg pixels in each 1 deg cell. `tbol` (bolometric brightness temperature, K) averaged per cell |

How it was fetched: PDS sends no CORS headers, so a script in the browser used the Vite dev-server proxy (`/pds` in `frontend/vite.config.js`) and saved results with the dev-only `/__save` endpoint. AI-assisted (Claude).
