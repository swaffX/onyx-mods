import { t } from '../i18n/i18n.js';
import { showInfoModal } from './modals/info.js';

// H-04: Module-level state instead of window.* globals to prevent pollution
let compCount = 0;
let compTotal = 0;

let addedFolders = [];
let selectedFolderIndex = -1;
let isProcessing = false;

// C-01: Locale-aware percent formatter
function formatPercent(value) {
    const lang = document.documentElement.lang || 'en';
    return lang === 'tr' ? `%${value}` : `${value}%`;
}

function toggleProcessing(processing) {
    isProcessing = processing;
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const compressSelectedBtn = document.getElementById('compress-selected-btn');
    const uncompressSelectedBtn = document.getElementById('uncompress-selected-btn');
    const addedFoldersList = document.getElementById('added-folders-list');
    const methodBoxes = document.querySelectorAll('.method-box');

    if (selectFolderBtn) selectFolderBtn.disabled = processing;
    if (compressSelectedBtn) compressSelectedBtn.disabled = processing;
    if (uncompressSelectedBtn) uncompressSelectedBtn.disabled = processing;
    
    methodBoxes.forEach(box => {
        box.style.pointerEvents = processing ? 'none' : 'auto';
        box.style.opacity = processing ? '0.5' : '1';
    });

    if (addedFoldersList) {
        addedFoldersList.style.pointerEvents = processing ? 'none' : 'auto';
        addedFoldersList.style.opacity = processing ? '0.6' : '1';
    }
}

const HISTORY_KEY = 'onyx_compression_history';
const HISTORY_MAX = 20;

function saveCompressionHistoryEntry(entry) {
    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : [];
        history.unshift(entry);
        if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (e) { /* silent */ }
}

