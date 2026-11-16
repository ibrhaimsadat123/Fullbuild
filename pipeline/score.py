"""
TwinWorlds similarity engine v1
AI-assisted code (Claude). Method: PROJECT.md Section 12.

For every Earth cell and every Moon/Mars target:
  1. Use only dimensions that are measured on BOTH worlds (target value not null).
  2. Per-dimension similarity  s_i = exp(-(x_earth - x_target)^2 / (2 * sigma_i^2))
     sigma_i = a quarter of Earth's 5th-95th percentile range for that dimension.
     Slope and relief are compared in log space (they are heavily skewed).
  3. If the target is beyond anything on Earth (e.g. lunar night), that dimension is
     scored by percentile rank toward the extreme (the coldest place on Earth scores 1,
     the median 0.5), and the true gap to the target is reported.
  4. Overall score = weighted GEOMETRIC mean of s_i (weights from the Mission Lens).
     Day, night and swing temperature are one family and share one vote (1/3 each).
     A dimension where the target is beyond anything on Earth does NOT vote: its percentile
     ranking would be the same for every target, so it would pull every Mars spot to the
     same corner of Earth. Its similarity is still stored and the gap is reported.
     A geometric mean means one badly failed dimension (e.g. bright ice vs dark Mars rock)
     pulls the whole score down, instead of being averaged away by the others.

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
MIN_DIMS = 3   # don't score a target on fewer than 3 voting dimensions (too easy to match)
# Correlated dimensions share one vote: day, night and swing temperature are one family.
FAMILY_W = {"lst_day_c": 1 / 3, "lst_night_c": 1 / 3, "lst_swing_c": 1 / 3}
# Map tiers are RELATIVE: the top X% of Earth's land cells for this target.
# The raw score (0-1) still says how close Earth gets in absolute terms.
TIER_PCT = [("exact", 0.5), ("strong", 2.0), ("moderate", 5.0), ("variable", 10.0)]


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


def tier_thresholds(score):
    return {name: round(float(np.percentile(score, 100 - pct)), 3) for name, pct in TIER_PCT}


def tier_of(score, th):
    for name, _ in TIER_PCT:
        if score >= th[name]:
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
        if clamped != tv:
            # Target is beyond anything on Earth: no cell can truly match, so score each
            # cell by how far toward that extreme it sits (percentile rank). Coldest cell = 1,
            # median = 0.5. This avoids one extreme corner of Earth winning by default.
            ranks = earth.argsort().argsort() / (len(earth) - 1)
            sims.append(ranks if tv > hi else 1 - ranks)
        else:
            e, t = tx(earth, log), tx(np.array(clamped), log)
            p5, p95 = np.percentile(e, [5, 95])
            sigma = max((p95 - p5) / 4, 1e-6)
            sims.append(np.exp(-((e - t) ** 2) / (2 * sigma ** 2)))
        beyond = clamped != tv
        w.append(0.0 if beyond else (weights or {}).get(dim, 1.0) * FAMILY_W.get(dim, 1.0))
        used.append(dim)

    voting = [d for d, wi in zip(used, w) if wi > 0]
    if len(voting) < MIN_DIMS:
        raise ValueError(f"{target['id']}: only {len(voting)} voting dimension(s) {voting}; need {MIN_DIMS}")
    S = np.vstack(sims)                       # (dims, cells)
    W = np.array(w)[:, None]
    score = np.exp((np.log(np.maximum(S, 0.01)) * W).sum(axis=0) / W.sum())
    # Open water is not an analog: multiply by the share of the cell that is land (Natural Earth),
    # so a cell that is mostly lake or sea (Caspian, Balkhash, Athabasca) cannot rank on flatness alone.
    if "land_frac" in col:
        score = score * cells[:, col["land_frac"]]
    return cells, used, missing, gaps, S, score


def export(target, cells, used, missing, gaps, S, score, land=None):
    order = np.argsort(-score)
    th = tier_thresholds(score)
    rows = []
    for i in range(len(score)):
        rows.append([round(cells[i, 0], 2), round(cells[i, 1], 2), round(float(score[i]), 3)] +
                    [round(float(v), 2) for v in S[:, i]] + ([round(float(land[i]), 2)] if land is not None else []))
    top = [{"lat": round(cells[i, 0], 2), "lon": round(cells[i, 1], 2),
            "score": round(float(score[i]), 3), "tier": tier_of(score[i], th)} for i in order[:50]]
    out = {
        "target": target["id"], "world": target["world"], "name": target["name"],
        "dims_used": used, "dims_missing": missing, "earth_gaps": gaps,
        "tiers": th, "tiers_note": "relative: exact = top 0.5% of Earth land cells, strong = top 2%, moderate = top 5%, variable = top 10%",
        "fields": ["lat", "lon", "score"] + [f"s_{d}" for d in used] + (["land"] if land is not None else []),
        "cells": rows, "top50": top,
        "dims_voting": [d for d in used if d not in gaps],
        "method": "Gaussian similarity per dimension, sigma = 1/4 of Earth 5-95th percentile range; "
                  "slope and relief in log space; weighted geometric mean across dimensions. Day/night/swing temperature "
                  "share one vote; dimensions beyond anything on Earth (earth_gaps) are reported but do not vote; "
                  "the result is multiplied by the cell's land share (land), so open water cannot rank",
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
        land = res[0][:, grid["fields"].index("land_frac")] if "land_frac" in grid["fields"] else None
        path, top = export(t, *res, land=land)
        print(f"\n{t['name']}  ->  {os.path.basename(path)}")
        print("  dims used:   ", res[1])
        print("  dims missing:", res[2])
        if res[3]:
            print("  Earth can't reach:", res[3])
        for row in top[:5]:
            print(f"   {row['lat']:7.2f} {row['lon']:8.2f}  score={row['score']:.3f}  {row['tier']}")
