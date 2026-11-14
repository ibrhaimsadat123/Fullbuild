// AI-assisted (Claude): Twin Dive camera sync.
//
// How the two cameras stay in sync: each world has an anchor (the target on Mars
// or the Moon, the matched site on Earth). Every frame, the leading camera's
// position, direction and up vector are expressed in its anchor's local
// East-North-Up frame (metres). The same local pose is applied in the other
// anchor's ENU frame. Result: identical altitude above the site, heading, pitch
// and roll, at true scale on both worlds. Whichever globe you touch leads.
import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  Math as CMath,
  Matrix4,
  Transforms,
} from 'cesium';
import { toCartesian, surfaceHeight } from './globes.js';
import { WORLDS, DIVE_VIEW } from './config.js';

const scratch = {
  inv: new Matrix4(),
  pos: new Cartesian3(),
  dir: new Cartesian3(),
  up: new Cartesian3(),
};

function enu(world, anchor) {
  return Transforms.eastNorthUpToFixedFrame(anchor, WORLDS[world].ellipsoid);
}

function localPose(camera, frame) {
  Matrix4.inverseTransformation(frame, scratch.inv);
  return {
    pos: Matrix4.multiplyByPoint(scratch.inv, camera.positionWC, new Cartesian3()),
    dir: Matrix4.multiplyByPointAsVector(scratch.inv, camera.directionWC, new Cartesian3()),
    up: Matrix4.multiplyByPointAsVector(scratch.inv, camera.upWC, new Cartesian3()),
  };
}

function applyPose(camera, pose, frame) {
  const destination = Matrix4.multiplyByPoint(frame, pose.pos, scratch.pos);
  const direction = Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame, pose.dir, scratch.dir), scratch.dir);
  const up = Cartesian3.normalize(Matrix4.multiplyByPointAsVector(frame, pose.up, scratch.up), scratch.up);
  camera.lookAtTransform(Matrix4.IDENTITY);
  camera.setView({ destination, orientation: { direction, up } });
}

export class TwinDive {
  constructor(planet, earth) {
    this.globes = { planet, earth };
    this.active = false;
    this.leader = 'planet';
    this.frames = null;
    this._remove = [];
  }

  /** Fly both cameras to their sites and lock them together. */
  async start(planetSite, earthSite, view = DIVE_VIEW) {
    this.stop();
    const { planet, earth } = this.globes;
    const [hp, he] = await Promise.all([
      surfaceHeight(planet, planetSite.lon, planetSite.lat),
      surfaceHeight(earth, earthSite.lon, earthSite.lat),
    ]);
    const anchors = {
      planet: toCartesian(planet.world, planetSite.lon, planetSite.lat, hp),
      earth: toCartesian('earth', earthSite.lon, earthSite.lat, he),
    };
    this.frames = { planet: enu(planet.world, anchors.planet), earth: enu('earth', anchors.earth) };
    this.anchors = anchors;
    this.sites = { planet: planetSite, earth: earthSite };
    this.active = true;
    this.leader = 'planet';

    // Whichever canvas gets the pointer leads; the other follows.
    for (const key of ['planet', 'earth']) {
      const canvas = this.globes[key].viewer.scene.canvas;
      const lead = () => { this.leader = key; };
      canvas.addEventListener('pointerdown', lead);
      canvas.addEventListener('wheel', lead, { passive: true });
      this._remove.push(() => {
        canvas.removeEventListener('pointerdown', lead);
        canvas.removeEventListener('wheel', lead);
      });
      const off = this.globes[key].viewer.scene.preRender.addEventListener(() => this._sync(key));
      this._remove.push(off);
    }

    // Only the planet camera flies; Earth mirrors it frame by frame, so the two
    // descents are identical rather than two similar animations.
    const v = view;
    planet.viewer.camera.flyToBoundingSphere(new BoundingSphere(anchors.planet, 0), {
      offset: new HeadingPitchRange(CMath.toRadians(v.headingDeg), CMath.toRadians(v.pitchDeg), v.range),
      duration: v.durationS,
    });
  }

  _sync(key) {
    if (!this.active || key !== this.leader) return;
    const other = key === 'planet' ? 'earth' : 'planet';
    const pose = localPose(this.globes[key].viewer.camera, this.frames[key]);
    applyPose(this.globes[other].viewer.camera, pose, this.frames[other]);
  }

  /** Current shared view, for the HUD. */
  readout() {
    if (!this.active) return null;
    const cam = this.globes.planet.viewer.camera;
    const pose = localPose(cam, this.frames.planet);
    return {
      altitudeM: pose.pos.z,
      rangeM: Cartesian3.magnitude(pose.pos),
      headingDeg: (CMath.toDegrees(cam.heading) + 360) % 360,
      pitchDeg: CMath.toDegrees(cam.pitch),
    };
  }

  stop() {
    this._remove.forEach((f) => f());
    this._remove = [];
    this.active = false;
  }
}
