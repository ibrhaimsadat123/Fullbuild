// AI-assisted (Claude): builds one Cesium viewer per world.
// Mars and the Moon run on their own ellipsoids (Ellipsoid.MARS / MOON). Every
// position on those globes must pass the ellipsoid explicitly, or Cesium falls
// back to WGS84 and markers float thousands of km off the surface.
import {
  Viewer,
  Ion,
  Cartesian3,
  Cartographic,
  Credit,
  GeographicTilingScheme,
  UrlTemplateImageryProvider,
  ImageryLayer,
  TileMapServiceImageryProvider,
  Terrain,
  CesiumTerrainProvider,
  Cesium3DTileset,
  EllipsoidTerrainProvider,
  buildModuleUrl,
  Color,
  sampleTerrainMostDetailed,
  BoundingSphere,
  HeadingPitchRange,
  Math as CesiumMath,
} from 'cesium';
import { WORLDS, ION_TOKEN } from './config.js';

if (ION_TOKEN) Ion.defaultAccessToken = ION_TOKEN;

const BASE_OPTIONS = {
  animation: false,
  timeline: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  baseLayerPicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
};

/**
 * Laptop-friendly settings: two 3D globes render side by side, so cap the frame rate,
 * load fewer tiles and skip anti-aliasing. Smooth on integrated GPUs; looks the same.
 */
function tune(viewer, sse = 2.5) {
  // Sharpness: Cesium's default renders at "browser recommended" resolution, which ignores
  // Windows display scaling (125-150% on most laptops), so globes and labels look blurry.
  // Render at the real screen resolution instead, capped at 2x so it stays smooth.
  viewer.useBrowserRecommendedResolution = false;
  viewer.resolutionScale = Math.min(1, 2 / (window.devicePixelRatio || 1));
  viewer.targetFrameRate = 30;
  viewer.scene.globe.maximumScreenSpaceError = sse;
  viewer.scene.globe.tileCacheSize = 200;
  viewer.scene.postProcessStages.fxaa.enabled = false;
  viewer.scene.fog.enabled = true;
}

/**
 * Fly to look straight down on a point. `height` in metres; pass null for the
 * "twin" overview, which is the same multiple of each planet's radius, so Mars,
 * the Moon and Earth appear the same size side by side.
 */
export function flyToPoint(viewer, worldId, lon, lat, height = null, duration = 1.5) {
  const ell = WORLDS[worldId].ellipsoid;
  const h = height ?? ell.maximumRadius * 1.9;
  const safeLat = Math.max(-89.5, Math.min(89.5, lat)); // straight down exactly over a pole spins the camera
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, safeLat, h, ell),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    duration,
  });
}

export function toCartesian(world, lon, lat, height = 0) {
  return Cartesian3.fromDegrees(lon, lat, height, WORLDS[world].ellipsoid);
}

export function toLonLat(world, cartesian) {
  const c = Cartographic.fromCartesian(cartesian, WORLDS[world].ellipsoid);
  if (!c) return null;
  return { lon: (c.longitude * 180) / Math.PI, lat: (c.latitude * 180) / Math.PI, height: c.height };
}

