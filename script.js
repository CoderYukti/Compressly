let images = [];
let compressedFiles = []; // store compressed files for individual/download all

const uploadInput = document.getElementById("upload");
const dropArea = document.getElementById("drop-area");
const previewContainer = document.getElementById("preview");
const progressBar = document.getElementById("progress-bar");

// Load saved settings
window.addEventListener("load", () => {
    const savedQuality = localStorage.getItem("quality");
    const savedFormat = localStorage.getItem("format");
    if (savedQuality) document.getElementById("quality").value = savedQuality;
    if (savedFormat) document.getElementById("format").value = savedFormat;
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
        document.getElementById("optimizeBtn").disabled = true;
        document.getElementById("downloadAllBtn").disabled = true;
        return;
    }

    document.getElementById("compressBtn").disabled = false;
    document.getElementById("optimizeBtn").disabled = false;

    images.forEach(file => {
        const reader = new FileReader();
        reader.onload = ev => {
            const div = document.createElement("div");
            div.className = "preview-item";

            const img = document.createElement("img");
            img.src = ev.target.result;

            // Remove button
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "remove-btn";
            removeBtn.textContent = "×";
            removeBtn.addEventListener("click", () => {
                images = images.filter(f => f !== file);
                compressedFiles = compressedFiles.filter(f => f.original !== file); // remove from compressed if exists
                renderPreview();
                updateOriginalSize();
            });

            // Original size label
            const sizeLabel = document.createElement("small");
            sizeLabel.textContent = `Original: ${(file.size / 1024).toFixed(1)} KB`;

            // Compressed size label placeholder
            const compressedLabel = document.createElement("small");
            compressedLabel.textContent = `Compressed: 0 KB`;

            // Download individual button
            const downloadBtn = document.createElement("button");
            downloadBtn.textContent = "Download";
            downloadBtn.className = "download-btn";
            downloadBtn.disabled = true;
            downloadBtn.addEventListener("click", () => {
                const compFile = compressedFiles.find(f => f.original === file)?.file;
                if (compFile) {
                    const ext = compFile.type.split("/")[1];
                    saveAs(compFile, cleanFileName(file.name).replace(/\.[^/.]+$/, `.${ext}`));
                }
            });

            // Individual progress bar
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
    // ✅ Add list-mode class here
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

// Compress Images function (compress only, no download)
async function compressImages(options, subset = null) {
    const targetImages = subset || images;
    if (targetImages.length === 0) return alert("Upload images first!");

    // Reset main progress bar at the **start**, not the end
    if (!subset) progressBar.style.width = "0%";

    const totalImages = targetImages.length;
    const previewItems = document.querySelectorAll(".preview-item");
    let totalCompressed = 0;

    document.querySelectorAll(".remove-btn").forEach(btn => btn.disabled = true);

    if (!subset) compressedFiles = []; // reset only when doing full set

    for (let i = 0; i < totalImages; i++) {
        const file = targetImages[i];
        const globalIndex = images.indexOf(file);
        const progressBarEl = previewItems[globalIndex].querySelector(".image-progress-bar");
        const compressedLabel = previewItems[globalIndex].querySelectorAll("small")[1];
        const downloadBtn = previewItems[globalIndex].querySelector(".download-btn");

        try {
            const compressedFile = await imageCompression(file, {
                ...options,
                exifOrientation: -1,
                onProgress: p => {
                    progressBarEl.style.width = `${p}%`;
                }
            });

            compressedLabel.textContent = `Compressed: ${(compressedFile.size / 1024).toFixed(1)} KB`;
            compressedFiles.push({ original: file, file: compressedFile });
            downloadBtn.disabled = false;

            totalCompressed += compressedFile.size;
        } catch (err) {
            console.error("Compression error:", err);
        }
    }

    // Only update totals if this was a full run, not just a batch
    if (!subset) {
        document.getElementById("compressed-size").textContent = `Compressed Size: ${(totalCompressed / 1024).toFixed(1)} KB`;
        const totalOriginal = images.reduce((sum, file) => sum + file.size, 0);
        const savedPercent = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1);
        document.getElementById("saved-percent").textContent = `Saved: ${savedPercent}%`;

        progressBar.style.width = "100%";
        document.getElementById("progress-text").textContent = `100%`;
    }

    document.querySelectorAll(".remove-btn").forEach(btn => btn.disabled = false);
    document.getElementById("downloadAllBtn").disabled = compressedFiles.length === 0;

    return totalCompressed; // ✅ return batch compressed size
}

// ✅ New Batch Compression
async function compressImagesInBatches(options, batchSize = 5) {
    if (images.length === 0) return alert("Upload images first!");
    const totalImages = images.length;
    let processedCount = 0;
    let totalCompressed = 0; // ✅ global compressed size tracker

    progressBar.style.width = "0%";

    for (let i = 0; i < totalImages; i += batchSize) {
        const batch = images.slice(i, i + batchSize);

        // compressImages should now RETURN the total size of compressed batch
        const batchCompressedSize = await compressImages(options, batch);
        totalCompressed += batchCompressedSize; // ✅ accumulate batch result

        processedCount += batch.length;
        const percent = Math.round((processedCount / totalImages) * 100);
        progressBar.style.width = `${percent}%`;
        document.getElementById("progress-text").textContent = `${percent}%`;
    }

    // ✅ After ALL batches, update totals correctly
    const totalOriginal = images.reduce((sum, file) => sum + file.size, 0);
    document.getElementById("compressed-size").textContent =
        `Compressed Size: ${(totalCompressed / 1024).toFixed(1)} KB`;

    const savedPercent = ((totalOriginal - totalCompressed) / totalOriginal * 100).toFixed(1);
    document.getElementById("saved-percent").textContent = `Saved: ${savedPercent}%`;
}


// Compress button click
document.getElementById("compressBtn").addEventListener("click", async () => {
    const quality = document.getElementById("quality").value / 100;
    const format = document.getElementById("format").value;

    const options = {
        useWebWorker: true,
        initialQuality: quality,
        fileType: format,
        exifOrientation: -1
    };

    // ✅ Use batching now
    await compressImagesInBatches(options, 5);
});

// Download All button click
document.getElementById("downloadAllBtn").addEventListener("click", async () => {
    if (compressedFiles.length === 0) return alert("Compress images first!");

    const zip = new JSZip();
    compressedFiles.forEach(obj => {
        const ext = obj.file.type.split("/")[1];
        zip.file(cleanFileName(obj.original.name).replace(/\.[^/.]+$/, `.${ext}`), obj.file, { binary: true });
    });

    zip.generateAsync({ type: "blob" }).then(content => {
        saveAs(content, "compressed-images.zip");
    });
});

// One-Click Web Optimize (unchanged)
document.getElementById("optimizeBtn").addEventListener("click", async () => {
    const options = {
        maxWidthOrHeight: null,
        useWebWorker: true,
        initialQuality: 0.8,
        fileType: "image/webp",
        exifOrientation: -1
    };
    await compressImagesInBatches(options, 5); // ✅ batch version
});
