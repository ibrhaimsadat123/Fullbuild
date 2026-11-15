# AI-assisted (Claude): model thermal inertia ("ground type") on Earth, Mars and the Moon, from the SAME
# inputs on every world: albedo, latitude, and the day-night ground temperature difference at 10:30 vs 22:30.
#
# Method (the idea behind TES/THEMIS thermal inertia, simplified): a 1-D heat-conduction model of the ground,
# heated by the Sun and cooling by radiation, is run for many thermal inertias I. For each world, latitude and
# albedo we tabulate the 10:30 minus 22:30 temperature it predicts, then invert: the I that reproduces the
# observed difference. Low I = loose dust (big swing), high I = rock (small swing).
# Simplifications (stated in the app): equinox sun (the observed temperatures are annual or 4-season means),
# no atmosphere, no clouds or moisture, emissivity 0.95, volumetric heat capacity 1.2e6 J m-3 K-1.
# On Earth the air and water damp the swing, so Earth values are "apparent" and read high; Mars and the Moon
# are close to the model's assumptions. Validated against published values (printed at the end).
import json, os
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "processed")
SIG, EPS, RHOC = 5.670e-8, 0.95, 1.2e6
WORLDS = {  # surface solar flux at noon, overhead sun (W m-2); solar day (s)
    "earth": {"S": 1361 * 0.75, "day": 86400.0, "note": "1361 W/m2 x 0.75 clear-sky transmission"},
    "mars": {"S": 1361 / 1.524 ** 2, "day": 88775.244, "note": "1361 / 1.524^2 W/m2 (mean distance), no atmosphere"},
    "moon": {"S": 1361.0, "day": 29.530589 * 86400, "note": "1361 W/m2, airless"},
}
I_GRID = np.exp(np.linspace(np.log(15), np.log(4000), 40))
LAT_GRID = np.arange(0, 86, 5.0)
A_GRID = np.array([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8])


def model_swing(world):
    """Table swing[lat, albedo, I] = T(10:30) - T(22:30) (K) for one world."""
    w = WORLDS[world]
    om = 2 * np.pi / w["day"]
    L, A, I = np.meshgrid(LAT_GRID, A_GRID, I_GRID, indexing="ij")
    L, A, I = L.ravel(), A.ravel(), I.ravel()
    k = I ** 2 / RHOC
    kappa = k / RHOC
    delta = np.sqrt(2 * kappa / om)          # diurnal skin depth
    nz, steps = 30, 720
    dz = delta * 5 / nz                       # 5 skin depths deep
    dt = w["day"] / steps
    lam = kappa * dt / dz ** 2
    sub = int(np.ceil(lam.max() / 0.4))       # sub-steps for stability
    dts = dt / sub
    lam = kappa * dts / dz ** 2
    # start near radiative equilibrium of the daily-mean flux
    Fmean = (1 - A) * w["S"] * np.cos(np.radians(L)) / np.pi
    T = np.repeat(((Fmean / (EPS * SIG)) ** 0.25)[:, None], nz, axis=1)
    rec = {}
    for day in range(25):
        for s in range(steps):
            hour = s * 24.0 / steps
            mu = np.cos(np.radians(L)) * np.cos(np.radians(15 * (hour - 12)))
            F = (1 - A) * w["S"] * np.clip(mu, 0, None)
            for _ in range(sub):
                # surface: thin skin with no heat capacity, solved by Newton: F - e s Ts^4 + k (T1 - Ts)/dz = 0
                g = k / dz
                Ts = T[:, 0].copy()
                for _n in range(4):
                    f = F - EPS * SIG * Ts ** 4 + g * (T[:, 1] - Ts)
                    Ts = Ts + f / (4 * EPS * SIG * Ts ** 3 + g)
                    Ts = np.clip(Ts, 20, 500)
                Tn = T.copy()
                Tn[:, 0] = Ts
                Tn[:, 1:-1] = T[:, 1:-1] + lam[:, None] * (T[:, 2:] - 2 * T[:, 1:-1] + T[:, :-2])
                Tn[:, -1] = T[:, -1] + lam * (T[:, -2] - T[:, -1])
                T = Tn
            if day == 24:
                if abs(hour - 10.5) < 1e-9: rec["d"] = T[:, 0].copy()
                if abs(hour - 22.5) < 1e-9: rec["n"] = T[:, 0].copy()
    sw = (rec["d"] - rec["n"]).reshape(len(LAT_GRID), len(A_GRID), len(I_GRID))
    return sw


