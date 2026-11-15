"""
Mars surface temperature through the day and the year, for the time factor (frontend/src/timesim.js).
AI-assisted code (Claude).
Input: data/sources/mcd/mcd_tsurf_diurnal.json, 32 whole-planet maps from the Mars Climate Database v6.2
       (LMD/OU/IAA/ESA/CNES), climatology scenario, surface temperature at fixed local time everywhere,
       for local times 0, 3, ..., 21 h and seasons Ls 0, 90, 180, 270.
Output: data/processed/mars_diurnal.json (compact: lats, lons, seasons, times, T[season][time] = K values,
        index lonIdx * nLat + latIdx).
"""
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(os.path.join(ROOT, "data", "sources", "mcd", "mcd_tsurf_diurnal.json")))
maps = src["maps"]
seasons, times = [0, 90, 180, 270], [0, 3, 6, 9, 12, 15, 18, 21]
m0 = maps["0_0"]
lats, lons = m0["lats"], m0["lons"]
keep = len(lons) - 1 if abs(lons[-1] - lons[0] - 360) < 1e-6 else len(lons)   # drop the duplicate +180 column
T = []
for ls in seasons:
    row = []
    for lt in times:
        g = maps[f"{ls}_{lt}"]["T"][:keep]
        row.append([v for col in g for v in col])
    T.append(row)
out = {"source": src["source"], "lats": lats, "lons": lons[:keep], "seasons": seasons, "times": times, "T": T}
json.dump(out, open(os.path.join(ROOT, "data", "processed", "mars_diurnal.json"), "w"), separators=(",", ":"))
print("lats", len(lats), "lons", keep, "maps", len(seasons) * len(times))
