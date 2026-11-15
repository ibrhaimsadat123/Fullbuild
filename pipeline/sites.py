"""
TwinWorlds named sites: Pakistan case study + well-known analogs, scored under every lens.
AI-assisted code (Claude).
Run from the repo root (after score.py):   python pipeline/sites.py
"""
import json, os, glob
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "processed")

SITES = [
    # Pakistan case study (rarely or never used as analogs)
    {"name": "Hingol mud volcanoes, Balochistan", "lat": 25.40, "lon": 65.47, "country": "Pakistan", "tag": "emerging",
     "why": "Active mud volcanoes, a process analog for the mounds of Acidalia Planitia"},
    {"name": "Khewra Salt Mine, Punjab", "lat": 32.65, "lon": 73.01, "country": "Pakistan", "tag": "emerging",
     "why": "Ancient salt deposits and an underground environment, like Mars chloride deposits"},
    {"name": "Karakoram (Baltoro region)", "lat": 35.70, "lon": 76.50, "country": "Pakistan", "tag": "emerging",
     "why": "High-altitude ice, thin air, strong UV and extreme cold"},
    {"name": "Chagai Hills / Koh-i-Sultan, Balochistan", "lat": 29.13, "lon": 62.82, "country": "Pakistan", "tag": "emerging",
     "why": "Arid volcanic terrain in a hyper-dry desert"},
    {"name": "Cholistan Desert, Punjab", "lat": 28.50, "lon": 71.50, "country": "Pakistan", "tag": "emerging",
     "why": "Dunes, dust and wind-driven processes"},
    {"name": "Thar Desert (Tharparkar), Sindh", "lat": 24.70, "lon": 70.20, "country": "Pakistan", "tag": "emerging",
     "why": "Dunes and dust"},
    # Well-known analogs (benchmarks)
    {"name": "Atacama Desert (Yungay)", "lat": -24.08, "lon": -69.93, "country": "Chile", "tag": "benchmark", "why": "Hyper-arid, near-sterile soils"},
    {"name": "Haughton Crater, Devon Island", "lat": 75.38, "lon": -89.68, "country": "Canada", "tag": "benchmark", "why": "Polar desert impact crater (NASA Haughton-Mars Project)"},
    {"name": "McMurdo Dry Valleys", "lat": -77.50, "lon": 162.00, "country": "Antarctica", "tag": "benchmark", "why": "Cold, dry, ice-free valleys"},
    {"name": "Icelandic highlands (Askja)", "lat": 64.90, "lon": -16.80, "country": "Iceland", "tag": "benchmark", "why": "Dark basalt plains (Apollo geology training)"},
    {"name": "Qaidam Basin", "lat": 37.50, "lon": 94.00, "country": "China", "tag": "benchmark", "why": "High, hyper-arid salt basin"},
    {"name": "Mars Desert Research Station", "lat": 38.41, "lon": -110.79, "country": "USA", "tag": "benchmark", "why": "Analog mission habitat in Utah desert"},
    {"name": "Lanzarote", "lat": 29.00, "lon": -13.60, "country": "Spain", "tag": "benchmark", "why": "Volcanic terrain and lava tubes (ESA PANGAEA training)"},
    {"name": "Mauna Kea", "lat": 19.82, "lon": -155.47, "country": "USA", "tag": "benchmark", "why": "Volcanic soils (lunar regolith testing)"},
]


def slug(name):
    import re
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")[:40]


def lens_score(S, weights, dims):
    w = np.array([weights.get(d, 1.0) for d in dims])[:, None]
    return np.exp((np.log(np.maximum(S, 0.01)) * w).sum(axis=0) / w.sum())


def main():
    lenses = {l["id"]: l for l in json.load(open(os.path.join(DATA, "lenses.json")))["lenses"]}
    out_sites = [dict(s, id=slug(s["name"]), scores={}) for s in SITES]
    for f in sorted(glob.glob(os.path.join(DATA, "scores_*.json"))):
        d = json.load(open(f))
        arr = np.array(d["cells"], dtype="float64")
        dims = d["dims_used"]
        S = arr[:, 3:3 + len(dims)].T
        per_lens = {k: lens_score(S, v["weights"], dims) for k, v in lenses.items()}
        for s in out_sites:
            dist = np.abs(arr[:, 0] - s["lat"]) + np.abs(((arr[:, 1] - s["lon"] + 180) % 360) - 180) * np.cos(np.radians(s["lat"]))
            i = dist.argmin()
            if dist[i] > 1.0:
                continue
            s["scores"][d["target"]] = {
                lk: {"score": round(float(sc[i]), 3), "top_percent": round(100.0 * float((sc > sc[i]).mean()), 1)}
                for lk, sc in per_lens.items()}
    json.dump({"note": "Nearest 0.5 deg cell to each site; top_percent = % of Earth land cells scoring higher (lower is better).",
               "sites": out_sites}, open(os.path.join(DATA, "sites.json"), "w"), indent=1)

    print("Best result per site (any target, any lens):")
    for s in out_sites:
        best = [(v["top_percent"], t, lk) for t, lv in s["scores"].items() for lk, v in lv.items()]
        if best:
            top, t, lk = min(best)
            print(f"   {s['name']:42s} top {top:5.1f}%  ({t}, {lk} lens)")
        else:
            print(f"   {s['name']:42s} (no land cell in grid)")
    print("\nwrote data/processed/sites.json")


if __name__ == "__main__":
    main()
