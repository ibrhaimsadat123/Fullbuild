# AI-assisted code (Claude). Builds data/processed/moon_grid.json: the same measurements as
# mars_grid.json, for every 1 deg cell of the Moon, so "click anywhere" works on the Moon.
#
# Inputs (fetched from NASA PDS through the Vite dev proxy, see data/sources/moon/README.md):
#   data/raw/moon/ldem_16.img          LRO LOLA LDEM 16 ppd (int16, 0.5 m)        -> slope, relief
#   data/raw/moon/ldam_4_float.img     LRO LOLA LDAM 4 ppd normal albedo (float32) -> albedo
#   data/sources/moon/diviner_gcp_1deg.json  LRO Diviner GCP bolometric temperature,
#                                       local time 9.75-11.25 h and 21.75-23.25 h, per 1 deg cell
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw", "moon")
SRC = os.path.join(ROOT, "data", "sources", "moon")
OUT = os.path.join(ROOT, "data", "processed", "moon_grid.json")
R_MOON = 1737400.0

# ---- terrain: LOLA LDEM 16 ppd -> 3x3 block mean (0.1875 deg = 5.69 km, close to Earth's 5.55 km)
z16 = np.fromfile(os.path.join(RAW, "ldem_16.img"), dtype="<i2").astype(np.float64).reshape(2880, 5760) * 0.5
z = z16.reshape(960, 3, 1920, 3).mean(axis=(1, 3))             # rows: 90N -> 90S, cols: 0 -> 360E
NY, NX = z.shape
dlat = 180.0 / NY
lat_c = 90.0 - (np.arange(NY) + 0.5) * dlat
px = np.deg2rad(dlat) * R_MOON                                   # metres per pixel north-south
coslat = np.maximum(np.cos(np.deg2rad(lat_c)), 0.02)[:, None]
dzdy = np.gradient(z, axis=0) / px
dzdx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * px * coslat)   # wraps in longitude
slope = np.degrees(np.arctan(np.hypot(dzdx, dzdy)))

# 55 km box statistics (box = +/-27.5 km, wider in degrees of longitude toward the poles)
def box_stats(a, b):
    """Mean of a and std of b over a 55 km box centred on each 1 deg cell centre."""
    pad = NX
    aw = np.concatenate([a, a, a], axis=1); bw = np.concatenate([b, b, b], axis=1)
    def integral(x):
        s = np.zeros((x.shape[0] + 1, x.shape[1] + 1)); s[1:, 1:] = x.cumsum(0).cumsum(1); return s
    Sa, Sb, Sb2 = integral(aw), integral(bw), integral(bw * bw)
    half_lat = 27500.0 / px                                      # in pixels
    mean_a = np.zeros((180, 360)); std_b = np.zeros((180, 360))
    for i in range(180):
        lat = 89.5 - i
        r = (90.0 - lat) / dlat - 0.5
        r0 = int(max(0, np.floor(r - half_lat + 0.5))); r1 = int(min(NY, np.floor(r + half_lat + 0.5) + 1))
        half_lon = min(half_lat / max(np.cos(np.deg2rad(lat)), 1e-3), NX / 2 - 1)
        for j in range(360):
            lon360 = (j - 180 + 0.5) % 360.0
            c = lon360 / dlat - 0.5 + pad
            c0 = int(np.floor(c - half_lon + 0.5)); c1 = int(np.floor(c + half_lon + 0.5)) + 1
            n = (r1 - r0) * (c1 - c0)
            sa = Sa[r1, c1] - Sa[r0, c1] - Sa[r1, c0] + Sa[r0, c0]
            sb = Sb[r1, c1] - Sb[r0, c1] - Sb[r1, c0] + Sb[r0, c0]
            sb2 = Sb2[r1, c1] - Sb2[r0, c1] - Sb2[r1, c0] + Sb2[r0, c0]
            mean_a[i, j] = sa / n
            std_b[i, j] = np.sqrt(max(sb2 / n - (sb / n) ** 2, 0.0))
    return mean_a, std_b

slope_cell, relief_cell = box_stats(slope, z)                   # [i: 89.5N..89.5S, j: -179.5..179.5]

