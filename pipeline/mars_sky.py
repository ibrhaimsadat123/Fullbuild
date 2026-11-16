# AI-assisted (Claude): Mars sky for the Dust / Water / UV card.
# Input: data/sources/mcd/mcd_sky_targets.json (Mars Climate Database v6.2 point series, every 15 deg of Ls,
#        local time 12 h): dod (dust column visible optical depth), col_h2ovapor (kg/m2), col_o3 (kg/m2).
# Output: data/processed/mars_sky.json. Water vapour in mm of precipitable water (1 kg/m2 = 1 mm);
#         ozone in Dobson units (1 DU = 2.1415e-5 kg/m2 of O3).
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = json.load(open(os.path.join(ROOT, "data", "sources", "mcd", "mcd_sky_targets.json")))
_m = os.path.join(ROOT, "data", "sources", "mcd", "mcd_sky_missions.json")   # NASA mission landing sites
if os.path.exists(_m):
    src["targets"].update(json.load(open(_m))["targets"])
DU = 2.1415e-5
out = {"source": src["source"], "units": {"dust": "column optical depth (visible)", "water_mm": "precipitable water, mm", "ozone_du": "Dobson units"},
       "earth_reference": {"ozone_du": 300, "ozone_note": "Earth's global average ozone column is about 300 Dobson units (well-established figure)"},
       "targets": {}}
for tid, t in src["targets"].items():
    ls = [r[0] for r in t["dod"]["rows"]]
    dust = [round(r[1], 3) for r in t["dod"]["rows"]]
    water = [round(r[1], 4) for r in t["col_h2ovapor"]["rows"]]
    oz = [round(r[1] / DU, 3) for r in t["col_o3"]["rows"]]
    m = lambda a: round(sum(a) / len(a), 4)
    out["targets"][tid] = {"name": t["name"], "lat": t["lat"], "lon": t["lon"], "ls": ls, "dust": dust, "water_mm": water, "ozone_du": oz,
                           "mean": {"dust": m(dust), "water_mm": m(water), "ozone_du": m(oz)},
                           "max": {"dust": max(dust), "water_mm": max(water), "ozone_du": max(oz)}}
    print(tid, out["targets"][tid]["mean"], out["targets"][tid]["max"])
json.dump(out, open(os.path.join(ROOT, "data", "processed", "mars_sky.json"), "w"), indent=1)
