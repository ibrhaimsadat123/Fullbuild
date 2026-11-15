# AI-assisted (Claude): candidate Earth places for the live "most Mars-like right now" job.
# For each Mars target: the 12 best-scoring places with distinct Natural Earth names (best cell per name).
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "processed")
grid = json.load(open(os.path.join(P, "earth_grid.json")))
pl = json.load(open(os.path.join(P, "earth_places.json")))
f = grid["fields"]; iLa, iLo = f.index("lat"), f.index("lon")
name = {(round(r[iLa], 2), round(r[iLo], 2)): pl["names"][pl["cells"][i]] for i, r in enumerate(grid["cells"])}
targets = {t["id"]: t for t in json.load(open(os.path.join(P, "targets.json")))["targets"]}
out = {"note": "Top places per Mars target (distinct names), for the hourly live job in the Worker.", "targets": {}}
for tid, t in targets.items():
    if t["world"] != "mars": continue
    s = json.load(open(os.path.join(P, f"scores_{tid}.json")))
    sf = s["fields"]; a, b, c = sf.index("lat"), sf.index("lon"), sf.index("score")
    seen, picks = set(), []
    for r in sorted(s["cells"], key=lambda r: -(r[c] or 0)):
        n = name.get((round(r[a], 2), round(r[b], 2)), "")
        if not n or n in seen: continue
        seen.add(n); picks.append({"name": n, "lat": r[a], "lon": r[b], "score": r[c]})
        if len(picks) == 12: break
    out["targets"][tid] = {"name": t["name"], "lat": t["lat"], "lon": t["lon"], "places": picks}
    print(tid, [p["name"] for p in picks[:5]])
json.dump(out, open(os.path.join(P, "live_candidates.json"), "w"), indent=1)
