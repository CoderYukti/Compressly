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
const compareStage   = $('compareStage');
const compareSlider  = $('compareSliderLine');
const modalMeta      = $('modalMeta');
const modalTitle     = $('modalTitle');

/* ═══════════════════════════════════════════
   UTILS
   ═══════════════════════════════════════════ */
function formatSize(bytes) {
  const kb = bytes / 1024;
  return kb >= 1000 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(1)} KB`;
}

// Unicode-safe, WordPress-style slug (Bengali etc. letters are kept): "My Photo_1" -> "my-photo-1"
function slugify(str, keepDots = false) {
  return str
    .normalize('NFC')
    .toLowerCase()
    .replace(keepDots ? /[\s_]+/g : /[\s_.]+/g, '-')
    .replace(keepDots ? /[^\p{L}\p{M}\p{N}.-]+/gu : /[^\p{L}\p{M}\p{N}-]+/gu, '')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');
}
function cleanName(name) {
  return slugify(name.replace(/\.[^/.]+$/, '')) || 'image';
}

function getSig(format, quality, targetKB, w, h) {
  return JSON.stringify({ format, quality: quality?.toFixed(2), targetKB, w, h, lock: aspectLock.checked });
}

let toastTimer;
function showToast(msg, ms = 3200, action) {
  toastEl.textContent = msg;
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { toastEl.classList.remove('show'); action.fn(); });
    toastEl.append(btn);
  }
  toastEl.classList.toggle('has-action', !!action);
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

function applyPreset(key, btn, silent = false) {
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

  if (!silent) showToast(`Preset applied: ${p.label}`);
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
dropArea.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === dropArea) { e.preventDefault(); uploadInput.click(); } });

dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', e => { if (!dropArea.contains(e.relatedTarget)) dropArea.classList.remove('drag-over'); });
dropArea.addEventListener('drop', e => { e.preventDefault(); dropArea.classList.remove('drag-over'); handleFiles(e.dataTransfer.files); });
uploadInput.addEventListener('change', e => { handleFiles(e.target.files); uploadInput.value = ''; });

const isHeic = f => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

let heicLoader;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve();
  heicLoader = heicLoader || new Promise((res, rej) => {
    const el = document.createElement('script');
    el.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
    el.onload = res;
    el.onerror = () => { heicLoader = null; rej(new Error('load')); };
    document.head.append(el);
  });
  return heicLoader;
}

// iPhone HEIC photos → JPEG (only loads the converter when a HEIC file is actually dropped)
async function convertHeic(files) {
  const out = [];
  showToast(`Converting ${files.length} HEIC photo${files.length > 1 ? 's' : ''}…`, 15000);
  try {
    await loadHeicLib();
    for (const f of files) {
      const r = await window.heic2any({ blob: f, toType: 'image/jpeg', quality: 0.95 });
      out.push(new File([Array.isArray(r) ? r[0] : r], f.name.replace(/\.hei[cf]$/i, '.jpg'), { type: 'image/jpeg' }));
    }
  } catch (err) {
    console.error('HEIC error:', err);
    showToast('⚠ Could not convert HEIC (needs internet the first time)', 4500);
  }
  return out;
}

async function handleFiles(files) {
  const list = [...files];
  const heic = list.filter(isHeic);
  const converted = heic.length ? await convertHeic(heic) : [];
  const valid = [...list.filter(f => !isHeic(f) && f.type.startsWith('image/')), ...converted];
  if (!valid.length) { if (!heic.length) showToast('No valid image files found.'); return; }
  const existing = new Set(images.map(f => f.name + f.size));
  const unique = valid.filter(f => !existing.has(f.name + f.size));
  if (!unique.length) { showToast('These images are already added.'); return; }
  images = [...images, ...unique];
  unique.forEach(f => renderCard(f));
  updateUI();
  showToast(`${unique.length} image${unique.length > 1 ? 's' : ''} added`);
}

// Ctrl+V / Cmd+V: paste screenshots or copied images straight in
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  const stamp = Date.now();
  handleFiles(files.map((f, i) =>
    new File([f], `pasted-${stamp}${files.length > 1 ? '-' + (i + 1) : ''}.${EXT[f.type] || 'png'}`, { type: f.type })));
});

/* ═══════════════════════════════════════════
   RENDER CARD
   ═══════════════════════════════════════════ */
function renderCard(file) {
  const card = document.createElement('div');
  card.className = 'preview-card';

  // One object URL serves both the thumbnail and the dimension read (cheaper than base64)
  const url = URL.createObjectURL(file);

  const thumb = document.createElement('img');
  thumb.className = 'card-thumb';
  thumb.alt = file.name;

  // Info column
  const info = document.createElement('div');
  info.className = 'card-info';

  const nameRow = document.createElement('div');
  nameRow.className = 'card-name-row';
  const name = document.createElement('div');
  name.className = 'card-name';
  name.title = file.name;
  name.textContent = file.name;
  name.addEventListener('click', () => startRename(file));
  const editBtn = document.createElement('button');
  editBtn.className = 'name-edit';
  editBtn.title = 'Rename before download';
  editBtn.setAttribute('aria-label', 'Rename file');
  editBtn.textContent = '✎';
  editBtn.hidden = true;
  editBtn.addEventListener('click', () => startRename(file));
  nameRow.append(name, editBtn);

  const dim = document.createElement('div');
  dim.className = 'card-dim';
  dim.textContent = '–';
  thumb.onload = () => {
    card._origDim = `${thumb.naturalWidth} × ${thumb.naturalHeight} px`;
    card._natW = thumb.naturalWidth;
    if (!card.classList.contains('done')) { dim.textContent = card._origDim; refreshTip(card, false); }
  };
  thumb.src = url;

  const sizes = document.createElement('div');
  sizes.className = 'card-sizes';
  const sizeOrig = document.createElement('span');
  sizeOrig.className = 'size-orig';
  sizeOrig.textContent = formatSize(file.size);
  sizes.append(sizeOrig);

  const note = document.createElement('div');
  note.className = 'card-note';
  note.hidden = true;

  const progressWrap = document.createElement('div');
  progressWrap.className = 'card-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'card-progress-fill';
  progressWrap.appendChild(progressFill);

  info.append(nameRow, dim, sizes, note, progressWrap);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const cmpBtn = document.createElement('button');
  cmpBtn.className = 'icon-btn compare';
  cmpBtn.title = 'Before / After';
  cmpBtn.disabled = true;
  cmpBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M8 3H5a2 2 0 00-2 2v14a2 2 0 002 2h3M16 3h3a2 2 0 012 2v14a2 2 0 01-2 2h-3M12 3v18"/></svg>`;
  cmpBtn.addEventListener('click', () => openCompare(file));

  const dlBtn = document.createElement('button');
  dlBtn.className = 'icon-btn dl-btn';
  dlBtn.title = 'Download';
  dlBtn.disabled = true;
  dlBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;
  dlBtn.addEventListener('click', () => downloadSingle(file));

  const rmBtn = document.createElement('button');
  rmBtn.className = 'icon-btn remove';
  rmBtn.title = 'Remove';
  rmBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  rmBtn.addEventListener('click', () => removeImage(file));

  actions.append(cmpBtn, dlBtn, rmBtn);
  card.append(thumb, info, actions);
  card._refs = { sizes, sizeOrig, progressFill, dlBtn, cmpBtn, rmBtn, dim, note, url, nameEl: name, nameRow, editBtn };
  previewMap.set(file, card);
  preview.prepend(card);

  const existing = compressedFiles.find(c => c.original === file);
  if (existing) applyCompressedToCard(file, existing);
}

