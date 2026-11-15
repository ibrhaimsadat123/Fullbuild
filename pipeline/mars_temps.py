# AI-assisted code (Claude). Adds Mars surface temperatures to mars_grid.json.
# Source: Mars Climate Database v6.2 whole-planet maps (data/sources/mcd/mcd_tsurf_maps.txt),
# bilinearly interpolated from the 5.7 x 3.8 deg model grid to the 1 deg cells.
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "sources", "mcd", "mcd_tsurf_maps.txt")
GRID = os.path.join(ROOT, "data", "processed", "mars_grid.json")

line = [l for l in open(SRC) if not l.startswith("#")][0].strip()
d, n = line[1:].split("N")
day = np.array([[float(v) for v in r.split()] for r in d.split(";")])    # [lon, lat] K
night = np.array([[float(v) for v in r.split()] for r in n.split(";")])
NLON, NLAT = day.shape
lon0, dlon = -180.0, 360.0 / NLON
lat0, dlat = -90.0, 180.0 / (NLAT - 1)

def interp(m, lat, lon):
    x = ((lon - lon0) % 360.0) / dlon
    i0 = int(np.floor(x)) % NLON; i1 = (i0 + 1) % NLON; fx = x - np.floor(x)
    y = min(max((lat - lat0) / dlat, 0), NLAT - 1 - 1e-9)
    j0 = int(np.floor(y)); j1 = j0 + 1; fy = y - j0
    return ((1-fx)*(1-fy)*m[i0, j0] + fx*(1-fy)*m[i1, j0]
            + (1-fx)*fy*m[i0, j1] + fx*fy*m[i1, j1])

g = json.load(open(GRID))
f = g["fields"]
base = [k for k in f if k not in ("lst_day_c", "lst_night_c", "lst_swing_c")]
ix = [f.index(k) for k in base]
la, lo = f.index("lat"), f.index("lon")
cells = []
for c in g["cells"]:
    tday = interp(day, c[la], c[lo]) - 273.15
    tnight = interp(night, c[la], c[lo]) - 273.15
    cells.append([c[i] for i in ix] + [round(tday, 1), round(tnight, 1), round(tday - tnight, 1)])
g["fields"] = base + ["lst_day_c", "lst_night_c", "lst_swing_c"]
g["cells"] = cells
src = ("Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES), climatology scenario: surface temperature at "
       "local time 10.5 h (day) / 22.5 h (night) everywhere, mean of Ls 0, 90, 180, 270, "
       "bilinearly interpolated from the 5.7 x 3.8 deg model grid")
g.setdefault("sources", {})
g["sources"]["lst_day_c"] = src
g["sources"]["lst_night_c"] = src
g["sources"]["lst_swing_c"] = "Computed: lst_day_c minus lst_night_c (" + src + ")"
json.dump(g, open(GRID, "w"), separators=(",", ":"))

k = {(c[0], c[1]): c for c in cells}
for name, key in [("Jezero", (18.5, 77.5)), ("Acidalia", (46.5, -22.5)), ("Arcadia", (40.5, -170.5))]:
    print(name, dict(zip(g["fields"], k.get(key, []))))
a = np.array([c[-3:] for c in cells])
print("day min/max", a[:,0].min(), a[:,0].max(), "night min/max", a[:,1].min(), a[:,1].max())
