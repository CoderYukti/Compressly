'use strict';

/* ═══════════════════════════════════════════
   PRESETS — web/WordPress focused
   ═══════════════════════════════════════════ */
const PRESETS = {
  hero:    { label: 'Hero Image',          maxKB: 200, maxPx: 1920, quality: 0.82, format: 'image/webp' },
  blog:    { label: 'Blog Thumbnail',      maxKB: 80,  maxPx: 800,  quality: 0.80, format: 'image/webp' },
  product: { label: 'WooCommerce Product', maxKB: 120, maxPx: 1200, quality: 0.85, format: 'image/webp' },
  social:  { label: 'Social / OG Image',  maxKB: 100, maxPx: 1200, quality: 0.85, format: 'image/jpeg' },
  avatar:  { label: 'Avatar / Logo',      maxKB: 30,  maxPx: 400,  quality: 0.80, format: 'image/webp' },
  retina:  { label: 'Retina / HiDPI',     maxKB: 300, maxPx: 2560, quality: 0.88, format: 'image/webp' },
};

/* ═══════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════ */
let images        = [];
let compressedFiles = []; // { original, file, format, origDataURL }
const previewMap  = new Map();
let activePreset  = null;
let isCompressing = false;
let lastSig       = null;

/* ═══════════════════════════════════════════
   DOM REFS
   ═══════════════════════════════════════════ */
const $  = id => document.getElementById(id);
const uploadInput    = $('upload');
const dropArea       = $('drop-area');
const browseBtn      = $('browseBtn');
const preview        = $('preview');
const compressBtn    = $('compressBtn');
const downloadAllBtn = $('downloadAllBtn');
const clearAllBtn    = $('clearAllBtn');
const progressBar    = $('progressBar');
const progressText   = $('progressText');
const progressLabel  = $('progressLabel');
const globalProgress = $('globalProgress');
const summaryCard    = $('summaryCard');
const previewSection = $('previewSection');
const imageCount     = $('imageCount');
const qualitySlider  = $('quality');
const qualityDisplay = $('qualityDisplay');
const maxSizeInput   = $('maxSize');
const maxSizeDisplay = $('maxSizeDisplay');
const formatHidden   = $('format');
const resizeToggle   = $('resizeToggle');
const resizeFields   = $('resizeFields');
const resizeWidth    = $('resizeWidth');
const resizeHeight   = $('resizeHeight');
const aspectLock     = $('aspectLock');
const exifToggle     = $('exifToggle');
const filenameSuffix = $('filenameSuffix');
const presetInfoBar  = $('presetInfoBar');
const presetInfoText = $('presetInfoText');
const presetClearBtn = $('presetClearBtn');
const presetsGrid    = $('presetsGrid');
const toastEl        = $('toast');
const modalOverlay   = $('modalOverlay');
const modalClose     = $('modalClose');
const compareBefore  = $('compareBefore');
const compareAfter   = $('compareAfter');
const compareWrap    = $('compareWrap');
const compareSlider  = $('compareSliderLine');
const modalMeta      = $('modalMeta');
const modalTitle     = $('modalTitle');

/* ═══════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════ */
function dataURLtoBlob(dataurl) {
  const [hdr, b64] = dataurl.split(',');
  const mime = hdr.match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(b64);
  const u8 = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
  return new Blob([u8], { type: mime });
}

function blobToDataURL(blob) {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = e => res(e.target.result);
    r.readAsDataURL(blob);
  });
}

function formatSize(bytes) {
  const kb = bytes / 1024;
  return kb >= 1000 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

function cleanName(name) {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-.]/g, '').toLowerCase();
}

function getSig(format, quality, targetKB, w, h, stripExif) {
  return JSON.stringify({ format, quality: quality?.toFixed(2), targetKB, w, h, stripExif });
}

