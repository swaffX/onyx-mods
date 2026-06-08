import { initTheme } from './ui/theme.js';
import { initNavigation } from './ui/navigation.js';
import { initOnboarding } from './ui/onboarding.js';
import { initBaseModals } from './ui/modals/base.js';
import { initInfoModal } from './ui/modals/info.js';
import { initGames, initGamesListeners } from './ui/games.js';
import { initBlacklistListeners } from './ui/blacklist.js';
import { initSettingsListeners, renderUserGamesUI } from './ui/settings.js';
import { initCompress } from './ui/compress.js';
import { initDlssListeners } from './ui/modals/dlss.js';
import { initOptiListeners } from './ui/modals/opti.js';
import { initOptiPatcherListeners } from './ui/modals/optiPatcher.js';
import { initFsr4Listeners } from './ui/modals/fsr4.js';
import { initStreamlineListeners } from './ui/modals/streamline.js';
import { initUpdateListeners } from './ui/modals/update.js';
import { initModSelectionListeners } from './ui/modals/modSelection.js';
import { initSettingsListeners as initModalSettingsListeners } from './ui/modals/settings.js';
import { initDlssVersionListeners } from './ui/modals/dlssVersions.js';
import { initUpdatesTab } from './ui/updates-tab.js';
import { initFreeGames } from './ui/free-games.js';
import { initShaderCache } from './ui/shader-cache.js';
import { initDiskUsage } from './ui/disk-usage.js';
import { initI18n, setLanguage, getCurrentLang, applyTranslations } from './i18n/i18n.js';


document.addEventListener('DOMContentLoaded', async () => {
    // 0. i18n — must run before any UI renders
    initI18n();

    // Language select dropdown (top-right)
    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
        langSelect.value = getCurrentLang();
        langSelect.addEventListener('change', () => {
            setLanguage(langSelect.value);
        });
    }

    // Re-render dynamic UI on language change
    document.addEventListener('language-changed', () => {
        // Re-render games list with fresh language strings
        initGames();
    });

    // 1. Core UI Navigation and Theme
    initNavigation();
    initTheme();

    // 2. Modals Event Listeners
    initBaseModals();
    initInfoModal();
    initDlssListeners();
    initOptiListeners();
    initOptiPatcherListeners();
    initFsr4Listeners();
    initStreamlineListeners();
    initUpdateListeners();
    initModSelectionListeners();
    initModalSettingsListeners();
    initDlssVersionListeners();

    // 3. Page Components Listeners
    initGamesListeners();
    initBlacklistListeners();
    initSettingsListeners();
    initCompress();
    initUpdatesTab();
    initFreeGames();
    initShaderCache();
    initDiskUsage();

    // 4. Initial Load
    initGames();

    // 5. Onboarding (first-run only)
    initOnboarding();

    // 6. System info + GPU compatibility
    if (window.electronAPI.getSystemInfo) {
        window.electronAPI.getSystemInfo().then(info => {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('si-gpu', info.gpu);
            set('si-cpu', info.cpu);
            set('si-ram', `${info.ramGB} GB`);
            set('si-mb', info.motherboard);
            set('si-win', info.windowsVersion);

            // GPU DLSS compatibility banner
            const gpuBanner = document.getElementById('gpu-compat-banner');
            if (!gpuBanner || !info.gpu || info.gpu === 'Bilinmiyor') return;
            const g = info.gpu.toLowerCase();
            let level = null; // 'none' | 'partial'
            if (g.includes('nvidia') || g.includes('geforce') || g.includes('rtx') || g.includes('gtx')) {
                if (g.includes('rtx')) {
                    level = null; // full support, no warning
                } else if (/gtx\s*16/.test(g)) {
                    level = 'partial'; // GTX 16xx — DLSS 1.0 only
                } else {
                    level = 'none'; // GTX 10xx, older
                }
            } else if (g.includes('amd') || g.includes('radeon') || g.includes(' rx ') || / rx\d/.test(g)) {
                level = 'none'; // AMD — no DLSS, XeSS/FSR only
            } else if (g.includes('intel') || g.includes('arc') || g.includes('iris')) {
                level = 'partial'; // Intel Arc — XeSS yes, DLSS no
            }
            if (!level) return;
            const msgEl = document.getElementById('gpu-compat-msg');
            if (msgEl) {
                if (level === 'none') {
                    if (g.includes('amd') || g.includes('radeon') || g.includes('rx')) {
                        msgEl.textContent = `${info.gpu} — DLSS desteği yok. OptiScaler/FSR ile oyunlarınızı optimize edebilirsiniz.`;
                    } else {
                        msgEl.textContent = `${info.gpu} — DLSS desteği yok (RTX kart gerekli). DLSS Enabler çalışmayabilir.`;
                    }
                } else {
                    msgEl.textContent = `${info.gpu} — Kısmi destek. DLSS 1.0 veya XeSS çalışabilir, Multi Frame Gen desteklenmez.`;
                }
            }
            gpuBanner.style.display = 'flex';
        }).catch(() => {});
    }

    // 7. Free games banner
    (function initFreeGamesBanner() {
        const DISMISS_KEY = 'onyx_fgb_dismissed_' + new Date().toDateString();
        if (localStorage.getItem(DISMISS_KEY)) return;

        const cached = localStorage.getItem('gamerpower_cache');
        if (!cached) return;
        try {
            const games = JSON.parse(cached);
            if (!Array.isArray(games) || games.length === 0) return;
            const banner = document.getElementById('free-games-banner');
            const countEl = document.getElementById('fgb-count-text');
            if (!banner) return;
            if (countEl) countEl.textContent = `${games.length} ücretsiz oyun şu anda mevcut.`;
            banner.style.display = 'flex';

            document.getElementById('fgb-dismiss-btn')?.addEventListener('click', () => {
                banner.style.display = 'none';
                localStorage.setItem(DISMISS_KEY, '1');
            });

            document.getElementById('fgb-cta-btn')?.addEventListener('click', () => {
                const freeGamesBtn = document.querySelector('.nav-item[data-target="free-games"]');
                if (freeGamesBtn) freeGamesBtn.click();
                banner.style.display = 'none';
                localStorage.setItem(DISMISS_KEY, '1');
            });
        } catch (e) {}
    })();
});
