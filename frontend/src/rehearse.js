// AI-assisted (Claude): Rehearsability Map. Colours Mars or the Moon by how well ANY place on Earth can
// rehearse each 2-degree cell (data/processed/rehearsability.json, from pipeline/rehearsability.py).
// Colours are by rank within that world: red = analog desert (bottom 10%), green = easy to rehearse.
import { SingleTileImageryProvider, ImageryLayer, Rectangle, Credit } from 'cesium';
import { WORLDS } from './config.js';

const RAMP = [[0, [200, 40, 40]], [0.1, [235, 110, 50]], [0.4, [240, 200, 70]], [0.75, [120, 200, 110]], [1, [40, 170, 120]]];
const col = (p) => {
  for (let i = 1; i < RAMP.length; i++) if (p <= RAMP[i][0]) {
    const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], t = (p - a) / (b - a);
    return ca.map((v, k) => Math.round(v + t * (cb[k] - v)));
  }
  return RAMP[RAMP.length - 1][1];
};

export function rehearseIndex(W) {
  const f = W.fields, ia = f.indexOf('lat'), io = f.indexOf('lon'), ir = f.indexOf('rehearsability');
  const vals = W.cells.map((c) => c[ir]).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const rank = (v) => { let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; } return lo / (vals.length - 1); };
  const m = new Map();
  for (const c of W.cells) m.set(`${c[ia]},${c[io]}`, c);
  const step = W.step_deg;
  return {
    rank,
    get(lat, lon) {
      const la = Math.floor((lat + 90) / step) * step - 90 + step / 4, lo = Math.floor((lon + 180) / step) * step - 180 + step / 4;
      return m.get(`${la},${lo}`) || null;
    },
  };
}

export async function addRehearseLayer(viewer, world, W) {
  const step = W.step_deg, w = 360 / step, h = 180 / step;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h);
  const f = W.fields, ia = f.indexOf('lat'), io = f.indexOf('lon'), ir = f.indexOf('rehearsability');
  const idx = rehearseIndex(W);
  for (const c of W.cells) {
    const v = c[ir]; if (typeof v !== 'number') continue;
    const x = Math.floor((c[io] + 180) / step), y = h - 1 - Math.floor((c[ia] + 90) / step);
    const [r, g, b] = col(idx.rank(v)); const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 170;
  }
  ctx.putImageData(img, 0, 0);
  const provider = await SingleTileImageryProvider.fromUrl(cv.toDataURL('image/png'), {
    rectangle: Rectangle.fromDegrees(-180, -90, 180, 90), ellipsoid: WORLDS[world].ellipsoid,
    credit: new Credit('TwinWorlds Rehearsability Map'),
  });
  const layer = new ImageryLayer(provider, { alpha: 0.75 });
  viewer.imageryLayers.add(layer);
  return layer;
}