let toastTimer;
function showToast(msg, ms = 3200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

// Estimate page load time delta in ms @ 5 Mbps
function loadDelta(savedBytes) {
  const ms = (savedBytes / (5 * 1024 * 1024 / 8)) * 1000;
  if (ms < 100) return `< 100 ms`;
  if (ms < 1000) return `~${Math.round(ms / 100) * 100} ms`;
  return `~${(ms / 1000).toFixed(1)} s`;
}

/* ═══════════════════════════════════════════
   SLIDER FILL
   ═══════════════════════════════════════════ */
function updateSliderFill() {
  const pct = ((qualitySlider.value - 10) / 90) * 100;
  qualitySlider.style.setProperty('--pct', `${pct}%`);
  qualityDisplay.textContent = `${qualitySlider.value}%`;
}
qualitySlider.addEventListener('input', () => {
  updateSliderFill();
  maxSizeInput.value = '';
  maxSizeDisplay.textContent = '–';
  maxSizeDisplay.classList.add('muted');
  clearActivePreset();
});
updateSliderFill();

maxSizeInput.addEventListener('input', () => {
  const v = parseFloat(maxSizeInput.value);
  if (!isNaN(v) && v > 0) {
    maxSizeDisplay.textContent = `${v} KB`;
    maxSizeDisplay.classList.remove('muted');
  } else {
    maxSizeDisplay.textContent = '–';
    maxSizeDisplay.classList.add('muted');
  }
  clearActivePreset();
});

/* ═══════════════════════════════════════════
   FORMAT TABS
   ═══════════════════════════════════════════ */
document.querySelectorAll('.fmt-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.fmt-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    formatHidden.value = btn.dataset.value;
    clearActivePreset();
  });
});

function setFormat(mime) {
  formatHidden.value = mime;
  document.querySelectorAll('.fmt-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.value === mime);
  });
}

/* ═══════════════════════════════════════════
   RESIZE TOGGLE
   ═══════════════════════════════════════════ */
resizeToggle.addEventListener('change', () => {
  resizeFields.style.display = resizeToggle.checked ? 'flex' : 'none';
  clearActivePreset();
});

/* ═══════════════════════════════════════════
   PRESETS
   ═══════════════════════════════════════════ */
presetsGrid.querySelectorAll('.preset-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.preset;
    if (key === 'custom') { clearActivePreset(); return; }
    applyPreset(key, btn);
  });
});

function applyPreset(key, btn) {
  const p = PRESETS[key];
  activePreset = key;

  // Update controls
  qualitySlider.value = Math.round(p.quality * 100);
  updateSliderFill();
  maxSizeInput.value = p.maxKB;
  maxSizeDisplay.textContent = `${p.maxKB} KB`;
  maxSizeDisplay.classList.remove('muted');
  setFormat(p.format);

  // Resize
  resizeToggle.checked = true;
  resizeFields.style.display = 'flex';
  resizeWidth.value = p.maxPx;
  resizeHeight.value = '';

  // Highlight card
  presetsGrid.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');

  // Info bar
  presetInfoBar.style.display = 'flex';
  presetInfoText.textContent = `${p.label}: max ${p.maxPx}px wide · max ${p.maxKB} KB · ${p.format.split('/')[1].toUpperCase()}`;

  showToast(`Preset applied: ${p.label}`);
}

function clearActivePreset() {
  activePreset = null;
  presetsGrid.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  presetInfoBar.style.display = 'none';
}

presetClearBtn.addEventListener('click', () => {
  clearActivePreset();
  maxSizeInput.value = '';
  maxSizeDisplay.textContent = '–';
  maxSizeDisplay.classList.add('muted');
  resizeToggle.checked = false;
  resizeFields.style.display = 'none';
  resizeWidth.value = '';
  resizeHeight.value = '';
});

/* ═══════════════════════════════════════════
   UPLOAD / DRAG-DROP
   ═══════════════════════════════════════════ */
browseBtn.addEventListener('click', e => { e.stopPropagation(); uploadInput.click(); });
dropArea.addEventListener('click', () => uploadInput.click());

dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', e => { if (!dropArea.contains(e.relatedTarget)) dropArea.classList.remove('drag-over'); });
dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
uploadInput.addEventListener('change', e => { handleFiles(e.target.files); uploadInput.value = ''; });

function handleFiles(files) {
  const valid = [...files].filter(f => f.type.startsWith('image/'));
  if (!valid.length) { showToast('No valid image files found.'); return; }
  const existing = new Set(images.map(f => f.name + f.size));
  const unique = valid.filter(f => !existing.has(f.name + f.size));
  if (!unique.length) { showToast('These images are already added.'); return; }
  images = [...images, ...unique];
  unique.forEach(f => renderCard(f));
  updateUI();
  showToast(`${unique.length} image${unique.length > 1 ? 's' : ''} added`);
}

/* ═══════════════════════════════════════════
   RENDER CARD
   ═══════════════════════════════════════════ */
