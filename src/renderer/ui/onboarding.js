const ONBOARDED_KEY = 'onyx_onboarded_v1';

export function initOnboarding() {
    if (localStorage.getItem(ONBOARDED_KEY)) return;

    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.style.display = 'flex';

    // Dot animation
    let dot = 0;
    const dots = overlay.querySelectorAll('.ob-dot');
    const dotInterval = setInterval(() => {
        dots.forEach((d, i) => d.classList.toggle('active', i === dot));
        dot = (dot + 1) % dots.length;
    }, 600);

    const startBtn = document.getElementById('onboarding-start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            clearInterval(dotInterval);
            overlay.classList.add('ob-fade-out');
            setTimeout(() => {
                overlay.style.display = 'none';
                overlay.classList.remove('ob-fade-out');
            }, 400);
            localStorage.setItem(ONBOARDED_KEY, '1');
        });
    }
}
