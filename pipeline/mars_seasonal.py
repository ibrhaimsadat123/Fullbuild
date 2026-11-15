"""
Mars surface temperature through the Mars year, for time travel (frontend/src/timetravel.js).
AI-assisted code (Claude).
Input: data/sources/mcd/mcd_tsurf_seasonal.json, 24 whole-planet maps from the Mars Climate Database v6.2
       (LMD/OU/IAA/ESA/CNES), climatology scenario, surface temperature at 10:30 and 22:30 local time
       everywhere (the MODIS Terra overpass hours used for Earth), every 30 deg of Ls.
Output: data/processed/mars_seasonal.json (lats, lons, ls, day[12][flat K], night[12][flat K];
        flat index = lonIdx * nLat + latIdx).
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(os.path.join(ROOT, "data", "sources", "mcd", "mcd_tsurf_seasonal.json")))
maps = src["maps"]
LS = list(range(0, 360, 30))
m0 = maps["0_10.5"]
lats, lons = m0["lats"], m0["lons"]
keep = len(lons) - 1 if abs(lons[-1] - lons[0] - 360) < 1e-6 else len(lons)
flat = lambda k: [v for col in maps[k]["T"][:keep] for v in col]
out = {"source": src["source"], "lats": lats, "lons": lons[:keep], "ls": LS,
       "day": [flat(f"{ls}_10.5") for ls in LS], "night": [flat(f"{ls}_22.5") for ls in LS]}
json.dump(out, open(os.path.join(ROOT, "data", "processed", "mars_seasonal.json"), "w"), separators=(",", ":"))
print("seasons", len(LS), "lats", len(lats), "lons", keep)