/** Planet (Mars or Moon) viewer. Returns { viewer, world, sources, tileset }. */
export async function createPlanetViewer(container, worldId) {
  const w = WORLDS[worldId];
  const tilingScheme = new GeographicTilingScheme({ ellipsoid: w.ellipsoid });
  const trek = new UrlTemplateImageryProvider({
    url: w.imagery.url,
    tilingScheme,
    maximumLevel: w.imagery.maximumLevel,
    credit: new Credit(w.imagery.credit),
  });
  const viewer = new Viewer(container, {
    ...BASE_OPTIONS,
    ellipsoid: w.ellipsoid,
    baseLayer: new ImageryLayer(trek),
    terrainProvider: new EllipsoidTerrainProvider({ ellipsoid: w.ellipsoid }),
    skyAtmosphere: false,
  });
  viewer.scene.globe.showGroundAtmosphere = false;
  viewer.scene.globe.enableLighting = false;
  viewer.scene.backgroundColor = Color.BLACK;
  viewer.scene.globe.baseColor = Color.fromCssColorString('#2a1a12');
  tune(viewer, 2.5);

  const sources = [w.imagery.credit];
  let tileset = null;

  // Real relief needs Zohaib's Cesium ion token. Without it the globe is the
  // Trek mosaic on a smooth ellipsoid, and the source tag says so.
  if (ION_TOKEN && w.ion3dTiles) {
    try {
      tileset = await Cesium3DTileset.fromIonAssetId(w.ion3dTiles.assetId, { ellipsoid: w.ellipsoid });
      viewer.scene.primitives.add(tileset);
      viewer.scene.globe.show = false;
      sources.splice(0, 1, w.ion3dTiles.credit);
      // Safety net: if the 3D tiles fail to load, bring the Trek imagery globe back
      // instead of leaving a black screen.
      tileset.tileFailed.addEventListener((e) => {
        console.warn(`[${worldId}] 3D tile failed, showing Trek imagery globe`, e);
        viewer.scene.globe.show = true;
      });
    } catch (e) {
      console.warn(`[${worldId}] Cesium ion 3D tiles unavailable, staying on Trek imagery`, e);
      sources.push('no 3D terrain (ion asset not available)');
    }
  } else if (ION_TOKEN && w.ionTerrain) {
    try {
      viewer.terrainProvider = await CesiumTerrainProvider.fromIonAssetId(w.ionTerrain.assetId, {
        ellipsoid: w.ellipsoid,
        requestVertexNormals: true,
      });
      sources.push(w.ionTerrain.credit);
      // Safety net: tiles that 404 would leave the globe black; drop back to the smooth ellipsoid.
      viewer.terrainProvider.errorEvent.addEventListener(() => {
        if (viewer.terrainProvider instanceof EllipsoidTerrainProvider) return;
        console.warn(`[${worldId}] terrain tiles failing, falling back to the ellipsoid`);
        viewer.terrainProvider = new EllipsoidTerrainProvider({ ellipsoid: w.ellipsoid });
      });
    } catch (e) {
      console.warn(`[${worldId}] Cesium ion terrain unavailable, staying on the ellipsoid`, e);
      sources.push('no 3D terrain (ion asset not available)');
    }
  } else {
    sources.push('no 3D terrain yet (add a Cesium ion token)');
  }

  flyHome(viewer, worldId, 0);
  return { viewer, world: worldId, sources, tileset };
}

/** Earth viewer. Cesium World Terrain when ion answers, bundled Natural Earth II otherwise. */
export async function createEarthViewer(container) {
  const w = WORLDS.earth;
  const terrain = Terrain.fromWorldTerrain({ requestVertexNormals: true });
  const viewer = new Viewer(container, { ...BASE_OPTIONS, terrain });
  viewer.scene.backgroundColor = Color.BLACK;
  tune(viewer, 3);
  const globe = { viewer, world: 'earth', sources: [w.credit], onSourcesChanged: null };
  if (!ION_TOKEN) globe.sources.push('using the CesiumJS demo token');

  // If ion does not answer (no network, bad token), swap to imagery bundled with
  // CesiumJS so the globe never goes blank, and say so in the source tag.
  terrain.errorEvent.addEventListener((e) => {
    console.warn('[earth] Cesium ion unavailable, using bundled imagery', e);
    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.add(
      ImageryLayer.fromProviderAsync(
        TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII')),
      ),
      0,
    );
    globe.sources = [w.fallbackCredit];
    globe.onSourcesChanged?.(globe.sources);
  });
  flyHome(viewer, 'earth', 0);
  return globe;
}

export function flyHome(viewer, worldId, duration = 1.5) {
  const h = WORLDS[worldId].home;
  flyToPoint(viewer, worldId, h.lon, h.lat, null, duration);
}

/** Best-effort surface height at a point (terrain or 3D tiles). Falls back to 0. */
export async function surfaceHeight(globe, lon, lat) {
  const { viewer, world, tileset } = globe;
  const carto = Cartographic.fromDegrees(lon, lat);
  try {
    if (tileset) {
      const [c] = await viewer.scene.sampleHeightMostDetailed([carto]);
      return Number.isFinite(c?.height) ? c.height : 0;
    }
    const tp = viewer.terrainProvider;
    if (!tp || tp instanceof EllipsoidTerrainProvider) return 0;
    const [c] = await sampleTerrainMostDetailed(tp, [carto]);
    return Number.isFinite(c?.height) ? c.height : 0;
  } catch {
    return 0;
  }
}
