// AI-assisted (Claude): sun and shadow slider. Puts the Sun where it really is at a chosen LOCAL SOLAR TIME
// over the Mars/Moon site and over the Earth place, so terrain shadows can be compared hour by hour.
// Mars: declination from today's season (Ls, obliquity 25.19 deg). Moon: declination ~0 (1.5 deg tilt).
// Earth: today's solar declination, Sun over the subsolar point for that local solar time at the place.
import { DirectionalLight, SunLight, Cartesian3, ShadowMode } from 'cesium';
import { WORLDS } from './config.js';
import { marsLs } from './timesim.js';

const rad = Math.PI / 180;

function planetSunDir(world, lat, lon, hour) {
  const now = new Date();
  const doy = Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 0)) / 86400000);
  const decl = world === 'mars' ? Math.asin(Math.sin(25.19 * rad) * Math.sin(marsLs() * rad)) / rad
    : world === 'earth' ? 23.44 * Math.sin(2 * Math.PI * (284 + doy) / 365) : 0;
  const subLon = lon - 15 * (hour - 12);                 // the Sun is overhead here
  const p = Cartesian3.fromDegrees(subLon, decl, 0, WORLDS[world].ellipsoid);
  return Cartesian3.negate(Cartesian3.normalize(p, new Cartesian3()), new Cartesian3());
}

// Cast shadows only close to the ground (Twin Dive): at whole-globe distance Cesium's shadow map blacks the globe out.
const near = (viewer, ell) => Cartesian3.magnitude(viewer.camera.positionWC) - ell.maximumRadius < 300_000;

export function setSun({ planet, earth, world, target, earthSpot, hour }) {
  // Mars / Moon: a directional light from the right direction in the planet's frame
  const pv = planet.viewer;
  pv.scene.light = new DirectionalLight({ direction: planetSunDir(world, target.lat, target.lon, hour), intensity: 2.2 });
  pv.scene.globe.enableLighting = true;
  pv.shadows = near(pv, WORLDS[world].ellipsoid);
  if (planet.tileset) planet.tileset.shadows = ShadowMode.ENABLED;
  // Earth: same idea, the Sun over today's subsolar point for this local solar time at the place
  const ev = earth.viewer;
  ev.scene.light = new DirectionalLight({ direction: planetSunDir('earth', earthSpot.lat, earthSpot.lon, hour), intensity: 2.2 });
  ev.scene.globe.enableLighting = true;
  const close = near(ev, WORLDS.earth.ellipsoid);
  ev.shadows = close;
  ev.terrainShadows = close ? ShadowMode.ENABLED : ShadowMode.RECEIVE_ONLY;
}

export function clearSun({ planet, earth }) {
  const pv = planet.viewer;
  pv.scene.light = new SunLight();
  pv.scene.globe.enableLighting = false;
  pv.shadows = false;
  const ev = earth.viewer;
  ev.scene.light = new SunLight();
  ev.scene.globe.enableLighting = false;
  ev.shadows = false;
  ev.terrainShadows = ShadowMode.RECEIVE_ONLY;
}
