"""
TwinWorlds Mission Twin: match a real Perseverance traverse to an Earth path.
AI-assisted code (Claude). Method: PROJECT.md Section 12 (Mission Twin path matching).

1. Mars route: NASA Mars 2020 traverse (mars.nasa.gov MMGIS, M20_traverse.json), sols 388-420:
   crater floor to the delta front, ~4.1 km. Elevations come from NASA's rover localization.
2. Resample every 25 m; cut into 250 m segments. Fingerprint per segment:
   slope (mean, 50 m baseline) and climb (end minus start elevation).
   Sub-metre roughness is NOT compared: Mars elevations come from 1 m HiRISE-based localization,
   Earth terrain from ~30 m Cesium World Terrain, so small-scale roughness is not like for like.
3. Earth: 16 x 16 km terrain grids (50 m) around candidate regions (Jezero's top Earth places,
   plus Hingol, Atacama, Qaidam). The route's real shape is tried at every 400 m offset and
   every 15 degrees of rotation. Paths over perfectly flat ground (water, filled gaps) are rejected.
4. Each candidate's segment sequence is compared with Mars by Dynamic Time Warping (window 2),
   per-segment cost = ((dslope / 0.5 deg)^2 + (dclimb / 3 m)^2); segment match = exp(-cost / 2).
5. Output data/processed/mission_twin.json (shape: frontend/DATA-SHAPES.md).

Run from the repo root:  python pipeline/mission_twin.py
"""
import json, glob, os, math
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "sources", "mission", "M20_traverse.json")
RAW = os.path.join(ROOT, "data", "raw", "mission")
OUT = os.path.join(ROOT, "data", "processed", "mission_twin.json")
SOL0, SOL1 = 388, 420
STEP, SEG = 25.0, 250.0
S_SLOPE, S_CLIMB = 0.5, 3.0
R_MARS = 3389500.0
rad = math.pi / 180


def mars_route():
    j = json.load(open(SRC))
    pts, sols = [], []
    for f in j["features"]:
        s = f["properties"]["sol"]
        if not (SOL0 <= s <= SOL1):
            continue
        g = f["geometry"]
        cs = g["coordinates"] if g["type"] == "LineString" else [c for part in g["coordinates"] for c in part]
        for c in cs:
            if c[2] == 0 or (pts and pts[-1][:2] == c[:2]):
                continue
            pts.append(c[:3]); sols.append(s)
    P = np.array(pts)
    dx = np.diff(P[:, 0]) * rad * R_MARS * np.cos(P[1:, 1] * rad)
    dy = np.diff(P[:, 1]) * rad * R_MARS
    d = np.concatenate([[0], np.cumsum(np.hypot(dx, dy))])
    s = np.arange(0, d[-1], STEP)
    lon, lat, z = (np.interp(s, d, P[:, k]) for k in range(3))
    sol = np.array(sols)[np.searchsorted(d, s, side="right") - 1]
    east = (lon - lon[0]) * rad * R_MARS * np.cos(lat[0] * rad)   # local metres, for reuse of the shape on Earth
    north = (lat - lat[0]) * rad * R_MARS
    return dict(s=s, lon=lon, lat=lat, z=z, sol=sol, east=east, north=north)


def seg_features(z):
    """z sampled every 25 m -> per 250 m segment: slope (deg, 50 m baseline), climb (m)."""
    per = int(SEG / STEP)
    nseg = (len(z) - 1) // per
    out = []
    for k in range(nseg):
        zz = z[k * per:(k + 1) * per + 1]
        dz50 = zz[2::2] - zz[:-2:2]
        out.append((float(np.degrees(np.arctan(np.abs(dz50) / 50.0)).mean()), float(zz[-1] - zz[0])))
    return np.array(out)


