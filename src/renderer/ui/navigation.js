import { showInfoModal } from './modals/info.js';

async function checkAndShowModUpdateBadge() {
    try {
        const results = await window.electronAPI.checkModUpdates();
        if (!results) return;
        const updateCount = Object.values(results).filter(r => r && r.hasUpdate).length;
        if (updateCount === 0) return;
        const modsNavItem = document.querySelector('.nav-item[data-target="modes"]');
        if (!modsNavItem) return;
        if (modsNavItem.querySelector('.mod-update-badge')) return;
        const badge = document.createElement('span');
        badge.className = 'mod-update-badge';
        badge.textContent = updateCount;
        modsNavItem.appendChild(badge);
    } catch (e) {
        // silent — badge is non-critical
    }
}

export function initNavigation() {
    // Check for mod updates and show badge on Modlar nav item
    setTimeout(checkAndShowModUpdateBadge, 3000);

    // External links logic (using event delegation to support dynamic translation strings)
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.external-link');
        if (link) {
            e.preventDefault();
            const url = link.getAttribute('data-url');
            if (url && window.electronAPI) {
                if (window.electronAPI.openExternalLink) {
                    window.electronAPI.openExternalLink(url);
                } else if (window.electronAPI.openExternal) {
                    window.electronAPI.openExternal(url);
                }
            }
        }
    });

    // Tab switching logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetId = item.getAttribute('data-target');
            window.electronAPI.logToMain(`Navigation: Tab clicked -> ${targetId}`);
            switchTab(targetId);
        });
    });

    // Promo cards navigation logic
    const promoCards = document.querySelectorAll('.promo-card');
    promoCards.forEach(card => {
        card.addEventListener('click', () => {
            const targetTab = card.getAttribute('data-target-tab');
            if (targetTab) {
                const sidebarItem = document.querySelector(`.nav-item[data-target="${targetTab}"]`);
                if (sidebarItem) {
                    sidebarItem.click();
                } else {
                    switchTab(targetTab);
                }
            }
        });
    });
}
export function switchTab(tabId) {
    window.electronAPI.logToMain(`Navigation: switchTab called -> ${tabId}`);
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // Update nav buttons
    navItems.forEach(nav => {
        if (nav.getAttribute('data-target') === tabId) {
            nav.classList.add('active');
        } else {
            nav.classList.remove('active');
        }
    });

    // Update tab visibility
    tabContents.forEach(content => {
        if (content.id === tabId) {
            window.electronAPI.logToMain(`Navigation: Activating element with ID -> ${tabId}`);
            content.style.display = 'block';
            content.classList.add('active');
            // Trigger enter animation
            content.classList.remove('tab-entering');
            void content.offsetWidth; // force reflow
            content.classList.add('tab-entering');
            // Notify interested modules that this tab is now active
            document.dispatchEvent(new CustomEvent('tab-activated', { detail: { tabId } }));
        } else {
            content.style.display = 'none';
            content.classList.remove('active');
            content.classList.remove('tab-entering');
        }
    });
}
export function switchTabToSettings() {
    switchTab('settings-tab');
}