function setNote(card, text, kind = 'warn') {
  const n = card._refs.note;
  if (!text) { n.hidden = true; return; }
  n.textContent = text;
  n.className = `card-note ${kind}`;
  n.hidden = false;
}

// Gentle hint for oversized photos (not a warning, just a nudge)
function refreshTip(card, resized) {
  const w = card._natW || 0;
  if (w > 2500 && !resized) setNote(card, `💡 ${w}px wide — most sites need ≤ 2000px. A Quick Preset can resize it.`, 'tip');
  else setNote(card, null);
}

/* ── Rename before download ── */
const customNames = new Map();   // file → custom base name (survives re-compress)

function autoBase(entry) {
  const suffix = filenameSuffix.value.trim().replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '');
  return `${cleanName(entry.original.name)}${suffix}`;
}

function refreshName(file) {
  const card = previewMap.get(file);
  if (!card || card._renaming) return;
  const { nameEl, editBtn } = card._refs;
  const entry = compressedFiles.find(c => c.original === file);
  nameEl.classList.toggle('editable', !!entry);
  editBtn.hidden = !entry;
  nameEl.textContent = entry ? buildOutputName(entry) : file.name;
  nameEl.title = entry ? 'Click to rename' : file.name;
}

function startRename(file) {
  const card = previewMap.get(file);
  const entry = compressedFiles.find(c => c.original === file);
  if (!card || !entry || card._renaming) return;
  card._renaming = true;
  const { nameEl, editBtn, nameRow } = card._refs;

  const current = buildOutputName(entry);
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'name-input';
  input.value = current.slice(0, current.lastIndexOf('.'));
  input.maxLength = 120;
  input.spellcheck = false;
  input.setAttribute('aria-label', 'File name');
  const ext = document.createElement('span');
  ext.className = 'name-ext';
  ext.textContent = `.${entry.format}`;
  nameRow.replaceChildren(input, ext);
  input.focus();
  input.select();

  let finished = false;
  const finish = commit => {
    if (finished) return;
    finished = true;
    if (commit) {
      const slug = slugify(input.value.replace(/\.(jpe?g|png|webp|gif|bmp)$/i, ''), true);
      if (!slug || slug === autoBase(entry)) customNames.delete(file);   // empty / same as auto → back to auto naming
      else customNames.set(file, slug);
    }
    card._renaming = false;
    nameRow.replaceChildren(nameEl, editBtn);
    refreshName(file);
  };
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

filenameSuffix.addEventListener('input', () => previewMap.forEach((_, f) => refreshName(f)));

/* ── Remove with Undo ── */
let pendingRemoval = null;

function finalizeRemoval() {
  if (!pendingRemoval) return;
  clearTimeout(pendingRemoval.timer);
  URL.revokeObjectURL(pendingRemoval.card._refs.url);
  customNames.delete(pendingRemoval.file);
  pendingRemoval = null;
}

function removeImage(file) {
  const card = previewMap.get(file);
  if (!card) return;
  finalizeRemoval();
  const entry = compressedFiles.find(c => c.original === file);
  images = images.filter(f => f !== file);
  compressedFiles = compressedFiles.filter(c => c.original !== file);
  previewMap.delete(file);
  card.remove();
  updateUI();
  updateSummary();
  pendingRemoval = { file, entry, card, timer: setTimeout(finalizeRemoval, 7000) };
  showToast('Image removed', 7000, { label: 'Undo', fn: undoRemoval });
}

function undoRemoval() {
  if (!pendingRemoval) return;
  const { file, entry, card, timer } = pendingRemoval;
  clearTimeout(timer);
  pendingRemoval = null;
  images.push(file);
  if (entry) compressedFiles.push(entry);
  previewMap.set(file, card);
  preview.prepend(card);
  updateUI();
  updateSummary();
}

function applyCompressedToCard(file, c) {
  const card = previewMap.get(file);
  if (!card) return;
  const { sizes, progressFill, dlBtn, cmpBtn, dim, note } = card._refs;

  card.querySelectorAll('.size-arrow,.size-comp,.savings-badge').forEach(e => e.remove());

  const arrow = document.createElement('span');
  arrow.className = 'size-arrow'; arrow.textContent = '→';

  const sizeComp = document.createElement('span');
  sizeComp.className = 'size-comp';
  sizeComp.textContent = formatSize(c.file.size);
  sizes.append(arrow, sizeComp);

  const savedPct = (file.size - c.file.size) / file.size * 100;
  const badge = document.createElement('span');
  badge.className = 'savings-badge';
  if (c.kept) badge.textContent = 'Already optimized';
  else if (savedPct > 0) badge.textContent = `-${savedPct.toFixed(0)}%`;
  else { badge.textContent = `+${Math.abs(savedPct).toFixed(0)}%`; badge.classList.add('worse'); }   // e.g. tiny PNG → WebP can grow
  sizes.append(badge);

  // Show new dimensions only when they changed
  const orig = card._origDim || '';
  dim.textContent = c.resized ? `${orig} → ${c.w} × ${c.h} px` : orig;

  if (c.shrunk) {
    const still = c.missedTarget ? ' (still over the limit)' : '';
    setNote(card, c.format === 'png'
      ? `⚠ PNG can't fit ${c.targetKB} KB at full size, so it was shrunk to ${c.w} × ${c.h}${still}. WebP or JPEG keeps ${c.baseW} × ${c.baseH}.`
      : `⚠ Shrunk to ${c.w} × ${c.h} to fit ${c.targetKB} KB${still}`, 'warn');
  } else if (c.missedTarget) setNote(card, `⚠ Couldn't reach ${c.targetKB} KB — closest result kept`, 'warn');
  else refreshTip(card, c.resized);

  progressFill.style.width = '100%';
  dlBtn.disabled = false;
  cmpBtn.disabled = false;
  card.classList.add('done');
  refreshName(file);
}


/* ═══════════════════════════════════════════
   UI STATE
   ═══════════════════════════════════════════ */
function updateUI() {
  const has = images.length > 0;
  previewSection.style.display = has ? 'block' : 'none';
  compressBtn.disabled = !has || (isCompressing && cancelRequested);   // while running it's the Cancel button
  imageCount.textContent = images.length;
  if (!has) { summaryCard.style.display = 'none'; globalProgress.style.display = 'none'; compressedFiles = []; lastSig = null; downloadAllBtn.disabled = true; }
}

function updateSummary() {
  if (!compressedFiles.length) { summaryCard.style.display = 'none'; downloadAllBtn.disabled = true; return; }
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
   RUN COMPRESSION
   ═══════════════════════════════════════════ */
const BOLT_ICON = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`;
const CONCURRENCY = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 1));

/* ── Web Worker pool: compression runs off the main thread (falls back to main thread if unsupported) ── */
const workerPool = [];
let workersUnavailable = typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function';

function getWorker(slot) {
  if (workersUnavailable) return null;
  if (workerPool[slot]) return workerPool[slot];
  try {
    const w = new Worker('compress.worker.js');
    const st = { w, dead: false, upng: false, seq: 0, pending: new Map() };
    st.ready = new Promise(res => { st.markReady = res; });
    w.onmessage = e => {
      const m = e.data;
      if (m.type === 'ready') { st.upng = m.upng; st.markReady(true); return; }
      const p = st.pending.get(m.id);
      if (!p) return;
      st.pending.delete(m.id);
      m.ok ? p.resolve(m.result) : p.reject(new Error(m.error));
    };
    w.onerror = () => {
      st.dead = true;
      st.markReady(false);
      st.pending.forEach(p => p.reject(new Error('Worker failed')));
      st.pending.clear();
    };
    st.run = (file, settings) => new Promise((resolve, reject) => {
      const id = ++st.seq;
      st.pending.set(id, { resolve, reject });
      w.postMessage({ id, file, s: settings });
    });
    workerPool[slot] = st;
    return st;
  } catch (_) { workersUnavailable = true; return null; }
}

async function compressSmart(slot, file, settings) {
  const st = getWorker(slot);
  if (st) {
    const ready = await Promise.race([st.ready, new Promise(r => setTimeout(() => r(false), 10000))]);
    // If the worker couldn't load UPNG but the page did, PNG goes through the page instead
    const pngNeedsPage = settings.format === 'image/png' && !st.upng && typeof UPNG !== 'undefined';
    if (ready && !st.dead && !pngNeedsPage) {
      try { return await st.run(file, settings); } catch (_) { /* retry on main thread below */ }
    }
  }
  return compressFile(file, settings.format, settings.quality, settings.targetKB, settings.rw, settings.rh, settings.lock);
}

function terminateWorkers() { workerPool.forEach(st => st.w.terminate()); workerPool.length = 0; }
let cancelRequested = false;

function resetResults() {
  compressedFiles = [];
  previewMap.forEach((card, file) => {
    card.querySelectorAll('.size-arrow,.size-comp,.savings-badge').forEach(e => e.remove());
    const r = card._refs;
    r.progressFill.style.width = '0%';
    r.dlBtn.disabled = true;
    r.cmpBtn.disabled = true;
    r.dim.textContent = card._origDim || '–';
    card.classList.remove('done');
    refreshTip(card, false);
    refreshName(file);
  });
  downloadAllBtn.disabled = true;
  summaryCard.style.display = 'none';
}

async function runCompression() {
  if (isCompressing) {                       // button doubles as "Cancel" while running
    cancelRequested = true;
    compressBtn.disabled = true;
    compressBtn.innerHTML = `${BOLT_ICON} Cancelling…`;
    return;
  }

  const format   = formatHidden.value;
  const targetKB = parseFloat(maxSizeInput.value) || null;
  const quality  = parseFloat(qualitySlider.value) / 100;   // upper limit; target size may lower it
  const rw = resizeToggle.checked ? (parseInt(resizeWidth.value)  || null) : null;
  const rh = resizeToggle.checked ? (parseInt(resizeHeight.value) || null) : null;
  const lock = aspectLock.checked;

  const sig = getSig(format, quality, targetKB, rw, rh);
  if (sig !== lastSig) { resetResults(); lastSig = sig; }

  const pending = images.filter(f => !compressedFiles.some(c => c.original === f));
  if (!pending.length) { showToast('✓ All images already compressed!'); return; }

  isCompressing = true;
  cancelRequested = false;
  compressBtn.innerHTML = `${BOLT_ICON} Cancel`;
  globalProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = '0%';
  progressLabel.textContent = `0 / ${pending.length} done`;
  document.querySelectorAll('.icon-btn.remove').forEach(b => b.disabled = true);

  const total = pending.length;
  let next = 0, done = 0, failed = 0, missed = 0, shrunk = 0;

  async function worker(slot) {
    while (!cancelRequested) {
      const idx = next++;
      if (idx >= total) return;
      const file = pending[idx];
      const card = previewMap.get(file);
      if (card) { card._refs.progressFill.style.width = '35%'; setNote(card, null); }

      try {
        const result = await compressSmart(slot, file, { format, quality, targetKB, rw, rh, lock });
        if (result.kept) result.file = file;   // worker returns a copy; keep the real original
        if (images.includes(file)) {         // user may have cleared the list meanwhile
          const entry = { original: file, ...result };
          compressedFiles.push(entry);
          applyCompressedToCard(file, entry);
          if (result.missedTarget) missed++;
          if (result.shrunk) shrunk++;
        }
      } catch (err) {
        failed++;
        console.error('Compression error:', file.name, err);
        if (card) {
          card._refs.progressFill.style.width = '0%';
          setNote(card, `⚠ ${err.message || 'Failed'} — click Compress to retry`, 'warn');
        }
      }

      done++;
      const pct = Math.round((done / total) * 100);
      progressBar.style.width = `${pct}%`;
      progressText.textContent = `${pct}%`;
      progressLabel.textContent = `${done} / ${total} done`;
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, (_, i) => worker(i)));
  terminateWorkers();

  progressLabel.textContent = cancelRequested ? 'Cancelled' : 'Done!';
  updateSummary();

  const ok = compressedFiles.length;
  if (cancelRequested) showToast(`Cancelled — ${ok} image${ok !== 1 ? 's' : ''} done`);
  else if (failed) showToast(`⚠ ${failed} failed — click Compress to retry`, 4500);
  else if (missed) showToast(`⚠ ${missed} image${missed > 1 ? 's' : ''} couldn't reach ${targetKB} KB`, 4500);
  else if (shrunk) showToast(`⚠ ${shrunk} image${shrunk > 1 ? 's were' : ' was'} shrunk to fit ${targetKB} KB`, 4500);
  else showToast(`⚡ ${ok} image${ok !== 1 ? 's' : ''} compressed`);

  isCompressing = false;
  cancelRequested = false;
  compressBtn.disabled = images.length === 0;
  compressBtn.innerHTML = `${BOLT_ICON} Compress Images`;
  document.querySelectorAll('.icon-btn.remove').forEach(b => b.disabled = false);
}

/* ═══════════════════════════════════════════
   DOWNLOAD
   ═══════════════════════════════════════════ */
function buildOutputName(entry) {
  // custom (renamed) name wins; otherwise slug + suffix, both read at download time (no re-compress needed)
  const base = customNames.get(entry.original) || autoBase(entry);
  return `${base}.${entry.format}`;
}

function uniqueName(name, used) {
  let n = name, i = 2;
  const dot = name.lastIndexOf('.');
  const base = name.slice(0, dot), ext = name.slice(dot);
  while (used.has(n)) n = `${base}-${i++}${ext}`;
  used.add(n);
  return n;
}

function downloadSingle(file) {
  const comp = compressedFiles.find(c => c.original === file);
  if (!comp) return;
  saveAs(comp.file, buildOutputName(comp));
}

compressBtn.addEventListener('click', runCompression);

downloadAllBtn.addEventListener('click', async () => {
  if (!compressedFiles.length) return;
  const zip = new JSZip();
  const used = new Set();
  compressedFiles.forEach(obj => zip.file(uniqueName(buildOutputName(obj), used), obj.file));
  // Images are already compressed, so skip ZIP deflate: much faster, same size
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  saveAs(blob, 'compressly-optimized.zip');
  showToast('📦 ZIP downloaded!');
});

clearAllBtn.addEventListener('click', () => {
  cancelRequested = true;
  finalizeRemoval();
  customNames.clear();
  previewMap.forEach(card => URL.revokeObjectURL(card._refs.url));
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
let compareURLs = [];

function openCompare(file) {
  const comp = compressedFiles.find(c => c.original === file);
  if (!comp) return;

  closeCompare();
  compareURLs = [URL.createObjectURL(file), URL.createObjectURL(comp.file)];
  compareBefore.src = compareURLs[0];
  compareAfter.src  = compareURLs[1];
  modalTitle.textContent = `Before / After — ${file.name}`;

  const savedPct = ((file.size - comp.file.size) / file.size * 100);
  modalMeta.innerHTML = `
    <span>Original: <b>${formatSize(file.size)}</b></span>
    <span>Compressed: <b>${formatSize(comp.file.size)}</b></span>
    <span>Saved: <b>${comp.kept ? 'Already optimized' : savedPct > 0 ? savedPct.toFixed(1) + '%' : '+' + Math.abs(savedPct).toFixed(1) + '% (larger)'}</b></span>
    <span>Format: <b>${comp.format.toUpperCase()}</b></span>
  `;

  modalOverlay.style.display = 'flex';
  sliderPct = 50;
  resetZoom();
}

function closeCompare() {
  modalOverlay.style.display = 'none';
  compareURLs.forEach(u => URL.revokeObjectURL(u));
  compareURLs = [];
}

modalClose.addEventListener('click', closeCompare);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeCompare(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeCompare(); });

// Slider + zoom/pan
let dragging = false, panning = false, panStart = null;
let sliderPct = 50, zoom = 1, panX = 0, panY = 0;
const MAX_ZOOM = 12;

function updateSliderPosition(pct) {
  compareSlider.style.left = `${pct}%`;
  // the clip lives inside the zoomed stage, so convert screen % → image-space %
  const W = compareWrap.clientWidth || 1;
  const local = Math.max(0, Math.min(100, ((pct / 100 * W - panX) / zoom) / W * 100));
  compareBefore.style.clipPath = `inset(0 ${100 - local}% 0 0)`;
}

function applyZoom() {
  const W = compareWrap.clientWidth, H = compareWrap.clientHeight;
  panX = Math.min(0, Math.max(W - W * zoom, panX));
  panY = Math.min(0, Math.max(H - H * zoom, panY));
  compareStage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  compareWrap.classList.toggle('zoomed', zoom > 1);
  updateSliderPosition(sliderPct);
}

function resetZoom() { zoom = 1; panX = panY = 0; applyZoom(); }

function zoomAt(clientX, clientY, newZoom) {
  const r = compareWrap.getBoundingClientRect();
  const cx = clientX - r.left, cy = clientY - r.top;
  newZoom = Math.max(1, Math.min(MAX_ZOOM, newZoom));
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
  if (zoom === 1) { panX = panY = 0; }
  applyZoom();
}

compareWrap.addEventListener('wheel', e => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2));
}, { passive: false });

