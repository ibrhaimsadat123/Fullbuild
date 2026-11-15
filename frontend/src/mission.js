// AI-assisted (Claude): Mission Twin playback.
// Draws the real rover route on Mars/Moon and its matched Earth path, then drives a
// marker along each in lockstep: segment i on the planet plays at the same time as
// its matched segment i on Earth (the pipeline's DTW pairing), so both rovers
// always sit on matching ground even when segment lengths differ.
import { CallbackProperty, Color, ClassificationType, LabelStyle, VerticalOrigin, Cartesian2, HeightReference } from 'cesium';
import { toCartesian } from './globes.js';

const lerp = (a, b, u) => a + (b - a) * u;

/** Point at fractional vertex index `f` along a [[lon, lat], ...] path. */
function along(path, f) {
  const i = Math.max(0, Math.min(path.length - 1, Math.floor(f)));
  const j = Math.min(path.length - 1, i + 1);
  const u = f - i;
  return [lerp(path[i][0], path[j][0], u), lerp(path[i][1], path[j][1], u)];
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

  draw() {
    this.clear();
    const add = (side, color, label) => {
      const g = this.globes[side];
      const world = side === 'earth' ? 'earth' : this.world;
      const path = this.data[side].path;
      const positions = path.map(([lon, lat]) => toCartesian(world, lon, lat, 0));
      this.entities.push([g, g.viewer.entities.add({
        polyline: { positions, width: 4, material: Color.fromCssColorString(color).withAlpha(0.9), clampToGround: true, classificationType: ClassificationType.BOTH },
      })]);
      this.entities.push([g, g.viewer.entities.add({
        position: new CallbackProperty(() => {
          const [lon, lat] = this.positionAt(side);
          return toCartesian(world, lon, lat, 0);
        }, false),
        // Pinned to the real ground (terrain on Earth, 3D tiles on Mars/Moon). At height 0 the
        // marker floated km above/below the surface and slid off its path when the camera turned.
        point: { pixelSize: 13, color: Color.WHITE, outlineColor: Color.fromCssColorString(color), outlineWidth: 4, heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: {
          text: label,
          font: '600 12px Inter, system-ui, sans-serif',
          style: LabelStyle.FILL_AND_OUTLINE,
          outlineWidth: 3,
          outlineColor: Color.BLACK,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -12),
          heightReference: HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })]);
      // Start / end markers so each route reads as a journey, not a line.
      const ends = this.data[side].ends || ['Start', 'End'];
      [[path[0], ends[0]], [path[path.length - 1], ends[1]]].forEach(([[lon, lat], text]) => {
        this.entities.push([g, g.viewer.entities.add({
          position: toCartesian(world, lon, lat, 0),
          point: { pixelSize: 7, color: Color.fromCssColorString(color), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY },
          label: {
            text, font: '500 11px Inter, system-ui, sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3,
            outlineColor: Color.BLACK, fillColor: Color.fromCssColorString('#dfe6f2'), verticalOrigin: VerticalOrigin.TOP,
            pixelOffset: new Cartesian2(0, 8), heightReference: HeightReference.CLAMP_TO_GROUND, disableDepthTestDistance: Number.POSITIVE_INFINITY,
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
    if (!n) return this.data[side].path[0];
    const s = this.segmentIndexAt();
    const u = this.t * n - s;
    const seg = this.segments[s];
    const range = side === 'earth' ? seg.earth_range : seg.planet_range;
    return along(this.data[side].path, lerp(range[0], range[1], Math.min(1, u)));
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