def invert(sw, lat, alb, swing):
    """Thermal inertia that reproduces `swing` at (lat, albedo); bilinear in lat/albedo, log-interp in I."""
    la = np.clip(abs(lat), LAT_GRID[0], LAT_GRID[-1]); al = np.clip(alb, A_GRID[0], A_GRID[-1])
    i = min(np.searchsorted(LAT_GRID, la) , len(LAT_GRID) - 1); i0 = max(i - 1, 0); fi = 0 if i == i0 else (la - LAT_GRID[i0]) / (LAT_GRID[i] - LAT_GRID[i0])
    j = min(np.searchsorted(A_GRID, al), len(A_GRID) - 1); j0 = max(j - 1, 0); fj = 0 if j == j0 else (al - A_GRID[j0]) / (A_GRID[j] - A_GRID[j0])
    curve = (1 - fi) * ((1 - fj) * sw[i0, j0] + fj * sw[i0, j]) + fi * ((1 - fj) * sw[i, j0] + fj * sw[i, j])
    # swing falls as I rises; curve is decreasing in I
    if swing >= curve[0]: return float(I_GRID[0]), "below"
    if swing <= curve[-1]: return float(I_GRID[-1]), "above"
    return float(np.exp(np.interp(-swing, -curve, np.log(I_GRID)))), "ok"


if __name__ == "__main__" and not os.environ.get("TI_APPLY"):
    tables = {}
    for wname in WORLDS:
        tables[wname] = model_swing(wname)
        print(wname, "swing at lat 20, A 0.2 for I=50, 200, 1000:",
              [round(float(np.interp(np.log(x), np.log(I_GRID), tables[wname][4, 3])), 1) for x in (50, 200, 1000)])
    np.savez(os.path.join(ROOT, "data", "raw", "ti_tables.npz"), **{k: v for k, v in tables.items()}, I=I_GRID, lat=LAT_GRID, A=A_GRID)


def apply():
    Z = np.load(os.path.join(ROOT, "data", "raw", "ti_tables.npz"))
    out = {"version": "0.1", "units": "J m-2 K-1 s-1/2 (thermal inertia, SI)",
           "method": "1-D heat-conduction model (sun in, radiation out, equinox, no atmosphere, emissivity 0.95, rho*c 1.2e6) run for 40 thermal inertias per world, latitude and albedo; inverted against the observed 10:30 minus 22:30 ground temperature. Same model and inputs on all three worlds.",
           "worlds": {k: v["note"] for k, v in WORLDS.items()},
           "caveat_earth": "Earth's air, clouds and soil moisture damp the day-night swing, which the model reads as higher thermal inertia: Earth values are apparent thermal inertia and read high, most in humid places. Deserts are closest to the model.",
           "classes": [[0, 150, "Dust"], [150, 400, "Sand"], [400, 1500, "Crust, gravel, rocks"], [1500, 1e9, "Bedrock"]],
           "classes_note": "Classes from Mellon et al. (2000), Icarus 148, 437: loose dust typically below ~150; coarse sand up to ~375; values above 400 suggest induration (crust); solid rock about 1500 to 3000.",
           "grids": {}, "targets": {}}
    for world, fname in (("earth", "earth_grid.json"), ("mars", "mars_grid.json"), ("moon", "moon_grid.json")):
        g = json.load(open(os.path.join(P, fname)))
        f = g["fields"]; ia, io, ial, isw = f.index("lat"), f.index("lon"), f.index("albedo"), f.index("lst_swing_c")
        sw = Z[world]
        vals = []
        for r in g["cells"]:
            a, s = r[ial], r[isw]
            if a is None or s is None or s <= 0: vals.append(None); continue
            ti, flag = invert(sw, r[ia], a, s)
            vals.append(round(ti) if flag == "ok" else (f"<{round(ti)}" if flag == "below" else f">{round(ti)}"))
        out["grids"][world] = vals
        ok = [v for v in vals if isinstance(v, (int, float))]
        print(world, "cells", len(vals), "solved", len(ok), "median", np.median(ok) if ok else None)
    T = json.load(open(os.path.join(P, "targets.json")))
    for t in T["targets"]:
        fv = lambda k: (t["features"].get(k) or {}).get("value")
        a, s = fv("albedo"), fv("lst_swing_c")
        if a is None or s is None: continue
        ti, flag = invert(Z[t["world"]], t["lat"], a, s)
        out["targets"][t["id"]] = {"ti": round(ti), "flag": flag, "albedo": a, "swing_c": s,
                                   "published": t["features"].get("thermal_inertia_si")}
        print(t["id"], round(ti), flag, "published:", (t["features"].get("thermal_inertia_si") or {}).get("range"))
    json.dump(out, open(os.path.join(P, "thermal_inertia.json"), "w"))


if __name__ == "__main__" and os.environ.get("TI_APPLY"):
    apply()
