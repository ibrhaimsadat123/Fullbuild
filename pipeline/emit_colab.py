# TwinWorlds: EMIT (Earth, from the ISS) spectra for the Mars vs Earth mineral comparison.
# Paste this whole cell into the same Google Colab you used for Earth Engine and run it.
# It writes emit_spectra.json; download it and put it in  Fullbuild\data\sources\spectra\
#
# Method: for each Earth site, take the EMIT L2A surface reflectance scene (NASA/EMIT/L2A/RFL)
# with the most valid pixels over the site box, sample up to 1500 pixels at 60 m, and keep the
# 25 pixels with the deepest diagnostic absorption for the mineral (band depth, defined below).
# Their mean spectrum is the Earth-from-orbit spectrum. Nothing is tuned to the Mars spectrum.
import ee, json, math
import numpy as np

PROJECT = 'thermal-list-367916'
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate()
    ee.Initialize(project=PROJECT)

SITES = [
  # id (matches the CRISM type spectrum), Earth site, box [W, S, E, N], band depth (center, left, right) in um
  ('gypsum',          'White Sands dune field, New Mexico, USA', [-106.40, 32.75, -106.18, 32.95], (1.75, 1.70, 1.80)),
  ('kaolinite',       'Cuprite, Nevada, USA',                    [-117.26, 37.49, -117.14, 37.59], (2.205, 2.12, 2.25)),
  ('alunite',         'Cuprite, Nevada, USA',                    [-117.26, 37.49, -117.14, 37.59], (1.76, 1.70, 1.82)),
  ('hematite',        'Hamersley Range, Pilbara, Australia',     [117.80, -22.45, 118.30, -22.05], (0.86, 0.76, 0.98)),
  ('fe_ca_carbonate', 'Kirthar Range limestone, Sindh, Pakistan', [67.30, 25.85, 67.75, 26.35],    (2.34, 2.25, 2.43)),
]
N_SAMPLE, N_KEEP = 1500, 25
col = ee.ImageCollection('NASA/EMIT/L2A/RFL')

def wavelengths(img, nb):
    info = img.toDictionary().getInfo()
    for k in ('reflectance_wavelengths', 'wavelengths', 'wavelength'):
        if k in info:
            v = info[k]
            if isinstance(v, str):
                v = [float(x) for x in v.replace('[', '').replace(']', '').split(',')]
            return [float(x) for x in v], k
    props = col.first().propertyNames().getInfo()
    raise RuntimeError('No wavelength property found. Image properties: %s' % props)

out = {'source': 'NASA EMIT L2A Estimated Surface Reflectance 60 m V001, via Google Earth Engine (NASA/EMIT/L2A/RFL)',
       'method': 'Scene with the most valid pixels over the site box; %d random 60 m pixels; mean of the %d with the deepest band depth BD = 1 - R(center) / interpolated continuum(left, right).' % (N_SAMPLE, N_KEEP),
       'sites': []}
cache = {}
for mid, site, box, (c, l, r) in SITES:
    region = ee.Geometry.Rectangle(box)
    key = tuple(box)
    if key not in cache:
        imgs = col.filterBounds(region).limit(12)
        n = imgs.size().getInfo()
        print(site, ':', n, 'EMIT scenes found')
        best = None
        for i in range(n):
            img = ee.Image(imgs.toList(n).get(i))
            bands = [b for b in img.bandNames().getInfo() if b.startswith('reflectance_') and 'uncert' not in b]
            fc = img.select(bands).sample(region=region, scale=60, numPixels=N_SAMPLE, geometries=True, dropNulls=True)
            feats = fc.getInfo()['features']
            print('  scene', i, img.get('system:index').getInfo(), len(feats), 'pixels')
            if best is None or len(feats) > len(best[1]):
                best = (img, feats, bands)
            if len(feats) >= 0.8 * N_SAMPLE:
                break
        cache[key] = best
    img, feats, bands = cache[key]
    if not feats:
        print('  no valid pixels, skipped'); continue
    idx = sorted(range(len(bands)), key=lambda b: int(bands[b].split('_')[1]))
    bands = [bands[i] for i in idx]
    wl, wkey = wavelengths(img, len(bands))
    wl = np.array(wl[:len(bands)]) / (1000.0 if max(wl) > 100 else 1.0)
    X = np.array([[f['properties'].get(b, np.nan) for b in bands] for f in feats], float)
    X[(X <= 0) | (X > 1.5)] = np.nan
    ll = np.array([f['geometry']['coordinates'] for f in feats])
    def R(w):
        j = np.argmin(np.abs(wl - w)); return np.nanmean(X[:, max(0, j - 1): j + 2], axis=1)
    Rc, Rl, Rr = R(c), R(l), R(r)
    cont = Rl + (Rr - Rl) * (c - l) / (r - l)
    bd = 1 - Rc / cont
    ok = np.isfinite(bd)
    top = np.argsort(-np.where(ok, bd, -9))[:N_KEEP]
    spec = np.nanmean(X[top], axis=0)
    out['sites'].append({
        'id': mid, 'site': site, 'box': box, 'scene': img.get('system:index').getInfo(),
        'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd').getInfo(),
        'band_depth': {'center_um': c, 'left_um': l, 'right_um': r, 'top_mean': float(np.nanmean(bd[top])), 'median_all': float(np.nanmedian(bd[ok]))},
        'pixels_sampled': int(len(feats)), 'pixels_kept': int(len(top)),
        'lat': float(ll[top, 1].mean()), 'lon': float(ll[top, 0].mean()),
        'wavelength_um': [round(float(x), 5) for x in wl], 'wavelength_key': wkey,
        'reflectance': [None if not np.isfinite(v) else round(float(v), 5) for v in spec],
    })
    print('  kept', len(top), 'pixels; band depth', round(float(np.nanmean(bd[top])), 3), 'vs median', round(float(np.nanmedian(bd[ok])), 3))

json.dump(out, open('emit_spectra.json', 'w'))
print('wrote emit_spectra.json; sites:', [s['id'] for s in out['sites']])
try:
    from google.colab import files; files.download('emit_spectra.json')
except Exception:
    pass
