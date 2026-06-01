/**
 * updates-tab.js — Güncellemeler sekmesi UI mantığı
 *
 * Durum makinesi: idle → checking → available → downloading → downloaded
 *                                              ↘ error (herhangi bir aşamada)
 */

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initUpdatesTab() {
    // Mevcut uygulama versiyonunu göster
    const versionEl = document.getElementById('current-app-version');
    if (versionEl && window.electronAPI.getAppVersion) {
        window.electronAPI.getAppVersion().then(v => {
            versionEl.textContent = `v${v}`;
        }).catch(() => {});
    }

    _setupButtonListeners();
    _setupIpcListeners();
}

// ─── Buton Listener'ları ──────────────────────────────────────────────────────

function _setupButtonListeners() {
    document.getElementById('check-updates-btn')?.addEventListener('click', async () => {
        _setState('checking');
        try {
            await window.electronAPI.checkForUpdatesManual();
            // Sonuç IPC event'leri ile gelir (update-available / update-not-available)
        } catch (e) {
            _setState('error', e.message || 'Bilinmeyen hata');
        }
    });

    document.getElementById('download-update-btn')?.addEventListener('click', () => {
        _setState('downloading');
        window.electronAPI.startUpdateDownload();
    });

    document.getElementById('install-update-btn')?.addEventListener('click', () => {
        window.electronAPI.quitAndInstall();
    });
}

// ─── IPC Event Listener'ları ──────────────────────────────────────────────────

function _setupIpcListeners() {
    // Önce eski listener'ları temizle (tekrar init edilirse birikiyor)
    window.electronAPI.removeUpdateListeners?.();

    window.electronAPI.onUpdateChecking(() => {
        _setState('checking');
    });

    window.electronAPI.onUpdateAvailable((info) => {
        _setState('available', info);
    });

    window.electronAPI.onUpdateNotAvailable(() => {
        _setState('idle', null, true); // isLatest = true
    });

    window.electronAPI.onUpdateDownloadProgress((data) => {
        _updateProgressBar(data.percent, data.bytesPerSecond);
    });

    window.electronAPI.onUpdateDownloaded((info) => {
        _setState('downloaded', info);
    });

    window.electronAPI.onUpdateError((msg) => {
        _setState('error', msg);
    });
}

// ─── Durum Makinesi ───────────────────────────────────────────────────────────

/**
 * @param {'idle'|'checking'|'available'|'downloading'|'downloaded'|'error'} state
 * @param {object|string|null} data
 * @param {boolean} isLatest
 */
function _setState(state, data = null, isLatest = false) {
    const $ = (id) => document.getElementById(id);

    const statusCard   = $('update-status-card');
    const statusIcon   = $('update-status-icon');
    const statusMsg    = $('update-status-message');
    const checkBtn     = $('check-updates-btn');
    const newVerBlock  = $('update-new-version-block');
    const newVerBadge  = $('update-new-version-badge');
    const releaseNotes = $('update-release-notes');
    const downloadBtn  = $('download-update-btn');
    const installBtn   = $('install-update-btn');
    const progressWrap = $('update-progress-wrapper');
    const progressBar  = $('update-progress-bar');
    const progressText = $('update-progress-text');

    if (!statusCard) return; // Sekme henüz DOM'a yüklenmediyse çık

    // Hepsini varsayılana sıfırla
    newVerBlock.style.display  = 'none';
    progressWrap.style.display = 'none';
    downloadBtn.style.display  = 'none';
    installBtn.style.display   = 'none';
    checkBtn.disabled          = false;
    statusCard.className       = 'update-status-card';

    switch (state) {
        case 'idle':
            statusIcon.textContent = isLatest ? '✅' : '⏸️';
            statusMsg.textContent  = isLatest
                ? 'En güncel sürümü kullanıyorsunuz.'
                : 'Güncelleme kontrolü yapılmadı.';
            checkBtn.textContent   = 'Güncelleme Kontrol Et';
            statusCard.classList.add(isLatest ? 'status-latest' : 'status-idle');
            break;

        case 'checking':
            statusIcon.textContent = '🔄';
            statusMsg.textContent  = 'Sunucu kontrol ediliyor...';
            checkBtn.textContent   = 'Kontrol ediliyor...';
            checkBtn.disabled      = true;
            statusCard.classList.add('status-checking');
            break;

        case 'available':
            statusIcon.textContent = '🔔';
            statusMsg.textContent  = `Yeni sürüm mevcut: v${data?.version}`;
            checkBtn.textContent   = 'Tekrar Kontrol Et';
            statusCard.classList.add('status-available');

            newVerBadge.textContent = `v${data?.version ?? ''}`;
            releaseNotes.innerHTML  = _formatReleaseNotes(data?.releaseNotes);
            newVerBlock.style.display  = 'block';
            downloadBtn.style.display  = 'inline-flex';
            break;

        case 'downloading':
            statusIcon.textContent     = '⬇️';
            statusMsg.textContent      = 'Güncelleme indiriliyor...';
            checkBtn.disabled          = true;
            statusCard.classList.add('status-downloading');
            newVerBlock.style.display  = 'block';
            progressWrap.style.display = 'flex';
            progressBar.style.width    = '0%';
            progressText.textContent   = '0%';
            break;

        case 'downloaded':
            statusIcon.textContent     = '✅';
            statusMsg.textContent      = 'Güncelleme indirildi — kuruluma hazır.';
            checkBtn.disabled          = true;
            statusCard.classList.add('status-downloaded');
            newVerBlock.style.display  = 'block';
            progressWrap.style.display = 'flex';
            progressBar.style.width    = '100%';
            progressText.textContent   = '100%';
            installBtn.style.display   = 'inline-flex';
            break;

        case 'error':
            statusIcon.textContent = '❌';
            statusMsg.textContent  = `Hata: ${data ?? 'Bilinmeyen hata'}`;
            checkBtn.textContent   = 'Tekrar Dene';
            statusCard.classList.add('status-error');
            break;
    }
}

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

function _updateProgressBar(percent, bytesPerSec) {
    const bar  = document.getElementById('update-progress-bar');
    const text = document.getElementById('update-progress-text');
    if (!bar || !text) return;

    const p = Math.min(100, Math.max(0, Math.floor(percent)));
    bar.style.width = `${p}%`;

    if (bytesPerSec) {
        const speed = bytesPerSec > 1024 * 1024
            ? `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`
            : `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
        text.textContent = `${p}% — ${speed}`;
    } else {
        text.textContent = `${p}%`;
    }
}

function _formatReleaseNotes(notes) {
    if (!notes) return '<p style="color:var(--text-secondary);">Değişiklik notları mevcut değil.</p>';
    // GitHub release notes genellikle Markdown gelir; temel formatting uygula
    return `<pre style="margin:0; white-space:pre-wrap; font-family:inherit;">${_escapeHtml(notes)}</pre>`;
}

function _escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
