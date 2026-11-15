# AI-assisted (Claude): Mission Twin timing.
# For each segment of a rover route, find the Earth date and hours at its twin site whose ground
# temperature and sun height best match what the rover saw on Mars on the sol it drove that segment.
#   Mars: Mars Climate Database v6.2 surface temperature (mars_diurnal.json), at the route start,
#         season (Ls) of that sol, local solar hours 11-14 (the drive window we compare).
#         Sun height from Mars' solar declination (obliquity 25.19 deg) and the hour angle.
#   Earth: ERA5 hourly soil temperature 0-7 cm for 2023 (Open-Meteo archive API) at the twin site;
#          sun height from the solar declination and local solar time (lon/15, no equation of time).
# cost per hour = (dT / 5 C)^2 + (dSun / 5 deg)^2, averaged over the 4-hour window.
import json, math, os, sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, "data", "processed")
SRC = os.path.join(ROOT, "data", "sources", "mission")
SOL_S = 88775.244
MISSIONS = {
    "perseverance": {"landing": datetime(2021, 2, 18, 20, 55, tzinfo=timezone.utc), "rover": "Perseverance"},
    "curiosity": {"landing": datetime(2012, 8, 6, 5, 17, tzinfo=timezone.utc), "rover": "Curiosity"},
}
WIN = [11, 12, 13, 14]
rad = math.pi / 180


def mars_ls(dt):
    jd = dt.timestamp() / 86400 + 2440587.5
    d = jd + 69.184 / 86400 - 2451545.0
    M = (19.3871 + 0.52402073 * d) * rad
    a = 270.3871 + 0.524038496 * d
    eoc = (10.691 + 3e-7 * d) * math.sin(M) + 0.623 * math.sin(2 * M) + 0.05 * math.sin(3 * M) + 0.005 * math.sin(4 * M) + 0.0005 * math.sin(5 * M)
    return (a + eoc) % 360


def mars_temp(D, lat, lon, ls, lt):
    lats, lons, seasons, times, T = D["lats"], D["lons"], D["seasons"], D["times"], D["T"]
    nLat, nLon = len(lats), len(lons)
    x = ((lon - lons[0]) % 360) / (360 / nLon)
    i0 = int(math.floor(x)) % nLon; i1 = (i0 + 1) % nLon; fx = x - math.floor(x)
    dLat = (lats[-1] - lats[0]) / (nLat - 1)
    y = max(0, min(nLat - 1 - 1e-9, (lat - lats[0]) / dLat)); j0 = int(y); j1 = j0 + 1; fy = y - j0
    def at(si, ti):
        g = T[si][ti]
        return (1 - fx) * (1 - fy) * g[i0 * nLat + j0] + fx * (1 - fy) * g[i1 * nLat + j0] + (1 - fx) * fy * g[i0 * nLat + j1] + fx * fy * g[i1 * nLat + j1]
    def per(v, arr, period):
        step = period / len(arr); u = ((v - arr[0]) % period) / step; a = int(u) % len(arr)
        return a, (a + 1) % len(arr), u - math.floor(u)
    s0, s1, fs = per(ls, seasons, 360); t0, t1, ft = per(lt, times, 24)
    k = (1 - fs) * ((1 - ft) * at(s0, t0) + ft * at(s0, t1)) + fs * ((1 - ft) * at(s1, t0) + ft * at(s1, t1))
    return k - 273.15


def sun_elev(lat, decl, hour):
    H = 15 * (hour - 12) * rad
    s = math.sin(lat * rad) * math.sin(decl * rad) + math.cos(lat * rad) * math.cos(decl * rad) * math.cos(H)
    return math.asin(max(-1, min(1, s))) / rad


