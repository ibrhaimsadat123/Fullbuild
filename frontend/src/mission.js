// AI-assisted (Claude): Mission Twin playback.
// Draws the real rover route on Mars/Moon and its matched Earth path, then drives a
// marker along each in lockstep: segment i on the planet plays at the same time as
// its matched segment i on Earth (the pipeline's DTW pairing), so both rovers
// always sit on matching ground even when segment lengths differ.
import { CallbackProperty, Color, LabelStyle, VerticalOrigin, Cartesian2, Cartographic, sampleTerrainMostDetailed } from 'cesium';
import { toCartesian } from './globes.js';

/**
 * Real ground height (m) under each [lon, lat]: Cesium's 3D tiles on Mars/Moon, terrain on Earth.
 * Drawing at height 0 put routes and rovers km above/below the surface, so they slid apart
 * when the camera tilted. Missing samples fall back to the nearest known height.
 */
async function groundHeights(globe, path) {
  const carts = path.map(([lon, lat]) => Cartographic.fromDegrees(lon, lat));
  try {
    const v = globe.viewer;
    const precise = globe.tileset
      ? v.scene.sampleHeightMostDetailed(carts.map((c) => c.clone()))
      : sampleTerrainMostDetailed(v.terrainProvider, carts.map((c) => c.clone()));
    // Most-detailed sampling waits for tiles to load; never let the app hang on it.
    const out = await Promise.race([precise, new Promise((r) => setTimeout(() => r(null), 12_000))]);
    let h;
    if (out) {
      h = out.map((c) => (Number.isFinite(c?.height) ? c.height : null));
    } else if (globe.tileset) {
      // Fallback: the 3D ground already on screen (fast, slightly coarser).
      h = carts.map((c) => { const x = v.scene.sampleHeight(c); return Number.isFinite(x) ? x : null; });
    } else {
      h = carts.map((c) => { const x = v.scene.globe.getHeight(c); return Number.isFinite(x) ? x : null; });
    }
    let last = h.find((x) => x != null) ?? 0;
    return h.map((x) => (x == null ? last : (last = x)));
  } catch (e) {
    console.warn('[mission] height sampling failed, drawing at 0', e);
    return path.map(() => 0);
  }
}

const lerp = (a, b, u) => a + (b - a) * u;

/** Point at fractional vertex index `f` along a [[lon, lat], ...] path (+ height when given). */
function along(path, f, heights = null) {
  const i = Math.max(0, Math.min(path.length - 1, Math.floor(f)));
  const j = Math.min(path.length - 1, i + 1);
  const u = f - i;
  const h = heights ? lerp(heights[i], heights[j], u) : 0;
  return [lerp(path[i][0], path[j][0], u), lerp(path[i][1], path[j][1], u), h];
}

export class MissionTwin {
  constructor(planet, earth, data, { onSegment } = {}) {
    this.globes = { planet, earth };
    this.data = data;
    this.segments = data.segments || [];
    this.t = 0; // 0..1 across all segments
    this.playing = false;
    this.durationS = data.playback_seconds || 24;
    this.onSegment = onSegment;
    this.current = -1;
    this.entities = [];
    this._last = null;
    this._off = null;
  }

  get world() {
    return this.globes.planet.world;
  }

  /** Centre of each path's bounding box, used as the Twin Dive anchors so both routes sit mid-screen. */
  centers() {
    const c = (path) => {
      const lons = path.map((p) => p[0]);
      const lats = path.map((p) => p[1]);
      return { lon: (Math.min(...lons) + Math.max(...lons)) / 2, lat: (Math.min(...lats) + Math.max(...lats)) / 2 };
    };
    return { planet: c(this.data.planet.path), earth: c(this.data.earth.path) };
  }

  /** Draws both routes on the real ground. Async: ground heights are sampled first. */
  async draw() {
    this.clear();
    const LIFT = 4; // metres above the sampled ground, so the line is never hidden inside it
    this.heights = {
      planet: await groundHeights(this.globes.planet, this.data.planet.path),
      earth: await groundHeights(this.globes.earth, this.data.earth.path),
    };
    const add = (side, color, label) => {
      const g = this.globes[side];
      const world = side === 'earth' ? 'earth' : this.world;
      const path = this.data[side].path;
      const hs = this.heights[side];
      const positions = path.map(([lon, lat], k) => toCartesian(world, lon, lat, hs[k] + LIFT));
      this.entities.push([g, g.viewer.entities.add({
        polyline: { positions, width: 4, material: Color.fromCssColorString(color).withAlpha(0.95) },
      })]);
      this.entities.push([g, g.viewer.entities.add({
        position: new CallbackProperty(() => {
          const [lon, lat, h] = this.positionAt(side);
          return toCartesian(world, lon, lat, h + LIFT);
        }, false),
        point: { pixelSize: 13, color: Color.WHITE, outlineColor: Color.fromCssColorString(color), outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: label,
          font: '600 12px Inter, system-ui, sans-serif',
          style: LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 3,
          outlineColor: Color.BLACK,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -12),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })]);
      // Start / end markers so each route reads as a journey, not a line.
      const ends = this.data[side].ends || ['Start', 'End'];
      [[0, ends[0]], [path.length - 1, ends[1]]].forEach(([k, text]) => {
        const [lon, lat] = path[k];
        this.entities.push([g, g.viewer.entities.add({
          position: toCartesian(world, lon, lat, hs[k] + LIFT),
          point: { pixelSize: 7, color: Color.fromCssColorString(color), disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text, font: '500 11px Inter, system-ui, sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3,
            outlineColor: Color.BLACK, fillColor: Color.fromCssColorString('#dfe6f2'), verticalOrigin: VerticalOrigin.TOP,
            pixelOffset: new Cartesian2(0, 8), disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })]);
      });
    };
    add('planet', '#e0703a', this.data.planet.rover || 'Rover');
    add('earth', '#4aa3ff', this.data.earth.rover || 'Earth twin');

    // Advance playback on the planet's render loop.
    this._off = this.globes.planet.viewer.scene.preRender.addEventListener(() => this._tick());
    this.seek(0);
  }

  segmentIndexAt(t = this.t) {
    const n = this.segments.length;
    return Math.min(n - 1, Math.floor(t * n));
  }

  positionAt(side) {
    const n = this.segments.length;
    if (!n) return [...this.data[side].path[0], this.heights?.[side]?.[0] ?? 0];
    const s = this.segmentIndexAt();
    const u = this.t * n - s;
    const seg = this.segments[s];
    const range = side === 'earth' ? seg.earth_range : seg.planet_range;
    return along(this.data[side].path, lerp(range[0], range[1], Math.min(1, u)), this.heights?.[side]);
  }

  _tick() {
    const now = performance.now();
    if (this.playing && this._last != null) {
      this.t = Math.min(1, this.t + (now - this._last) / 1000 / this.durationS);
      if (this.t >= 1) this.playing = false;
    }
    this._last = now;
    const s = this.segmentIndexAt();
    if (s !== this.current) {
      this.current = s;
      this.onSegment?.(s, this.segments[s]);
    }
  }

  play() {
    if (this.t >= 1) this.t = 0;
    this.playing = true;
  }

  pause() {
    this.playing = false;
  }

  seek(t) {
    this.t = Math.max(0, Math.min(1, t));
    this._tick();
  }

  clear() {
    this._off?.();
    this._off = null;
    for (const [g, e] of this.entities) g.viewer.entities.remove(e);
    this.entities = [];
    this.playing = false;
    this.current = -1;
  }
}
