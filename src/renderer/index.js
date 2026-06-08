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
import { initVideos } from './ui/videos.js';
import { initUpdatesTab } from './ui/updates-tab.js';
import { initFreeGames } from './ui/free-games.js';
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
    initVideos();
    initUpdatesTab();
    initFreeGames();

    // 4. Initial Load
    initGames();

    // 5. Onboarding (first-run only)
    initOnboarding();

    // 6. System info
    if (window.electronAPI.getSystemInfo) {
        window.electronAPI.getSystemInfo().then(info => {
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            set('si-gpu', info.gpu);
            set('si-cpu', info.cpu);
            set('si-ram', `${info.ramGB} GB`);
            set('si-mb', info.motherboard);
            set('si-win', info.windowsVersion);
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
