"""
TwinWorlds similarity engine v1
AI-assisted code (Claude). Method: PROJECT.md Section 12.

For every Earth cell and every Moon/Mars target:
  1. Use only dimensions that are measured on BOTH worlds (target value not null).
  2. Per-dimension similarity  s_i = exp(-(x_earth - x_target)^2 / (2 * sigma_i^2))
     sigma_i = a quarter of Earth's 5th-95th percentile range for that dimension.
     Slope and relief are compared in log space (they are heavily skewed).
  3. If the target is beyond anything on Earth (e.g. lunar night), the target is
     clamped to Earth's most extreme value for scoring, and the true gap is reported.
  4. Overall score = weighted mean of s_i (weights from the Mission Lens).

Run from the repo root:   python pipeline/score.py
"""
import json, math, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "processed")

# Dimensions the engine knows about: (field name, compare in log space?)
DIMS = {
    "slope_deg":     True,
    "relief_55km_m": True,
    "lst_day_c":     False,
    "lst_night_c":   False,
    "lst_swing_c":   False,
    "albedo":        False,
    "ndvi":          False,
}
MIN_DIMS = 3   # don't score a target on fewer than 3 shared dimensions (too easy to match)
TIERS = [("exact", 0.90), ("strong", 0.75), ("moderate", 0.60), ("variable", 0.45)]


def load():
    grid = json.load(open(os.path.join(DATA, "earth_grid.json")))
    targets = json.load(open(os.path.join(DATA, "targets.json")))["targets"]
    lenses_path = os.path.join(DATA, "lenses.json")
    lenses = json.load(open(lenses_path)) if os.path.exists(lenses_path) else {}
    return grid, targets, lenses


def tx(x, log):
    return np.log1p(np.maximum(x, 0)) if log else x


def target_value(feat):
    """Number for a target feature: value, else midpoint of range, else None."""
    if feat is None or feat.get("status") != "sourced":
        return None
    if feat.get("value") is not None:
        return float(feat["value"])
    if feat.get("range"):
        lo, hi = feat["range"]
        return (lo + hi) / 2
    return None


def tier_of(score):
    for name, t in TIERS:
        if score >= t:
            return name
    return None


def score_target(grid, target, weights=None):
    fields = grid["fields"]
    cells = np.array(grid["cells"], dtype="float64")
    col = {f: i for i, f in enumerate(fields)}

    used, missing, gaps, sims, w = [], [], {}, [], []
    for dim, log in DIMS.items():
        tv = target_value(target["features"].get(dim))
        if tv is None or dim not in col:
            missing.append(dim)
            continue
        earth = cells[:, col[dim]]
        lo, hi = float(earth.min()), float(earth.max())
        clamped = min(max(tv, lo), hi)
        if clamped != tv:
            gaps[dim] = {"target": tv, "earth_extreme": clamped, "gap": round(tv - clamped, 2)}
        e, t = tx(earth, log), tx(np.array(clamped), log)
        p5, p95 = np.percentile(e, [5, 95])
        sigma = max((p95 - p5) / 4, 1e-6)
        sims.append(np.exp(-((e - t) ** 2) / (2 * sigma ** 2)))
        w.append((weights or {}).get(dim, 1.0))
        used.append(dim)

    if len(used) < MIN_DIMS:
        raise ValueError(f"{target['id']}: only {len(used)} sourced dimension(s) {used}; need {MIN_DIMS}")
    S = np.vstack(sims)                       # (dims, cells)
    W = np.array(w)[:, None]
    score = (S * W).sum(axis=0) / W.sum()
    return cells, used, missing, gaps, S, score


def export(target, cells, used, missing, gaps, S, score):
    order = np.argsort(-score)
    rows = []
    for i in range(len(score)):
        rows.append([round(cells[i, 0], 2), round(cells[i, 1], 2), round(float(score[i]), 3)] +
                    [round(float(v), 2) for v in S[:, i]])
    top = [{"lat": round(cells[i, 0], 2), "lon": round(cells[i, 1], 2),
            "score": round(float(score[i]), 3), "tier": tier_of(score[i])} for i in order[:50]]
    out = {
        "target": target["id"], "world": target["world"], "name": target["name"],
        "dims_used": used, "dims_missing": missing, "earth_gaps": gaps,
        "tiers": dict(TIERS),
        "fields": ["lat", "lon", "score"] + [f"s_{d}" for d in used],
        "cells": rows, "top50": top,
        "method": "Gaussian similarity per dimension, sigma = 1/4 of Earth 5-95th percentile range; "
                  "slope and relief in log space; equal weights unless a lens is applied",
    }
    path = os.path.join(DATA, f"scores_{target['id']}.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    return path, top


if __name__ == "__main__":
    grid, targets, lenses = load()
    for t in targets:
        try:
            res = score_target(grid, t)
        except ValueError as e:
            print("SKIP", e)
            continue
        path, top = export(t, *res)
        print(f"\n{t['name']}  ->  {os.path.basename(path)}")
        print("  dims used:   ", res[1])
        print("  dims missing:", res[2])
        if res[3]:
            print("  Earth can't reach:", res[3])
        for row in top[:5]:
            print(f"   {row['lat']:7.2f} {row['lon']:8.2f}  score={row['score']:.3f}  {row['tier']}")