def run(mid):
    cfg = MISSIONS[mid]
    mfile = os.path.join(P, f"mission_twin_{mid}.json")
    m = json.load(open(mfile))
    D = json.load(open(os.path.join(P, "mars_diurnal.json")))
    E = json.load(open(os.path.join(SRC, f"era5_{mid}_2023.json")))
    mlon, mlat = m["planet"]["path"][0]
    elat, elon = E["latitude"], E["longitude"]
    times = [datetime.fromisoformat(t).replace(tzinfo=timezone.utc) for t in E["hourly"]["time"]]
    soil = E["hourly"]["soil_temperature_0_to_7cm"]
    # Earth: per local-solar day, temperature and sun height by local solar hour (rounded)
    off = elon / 15
    days = {}
    for t, v in zip(times, soil):
        if v is None: continue
        lst = t + timedelta(hours=off)
        doy = lst.timetuple().tm_yday
        decl = 23.44 * math.sin(2 * math.pi * (284 + doy) / 365)
        h = lst.hour + lst.minute / 60
        days.setdefault(lst.date(), {})[round(h) % 24] = (v, sun_elev(elat, decl, h))
    dates = sorted(d for d in days if d.year == 2023)

    def earth_best(d, mT, mS):
        best = None
        hrs = days.get(d, {})
        for s in range(6, 16):
            if not all((s + k) in hrs for k in range(4)): continue
            c = sum(((hrs[s + k][0] - mT[k]) / 5) ** 2 + ((hrs[s + k][1] - mS[k]) / 5) ** 2 for k in range(4)) / 4
            if best is None or c < best[0]:
                best = (c, s, [hrs[s + k][0] for k in range(4)], [hrs[s + k][1] for k in range(4)])
        return best

    segs = m["segments"]
    mars = []
    for sg in segs:
        sol = int(str(sg["sols"]).split("-")[0])
        dt = cfg["landing"] + timedelta(seconds=sol * SOL_S)
        ls = mars_ls(dt)
        decl = math.asin(math.sin(25.19 * rad) * math.sin(ls * rad)) / rad
        mT = [mars_temp(D, mlat, mlon, ls, h) for h in WIN]
        mS = [sun_elev(mlat, decl, h) for h in WIN]
        mars.append((sol, dt, ls, mT, mS))

    # per-segment best date (any day of the year)
    per = []
    for (sol, dt, ls, mT, mS), sg in zip(mars, segs):
        cands = [(earth_best(d, mT, mS), d) for d in dates]
        cands = [(b, d) for b, d in cands if b]
        b, d = min(cands, key=lambda x: x[0][0])
        per.append({"segment": sg["id"], "sol": sol, "earth_date_of_sol": dt.strftime("%Y-%m-%d"), "mars_ls": round(ls, 1),
                    "mars_temp_c": [round(x, 1) for x in mT], "mars_sun_deg": [round(x, 1) for x in mS],
                    "best_earth_date": d.isoformat(), "earth_start_hour": b[1], "earth_temp_c": [round(x, 1) for x in b[2]],
                    "earth_sun_deg": [round(x, 1) for x in b[3]], "cost": round(b[0], 2)})

    # best consecutive window: segment k on start + k days
    best = None
    for i0 in range(len(dates) - len(segs)):
        tot, picks, ok = 0, [], True
        for k, ((sol, dt, ls, mT, mS)) in enumerate(mars):
            d = dates[i0] + timedelta(days=k)
            b = earth_best(d, mT, mS)
            if not b: ok = False; break
            tot += b[0]; picks.append((d, b))
        if ok and (best is None or tot < best[0]): best = (tot, picks)
    tot, picks = best
    itinerary = []
    for k, ((d, b), sg, mm) in enumerate(zip(picks, segs, mars)):
        dT = sum(abs(b[2][j] - mm[3][j]) for j in range(4)) / 4
        dS = sum(abs(b[3][j] - mm[4][j]) for j in range(4)) / 4
        itinerary.append({"day": k + 1, "date": d.isoformat(), "time": f"{b[1]:02d}:00-{b[1] + 4:02d}:00",
                          "segment": sg["id"],
                          "text": f"Segment {sg['id']} ({sg['label']}), as {cfg['rover']} drove on sol {mm[0]}: ground {int(round(sum(b[2]) / 4))} °C vs {int(round(sum(mm[3]) / 4))} °C on Mars, sun {int(round(sum(b[3]) / 4))}° vs {int(round(sum(mm[4]) / 4))}° high",
                          "d_temp_c": round(dT, 1), "d_sun_deg": round(dS, 1)})
    mdT = sum(x["d_temp_c"] for x in itinerary) / len(itinerary)
    mdS = sum(x["d_sun_deg"] for x in itinerary) / len(itinerary)
    m["itinerary"] = itinerary
    m["timing"] = {
        "window": {"start": picks[0][0].isoformat(), "end": picks[-1][0].isoformat(), "mean_d_temp_c": round(mdT, 1), "mean_d_sun_deg": round(mdS, 1)},
        "per_segment": per,
        "mars_hours": WIN,
        "method": "For each segment: Mars ground temperature (Mars Climate Database v6.2, season of the sol it was driven, local solar hours 11 to 14) and sun height (from Ls and Mars' 25.19 deg obliquity). Earth: ERA5 hourly soil temperature 0-7 cm for 2023 at the twin site, sun height from date and local solar time. Each Earth day's best 4-hour window minimises mean (dT/5 C)^2 + (dSun/5 deg)^2; the itinerary is the run of consecutive days (one per segment) with the lowest total.",
        "sources": ["Mars Climate Database v6.2 (LMD/OU/IAA/ESA/CNES)", "ERA5 reanalysis (Copernicus/ECMWF) via Open-Meteo Historical Weather API", "Mars Ls: Allison & McEwen (2000), Planet. Space Sci. 48, 215"],
    }
    m["timing_note"] = (f"Best rehearsal window: {picks[0][0].strftime('%d %b')} to {picks[-1][0].strftime('%d %b')} (2023 weather), one day per segment. "
                        f"On average the ground is within {mdT:.0f} °C and the sun within {mdS:.0f}° of what {cfg['rover']} saw. "
                        "A sol is 24 h 39 min and Mars seasons last about twice as long, so we match conditions, not clocks. "
                        "Earth temperature is ERA5 soil 0-7 cm, Mars is the ground surface.")
    if mdT > 10:
        m["timing_note"] += (f" Weak thermal match: {m['earth']['site']} is never as cold as {cfg['rover']}'s route at midday, "
                             "so rehearse the terrain here and the temperature in a thermal chamber.")
    json.dump(m, open(mfile, "w"), indent=1)
    print(mid, m["timing"]["window"])
    for it in itinerary[:4]: print(" ", it["date"], it["time"], it["text"])


if __name__ == "__main__":
    for mid in (sys.argv[1:] or MISSIONS): run(mid)
