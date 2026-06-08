function formatBytes(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

let diskUsageLoaded = false;

export function initDiskUsage() {
    // Load once when home tab is first shown or on app start
    document.addEventListener('tab-activated', (e) => {
        if (e.detail.tabId === 'home' && !diskUsageLoaded) {
            loadDiskUsage();
        }
    });

    // Also try to load after a short delay on startup (home tab is default)
    setTimeout(() => {
        const homeTab = document.getElementById('home');
        if (homeTab && homeTab.classList.contains('active') && !diskUsageLoaded) {
            loadDiskUsage();
        }
    }, 1500);
}

async function loadDiskUsage() {
    const loadingEl = document.getElementById('disk-usage-loading');
    const listEl = document.getElementById('disk-usage-list');
    if (!listEl) return;

    diskUsageLoaded = true;

    const items = [];
    let maxBytes = 0;

    window.electronAPI.onDiskUsageProgress((data) => {
        if (data.done) {
            renderDiskUsage(items, maxBytes, listEl, loadingEl);
            window.electronAPI.removeDiskUsageListeners();
            return;
        }
        items.push({ name: data.name, sizeBytes: data.sizeBytes });
        if (data.sizeBytes > maxBytes) maxBytes = data.sizeBytes;
    });

    try {
        await window.electronAPI.getGamesDiskUsage();
    } catch (e) {
        if (loadingEl) loadingEl.textContent = 'Disk kullanımı alınamadı.';
    }
}

function renderDiskUsage(items, maxBytes, listEl, loadingEl) {
    if (loadingEl) loadingEl.style.display = 'none';

    if (items.length === 0) {
        listEl.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);padding:8px 0;">Oyun bulunamadı.</div>';
        listEl.style.display = 'block';
        return;
    }

    // Sort by size descending, show top 10
    items.sort((a, b) => b.sizeBytes - a.sizeBytes);
    const top = items.slice(0, 10);

    listEl.innerHTML = '';
    top.forEach(item => {
        const pct = maxBytes > 0 ? Math.round((item.sizeBytes / maxBytes) * 100) : 0;
        const div = document.createElement('div');
        div.className = 'disk-usage-item';
        div.innerHTML = `
            <span class="disk-usage-item-name" title="${item.name}">${item.name}</span>
            <div class="disk-usage-bar-wrap"><div class="disk-usage-bar" style="width:${pct}%"></div></div>
            <span class="disk-usage-item-size">${formatBytes(item.sizeBytes)}</span>
        `;
        listEl.appendChild(div);
    });
    listEl.style.display = 'flex';
}
