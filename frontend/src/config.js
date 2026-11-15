// AI-assisted (Claude): world and layer settings. Every layer carries the credit
// shown in the globe's source tag, so the screen always says where pixels come from.
import { Ellipsoid } from 'cesium';

export const ION_TOKEN = import.meta.env.VITE_CESIUM_ION_TOKEN || '';
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const WORLDS = {
  mars: {
    id: 'mars',
    label: 'Mars',
    ellipsoid: Ellipsoid.MARS,
    imagery: {
      url: 'https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
      maximumLevel: 7, // deeper levels 404 on Trek (checked 2026-11-14)
      credit: 'NASA Mars Trek: Viking MDIM 2.1 colour mosaic, 232 m',
    },
    // Cesium Mars: 3D Tiles built from NASA MGS MOLA + ESA Mars Express HRSC terrain.
    // Needs a Cesium ion token with the asset added from the ion Asset Depot.
    ion3dTiles: { assetId: 3644333, credit: 'Cesium Mars (NASA MGS MOLA + ESA Mars Express HRSC) via Cesium ion' },
    home: { lon: 40, lat: 20, height: 12_000_000 },
  },
  moon: {
    id: 'moon',
    label: 'Moon',
    ellipsoid: Ellipsoid.MOON,
    imagery: {
      url: 'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg',
      maximumLevel: 8, // deeper levels 404 on Trek (checked 2026-11-14)
      credit: 'NASA Moon Trek: LRO WAC global mosaic, 303 ppd',
    },
    // Cesium Moon Terrain: built from NASA LRO LOLA. Published as 3D Tiles (like Cesium Mars),
    // not as a quantized-mesh terrain provider: loading it as terrain gives 404 tiles and a black globe.
    ion3dTiles: { assetId: 2684829, credit: 'Cesium Moon Terrain (NASA LRO LOLA) via Cesium ion' },
    home: { lon: 30, lat: -10, height: 7_000_000 },
  },
  earth: {
    id: 'earth',
    label: 'Earth',
    ellipsoid: Ellipsoid.WGS84,
    credit: 'Cesium World Terrain + Bing imagery via Cesium ion',
    fallbackCredit: 'Natural Earth II (bundled with CesiumJS); no ion token, so no 3D terrain',
    home: { lon: 40, lat: 20, height: 20_000_000 },
  },
};

// Twin Dive pairs to try before scores exist. Coordinates for Earth sites move to
// sites.json once Ibrahim publishes it; these carry their own source until then.
export const DIVE_PAIRS = {
  acidalia: {
    earth: {
      name: 'Hingol mud volcanoes, Pakistan',
      lat: 25.44528,
      lon: 65.86556,
      source: 'Wikipedia, "Hingol mud volcanoes" (coordinates of the volcano group, not a surveyed vent)',
    },
  },
};

// Hero pairs: hand-picked process analogs (PROJECT.md 8.2), offered next to the best score match.
// They are chosen for a shared process, not for the score, and the app says so.
export const HERO_PAIRS = {
  acidalia: [{ name: 'Hingol mud volcanoes, Pakistan', lat: 25.44528, lon: 65.86556, why: 'mud volcanoes, a live process analog for the Acidalia mounds',
    source: 'Wikipedia, "Hingol mud volcanoes" (coordinates of the volcano group)' }],
  jezero: [{ name: 'Makgadikgadi Pan, Botswana', lat: -20.8, lon: 25.333, why: 'a dried-up ancient lake, like Jezero\u2019s lake and delta',
    source: 'Wikipedia, "Makgadikgadi Pan" (20\u00b048\u2032S 25\u00b020\u2032E)' }],
  tranquillitatis_pit: [{ name: 'Cueva de los Verdes lava tube, Lanzarote', lat: 29.16111, lon: -13.43889, why: 'a lava tube, like the cave below the Tranquillitatis pit',
    source: 'Wikipedia, "Cueva de los Verdes" (29\u00b009\u203240\u2033N 13\u00b026\u203220\u2033W)' }],
  shackleton: [{ name: 'Haughton crater, Devon Island, Canada', lat: 75.4, lon: -89.7, why: 'a high-Arctic impact crater with a low sun, like the lunar south pole',
    source: 'Earth Impact Database (NASA ARES): Haughton 75.4N 89.7W' }],
};

// Dive end pose, relative to the site on each world.
export const DIVE_VIEW = { range: 30_000, pitchDeg: -32, headingDeg: 20, durationS: 5 };

// Tier colours (match zones). Tier names come from the scores files.
export const TIER_COLORS = {
  exact: '#ff5a36',
  strong: '#ffb000',
  moderate: '#e8e35a',
  variable: '#5ac8c8',
};
