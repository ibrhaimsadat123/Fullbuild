# AI-assisted (Claude): Mars vs Earth mineral spectra.
# Mars: CRISM type spectra (Viviano-Beck et al. 2014, PDS MRO-M-CRISM-4-TYPESPEC-V1.0), ratioed I/F, corrected.
# Earth, two kinds:
#   lab   - RELAB reflectance (Brown University, PDS urn:nasa:pds:relab) of the specimen each CRISM label
#           names as its lab analog.
#   orbit - NASA EMIT L2A surface reflectance (ISS, 60 m) at a real Earth site, via Google Earth Engine
#           (pipeline/emit_colab.py -> data/sources/spectra/emit_spectra.json).
# Shape match: both continuum-removed (upper convex hull) over the mineral's diagnostic window, Pearson r on a
# 0.01 um grid, skipping the CRISM detector join (1.62-1.70 um), atmospheric CO2 (1.95-2.08 um) where noted,
# and any wavelengths EMIT leaves blank (water vapour bands).
import json, os, re
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "sources", "spectra")
JOIN, CO2 = (1.62, 1.70), (1.95, 2.08)

# id, mineral name, raw file, window (um), masks, why this window
LAB = [
    ("mg_olivine", "Mg-olivine (forsterite)", "mg_olivine", (0.75, 2.6), [JOIN, CO2], "broad 1 um iron band"),
    ("fe_olivine", "Fe-olivine (fayalite)", "fe_olivine", (0.75, 2.6), [JOIN, CO2], "broad 1 um iron band"),
    ("hcp", "High-calcium pyroxene", "hcp", (0.75, 2.6), [JOIN, CO2], "1 and 2 um pyroxene bands"),
    ("lcp", "Low-calcium pyroxene", "lcp", (0.75, 2.6), [JOIN, CO2], "1 and 2 um pyroxene bands"),
    ("plagioclase", "Plagioclase feldspar", "plagioclase", (0.75, 2.6), [JOIN, CO2], "1.25 um iron band"),
    ("fe_smectite", "Fe-smectite clay (nontronite)", "fe_smectite_b", (1.2, 2.6), [JOIN], "water bands at 1.4 and 1.9 um, Fe-OH at 2.29 um"),
    ("fe_ca_carbonate", "Carbonate", "fe_ca_carbonate", (2.1, 2.6), [], "carbonate bands at 2.3 and 2.5 um"),
]
# EMIT pairs: id in emit_spectra.json -> CRISM type spectrum, mineral, window, masks
ORBIT = {
    "gypsum": ("gypsum", "Gypsum", (1.4, 2.48), [], "hydration bands at 1.45, 1.75 and 1.94 um, doublet near 2.2 um"),
    "kaolinite": ("kaolinite", "Kaolinite clay", (2.0, 2.45), [], "Al-OH doublet at 2.16 and 2.21 um"),
    "alunite": ("alunite", "Alunite (sulfate)", (1.4, 2.48), [], "1.76 um and 2.17 um bands"),
    "hematite": ("hematite", "Hematite", (0.5, 1.0), [], "iron bands near 0.53 and 0.86 um"),
    "fe_ca_carbonate": ("fe_ca_carbonate", "Carbonate", (2.1, 2.48), [], "carbonate band at 2.3 um (EMIT stops at 2.49 um)"),
}


def hull_cr(x, y):
    pts = []
    for p in zip(x, y):
        while len(pts) >= 2 and (pts[-1][0] - pts[-2][0]) * (p[1] - pts[-2][1]) - (pts[-1][1] - pts[-2][1]) * (p[0] - pts[-2][0]) >= 0:
            pts.pop()
        pts.append(p)
    hx, hy = zip(*pts)
    return y / np.interp(x, hx, hy)


def tag(xml, name):
    m = re.search(rf"<{re.escape(name)}[^>]*>([^<]*)</", xml)
    return m.group(1).strip() if m else None


def crism(lbl, rows):
    g = lambda key: (re.search(key + r'\s*=\s*"?([^"\r\n]+)', lbl) or [None, None])[1]
    c = np.array([r for r in rows if len(r) == 2 and 0 < r[1] < 1000])
    desc = re.sub(r"\s+", " ", (re.search(r'DESCRIPTION\s*=\s*"CRISM type spectrum of ([^"]+)"', lbl) or [None, ""])[1]).strip().rstrip(".")
    meta = {"where": desc, "lat": float(g("TYPESPEC_NUM_LAT").split()[0]), "lon": float(g("TYPESPEC_NUM_LON").split()[0]),
            "product": g("SOURCE_PRODUCT_ID"), "lab_analog_named": g("TYPESPEC_LAB_ANALOG_ID"),
            "source": "MRO CRISM type spectrum (Viviano-Beck et al. 2014), PDS " + (g("PRODUCT_ID") or "")}
    return c[:, 0], c[:, 1], meta