function renderCompressionHistory() {
    const container = document.getElementById('compression-history-list');
    if (!container) return;

    try {
        const raw = localStorage.getItem(HISTORY_KEY);
        const history = raw ? JSON.parse(raw) : [];

        const emptyEl = document.getElementById('compression-history-empty');
        if (history.length === 0) {
            if (emptyEl) emptyEl.style.display = '';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        // Remove old entries (keep empty placeholder)
        [...container.children].forEach(ch => {
            if (ch.id !== 'compression-history-empty') ch.remove();
        });

        history.forEach(entry => {
            const row = document.createElement('div');
            row.className = 'compression-history-row';
            const date = new Date(entry.ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
            row.innerHTML = `
                <span class="comp-hist-name">${entry.name}</span>
                <span class="comp-hist-algo utag utag-dlss">${entry.algorithm}</span>
                <span class="comp-hist-saved" style="color: var(--accent-color); font-weight: 700;">${entry.spaceSaved}%</span>
                <span class="comp-hist-date" style="color: var(--text-secondary); font-size: 12px;">${date}</span>
            `;
            container.appendChild(row);
        });
    } catch (e) { /* silent */ }
}

export async function initCompress() {
    // C-02: Remove any accumulated progress listeners before adding new ones
    window.electronAPI.removeCompressionProgressListeners();
    renderCompressionHistory();

    // 1. Core Elements
    const selectFolderBtn = document.getElementById('select-folder-btn');
    const compressSelectedBtn = document.getElementById('compress-selected-btn');
    const uncompressSelectedBtn = document.getElementById('uncompress-selected-btn');
    const addedFoldersList = document.getElementById('added-folders-list');

    // Progress Listener
    window.electronAPI.onCompressionProgress((data) => {
        const progressText = document.getElementById('realtime-progress-text');
        const statusText = document.getElementById('realtime-status-text');
        const progressBar = document.getElementById('realtime-progress-bar');
        
        if (progressText && data.progress) {
            // compact.exe output parser — detect [OK] or [SKIPPED] per file
            if (data.progress.includes('[OK]') || data.progress.includes('[SKIPPED]')) {
                compCount++;
                
                // M-06: Guard against compTotal being 0
                if (compTotal > 0) {
                    const percent = Math.min(99, Math.round((compCount / compTotal) * 100));
                    // C-01: Use locale-aware percent format
                    progressText.textContent = formatPercent(percent);
                    if (progressBar) progressBar.style.width = `${percent}%`;
                    // H-10: Use textContent to avoid XSS
                    if (statusText) statusText.textContent = `${compCount} / ${compTotal} ${t('compress.filesProcessed')}`;
                }
            } else if (
                // H-06: Locale-independent completion detection: if compCount reaches compTotal
                compTotal > 0 && compCount >= compTotal
            ) {
                progressText.textContent = formatPercent(100);
                if (progressBar) progressBar.style.width = '100%';
                if (statusText) statusText.textContent = t('compress.completed');
            }
        }
    });


    // 3. Folder Selection
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', async () => {
            if (isProcessing) return;
            const folderPath = await window.electronAPI.selectFolder();
            if (folderPath) {
                addFolderToList(folderPath);
            }
        });
    }

    if (addedFoldersList) {
        addedFoldersList.addEventListener('click', (e) => {
            if (isProcessing) return;
            const item = e.target.closest('.folder-item');
            if (item) {
                const index = parseInt(item.getAttribute('data-index'));
                selectFolder(index);
            }
        });
    }

    // 4. Execution
    if (compressSelectedBtn) {
        compressSelectedBtn.addEventListener('click', async () => {
            if (selectedFolderIndex === -1 || isProcessing) return;
            const folder = addedFolders[selectedFolderIndex];

            // H-04: Use module-level state variables
            compCount = 0;
            compTotal = parseInt(String(folder.fileCount).replace(/[^0-9]/g, '')) || 0;
            
            toggleProcessing(true);
            
            const statsSection = document.getElementById('compression-stats-section');
            const progressContainer = document.getElementById('realtime-progress-container');
            const methodSection = document.getElementById('compression-method-section');
            const methodContainer = document.getElementById('detected-method-container');
            const actualStatsContainer = document.getElementById('compression-actual-stats');

            statsSection.style.display = 'flex';
            progressContainer.style.display = 'block';
            methodSection.style.display = 'none';
            if (methodContainer) methodContainer.style.display = 'none';
            if (actualStatsContainer) actualStatsContainer.style.display = 'none';

            const realtimeProgressBar = document.getElementById('realtime-progress-bar');
            if (realtimeProgressBar) realtimeProgressBar.style.width = '0%';
            // C-01: Locale-aware
            document.getElementById('realtime-progress-text').textContent = formatPercent(0);

            try {
                const result = await window.electronAPI.runCompression({
                    folderPath: folder.path,
                    algorithm: folder.method
                });
                if (result.success) {
                    // H-06: Force 100% on success
                    if (realtimeProgressBar) realtimeProgressBar.style.width = '100%';
                    document.getElementById('realtime-progress-text').textContent = formatPercent(100);
                    const statusText = document.getElementById('realtime-status-text');
                    if (statusText) statusText.textContent = t('compress.completed');

                    // Save compression history entry
                    const spaceSaved = (folder.rawUncompressedBytes && folder.rawCompressedBytes && folder.rawUncompressedBytes > 0)
                        ? Math.max(0, Math.round(((folder.rawUncompressedBytes - folder.rawCompressedBytes) / folder.rawUncompressedBytes) * 100))
                        : 0;
                    saveCompressionHistoryEntry({
                        name: folder.name,
                        algorithm: folder.method,
                        spaceSaved,
                        ts: Date.now()
                    });
                    renderCompressionHistory();

                    showInfoModal(t('opti.successTitle'), t('compress.compressDone'));
                }
            } catch (e) {
                // H-11: Translate error codes from main process
                const msg = translateErrorCode(e.message);
                showInfoModal(t('opti.errorTitle'), t('compress.genericError') + msg, true);
            } finally {
                toggleProcessing(false);
                const progressContainerFinal = document.getElementById('realtime-progress-container');
                if (progressContainerFinal) progressContainerFinal.style.display = 'none';
                
                await refreshFolderState(folder);
            }
        });
    }

    if (uncompressSelectedBtn) {
        uncompressSelectedBtn.addEventListener('click', async () => {
            if (selectedFolderIndex === -1 || isProcessing) return;
            const folder = addedFolders[selectedFolderIndex];

            // Uncompress: no percent display needed (user request)
            // Set compTotal=0 so the progress listener won't update the bar
            compCount = 0;
            compTotal = 0;
            
            toggleProcessing(true);
            
            const statsSection = document.getElementById('compression-stats-section');
            const progressContainer = document.getElementById('realtime-progress-container');
            const methodSection = document.getElementById('compression-method-section');
            const actualStatsContainer = document.getElementById('compression-actual-stats');
            const realtimeProgressBarContainer = progressContainer ? progressContainer.querySelector('.comp-progress-container') : null;
            const progressText = document.getElementById('realtime-progress-text');
            const statusText = document.getElementById('realtime-status-text');

            statsSection.style.display = 'flex';
            progressContainer.style.display = 'block';
            methodSection.style.display = 'none';
            if (actualStatsContainer) actualStatsContainer.style.display = 'none';

            // Hide the percent text and bar, just show processing status
            if (realtimeProgressBarContainer) realtimeProgressBarContainer.style.display = 'none';
            if (progressText) progressText.style.display = 'none';
            if (statusText) statusText.textContent = t('compress.processing');

            try {
                const result = await window.electronAPI.runUncompression({ folderPath: folder.path });
                if (result.success) {
                    if (statusText) statusText.textContent = t('compress.completed');
                    showInfoModal(t('opti.successTitle'), t('compress.uncompressDone'));
                }
            } catch (e) {
                const msg = translateErrorCode(e.message);
                showInfoModal(t('opti.errorTitle'), t('compress.genericError') + msg, true);
            } finally {
                toggleProcessing(false);
                // Restore bar/text visibility for next compress operation
                if (realtimeProgressBarContainer) realtimeProgressBarContainer.style.display = '';
                if (progressText) progressText.style.display = '';
                const progressContainerFinal = document.getElementById('realtime-progress-container');
                if (progressContainerFinal) progressContainerFinal.style.display = 'none';
                
                await refreshFolderState(folder);
            }
        });
    }

    // 5. Watcher & Method UI
    const methodBoxes = document.querySelectorAll('.method-box');
    methodBoxes.forEach(box => {
        box.addEventListener('click', () => {
            if (selectedFolderIndex !== -1 && !isProcessing) {
                const method = box.getAttribute('data-method');
                addedFolders[selectedFolderIndex].method = method;
                updateMethodUI(method, addedFolders[selectedFolderIndex]);
            }
        });
    });
}