def dtw(A, B, w=2):
    n, m = len(A), len(B)
    C = ((A[:, None, 0] - B[None, :, 0]) / S_SLOPE) ** 2 + ((A[:, None, 1] - B[None, :, 1]) / S_CLIMB) ** 2
    D = np.full((n + 1, m + 1), np.inf); D[0, 0] = 0
    for i in range(1, n + 1):
        for j in range(max(1, i - w), min(m, i + w) + 1):
            D[i, j] = C[i - 1, j - 1] + min(D[i - 1, j], D[i, j - 1], D[i - 1, j - 1])
    i, j, path = n, m, []
    while i > 0 and j > 0:
        path.append((i - 1, j - 1))
        k = np.argmin([D[i - 1, j - 1], D[i - 1, j], D[i, j - 1]])
        i, j = (i - 1, j - 1) if k == 0 else (i - 1, j) if k == 1 else (i, j - 1)
    return D[n, m] / len(path), path[::-1], C


def bilinear(g, lat, lon):
    H = g["H"]
    y = (lat - g["lat0"]) / g["dlat"]; x = (lon - g["lon0"]) / g["dlon"]
    i0 = np.floor(y).astype(int); k0 = np.floor(x).astype(int)
    ok = (i0 >= 0) & (k0 >= 0) & (i0 < g["n"] - 1) & (k0 < g["n"] - 1)
    i0c, k0c = np.clip(i0, 0, g["n"] - 2), np.clip(k0, 0, g["n"] - 2)
    fy, fx = y - i0c, x - k0c
    v = (H[i0c, k0c] * (1 - fy) * (1 - fx) + H[i0c + 1, k0c] * fy * (1 - fx)
         + H[i0c, k0c + 1] * (1 - fy) * fx + H[i0c + 1, k0c + 1] * fy * fx)
    v[~ok] = np.nan
    return v


def search(route, A, g):
    la, lo = g["center"]
    mlat, mlon = 111320.0, 111320.0 * math.cos(la * rad)
    best = None
    E, N = route["east"], route["north"]
    half = (g["n"] - 1) * 50 / 2
    for th in range(0, 360, 15):
        c, s_ = math.cos(th * rad), math.sin(th * rad)
        e = E * c - N * s_; nn = E * s_ + N * c
        e -= (e.min() + e.max()) / 2; nn -= (nn.min() + nn.max()) / 2
        span_e, span_n = (e.max() - e.min()) / 2, (nn.max() - nn.min()) / 2
        for oy in np.arange(-half + span_n + 100, half - span_n - 100, 400):
            for ox in np.arange(-half + span_e + 100, half - span_e - 100, 400):
                lat = la + (nn + oy) / mlat; lon = lo + (e + ox) / mlon
                z = bilinear(g, lat, lon)
                if np.isnan(z).any():
                    continue
                if (np.abs(np.diff(z)) < 0.05).mean() > 0.3:   # water or filled gaps
                    continue
                B = seg_features(z)
                cost = (((A[:, 0] - B[:, 0]) / S_SLOPE) ** 2 + ((A[:, 1] - B[:, 1]) / S_CLIMB) ** 2).mean()
                if best is None or cost < best[0]:
                    best = (cost, th, lat, lon, z, B)
    return best


def label(slope, climb):
    if climb > 8: return "steep climb"
    if climb < -8: return "steep descent"
    if slope < 0.8: return "flat"
    if slope < 1.5: return "gentle, rolling"
    return "uneven"


