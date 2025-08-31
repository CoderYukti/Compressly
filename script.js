let images = [];
let compressedFiles = [];

const uploadInput = document.getElementById("upload");
const dropArea = document.getElementById("drop-area");
const previewContainer = document.getElementById("preview");
const progressBar = document.getElementById("progress-bar");

// Helper: convert dataURL -> Blob
function dataURLtoBlob(dataurl) {
    const parts = dataurl.split(',');
    const mimeMatch = parts[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new Blob([u8arr], { type: mime });
}

// Clear quality and maxSize inputs on load
window.addEventListener("DOMContentLoaded", () => {
    const qualityEl = document.getElementById("quality");
    const maxSizeEl = document.getElementById("maxSize");

    if (qualityEl) {
        qualityEl.value = "";
        qualityEl.setAttribute("autocomplete", "off");
    }
    if (maxSizeEl) {
        maxSizeEl.value = "";
        maxSizeEl.setAttribute("autocomplete", "off");
    }

    toggleInputs(); // ensure state is correct
});

// Drag & Drop
dropArea.addEventListener("click", () => uploadInput.click());
dropArea.addEventListener("dragover", e => {
    e.preventDefault();
    dropArea.style.background = "#e0f0ff";
    dropArea.style.borderColor = "#005bb5";
});
dropArea.addEventListener("dragleave", e => {
    e.preventDefault();
    dropArea.style.background = "#f0f8ff";
    dropArea.style.borderColor = "#0070f3";
});
dropArea.addEventListener("drop", e => {
    e.preventDefault();
    dropArea.style.background = "#f0f8ff";
    dropArea.style.borderColor = "#0070f3";
    handleFiles(e.dataTransfer.files);
});
uploadInput.addEventListener("change", e => handleFiles(e.target.files));

// Handle Files
function handleFiles(files) {
    images = [...images, ...files];
    renderPreview();
    updateOriginalSize();
}

// Render preview
function renderPreview() {
    previewContainer.innerHTML = "";
    if (images.length === 0) {
        previewContainer.innerHTML = "<p>No images uploaded. Drag & drop or click above to add images.</p>";
        document.getElementById("compressBtn").disabled = true;
        document.getElementById("downloadAllBtn").disabled = true;
        return;
    }

    document.getElementById("compressBtn").disabled = false;

    images.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
            const div = document.createElement("div");
            div.className = "preview-item";

            const img = document.createElement("img");
            img.src = ev.target.result;

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "remove-btn";
            removeBtn.textContent = "×";
            removeBtn.addEventListener("click", () => {
                images = images.filter(f => f !== file);
                compressedFiles = compressedFiles.filter(f => f.original !== file);
                renderPreview();
                updateOriginalSize();
            });

            const sizeLabel = document.createElement("small");
            sizeLabel.textContent = `Original: ${(file.size / 1024).toFixed(1)} KB`;

            const compressedLabel = document.createElement("small");
            compressedLabel.textContent = `Compressed: 0 KB`;

            const downloadBtn = document.createElement("button");
            downloadBtn.textContent = "Download";
            downloadBtn.className = "download-btn";
            downloadBtn.disabled = true;
            downloadBtn.addEventListener("click", () => {
                const compFileObj = compressedFiles.find(f => f.original === file);
                if (compFileObj) {
                    const ext = compFileObj.format || compFileObj.file.type.split("/")[1];
                    saveAs(
                        compFileObj.file,
                        cleanFileName(file.name).replace(/\.[^/.]+$/, `.${ext}`)
                    );
                }
            });

            const progressDiv = document.createElement("div");
            progressDiv.className = "image-progress";
            progressDiv.innerHTML = `<div class="image-progress-bar"></div>`;

            div.appendChild(img);
            div.appendChild(removeBtn);
            div.appendChild(sizeLabel);
            div.appendChild(compressedLabel);
            div.appendChild(progressDiv);
            div.appendChild(downloadBtn);

            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
    previewContainer.classList.add("list-mode");
}

// Update Original Size
function updateOriginalSize() {
    const totalSize = images.reduce((sum, file) => sum + file.size, 0);
    document.getElementById("original-size").textContent = `Original Size: ${(totalSize / 1024).toFixed(1)} KB`;
}

// Clean Filename
function cleanFileName(name) {
    return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-\.]/g, "").toLowerCase();
}

