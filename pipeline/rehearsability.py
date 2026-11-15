# AI-assisted (Claude): Rehearsability Map. The engine run backwards: for every 2-degree cell on Mars or the
# Moon, how well can ANY place on Earth rehearse it? Value = the best TwinWorlds score over all 79,625 Earth
# land cells (same dimensions, sigmas, family weights and beyond-Earth rule as pipeline/score.py).
# Cells where every Earth place scores low are "analog deserts".
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from score import DIMS, FAMILY_W, MIN_DIMS, tx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "processed")
STEP = 2


def run(world):
    E = json.load(open(os.path.join(P, "earth_grid.json")))
    ef = E["fields"]; ec = np.array(E["cells"], float)
    pl = json.load(open(os.path.join(P, "earth_places.json")))
    G = json.load(open(os.path.join(P, f"{world}_grid.json")))
    gf = G["fields"]; gc = np.array([[np.nan if v is None else v for v in r] for r in G["cells"]], float)
    keep = (np.mod(gc[:, gf.index("lat")] - 0.5, STEP) == 0) & (np.mod(gc[:, gf.index("lon")] - 0.5, STEP) == 0)
    gc = gc[keep]
    dims = [d for d in DIMS if d in ef]
    earth, sig, lo, hi, logs = [], [], [], [], []
    for d in dims:
        e = ec[:, ef.index(d)]; L = DIMS[d]
        lo.append(e.min()); hi.append(e.max())
        te = tx(e, L); p5, p95 = np.percentile(te, [5, 95])
        earth.append(te); sig.append(max((p95 - p5) / 4, 1e-6)); logs.append(L)
    earth = np.array(earth)                     # (D, N)
    sig = np.array(sig)[:, None]
    lo, hi = np.array(lo), np.array(hi)
    # target values: NDVI is zero on Mars and the Moon
    T = np.stack([np.zeros(len(gc)) if d == "ndvi" else gc[:, gf.index(d)] for d in dims], axis=1)   # (M, D)
    valid = np.isfinite(T)
    beyond = valid & ((T < lo) | (T > hi))
    W0 = np.array([FAMILY_W.get(d, 1.0) for d in dims])[None, :] * valid
    W = W0 * ~beyond
    coverage = W.sum(axis=1) / np.maximum(W0.sum(axis=1), 1e-9)   # share of the measurements Earth can reach at all
    best, best_i, nvote = np.zeros(len(gc)), np.zeros(len(gc), int), (W > 0).sum(axis=1)
    Tt = np.stack([tx(T[:, k], logs[k]) for k in range(len(dims))], axis=1)
    CH = 48
    for a in range(0, len(gc), CH):
        t = Tt[a:a + CH]; w = W[a:a + CH]
        acc = np.zeros((len(t), earth.shape[1]))
        for k in range(len(dims)):
            wk = w[:, k][:, None]
            if not wk.any(): continue
            tk = np.nan_to_num(t[:, k])[:, None]
            s = np.exp(-((earth[k][None, :] - tk) ** 2) / (2 * sig[k] ** 2))
            acc += wk * np.log(np.maximum(s, 0.01))
        sc = np.exp(acc / np.maximum(w.sum(axis=1)[:, None], 1e-9))
        best_i[a:a + CH] = sc.argmax(axis=1); best[a:a + CH] = sc.max(axis=1)
    out = []
    for m in range(len(gc)):
        ok = nvote[m] >= MIN_DIMS
        i = best_i[m]
        out.append([float(gc[m, gf.index("lat")]), float(gc[m, gf.index("lon")]),
                    round(float(best[m] * coverage[m]), 3) if ok else None, round(float(best[m]), 3) if ok else None,
                    round(float(coverage[m]), 3), int(beyond[m].sum()), pl["cells"][i] if ok else None])
    sc = np.array([r[2] for r in out if r[2] is not None])
    print(world, len(out), "cells; best-score percentiles 10/50/90:", np.percentile(sc, [10, 50, 90]).round(3), "unscoreable:", sum(r[2] is None for r in out))
    return {"step_deg": STEP, "fields": ["lat", "lon", "rehearsability", "best_score", "coverage", "dims_beyond_earth", "place"], "cells": out,
            "places": pl["names"], "deserts_below": round(float(np.percentile(sc, 10)), 3)}


if __name__ == "__main__":
    world = sys.argv[1]
    res = run(world)
    path = os.path.join(P, "rehearsability.json")
    R = json.load(open(path)) if os.path.exists(path) else {
        "method": "For every 2-degree cell on Mars or the Moon: the best TwinWorlds score over all 79,625 Earth land cells, same engine as the main map (Gaussian similarity, Earth-spread sigmas, temperature family shares one vote, dimensions beyond Earth do not vote but are counted). Rehearsability = best score x coverage, where coverage is the share of the (family-weighted) measurements that fall inside Earth's range at all. Analog deserts = the lowest 10% of cells on that world.",
        "worlds": {}}
    R["worlds"][world] = res
    json.dump(R, open(path, "w"))