def compare(cx, cy, ex, ey, win, masks):
    gx = np.round(np.arange(win[0], win[1] + 1e-9, 0.01), 3)
    gx = gx[(gx >= max(cx.min(), np.nanmin(ex))) & (gx <= min(cx.max(), np.nanmax(ex)))]
    good = np.isfinite(ey)
    cm = np.interp(gx, cx, cy)
    em = np.interp(gx, ex[good], ey[good])
    # blank EMIT bands: grid points farther than 0.02 um from any valid EMIT band
    near = np.array([np.min(np.abs(ex[good] - x)) <= 0.02 for x in gx])
    mk = near.copy()
    for a, b in masks:
        mk &= ~((gx > a) & (gx < b))
    ccr, ecr = hull_cr(gx, cm), hull_cr(gx, em)
    r = float(np.corrcoef(ccr[mk], ecr[mk])[0, 1])
    rnd = lambda a: [None if not m else round(float(v), 4) for v, m in zip(a, mk)]
    return {"x": [round(float(v), 3) for v in gx], "mars_cr": rnd(ccr), "earth_cr": rnd(ecr), "shape_r": round(r, 3)}


out = []
for mid, name, f, win, masks, why in LAB:
    r = json.load(open(os.path.join(SRC, f + ".json")))
    cx, cy, meta = crism(r["crism"]["label"], r["crism"]["rows"])
    e = np.array([row[:2] for row in r["relab"]["rows"]], float)
    e = e[np.argsort(e[:, 0])]
    xml = r["relab"]["xml"]
    cmp = compare(cx, cy, e[:, 0] / 1000.0, e[:, 1], win, masks)
    out.append({"id": mid, "pair": "lab", "mineral": name, "mars": meta, "window_um": win, "window_why": why,
                "earth": {"kind": "lab", "relab_spectrum": r["relab"]["id"], "sample": tag(xml, "speclib:specimen_id"),
                          "name": tag(xml, "speclib:specimen_name"), "description": tag(xml, "speclib:specimen_description"),
                          "where": tag(xml, "speclib:specimen_collection_location") or None, "type": tag(xml, "speclib:specimen_type"),
                          "source": "RELAB spectral library (Brown University), PDS urn:nasa:pds:relab:data_reflectance:" + r["relab"]["id"]},
                **cmp})
    print("lab  ", mid, cmp["shape_r"], out[-1]["earth"]["sample"], out[-1]["earth"]["name"])

emit_file = os.path.join(SRC, "emit_spectra.json")
if os.path.exists(emit_file):
    E = json.load(open(emit_file))
    fix = os.path.join(SRC, "emit_spectra_fix.json")  # re-run for gypsum and alunite (pipeline/emit_colab_fix.py)
    if os.path.exists(fix):
        F = {s["id"]: s for s in json.load(open(fix))["sites"]}
        E["sites"] = [F.get(s["id"], s) for s in E["sites"]]
    for s in E["sites"]:
        # Alunite: no pixel at Cuprite had a 2.165 um band clearly deeper than kaolinite's 2.205 um band
        # (best band-depth difference about 0), so EMIT did not isolate alunite there. Left out.
        if s["id"] == "alunite" and s["band_depth"]["top_mean"] < 0.02:
            print("orbit alunite skipped: not isolated by EMIT at", s["site"]); continue
        if s["id"] not in ORBIT:
            continue
        crism_id, name, win, masks, why = ORBIT[s["id"]]
        cf = os.path.join(SRC, f"crism_{crism_id}.json")
        if os.path.exists(cf):
            c = json.load(open(cf)); lbl, rows = c["label"], c["rows"]
        else:
            c = json.load(open(os.path.join(SRC, crism_id + ".json")))["crism"]; lbl, rows = c["label"], c["rows"]
        cx, cy, meta = crism(lbl, rows)
        ex = np.array(s["wavelength_um"], float)
        ey = np.array([np.nan if v is None else v for v in s["reflectance"]], float)
        cmp = compare(cx, cy, ex, ey, win, masks)
        out.append({"id": "emit_" + s["id"], "pair": "orbit", "mineral": name, "mars": meta, "window_um": win, "window_why": why,
                    "earth": {"kind": "orbit", "where": s["site"], "lat": s["lat"], "lon": s["lon"], "scene": s["scene"], "date": s["date"],
                              "pixels": f"{s['pixels_kept']} purest of {s['pixels_sampled']} pixels (deepest band at {s['band_depth']['center_um']} um)",
                              "source": E["source"] + ", scene " + s["scene"]},
                    **cmp})
        print("orbit", s["id"], cmp["shape_r"], s["site"])

json.dump({"version": "0.2",
           "method": "Continuum removed (upper convex hull) over each mineral's diagnostic window; Pearson r on a 0.01 um grid, skipping 1.62-1.70 um (CRISM detector join), 1.95-2.08 um (atmospheric CO2) where it would hide nothing diagnostic, and any band EMIT leaves blank. r = 1 means the same absorption shape.",
           "note": "Lab pairs use the exact specimen each CRISM label names as its analog. Orbit pairs use NASA EMIT on the ISS over a real Earth site, keeping the 25 pixels with the deepest diagnostic band; pixels are chosen by band depth only, never by similarity to Mars.",
           "spectra": out}, open(os.path.join(ROOT, "data", "processed", "spectra.json"), "w"))