// --- Optimized PNG Compression ---
async function compressPNG(file, qualityPercent = null, explicitTargetKB = null) {
    const imgBitmap = await createImageBitmap(file);
    const origW = imgBitmap.width;
    const origH = imgBitmap.height;
    const originalSizeKB = file.size / 1024;

    let targetSizeKB = explicitTargetKB || null;
    if (!targetSizeKB && typeof qualityPercent === "number") {
        targetSizeKB = Math.max(1, originalSizeKB * (qualityPercent / 100));
    }

    if (!targetSizeKB) {
        const canvas = document.createElement("canvas");
        canvas.width = origW;
        canvas.height = origH;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgBitmap, 0, 0);
        const dataUrl = canvas.toDataURL("image/png");
        return { file: dataURLtoBlob(dataUrl), format: "png" };
    }

    let scale = 1.0;
    let lastBlob = null;

    for (let i = 0; i < 12; i++) {
        const w = Math.max(1, Math.round(origW * scale));
        const h = Math.max(1, Math.round(origH * scale));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgBitmap, 0, 0, w, h);

        const dataUrl = canvas.toDataURL("image/png");
        const blob = dataURLtoBlob(dataUrl);
        const sizeKB = blob.size / 1024;

        lastBlob = blob;

        if (sizeKB <= targetSizeKB) break;

        const ratio = Math.max(0.001, targetSizeKB / sizeKB);
        let scaleFactor = Math.sqrt(ratio);
        scaleFactor = Math.max(0.3, Math.min(0.95, scaleFactor));
        scale *= scaleFactor;

        if (scale < 0.05) break;
    }

    return { file: lastBlob || file, format: "png" };
}

// --- Universal Compression ---
async function compressToTarget(file, options, targetSizeKB = null) {
    const fileType = options.fileType;

    if (fileType === "image/png") {
        const qualityPercent = (typeof options.initialQuality === "number" && options.initialQuality > 0)
            ? Math.round(options.initialQuality * 100)
            : null;
        const explicitKB = targetSizeKB || null;
        const result = await compressPNG(file, qualityPercent, explicitKB);
        return { file: result.file, format: "png" };
    }

    let quality = options.initialQuality ?? 0.9;
    const minQuality = 0.1;
    const step = 0.05;
    let compressedFile = file;
    let maxWidthOrHeight = targetSizeKB ? 1024 : undefined;
    let iteration = 0;

    if (targetSizeKB) {
        while (true) {
            compressedFile = await imageCompression(file, {
                ...options,
                initialQuality: quality,
                fileType,
                maxWidthOrHeight
            });

            const sizeKB = compressedFile.size / 1024;
            if (sizeKB <= targetSizeKB || quality <= minQuality || iteration > 20) break;

            quality -= step;
            maxWidthOrHeight *= 0.9;
            iteration++;
        }
    } else {
        compressedFile = await imageCompression(file, {
            ...options,
            initialQuality: quality,
            fileType
        });
    }

    return { file: compressedFile, format: fileType.split("/")[1] };
}

// --- Compress Images ---
async function compressImages(options, subset = null, targetSizeKB = null) {
    const targetImages = subset || images;
    if (targetImages.length === 0) return;

    if (!subset) progressBar.style.width = "0%";

    const totalImages = targetImages.length;
    const previewItems = document.querySelectorAll(".preview-item");
    let totalCompressed = 0;

    document.querySelectorAll(".remove-btn").forEach(btn => btn.disabled = true);

    if (!subset) compressedFiles = [];

    for (let i = 0; i < totalImages; i++) {
        const file = targetImages[i];
        const globalIndex = images.indexOf(file);
        const progressBarEl = previewItems[globalIndex]?.querySelector(".image-progress-bar");
        const compressedLabel = previewItems[globalIndex]?.querySelectorAll("small")[1];
        const downloadBtn = previewItems[globalIndex]?.querySelector(".download-btn");

        try {
            const result = await compressToTarget(file, options, targetSizeKB);
            const sizeKB = result.file.size / 1024;
            if (compressedLabel) compressedLabel.textContent = `Compressed: ${sizeKB.toFixed(1)} KB`;

            const existingIndex = compressedFiles.findIndex(f => f.original === file);
            if (existingIndex !== -1) {
                compressedFiles[existingIndex] = { original: file, ...result };
            } else {
                compressedFiles.push({ original: file, ...result });
            }

            if (downloadBtn) downloadBtn.disabled = false;
            totalCompressed += result.file.size;
            if (progressBarEl) progressBarEl.style.width = "100%";
        } catch (err) {
            console.error("Compression error:", err);
        }
    }

    if (!subset) {
        document.getElementById("compressed-size").textContent = `Compressed Size: ${(totalCompressed / 1024).toFixed(1)} KB`;
        const totalOriginal = images.reduce((sum, file) => sum + file.size, 0);
        const savedPercent = totalOriginal ? ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1) : "0.0";
        document.getElementById("saved-percent").textContent = `Saved: ${savedPercent}%`;

        progressBar.style.width = "100%";
        document.getElementById("progress-text").textContent = "100%";
    }

    document.querySelectorAll(".remove-btn").forEach(btn => btn.disabled = false);
    document.getElementById("downloadAllBtn").disabled = compressedFiles.length === 0;

    return totalCompressed;
}

