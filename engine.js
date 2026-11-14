'use strict';

/* ═══════════════════════════════════════════
   COMPRESSION ENGINE
   Everything runs locally: decode → resize → encode.
   (Canvas re-encoding also removes EXIF/GPS metadata.)
   Shared by the page (fallback) and compress.worker.js (normal path).
   ═══════════════════════════════════════════ */
const EXT = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png', 'image/gif': 'gif', 'image/bmp': 'bmp' };
const QUALITY_FLOOR = 0.5;   // below this, shrink dimensions instead of wrecking quality
const IN_WORKER = typeof document === 'undefined';
const tick = () => new Promise(r => setTimeout(r, 0));   // let the UI breathe between heavy steps

async function decodeImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { src: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
  } catch (err) {
    if (IN_WORKER) throw err;                 // no <img> inside a worker – the page retries on the main thread
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { src: img, w: img.naturalWidth, h: img.naturalHeight, close() {} };
    } finally { URL.revokeObjectURL(url); }
  }
}

// Width only → fit width. Height only → fit height. Both + lock → fit inside box.
// Both + unlocked → exact size. Never upscales (except exact size).
function targetSize(w, h, maxW, maxH, lock) {
  if (!maxW && !maxH) return { w, h };
  if (maxW && maxH && !lock) return { w: maxW, h: maxH };
  const scale = Math.min(1, maxW ? maxW / w : Infinity, maxH ? maxH / h : Infinity);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

// Step-down halving gives noticeably sharper results than one big drawImage shrink.
function makeCanvas(w, h) {
  if (IN_WORKER) return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function drawToCanvas(src, sw, sh, w, h, opaque) {
  let cur = src, cw = sw, ch = sh;
  while (cw / 2 >= w && ch / 2 >= h) {
    const nw = Math.round(cw / 2), nh = Math.round(ch / 2);
    const t = makeCanvas(nw, nh);
    const tc = t.getContext('2d');
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(cur, 0, 0, nw, nh);
    cur = t; cw = nw; ch = nh;
  }
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  if (opaque) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }   // transparent PNG → JPEG: white, not black
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return c;
}

function canvasToBlob(canvas, type, q) {
  const check = b => {
    if (!b) throw new Error('Encoding failed');
    if (b.type !== type) throw new Error(`This browser can't export ${type.split('/')[1].toUpperCase()}`);
    return b;
  };
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality: q }).then(check);   // OffscreenCanvas
  return new Promise((res, rej) => canvas.toBlob(b => { try { res(check(b)); } catch (e) { rej(e); } }, type, q));
}

// PNG: quality 100% = lossless, lower = fewer colours (real PNG size reduction via UPNG.js)
async function encodePNG(canvas, q) {
  if (typeof UPNG === 'undefined') return canvasToBlob(canvas, 'image/png');
  await tick();
  const { width: w, height: h } = canvas;
  const rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const colors = q >= 0.99 ? 0 : Math.max(16, Math.round(q * 256));
  return new Blob([UPNG.encode([rgba.buffer], w, h, colors)], { type: 'image/png' });
}

function encode(canvas, format, q) {
  return format === 'image/png' ? encodePNG(canvas, q) : canvasToBlob(canvas, format, q);
}

// Highest quality (between lo and hi) that still fits targetBytes — binary search.
async function fitToTarget(canvas, format, hi, lo, targetBytes) {
  let blob = await encode(canvas, format, hi);
  if (!targetBytes || blob.size <= targetBytes) return blob;

  const floor = await encode(canvas, format, lo);
  if (floor.size > targetBytes) return floor;           // can't fit at this size

  let best = floor, a = lo, b = hi;
  const steps = format === 'image/png' ? 3 : 6;
  for (let i = 0; i < steps; i++) {
    const m = (a + b) / 2;
    const t = await encode(canvas, format, m);
    if (t.size <= targetBytes) { best = t; a = m; } else { b = m; }
  }
  return best;
}

async function compressFile(file, format, quality, targetKB, rw, rh, lock) {
  const img = await decodeImage(file);
  try {
    const targetBytes = targetKB ? targetKB * 1024 : null;
    const base = targetSize(img.w, img.h, rw, rh, lock);
    const lo = Math.min(QUALITY_FLOOR, quality);

    let scale = 1, w = base.w, h = base.h, blob;
    for (let attempt = 0; attempt < 7; attempt++) {
      w = Math.max(1, Math.round(base.w * scale));
      h = Math.max(1, Math.round(base.h * scale));
      const canvas = drawToCanvas(img.src, img.w, img.h, w, h, format === 'image/jpeg');
      blob = await fitToTarget(canvas, format, quality, lo, targetBytes);
      if (!targetBytes || blob.size <= targetBytes) break;
      // Still too big at minimum quality → shrink dimensions proportionally to the overshoot
      scale *= Math.max(0.4, Math.min(0.95, Math.sqrt(targetBytes / blob.size) * 0.97));
      await tick();
    }

    const resized = w !== img.w || h !== img.h;

    // Already-optimized file (same format, same size, result not smaller) → keep the original
    if (file.type === format && !resized && blob.size >= file.size) {
      return { file, format: EXT[file.type] || file.type.split('/')[1], w: img.w, h: img.h, baseW: base.w, baseH: base.h, resized: false, shrunk: false, kept: true, targetKB };
    }

    return {
      file: blob, format: EXT[format], w, h, baseW: base.w, baseH: base.h, resized,
      shrunk: w < base.w,            // had to go smaller than the requested size to fit the KB limit
      kept: false, targetKB,
      missedTarget: !!targetBytes && blob.size > targetBytes,
    };
  } finally {
    img.close();
  }
}
