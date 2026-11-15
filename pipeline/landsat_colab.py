# TwinWorlds: Landsat "then and now" for hero sites. Paste into your Earth Engine Colab and run.
# It downloads landsat.zip. Unzip it into  Fullbuild\frontend\public\landsat\  (so you get ...\public\landsat\index.json).
#
# Then: Landsat 5 TM Collection 2 Level-2 surface reflectance, median of clear pixels, 1985-1990.
# Now:  Landsat 8 + 9 OLI Collection 2 Level-2 surface reflectance, median of clear pixels, 2023-2024.
# True colour (red, green, blue), same stretch for both, 0.5 x 0.5 degree box around each site.
import ee, json, os, zipfile, urllib.request
PROJECT = 'thermal-list-367916'
try:
    ee.Initialize(project=PROJECT)
except Exception:
    ee.Authenticate(); ee.Initialize(project=PROJECT)

SITES = [
    ('makgadikgadi', 'Makgadikgadi Pan, Botswana', -20.8, 25.333),
    ('hingol', 'Hingol mud volcanoes, Pakistan', 25.445, 65.866),
    ('chagai', 'Chagai Hills, Pakistan', 29.13, 62.82),
    ('kirthar', 'Kirthar Range, Pakistan', 26.1, 67.5),
    ('qaidam', 'Qaidam Basin, China', 37.9, 93.9),
    ('kunlun', 'Kunlun Mountains, China (best match for Jezero)', 36.25, 83.75),
    ('altyn_tagh', 'Altyn-Tagh, China (Perseverance Mission Twin)', 37.73, 88.685),
    ('atacama', 'Atacama Desert (Yungay), Chile', -24.12, -69.91),
    ('lanzarote', 'Lanzarote lava fields, Spain', 29.16, -13.44),
    ('white_sands', 'White Sands, New Mexico, USA', 32.85, -106.3),
]
HALF = 0.25

def mask_c2(img):
    qa = img.select('QA_PIXEL')
    clear = qa.bitwiseAnd(1 << 3).eq(0).And(qa.bitwiseAnd(1 << 4).eq(0))   # no cloud, no cloud shadow
    return img.updateMask(clear)

def sr(img, bands):
    return img.select(bands).multiply(0.0000275).add(-0.2).rename(['r', 'g', 'b'])

def then(region):
    c = (ee.ImageCollection('LANDSAT/LT05/C02/T1_L2').filterBounds(region).filterDate('1985-01-01', '1991-01-01')
         .map(mask_c2).map(lambda i: sr(i, ['SR_B3', 'SR_B2', 'SR_B1'])))
    return c.median(), c.size()

def now(region):
    c = (ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
         .filterBounds(region).filterDate('2023-01-01', '2025-01-01')
         .map(mask_c2).map(lambda i: sr(i, ['SR_B4', 'SR_B3', 'SR_B2'])))
    return c.median(), c.size()

os.makedirs('landsat', exist_ok=True)
index = {'source': 'USGS/NASA Landsat Collection 2 Level-2 surface reflectance via Google Earth Engine. Then: Landsat 5 TM 1985-1990 median of clear pixels. Now: Landsat 8 and 9 OLI 2023-2024 median of clear pixels. True colour, same stretch (0 to 0.35 reflectance).',
         'sites': []}
for sid, name, lat, lon in SITES:
    region = ee.Geometry.Rectangle([lon - HALF, lat - HALF, lon + HALF, lat + HALF])
    entry = {'id': sid, 'name': name, 'lat': lat, 'lon': lon, 'box': [lon - HALF, lat - HALF, lon + HALF, lat + HALF]}
    for label, fn in (('then', then), ('now', now)):
        img, n = fn(region)
        n = n.getInfo()
        entry[label + '_scenes'] = n
        if n == 0:
            print(name, label, 'no scenes'); continue
        url = img.visualize(min=0, max=0.35, gamma=1.2).getThumbURL({'region': region, 'dimensions': 768, 'format': 'jpg'})
        fn_ = f'{sid}_{label}.jpg'
        urllib.request.urlretrieve(url, os.path.join('landsat', fn_))
        entry[label] = fn_
        print(name, label, n, 'scenes')
    index['sites'].append(entry)
json.dump(index, open('landsat/index.json', 'w'), indent=1)
with zipfile.ZipFile('landsat.zip', 'w') as z:
    for f in os.listdir('landsat'): z.write(os.path.join('landsat', f), f)
try:
    from google.colab import files; files.download('landsat.zip')
except Exception:
    print('landsat.zip written')