// H-11: Translate error codes from main process to localized messages
function translateErrorCode(errorMsg) {
    if (errorMsg.includes('ERR_FOLDER_NOT_FOUND')) return t('compress.errFolderNotFound');
    if (errorMsg.includes('ERR_INVALID_ALGORITHM')) return t('compress.errInvalidAlgorithm');
    if (errorMsg.includes('ERR_SPAWN_FAILED')) return t('compress.errSpawnFailed');
    if (errorMsg.includes('ERR_COMPRESS_FAILED')) return errorMsg.replace('ERR_COMPRESS_FAILED:', t('compress.errCompressFailed') + ' (code: ');
    if (errorMsg.includes('ERR_COMPACT_FAILED')) return errorMsg.replace('ERR_COMPACT_FAILED:', t('compress.errCompressFailed') + ' (code: ');
    return errorMsg;
}

async function addFolderToList(path) {
    const name = path.split(/[\\\/]/).pop() || path;
    const newFolder = {
        name: name,
        path: path,
        size: t('compress.analyzing'),
        fileCount: '...',
        method: 'XPRESS4K',
        isCompressed: false,
        isAnalyzing: true
    };

    addedFolders.push(newFolder);
    renderFolderList();
    selectFolder(addedFolders.length - 1);
    document.querySelector('.compress-action-group').style.display = 'flex';

    await refreshFolderState(newFolder);
}

