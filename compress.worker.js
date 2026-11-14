'use strict';
/* Runs compression off the main thread so the page never freezes. */
let hasUPNG = false;
try {
  importScripts(
    'https://cdn.jsdelivr.net/npm/pako@1.0.11/dist/pako.min.js',
    'https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js'
  );
  hasUPNG = typeof UPNG !== 'undefined';
} catch (_) { /* offline / blocked CDN: the page falls back to the main thread for PNG */ }

importScripts('engine.js');
postMessage({ type: 'ready', upng: hasUPNG });

self.onmessage = async e => {
  const { id, file, s } = e.data;
  try {
    const r = await compressFile(file, s.format, s.quality, s.targetKB, s.rw, s.rh, s.lock);
    postMessage({ id, ok: true, result: r });
  } catch (err) {
    postMessage({ id, ok: false, error: (err && err.message) || 'Failed' });
  }
};
