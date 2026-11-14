// AI-assisted (Claude): Vite config for the TwinWorlds frontend.
// - Serves Cesium's static assets (workers, widgets, textures) at /cesiumStatic in dev
//   and copies them to dist/cesiumStatic on build. Done by hand, not with a copy
//   plugin, because the plugin stopped serving after Vite's auto-restart.
// - Serves ../data/processed at /data in dev and copies it to dist/data on build,
//   so the app always reads Ibrahim's files directly (never a frontend copy).
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

const cesiumSource = path.resolve(import.meta.dirname, 'node_modules/cesium/Build/Cesium');
const cesiumDirs = ['Workers', 'ThirdParty', 'Assets', 'Widgets'];
const cesiumBaseUrl = 'cesiumStatic';
// TWINWORLDS_DATA_DIR lets a test run point at a fixtures folder instead.
const dataDir = process.env.TWINWORLDS_DATA_DIR
  ? path.resolve(process.env.TWINWORLDS_DATA_DIR)
  : path.resolve(import.meta.dirname, '../data/processed');

const TYPES = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Static file middleware for one folder. Unknown paths 404 (never fall through to index.html). */
function serveDir(root, { noStore = false } = {}) {
  return (req, res) => {
    const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
    const file = path.resolve(root, name);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
    if (noStore) res.setHeader('Cache-Control', 'no-store');
    fs.createReadStream(file).pipe(res);
  };
}

function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(path.join(dir, d.name), `${base}${d.name}/`) : [`${base}${d.name}`],
  );
}

function twinworldsStatic() {
  return {
    name: 'twinworlds-static',
    configureServer(server) {
      // Index of available data files, so the app knows what exists without 404 probing.
      server.middlewares.use('/data/index.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ files: fs.existsSync(dataDir) ? listFiles(dataDir) : [] }));
      });
      server.middlewares.use('/data', serveDir(dataDir, { noStore: true }));
      server.middlewares.use(`/${cesiumBaseUrl}`, serveDir(cesiumSource));
    },
    closeBundle() {
      const dist = path.resolve(import.meta.dirname, 'dist');
      for (const d of cesiumDirs) {
        fs.cpSync(path.join(cesiumSource, d), path.join(dist, cesiumBaseUrl, d), { recursive: true });
      }
      if (fs.existsSync(dataDir)) {
        const out = path.join(dist, 'data');
        fs.cpSync(dataDir, out, { recursive: true });
        fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ files: listFiles(dataDir) }));
      }
    },
  };
}

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [twinworldsStatic()],
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