// Double-click: jump to 100% (real pixels) / back to fit
function toggleZoom(x, y) {
  if (zoom > 1) { resetZoom(); return; }
  const nw = compareBefore.naturalWidth, nh = compareBefore.naturalHeight;
  const fit = Math.min(compareBefore.clientWidth / nw, compareBefore.clientHeight / nh) || 1;
  zoomAt(x, y, Math.max(2, 1 / fit));
}
let lastTouch = 0;   // browsers replay touches as mouse events; ignore those so gestures don't fire twice
compareWrap.addEventListener('dblclick', e => {
  if (Date.now() - lastTouch < 700) return;
  toggleZoom(e.clientX, e.clientY);
});

compareWrap.addEventListener('mousedown', e => {
  if (Date.now() - lastTouch < 700) return;
  if (zoom > 1 && !e.target.closest('#compareSliderLine')) {   // zoomed: drag pans; the handle still moves the slider
    panning = true;
    panStart = { x: e.clientX - panX, y: e.clientY - panY };
    compareWrap.classList.add('panning');
    return;
  }
  dragging = true; moveSlider(e);
});
// Touch: 2 fingers = pinch zoom, 1 finger = slider (or pan when zoomed), double-tap = 100% / fit
let pinch = null, touchPan = null, lastTap = 0;
const touchDist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
compareWrap.addEventListener('touchstart', e => {
  lastTouch = Date.now();
  if (e.touches.length === 2) { dragging = false; touchPan = null; pinch = { d: touchDist(e.touches), z: zoom }; return; }
  if (e.touches.length !== 1) return;
  const t = e.touches[0];
  if (Date.now() - lastTap < 300) { lastTap = 0; toggleZoom(t.clientX, t.clientY); return; }
  lastTap = Date.now();
  if (zoom > 1 && !e.target.closest('#compareSliderLine')) touchPan = { x: t.clientX - panX, y: t.clientY - panY };
  else { dragging = true; moveSlider(t); }
}, { passive: true });
document.addEventListener('mousemove', e => {
  if (panning) { panX = e.clientX - panStart.x; panY = e.clientY - panStart.y; applyZoom(); }
  else if (dragging) moveSlider(e);
});
document.addEventListener('touchmove', e => {
  lastTouch = Date.now();
  if (pinch && e.touches.length === 2) {
    const [a, b] = e.touches;
    zoomAt((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, pinch.z * touchDist(e.touches) / pinch.d);
  } else if (touchPan && e.touches.length === 1) {
    panX = e.touches[0].clientX - touchPan.x; panY = e.touches[0].clientY - touchPan.y; applyZoom();
  } else if (dragging && e.touches.length === 1) moveSlider(e.touches[0]);
}, { passive: true });
document.addEventListener('mouseup', () => { dragging = panning = false; compareWrap.classList.remove('panning'); });
document.addEventListener('touchend', e => {
  lastTouch = Date.now();
  if (e.touches.length < 2) pinch = null;
  if (e.touches.length === 0) { dragging = false; touchPan = null; }
});

function moveSlider(e) {
  const rect = compareWrap.getBoundingClientRect();
  sliderPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
  updateSliderPosition(sliderPct);
}

/* ═══════════════════════════════════════════
   REMEMBER SETTINGS
   ═══════════════════════════════════════════ */
const SETTINGS_KEY = 'compressly:settings:v1';

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      preset: activePreset,
      format: formatHidden.value,
      quality: qualitySlider.value,
      maxKB: maxSizeInput.value,
      resize: resizeToggle.checked,
      rw: resizeWidth.value,
      rh: resizeHeight.value,
      lock: aspectLock.checked,
      suffix: filenameSuffix.value,
    }));
  } catch (_) { /* private mode / storage blocked: just don't remember */ }
}

function loadSettings() {
  let st;
  try { st = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (_) { return; }
  if (!st) return;
  if (st.preset && PRESETS[st.preset]) {
    applyPreset(st.preset, presetsGrid.querySelector(`[data-preset="${st.preset}"]`), true);
  } else {
    if (st.format) setFormat(st.format);
    if (st.quality) { qualitySlider.value = st.quality; updateSliderFill(); }
    if (st.maxKB) { maxSizeInput.value = st.maxKB; maxSizeInput.dispatchEvent(new Event('input')); }
    resizeToggle.checked = !!st.resize;
    resizeFields.style.display = st.resize ? 'flex' : 'none';
    resizeWidth.value = st.rw || '';
    resizeHeight.value = st.rh || '';
  }
  aspectLock.checked = st.lock !== false;
  filenameSuffix.value = st.suffix || '';
}

document.addEventListener('input', saveSettings);
document.addEventListener('change', saveSettings);
document.addEventListener('click', e => {
  if (e.target.closest('.fmt-tab, .preset-card, #presetClearBtn')) saveSettings();   // runs after the element's own handler (bubbling)
});
loadSettings();

/* ═══════════════════════════════════════════
   OFFLINE / INSTALLABLE (service worker)
   ═══════════════════════════════════════════ */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