# ---- albedo: LOLA LDAM 4 ppd, mean per 1 deg cell
alb = np.fromfile(os.path.join(RAW, "ldam_4_float.img"), dtype="<f4").astype(np.float64).reshape(720, 1440)
alb = np.where((alb > 0) & (alb < 1), alb, np.nan)
alb_cell = np.nanmean(alb.reshape(180, 4, 360, 4), axis=(1, 3))  # cols 0..360E
alb_cell = np.roll(alb_cell, 180, axis=1)                        # -> -180..180

# ---- temperatures: Diviner GCP per 1 deg cell (index = (floor(lat)+90)*360 + floor(lon)+180)
d = json.load(open(os.path.join(SRC, "diviner_gcp_1deg.json")))
def to_grid(vals):
    a = np.array([np.nan if v is None else v for v in vals], dtype=float).reshape(180, 360)  # row 0 = -90..-89
    return a[::-1]                                               # row 0 = 89..90 (matches the cells above)
tday, tnight = to_grid(d["day_K"]), to_grid(d["night_K"])
def fill(a):
    """One pass: empty cells take the mean of their filled 3x3 neighbours (wrapping in longitude)."""
    out = a.copy(); m = np.isnan(a)
    stack = [np.roll(np.roll(a, di, 0), dj, 1) for di in (-1, 0, 1) for dj in (-1, 0, 1)]
    nb = np.nanmean(np.array(stack), axis=0)
    out[m] = nb[m]
    return out, int(m.sum()), int(np.isnan(out).sum())
tday, gaps_d, left_d = fill(tday); tnight, gaps_n, left_n = fill(tnight)

cells = []
for i in range(180):
    for j in range(360):
        def r(x, k): return None if not np.isfinite(x) else round(float(x), k)
        td = tday[i, j] - 273.15; tn = tnight[i, j] - 273.15
        cells.append([89.5 - i, -179.5 + j, r(slope_cell[i, j], 3), r(relief_cell[i, j], 1), r(alb_cell[i, j], 4),
                      r(td, 1), r(tn, 1), r(td - tn, 1)])

div = ("LRO Diviner Global Cumulative Product (Williams et al. 2017, Icarus 283), bolometric temperature, "
       "nadir data 2009-2015, mean of 0.25 h local-time bins between {} per 1 deg cell (2 of 4 0.5 deg pixels sampled); "
       "empty cells filled from neighbours")
g = {
    "world": "moon", "resolution_deg": 1.0,
    "fields": ["lat", "lon", "slope_deg", "relief_55km_m", "albedo", "lst_day_c", "lst_night_c", "lst_swing_c"],
    "cells": cells,
    "sources": {
        "slope_deg": "Computed by TwinWorlds from NASA PDS LRO LOLA LDEM 16 ppd, block-averaged to 5.69 km pixels (Earth uses 5.55 km), mean over a 55 km box",
        "relief_55km_m": "Computed by TwinWorlds from LRO LOLA LDEM: std dev of 5.69 km elevation within a 55 km box",
        "albedo": "LRO LOLA LDAM 4 ppd normal albedo at 1064 nm (Lemelin et al. 2016), mean per 1 deg cell. Single wavelength, not broadband like Earth (MODIS) and Mars (TES): approximate comparison",
        "lst_day_c": div.format("9.75 and 11.25 h (centred on 10:30, the Terra overpass time used for Earth)"),
        "lst_night_c": div.format("21.75 and 23.25 h (centred on 22:30)"),
        "lst_swing_c": "Computed: lst_day_c minus lst_night_c (LRO Diviner GCP)",
    },
    "notes": f"Diviner gaps filled from neighbours: day {gaps_d - left_d}, night {gaps_n - left_n}; still empty: day {left_d}, night {left_n}",
}
json.dump(g, open(OUT, "w"), separators=(",", ":"))
k = {(c[0], c[1]): c for c in cells}
for name, key in [("Tranquillitatis pit", (8.5, 33.5)), ("Shackleton", (-89.5, 129.5)), ("Mare Imbrium", (35.5, -15.5)), ("Highlands (Descartes)", (-9.5, 15.5))]:
    print(name, dict(zip(g["fields"], k[key])))
print(g["notes"])