// --- Batch Compression ---
async function compressImagesInBatches(options, batchSize = 5, subset = null, targetSizeKB = null) {
    const targetImages = subset || images;
    if (targetImages.length === 0) return;

    const totalImages = targetImages.length;
    let processedCount = 0;
    let totalCompressed = 0;

    // Reset main progress bar and progress text
    progressBar.style.width = "0%";
    document.getElementById("progress-text").textContent = "0%";

    // Reset per-image progress bars
    const previewItems = document.querySelectorAll(".preview-item");
    previewItems.forEach(item => {
        const imgProgressBar = item.querySelector(".image-progress-bar");
        if (imgProgressBar) imgProgressBar.style.width = "0%";
    });

    for (let i = 0; i < totalImages; i += batchSize) {
        const batch = targetImages.slice(i, i + batchSize);
        const batchCompressedSize = await compressImages(options, batch, targetSizeKB);
        totalCompressed += batchCompressedSize;

        processedCount += batch.length;
        const percent = Math.round((processedCount / totalImages) * 100);
        progressBar.style.width = `${percent}%`;
        document.getElementById("progress-text").textContent = `${percent}%`;
    }

    const totalOriginal = images.reduce((sum, file) => sum + file.size, 0);
    document.getElementById("compressed-size").textContent =
        `Compressed Size: ${(totalCompressed / 1024).toFixed(1)} KB`;
    const savedPercent = totalOriginal ? ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1) : "0.0";
    document.getElementById("saved-percent").textContent = `Saved: ${savedPercent}%`;
}


// --- Button Handlers ---
// Compress button
document.getElementById("compressBtn").addEventListener("click", async () => {
    const format = document.getElementById("format").value;
    const maxSizeInput = parseFloat(document.getElementById("maxSize").value);
    let qualityInput = parseFloat(document.getElementById("quality").value);

    if (isNaN(qualityInput) || qualityInput <= 0 || qualityInput > 100) qualityInput = 90;
    let quality = qualityInput / 100;

    let targetSizeKB = null;
    if (maxSizeInput > 0) {
        targetSizeKB = maxSizeInput;
        quality = null;
    }

    const options = {
        useWebWorker: true,
        exifOrientation: -1,
        fileType: format,
        initialQuality: quality
    };

    await compressImagesInBatches(options, 5, null, targetSizeKB);
});

// Download All
document.getElementById("downloadAllBtn").addEventListener("click", async () => {
    if (compressedFiles.length === 0) return alert("Compress images first!");

    const zip = new JSZip();
    compressedFiles.forEach(obj => {
        const ext = obj.format || obj.file.type.split("/")[1];
        zip.file(cleanFileName(obj.original.name).replace(/\.[^/.]+$/, `.${ext}`), obj.file, { binary: true });
    });

    zip.generateAsync({ type: "blob" }).then(content => {
        saveAs(content, "compressed-images.zip");
    });
});

// --- Mutually exclusive inputs (quality vs target size) ---
const qualityInputEl = document.getElementById("quality");
const maxSizeInputEl = document.getElementById("maxSize");

function toggleInputs() {
    const qualityVal = parseFloat(qualityInputEl.value);
    const maxSizeVal = parseFloat(maxSizeInputEl.value);

    if (!isNaN(qualityVal) && qualityVal > 0) {
        maxSizeInputEl.disabled = true;
        qualityInputEl.disabled = false;
    } else if (!isNaN(maxSizeVal) && maxSizeVal > 0) {
        qualityInputEl.disabled = true;
        maxSizeInputEl.disabled = false;
    } else {
        qualityInputEl.disabled = false;
        maxSizeInputEl.disabled = false;
    }
}

// Listen for changes
qualityInputEl.addEventListener("input", toggleInputs);
maxSizeInputEl.addEventListener("input", toggleInputs);

// Run once on load
toggleInputs();