function renderCard(file) {
  const card = document.createElement('div');
  card.className = 'preview-card';

  // Thumb
  const thumb = document.createElement('img');
  thumb.className = 'card-thumb';
  thumb.alt = file.name;
  const reader = new FileReader();
  reader.onload = e => (thumb.src = e.target.result);
  reader.readAsDataURL(file);

  // Info column
  const info = document.createElement('div');
  info.className = 'card-info';

  const name = document.createElement('div');
  name.className = 'card-name';
  name.title = file.name;
  name.textContent = file.name;

  const dim = document.createElement('div');
  dim.className = 'card-dim';
  dim.textContent = '–';
  // Async read dimensions
  const img = new Image();
  img.onload = () => { dim.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`; URL.revokeObjectURL(img.src); };
  img.src = URL.createObjectURL(file);

  const sizes = document.createElement('div');
  sizes.className = 'card-sizes';
  const sizeOrig = document.createElement('span');
  sizeOrig.className = 'size-orig';
  sizeOrig.textContent = formatSize(file.size);
  sizes.append(sizeOrig);

  const progressWrap = document.createElement('div');
  progressWrap.className = 'card-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'card-progress-fill';
  progressWrap.appendChild(progressFill);

  info.append(name, dim, sizes, progressWrap);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  // Compare btn
  const cmpBtn = document.createElement('button');
  cmpBtn.className = 'icon-btn compare';
  cmpBtn.title = 'Before / After';
  cmpBtn.disabled = true;
  cmpBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h3M16 3h3a2 2 0 012 2v14a2 2 0 01-2 2h-3M12 3v18"/></svg>`;
  cmpBtn.addEventListener('click', () => openCompare(file));

  // Download btn
  const dlBtn = document.createElement('button');
  dlBtn.className = 'icon-btn dl-btn';
  dlBtn.title = 'Download';
  dlBtn.disabled = true;
  dlBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;
  dlBtn.addEventListener('click', () => downloadSingle(file));

  // Remove btn
  const rmBtn = document.createElement('button');
  rmBtn.className = 'icon-btn remove';
  rmBtn.title = 'Remove';
  rmBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  rmBtn.addEventListener('click', () => {
    images = images.filter(f => f !== file);
    compressedFiles = compressedFiles.filter(c => c.original !== file);
    previewMap.delete(file);
    card.remove();
    updateUI();
    updateSummary();
  });

  actions.append(cmpBtn, dlBtn, rmBtn);
  card.append(thumb, info, actions);
  card._refs = { sizes, sizeOrig, progressFill, dlBtn, cmpBtn, rmBtn };
  previewMap.set(file, card);
  preview.prepend(card);

  // Restore if previously compressed
  const existing = compressedFiles.find(c => c.original === file);
  if (existing) applyCompressedToCard(file, existing);
}

function applyCompressedToCard(file, compData) {
  const card = previewMap.get(file);
  if (!card) return;
  const { sizes, progressFill, dlBtn, cmpBtn } = card._refs;

  card.querySelectorAll('.size-arrow,.size-comp,.savings-badge').forEach(e => e.remove());

  const arrow = document.createElement('span');
  arrow.className = 'size-arrow'; arrow.textContent = '→';

  const sizeComp = document.createElement('span');
  sizeComp.className = 'size-comp';
  sizeComp.textContent = formatSize(compData.file.size);

  const savedPct = ((file.size - compData.file.size) / file.size * 100);
  if (savedPct > 0) {
    const badge = document.createElement('span');
    badge.className = 'savings-badge';
    badge.textContent = `-${savedPct.toFixed(0)}%`;
    sizes.append(arrow, sizeComp, badge);
  } else {
    sizes.append(arrow, sizeComp);
  }

  progressFill.style.width = '100%';
  dlBtn.disabled = false;
  cmpBtn.disabled = false;
  card.classList.add('done');
}

/* ═══════════════════════════════════════════
   UI STATE
   ═══════════════════════════════════════════ */
function updateUI() {
  const has = images.length > 0;
  previewSection.style.display = has ? 'block' : 'none';
  compressBtn.disabled = !has || isCompressing;
  imageCount.textContent = images.length;
  if (!has) { summaryCard.style.display = 'none'; globalProgress.style.display = 'none'; compressedFiles = []; lastSig = null; downloadAllBtn.disabled = true; }
}

function updateSummary() {
  if (!compressedFiles.length) return;
  const totalOrig = compressedFiles.reduce((s, c) => s + c.original.size, 0);
  const totalComp = compressedFiles.reduce((s, c) => s + c.file.size, 0);
  const saved = totalOrig - totalComp;
  const pct = totalOrig ? ((saved / totalOrig) * 100).toFixed(1) : 0;

  $('statFiles').textContent = compressedFiles.length;
  $('statBefore').textContent = formatSize(totalOrig);
  $('statAfter').textContent = formatSize(totalComp);
  $('statSaved').textContent = `${formatSize(saved)} (${pct}%)`;
  summaryCard.style.display = 'flex';
  downloadAllBtn.disabled = false;
}

/* ═══════════════════════════════════════════
   COMPRESSION ENGINE
   ═══════════════════════════════════════════ */
async function compressPNG(file, qualityPct, targetKB, maxDim) {
  const bitmap = await createImageBitmap(file);
  let origW = bitmap.width, origH = bitmap.height;

  // Resize if needed
  if (maxDim && (origW > maxDim || origH > maxDim)) {
    const ratio = Math.min(maxDim / origW, maxDim / origH);
    origW = Math.round(origW * ratio);
    origH = Math.round(origH * ratio);
  }

  const origSizeKB = file.size / 1024;
  let targetSizeKB = targetKB;
  if (!targetSizeKB && qualityPct) targetSizeKB = Math.max(1, origSizeKB * (qualityPct / 100));

  if (!targetSizeKB) {
    const c = document.createElement('canvas');
    c.width = origW; c.height = origH;
    c.getContext('2d').drawImage(bitmap, 0, 0, origW, origH);
    return { file: dataURLtoBlob(c.toDataURL('image/png')), format: 'png' };
  }

  let scale = 1.0, lastBlob = null;
  for (let i = 0; i < 14; i++) {
    const w = Math.max(1, Math.round(origW * scale));
    const h = Math.max(1, Math.round(origH * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = dataURLtoBlob(c.toDataURL('image/png'));
    lastBlob = blob;
    if (blob.size / 1024 <= targetSizeKB) break;
    const ratio = Math.max(0.001, targetSizeKB / (blob.size / 1024));
    scale *= Math.max(0.3, Math.min(0.95, Math.sqrt(ratio)));
    if (scale < 0.05) break;
  }
  return { file: lastBlob || file, format: 'png' };
}

async function compressFile(file, format, quality, targetKB, maxDim) {
  if (format === 'image/png') {
    return compressPNG(file, quality * 100, targetKB, maxDim);
  }

  const opts = {
    useWebWorker: true,
    fileType: format,
    initialQuality: quality,
    ...(maxDim ? { maxWidthOrHeight: maxDim } : {}),
  };

  if (!targetKB) {
    const out = await imageCompression(file, opts);
    return { file: out, format: format.split('/')[1] };
  }

  let q = quality, mw = maxDim || 1920, iter = 0, out = file;
  while (iter < 22) {
    out = await imageCompression(file, { ...opts, initialQuality: q, maxWidthOrHeight: mw });
    if (out.size / 1024 <= targetKB || q <= 0.1) break;
    q = Math.max(0.1, q - 0.06);
    if (iter > 10) mw = Math.max(200, Math.round(mw * 0.9));
    iter++;
  }
  return { file: out, format: format.split('/')[1] };
}

/* ═══════════════════════════════════════════
   RUN COMPRESSION
   ═══════════════════════════════════════════ */
async function runCompression() {
  if (isCompressing) return;

  const format   = formatHidden.value;
  const targetKB = parseFloat(maxSizeInput.value) || null;
  const quality  = targetKB ? 0.92 : parseFloat(qualitySlider.value) / 100;
  const maxDim   = resizeToggle.checked ? (parseInt(resizeWidth.value) || null) : null;
  const stripExif = exifToggle.checked;
  const suffix    = filenameSuffix.value.trim();

  const sig = getSig(format, quality, targetKB, maxDim, parseInt(resizeHeight.value) || null, stripExif);
  if (sig !== lastSig) {
    compressedFiles = [];
    lastSig = sig;
    previewMap.forEach(card => {
      card.querySelectorAll('.size-arrow,.size-comp,.savings-badge').forEach(e => e.remove());
      card._refs.progressFill.style.width = '0%';
      card._refs.dlBtn.disabled = true;
      card._refs.cmpBtn.disabled = true;
      card.classList.remove('done');
    });
    downloadAllBtn.disabled = true;
    summaryCard.style.display = 'none';
  }

  const pending = images.filter(f => !compressedFiles.some(c => c.original === f));
  if (!pending.length) { showToast('✓ All images already compressed!'); return; }

  isCompressing = true;
  compressBtn.disabled = true;
  compressBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Compressing…`;
  globalProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  progressLabel.textContent = `0 / ${pending.length} done`;

  document.querySelectorAll('.icon-btn.remove').forEach(b => b.disabled = true);

  const BATCH = 4;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(batch.map(async file => {
      try {
        const result = await compressFile(file, format, quality, targetKB, maxDim);
        // Store original dataURL for comparison
        const origDataURL = await blobToDataURL(file);
        const compDataURL = await blobToDataURL(result.file);

        const entry = { original: file, file: result.file, format: result.format, origDataURL, compDataURL, suffix };
        const idx = compressedFiles.findIndex(c => c.original === file);
        if (idx !== -1) compressedFiles[idx] = entry;
        else compressedFiles.push(entry);

        applyCompressedToCard(file, entry);
      } catch (err) {
        console.error('Compression error:', file.name, err);
        showToast(`⚠ Failed: ${file.name}`);
      }
    }));

    const done = Math.min(i + BATCH, pending.length);
    const pct = Math.round((done / pending.length) * 100);
    progressBar.style.width = `${pct}%`;
    progressText.textContent = `${pct}%`;
    progressLabel.textContent = `${done} / ${pending.length} done`;
  }

  progressBar.style.width = '100%';
  progressText.textContent = '100%';
  progressLabel.textContent = 'Done!';

  updateSummary();
  showToast(`⚡ ${compressedFiles.length} image${compressedFiles.length !== 1 ? 's' : ''} compressed`);

  isCompressing = false;
  compressBtn.disabled = images.length === 0;
  compressBtn.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Compress Images`;
  document.querySelectorAll('.icon-btn.remove').forEach(b => b.disabled = false);
}

/* ═══════════════════════════════════════════
   DOWNLOAD
   ═══════════════════════════════════════════ */
function buildOutputName(file, format, suffix) {
  const ext = format || file.type.split('/')[1] || 'webp';
  const base = cleanName(file.name).replace(/\.[^/.]+$/, '');
  return `${base}${suffix || ''}.${ext}`;
}

function downloadSingle(file) {
  const comp = compressedFiles.find(c => c.original === file);
  if (!comp) return;
  saveAs(comp.file, buildOutputName(file, comp.format, comp.suffix));
}

compressBtn.addEventListener('click', runCompression);

downloadAllBtn.addEventListener('click', async () => {
  if (!compressedFiles.length) return;
  const zip = new JSZip();
  compressedFiles.forEach(obj => {
    zip.file(buildOutputName(obj.original, obj.format, obj.suffix), obj.file);
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, 'compressly-optimized.zip');
  showToast('📦 ZIP downloaded!');
});

clearAllBtn.addEventListener('click', () => {
  images = []; compressedFiles = [];
  previewMap.clear(); preview.innerHTML = '';
  lastSig = null;
  updateUI();
  summaryCard.style.display = 'none';
  globalProgress.style.display = 'none';
  downloadAllBtn.disabled = true;
  showToast('Cleared.');
});

/* ═══════════════════════════════════════════
   BEFORE / AFTER COMPARISON MODAL
   ═══════════════════════════════════════════ */
function openCompare(file) {
  const comp = compressedFiles.find(c => c.original === file);
  if (!comp || !comp.origDataURL || !comp.compDataURL) return;

  compareBefore.src = comp.origDataURL;
  compareAfter.src  = comp.compDataURL;
  modalTitle.textContent = `Before / After — ${file.name}`;

  const savedPct = ((file.size - comp.file.size) / file.size * 100).toFixed(1);
  modalMeta.innerHTML = `
    <span>Original: <b>${formatSize(file.size)}</b></span>
    <span>Compressed: <b>${formatSize(comp.file.size)}</b></span>
    <span>Saved: <b>${savedPct}%</b></span>
    <span>Format: <b>${comp.format.toUpperCase()}</b></span>
  `;

  modalOverlay.style.display = 'flex';
  sliderPct = 50;
  updateSliderPosition(sliderPct);
}

modalClose.addEventListener('click', () => { modalOverlay.style.display = 'none'; });
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') modalOverlay.style.display = 'none'; });

// Drag slider
let dragging = false;
let sliderPct = 50;

function updateSliderPosition(pct) {
  compareSlider.style.left = `${pct}%`;
  compareBefore.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
}

compareWrap.addEventListener('mousedown', e => { dragging = true; moveSlider(e); });
compareWrap.addEventListener('touchstart', e => { dragging = true; moveSlider(e.touches[0]); }, { passive: true });
document.addEventListener('mousemove', e => { if (dragging) moveSlider(e); });
document.addEventListener('touchmove', e => { if (dragging) moveSlider(e.touches[0]); }, { passive: true });
document.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('touchend', () => { dragging = false; });

function moveSlider(e) {
  const rect = compareWrap.getBoundingClientRect();
  let pct = ((e.clientX - rect.left) / rect.width) * 100;
  pct = Math.max(0, Math.min(100, pct));
  sliderPct = pct;
  updateSliderPosition(pct);
}