def main():
    route = mars_route()
    A = seg_features(route["z"])
    per = int(SEG / STEP)
    print(f"Mars: {route['s'][-1]:.0f} m, {len(A)} segments")
    results = []
    for f in sorted(glob.glob(os.path.join(RAW, "earth_*.json"))):
        g = json.load(open(f))
        g["H"] = np.array(g["h"], dtype="float64").reshape(g["n"], g["n"])
        b = search(route, A, g)
        if b is None:
            print(f"  {g['name']:36s} no valid path"); continue
        score, path, C = dtw(A, b[5])
        results.append((score, g, b, path, C))
        print(f"  {g['name']:36s} DTW cost {score:6.2f}  mean match {np.exp(-np.diag(C)/2).mean():.2f}  rot {b[1]}")
    results.sort(key=lambda r: r[0])
    score, g, b, path, C = results[0]
    _, th, lat, lon, z, B = b
    planet_path = [[round(float(x), 6), round(float(y), 6)] for x, y in zip(route["lon"], route["lat"])]
    earth_path = [[round(float(x), 6), round(float(y), 6)] for x, y in zip(lon, lat)]
    segs = []
    for i in range(len(A)):
        js = [jj for ii, jj in path if ii == i]
        m = float(np.exp(-min(C[i, jj] for jj in js) / 2))
        sols = sorted(set(int(x) for x in route["sol"][i * per:(i + 1) * per + 1]))
        segs.append({
            "id": i + 1, "label": label(*A[i]), "length_m": int(SEG),
            "planet_range": [i * per, (i + 1) * per], "earth_range": [min(js) * per, (max(js) + 1) * per],
            "match": round(m, 2) if m >= 0.3 else None,
            "sols": f"{sols[0]}" if sols[0] == sols[-1] else f"{sols[0]}-{sols[-1]}",
            "planet": {"seg_slope_deg": round(float(A[i, 0]), 2), "climb_m": round(float(A[i, 1]), 1)},
            "earth": {"seg_slope_deg": round(float(np.mean([B[jj, 0] for jj in js])), 2), "climb_m": round(float(np.mean([B[jj, 1] for jj in js])), 1)},
            "gaps": ["Gravity (0.38 g)", "Thin CO2 air (~600 Pa)", "Radiation", "Nights colder than anywhere on Earth"],
        })
    # Itinerary: one rehearsal day per sol Perseverance spent driving these segments.
    itinerary, day, last = [], 0, None
    for sg in segs:
        first_sol = sg["sols"].split("-")[0]
        if first_sol != last:
            day += 1; last = first_sol
            itinerary.append({"day": day, "time": "10:30", "segment": sg["id"],
                              "text": f"Segment {sg['id']} onward ({sg['label']}), as Perseverance drove from sol {first_sol}"})
    others = [{"site": r[1]["name"], "dtw_cost": round(r[0], 2), "mean_match": round(float(np.exp(-np.diag(r[4]) / 2).mean()), 2)} for r in results]
    out = {
        "mission": "Perseverance, Jezero crater floor to the delta front (sols 388-420)",
        "playback_seconds": 28,
        "distance_km": round(float(route["s"][-1]) / 1000, 1),
        "planet": {"world": "mars", "target": "jezero", "rover": "Perseverance", "path": planet_path, "ends": [f"Start, sol {SOL0}", "Delta front, sol 419"],
                   "source": "NASA/JPL-Caltech Mars 2020 traverse (mars.nasa.gov MMGIS M20_traverse.json), sols 388-420; elevations from rover localization"},
        "earth": {"site": g["name"], "rover": "Earth twin", "path": earth_path, "ends": ["Start", "Climb (delta-front twin)"],
                  "source": f"Route shape matched on Cesium World Terrain (50 m grid), rotated {th} deg; Dynamic Time Warping on segment slope and climb"},
        "segments": segs,
        "itinerary": itinerary,
        "candidates": others,
        "method": "250 m segments; fingerprint = mean slope (50 m baseline) and climb; Earth paths = the real route shape at every 400 m offset and 15 deg rotation in 16 x 16 km candidate regions; DTW window 2; match = exp(-cost/2), cost = (dslope/0.5 deg)^2 + (dclimb/3 m)^2. Sub-metre roughness is not compared (1 m HiRISE on Mars vs ~30 m terrain on Earth).",
        "timing_note": "A Mars day (sol) is about 24 h 39 min and Mars seasons are about twice as long. We match ground conditions, not clocks: one rehearsal day per sol of driving, at 10:30 local time (the hour our temperatures are compared at).",
    }
    json.dump(out, open(OUT, "w"), indent=1)
    print("best:", g["name"], "mean segment match", round(float(np.mean([s['match'] or 0 for s in segs])), 2))
    for s in segs: print(s["id"], s["label"], s["sols"], s["planet"], s["earth"], s["match"])


if __name__ == "__main__":
    main()