async function refreshFolderState(folder) {
    folder.isAnalyzing = true;
    folder.size = t('compress.analyzing');
    renderFolderList();
    updateDetailsView(folder);

    try {
        const stats = await window.electronAPI.analyzeFolder(folder.path);

        folder.size = formatBytes(stats.uncompressedBytes);
        folder.rawUncompressedBytes = stats.uncompressedBytes;
        folder.compressedSize = formatBytes(stats.compressedBytes);
        folder.rawCompressedBytes = stats.compressedBytes; // Populated correctly
        folder.fileCount = stats.fileCount.toLocaleString();
        folder.isCompressed = stats.isCompressed;
        folder.compressionRatio = stats.ratio;
        folder.isAnalyzing = false;

        if (selectedFolderIndex === addedFolders.indexOf(folder)) {
            updateDetailsView(folder);
        }
        renderFolderList();
    } catch (e) {
        console.error('Analysis error:', e);
        folder.isAnalyzing = false;
        folder.size = t('compress.error');
        if (selectedFolderIndex === addedFolders.indexOf(folder)) {
            updateDetailsView(folder);
        }
    }
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function renderFolderList() {
    const listContainer = document.getElementById('added-folders-list');
    listContainer.innerHTML = '';

    addedFolders.forEach((folder, index) => {
        const item = document.createElement('div');
        item.className = `folder-item ${index === selectedFolderIndex ? 'active' : ''}`;
        item.setAttribute('data-index', index);
        
        // H-10: Use textContent for user-controlled values (XSS prevention)
        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-item-name';
        nameSpan.textContent = folder.name;

        const pathSpan = document.createElement('span');
        pathSpan.className = 'folder-item-path';
        pathSpan.textContent = folder.path;

        if (folder.isAnalyzing) {
            const spinner = document.createElement('span');
            spinner.className = 'loading-spinner-small';
            item.appendChild(spinner);
        } else if (folder.isCompressed) {
            const checkmark = document.createElement('span');
            checkmark.style.cssText = 'color:var(--accent-color); float:right;';
            checkmark.textContent = '✓';
            item.appendChild(checkmark);
        }

        item.appendChild(nameSpan);
        item.appendChild(pathSpan);
        listContainer.appendChild(item);
    });
}

function selectFolder(index) {
    selectedFolderIndex = index;
    const folder = addedFolders[index];
    renderFolderList();
    updateDetailsView(folder);
    document.getElementById('folder-details-view').style.display = 'flex';
}

function updateDetailsView(folder) {
    // H-10: textContent for all user data
    document.getElementById('detail-folder-name').textContent = folder.name;
    document.getElementById('detail-folder-path').textContent = folder.path;
    document.getElementById('detail-folder-size').textContent = folder.isAnalyzing ? t('compress.analyzing') : folder.size;
    document.getElementById('detail-file-count').textContent = folder.isAnalyzing ? '...' : folder.fileCount;

    const compressBtn = document.getElementById('compress-selected-btn');
    const uncompressBtn = document.getElementById('uncompress-selected-btn');

    if (folder.isAnalyzing) {
        compressBtn.disabled = true;
        uncompressBtn.style.display = 'none';
        compressBtn.textContent = t('compress.analyzing2');
        
        // Hide stats section and actual stats during analysis
        const statsSection = document.getElementById('compression-stats-section');
        const methodSection = document.getElementById('compression-method-section');
        if (statsSection) statsSection.style.display = 'none';
        if (methodSection) methodSection.style.display = 'none';
    } else {
        compressBtn.disabled = false;
        if (folder.isCompressed) {
            // M-19: Fixed double parentheses: "Re-Compress (Ratio: (1.5:1)" → "Re-Compress (1.5:1)"
            compressBtn.textContent = `${t('compress.reCompress')} (${folder.compressionRatio}:1)`;
            uncompressBtn.style.display = 'block';

            // Update Statistics Bar — show method but NOT size savings (per user requirement)
            const methodContainer = document.getElementById('detected-method-container');
            const methodNameEl = document.getElementById('detected-method-name');
            if (methodContainer && methodNameEl && folder.gameInfo && folder.gameInfo.algorithm) {
                methodContainer.style.display = 'flex';
                methodNameEl.textContent = folder.gameInfo.algorithm;
            } else if (methodContainer) {
                methodContainer.style.display = 'none';
            }

            // Update Statistics
            const rawSizeEl = document.getElementById('detail-folder-size-raw');
            const compSizeEl = document.getElementById('detail-folder-compressed-size');
            const savedPercentEl = document.getElementById('compression-saved-percent');

            if (rawSizeEl) rawSizeEl.textContent = folder.size;
            if (compSizeEl) compSizeEl.textContent = folder.compressedSize || folder.size;

            let savedPercent = 0;
            if (folder.rawUncompressedBytes && folder.rawCompressedBytes && folder.rawUncompressedBytes > 0) {
                savedPercent = Math.max(0, Math.round(((folder.rawUncompressedBytes - folder.rawCompressedBytes) / folder.rawUncompressedBytes) * 100));
            }

            if (savedPercentEl) {
                const lang = document.documentElement.lang || 'en';
                const parentNode = savedPercentEl.parentNode;
                if (parentNode) {
                    if (lang === 'tr') {
                        parentNode.innerHTML = `Diskte <span id="compression-saved-percent" style="color: var(--accent-color); font-weight: bold;">%${savedPercent}</span> oranında yer açıldı.`;
                    } else {
                        parentNode.innerHTML = `<span id="compression-saved-percent" style="color: var(--accent-color); font-weight: bold;">${savedPercent}%</span> of disk space saved.`;
                    }
                }
            }

            const statsSection = document.getElementById('compression-stats-section');
            const methodSection = document.getElementById('compression-method-section');
            const actualStatsContainer = document.getElementById('compression-actual-stats');
            if (statsSection && methodSection) {
                statsSection.style.display = 'flex';
                methodSection.style.display = 'none';
                if (actualStatsContainer) actualStatsContainer.style.display = 'flex';

                // Show compression ratio bar (not size saving %) — only show ratio
                const currentPercent = folder.rawUncompressedBytes && folder.rawCompressedBytes && folder.rawUncompressedBytes > 0 
                    ? Math.round((folder.rawCompressedBytes / folder.rawUncompressedBytes) * 100)
                    : 100;

                document.getElementById('compression-bar').style.width = currentPercent + '%';
            }
        } else {
            compressBtn.textContent = t('compress.compressBtn');
            uncompressBtn.style.display = 'none';
            const statsSection = document.getElementById('compression-stats-section');
            const methodSection = document.getElementById('compression-method-section');
            const actualStatsContainer = document.getElementById('compression-actual-stats');
            if (statsSection && methodSection) {
                statsSection.style.display = 'none';
                methodSection.style.display = 'block';
                if (actualStatsContainer) actualStatsContainer.style.display = 'none';
            }
        }
    }

    updateMethodUI(folder.method, folder);
}

function updateMethodUI(selectedMethod, folder = null) {
    const methodBoxes = document.querySelectorAll('.method-box');

    methodBoxes.forEach(box => {
        const method = box.getAttribute('data-method');
        box.classList.toggle('active', method === selectedMethod);
        
        const infoEl = box.querySelector('.method-info');
        // Default info labels only — DB result size data removed per user requirement
        if (method === 'XPRESS4K') infoEl.textContent = t('compress.x4kInfo');
        else if (method === 'XPRESS8K') infoEl.textContent = t('compress.x8kInfo');
        else if (method === 'XPRESS16K') infoEl.textContent = t('compress.x16kInfo');
        else if (method === 'LZX') infoEl.textContent = t('compress.lzxInfo');
    });
}
