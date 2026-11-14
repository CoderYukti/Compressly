# Compressly — Image Compressor for Web & WordPress Developers

Compress, resize and convert images right in your browser. Nothing is uploaded — everything runs locally.

➡️ **Live demo:** https://compressly-five.vercel.app/

---

## ✨ Features

- 📥 Drag & drop, file picker, or **paste with Ctrl+V** (screenshots work too)
- 📱 **iPhone HEIC** photos are converted automatically
- 🎯 **Max file size** – finds the best quality that fits your KB limit, then shrinks dimensions only if needed
- ⚡ **Quick presets** for WordPress / WooCommerce / social / avatar / retina
- 📐 Resize by width, height, or both (aspect ratio lock, never upscales)
- 🗜️ Real **PNG** compression (lossless at 100%, fewer colors below that)
- ✎ **Rename before download** – click any file name after compressing
- 🔍 Before / After slider with **zoom** (scroll) and **100% view** (double-click)
- ↩️ Undo for removed images
- 📦 Download one file or everything as a ZIP
- 💾 Remembers your last settings
- 🔒 Strips EXIF / GPS metadata
- 📴 Works **offline** after the first visit (installable as an app)

---

## 📦 Dependencies (loaded from CDN, cached for offline use)

- [UPNG.js](https://github.com/photopea/UPNG.js) + [pako](https://github.com/nodeca/pako) – PNG compression
- [JSZip](https://stuk.github.io/jszip/) – ZIP download
- [FileSaver.js](https://github.com/eligrey/FileSaver.js) – saving files
- [heic2any](https://github.com/alexcorvi/heic2any) – HEIC → JPEG (loaded only when a HEIC file is added)
- Vanilla JavaScript + Canvas API (JPEG / WebP encoding)

---

## 🧩 Contributing

Pull requests are welcome! Open an issue if you have an idea or find a bug.
