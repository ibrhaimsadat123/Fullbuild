// AI-assisted (Claude): Vite config for the TwinWorlds frontend.
// - Copies Cesium's static assets (workers, widgets, textures) next to the app.
// - Serves ../data/processed at /data in dev and copies it to dist/data on build,
//   so the app always reads Ibrahim's files directly (never a frontend copy).
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import fs from 'node:fs';
import path from 'node:path';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesiumStatic';
// TWINWORLDS_DATA_DIR lets a test run point at a fixtures folder instead.
const dataDir = process.env.TWINWORLDS_DATA_DIR
  ? path.resolve(process.env.TWINWORLDS_DATA_DIR)
  : path.resolve(import.meta.dirname, '../data/processed');

function processedData() {
  return {
    name: 'twinworlds-processed-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(dataDir, name);
        if (!file.startsWith(dataDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!fs.existsSync(dataDir)) return;
      const out = path.resolve(import.meta.dirname, 'dist/data');
      fs.cpSync(dataDir, out, { recursive: true });
      // Index of available files, so the app knows what exists without 404 probing.
      fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ files: listFiles(dataDir) }));
    },
  };
}

function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? listFiles(path.join(dir, d.name), `${base}${d.name}/`) : [`${base}${d.name}`],
  );
}

function dataIndexDev() {
  return {
    name: 'twinworlds-data-index',
    configureServer(server) {
      server.middlewares.use('/data/index.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ files: fs.existsSync(dataDir) ? listFiles(dataDir) : [] }));
      });
    },
  };
}

export default defineConfig({
  define: {
    CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
  },
  plugins: [
    dataIndexDev(),
    processedData(),
    viteStaticCopy({
      targets: [
        // stripBase 4 drops "node_modules/cesium/Build/Cesium" so files land at /cesiumStatic/Workers/...
        { src: `${cesiumSource}/ThirdParty`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Workers`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Assets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
        { src: `${cesiumSource}/Widgets`, dest: cesiumBaseUrl, rename: { stripBase: 4 } },
      ],
    }),
  ],
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
