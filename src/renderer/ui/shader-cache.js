import { t } from '../i18n/i18n.js';
import { showInfoModal } from './modals/info.js';

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

let cacheData = [];

function updateTotalLabel() {
    const totalEl = document.getElementById('shader-cache-total');
    if (!totalEl) return;
    const checked = cacheData.filter(c => c._checked);
    const totalBytes = checked.reduce((sum, c) => sum + c.sizeBytes, 0);
    totalEl.textContent = checked.length > 0 ? `${checked.length} öğe seçili — ${formatBytes(totalBytes)}` : '';
}

function renderCacheList(data) {
    const listEl = document.getElementById('shader-cache-list');
    const loadingEl = document.getElementById('shader-cache-loading');
    const emptyEl = document.getElementById('shader-cache-empty');
    const actionsEl = document.getElementById('shader-cache-actions');
    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'none';

    if (!data || data.length === 0) {
        listEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'block';
        if (actionsEl) actionsEl.style.display = 'none';
        return;
    }

    if (emptyEl) emptyEl.style.display = 'none';
    listEl.style.display = 'flex';
    if (actionsEl) actionsEl.style.display = 'flex';

    listEl.innerHTML = '';
    data.forEach((cache, idx) => {
        cache._checked = false;
        const item = document.createElement('div');
        item.className = 'shader-cache-item';
        item.innerHTML = `
            <input type="checkbox" data-idx="${idx}">
            <span class="shader-cache-item-name">${cache.name}</span>
            <span class="shader-cache-item-size">${formatBytes(cache.sizeBytes)}</span>
        `;
        const cb = item.querySelector('input[type="checkbox"]');
        cb.addEventListener('change', () => {
            cache._checked = cb.checked;
            item.classList.toggle('selected', cb.checked);
            updateTotalLabel();
        });
        item.addEventListener('click', (e) => {
            if (e.target === cb) return;
            cb.checked = !cb.checked;
            cb.dispatchEvent(new Event('change'));
        });
        listEl.appendChild(item);
    });
    updateTotalLabel();
}

export function initShaderCache() {
    const toolsTab = document.getElementById('tools');
    if (!toolsTab) return;

    // Load when tools tab is activated
    document.addEventListener('tab-activated', (e) => {
        if (e.detail.tabId === 'tools') loadShaderCache();
    });

    // Select All button
    const selectAllBtn = document.getElementById('shader-cache-select-all-btn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#shader-cache-list input[type="checkbox"]');
            const allChecked = [...checkboxes].every(cb => cb.checked);
            checkboxes.forEach((cb, idx) => {
                cb.checked = !allChecked;
                cacheData[idx]._checked = !allChecked;
                cb.closest('.shader-cache-item')?.classList.toggle('selected', !allChecked);
            });
            updateTotalLabel();
        });
    }

    // Clean button
    const cleanBtn = document.getElementById('shader-cache-clean-btn');
    if (cleanBtn) {
        cleanBtn.addEventListener('click', async () => {
            const selected = cacheData.filter(c => c._checked);
            if (selected.length === 0) return;

            cleanBtn.disabled = true;
            cleanBtn.textContent = 'Temizleniyor...';

            try {
                const paths = selected.map(c => c.path);
                const result = await window.electronAPI.cleanShaderCache(paths);
                if (result.success) {
                    const freed = formatBytes(result.freedBytes || 0);
                    showInfoModal('Shader Cache Temizlendi', `${freed} disk alanı boşaltıldı.`);
                    await loadShaderCache();
                } else {
                    showInfoModal('Hata', result.error || 'Temizleme başarısız.', true);
                }
            } catch (e) {
                showInfoModal('Hata', e.message, true);
            } finally {
                cleanBtn.disabled = false;
                cleanBtn.textContent = t('tools.shaderCacheClean') || 'Seçilenleri Temizle';
            }
        });
    }
}

async function loadShaderCache() {
    const loadingEl = document.getElementById('shader-cache-loading');
    const listEl = document.getElementById('shader-cache-list');
    const emptyEl = document.getElementById('shader-cache-empty');
    const actionsEl = document.getElementById('shader-cache-actions');

    if (loadingEl) loadingEl.style.display = 'block';
    if (listEl) listEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'none';
    if (actionsEl) actionsEl.style.display = 'none';

    try {
        cacheData = await window.electronAPI.getShaderCacheInfo();
        renderCacheList(cacheData);
    } catch (e) {
        if (loadingEl) { loadingEl.textContent = 'Yüklenemedi: ' + e.message; }
    }
}
