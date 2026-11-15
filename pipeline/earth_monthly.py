"""
Earth month by month, for time travel (frontend/src/timetravel.js).
AI-assisted code (Claude).
Input: data/raw/earth_monthly_2023.npz from Google Earth Engine (Colab), 12 x 360 x 720 arrays at 0.5 deg:
       day, night  NASA MODIS MOD11C3 v061 monthly land surface temperature (deg C)
       ndvi        NASA MODIS MOD13C2 v061 monthly NDVI
       albedo      NASA MODIS MCD43C3 v061 white-sky shortwave albedo, monthly mean
       Missing values are -9999 (no data that month, e.g. polar night or cloud).
Output: data/processed/earth_monthly.bin (Int16, [month][var][cell] in earth_grid.json cell order)
        + data/processed/earth_monthly.json (header). A missing month falls back to the cell's
        2023 annual value from earth_grid.json, and the count of fallbacks is recorded.
"""
import json, os
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "processed")
npz = np.load(os.path.join(ROOT, "data", "raw", "earth_monthly_2023.npz"))
grid = json.load(open(os.path.join(P, "earth_grid.json")))
f = grid["fields"]; C = np.array(grid["cells"], dtype="float64")
row = np.clip(((90 - C[:, f.index("lat")]) / 0.5).astype(int), 0, 359)
col = np.clip(((C[:, f.index("lon")] + 180) / 0.5).astype(int), 0, 719)
VARS = [("lst_day_c", "day", 10), ("lst_night_c", "night", 10), ("albedo", "albedo", 1000), ("ndvi", "ndvi", 1000)]
n = len(C)
out = np.zeros((12, len(VARS), n), dtype="int16")
fallback = {}
for vi, (field, key, sc) in enumerate(VARS):
    A = npz[key][:, row, col]                         # 12 x n
    annual = C[:, f.index(field)]
    bad = (A < -9000) | ~np.isfinite(A)
    if field == "ndvi":
        A = np.where(bad, 0.0, A); A = np.maximum(A, -0.2)   # no vegetation data (ice, polar night): 0, like the annual grid
    else:
        A = np.where(bad, annual[None, :], A)
    fallback[field] = int(bad.sum())
    out[:, vi, :] = np.round(A * sc).astype("int16")
out.tofile(os.path.join(P, "earth_monthly.bin"))
head = {"year": 2023, "months": 12, "cells": n, "vars": [v[0] for v in VARS], "scale": {v[0]: v[2] for v in VARS},
        "order": "Int16 [month][var][cell], cell order = earth_grid.json", "fallback_to_annual": fallback,
        "sources": {"lst_day_c": "NASA MODIS MOD11C3 v061 monthly LST day (2023)", "lst_night_c": "NASA MODIS MOD11C3 v061 monthly LST night (2023)",
                    "albedo": "NASA MODIS MCD43C3 v061 white-sky shortwave albedo, monthly mean (2023)", "ndvi": "NASA MODIS MOD13C2 v061 monthly NDVI (2023)"}}
json.dump(head, open(os.path.join(P, "earth_monthly.json"), "w"), indent=1)
print("cells", n, "fallbacks", fallback, "bytes", out.nbytes)
for name, (la, lo) in {"Lahore": (31.75, 74.25), "Vostok": (-78.25, 106.75), "Sahara": (24.75, -2.75)}.items():
    k = int(np.argmin(np.abs(C[:, 0] - la) + np.abs(C[:, 1] - lo)))
    print(name, "day by month:", (out[:, 0, k] / 10).round(0).tolist())
