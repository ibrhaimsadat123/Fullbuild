"""
TwinWorlds blind test (strict version)
AI-assisted code (Claude).

Question: the engine was never told about famous Mars/Moon analog sites.
Where do they rank anyway?

For each known site and each target we take the Earth cell nearest the site and ask:
"what % of all Earth land cells score higher?"  (top 1% = excellent, top 50% = average).
A randomly chosen place averages top 50% by definition, so that is the baseline.

Run from the repo root (after score.py):   python pipeline/blind_test.py
"""
import json, os, glob
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "processed")

# Well-known terrestrial analog sites. The engine never sees this list.
KNOWN = {
    "Atacama Desert (Yungay), Chile":      (-24.08, -69.93),
    "Haughton Crater, Devon Island":       (75.38, -89.68),
    "McMurdo Dry Valleys, Antarctica":     (-77.50, 162.00),
    "Icelandic highlands (Askja)":         (64.90, -16.80),
    "Mauna Kea, Hawaii":                   (19.82, -155.47),
    "Rio Tinto, Spain":                    (37.70, -6.60),
    "Mojave Desert, USA":                  (35.00, -116.00),
    "Mars Desert Research Station, Utah":  (38.41, -110.79),
    "Svalbard (AMASE), Norway":            (79.40, 13.30),
    "Qaidam Basin, China":                 (37.50, 94.00),
    "Death Valley, USA":                   (36.50, -116.90),
    "Danakil Depression, Ethiopia":        (14.24, 40.30),
    "Pilbara, Australia":                  (-21.00, 119.00),
    "Lanzarote, Canary Islands":           (29.00, -13.60),
}


def top_percent(arr, lat, lon):
    d = np.abs(arr[:, 0] - lat) + np.abs(((arr[:, 1] - lon + 180) % 360) - 180) * np.cos(np.radians(lat))
    i = d.argmin()
    if d[i] > 1.0:
        return None
    return round(100.0 * float((arr[:, 2] > arr[i, 2]).mean()), 1)


def main():
    loaded = {}
    for f in sorted(glob.glob(os.path.join(DATA, "scores_*.json"))):
        d = json.load(open(f))
        loaded[d["target"]] = np.array(d["cells"], dtype="float64")

    per_target, per_site = {}, {}
    print("Per target (random place = top 50% on average):")
    for t, arr in loaded.items():
        vals = {s: top_percent(arr, *ll) for s, ll in KNOWN.items()}
        ok = [v for v in vals.values() if v is not None]
        per_target[t] = {"sites": vals, "median_top_percent": round(float(np.median(ok)), 1)}
        print(f"   {t:22s} known sites median: top {np.median(ok):5.1f}%")

    print("\nPer known site (average over all targets):")
    for s, ll in KNOWN.items():
        v = [per_target[t]["sites"][s] for t in loaded if per_target[t]["sites"][s] is not None]
        if v:
            per_site[s] = round(float(np.mean(v)), 1)
    for s, v in sorted(per_site.items(), key=lambda x: x[1]):
        print(f"   {s:38s} top {v:5.1f}%")

    out = {
        "method": "Nearest Earth cell to each known analog site; % of Earth land cells scoring higher. "
                  "Known sites are never used in scoring. Random baseline = top 50%.",
        "per_target": per_target, "per_site_mean_top_percent": per_site,
    }
    json.dump(out, open(os.path.join(DATA, "blind_test.json"), "w"), indent=1)
    print("\nwrote data/processed/blind_test.json")


if __name__ == "__main__":
    main()
