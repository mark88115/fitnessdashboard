// fitness-dashboard/js/layoutMode.js

/** Every layout rule keys off `<html data-layout="desktop|mobile">` rather
 * than off a media query directly, so the phone layout can be inspected on a
 * desktop screen without resizing the window or opening devtools. The width
 * test still decides the default; the toggle only pins it. */
const STORAGE_KEY = 'fitness-dashboard:layout';
const NARROW = window.matchMedia('(max-width: 720px)');

const MODES = ['desktop', 'mobile'];

/** Pinned to a mode, or `null` while it follows the screen width. */
function readPinned() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return MODES.includes(stored) ? stored : null;
}

export function setupLayoutToggle(container) {
  const root = document.documentElement;
  let pinned = readPinned();

  const buttons = MODES.map((mode) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'layout-toggle__btn';
    btn.dataset.mode = mode;
    btn.textContent = mode === 'desktop' ? '電腦版' : '手機版';
    btn.onclick = () => {
      pinned = mode;
      localStorage.setItem(STORAGE_KEY, mode);
      apply();
    };
    return btn;
  });

  container.className = 'layout-toggle';
  container.setAttribute('role', 'group');
  container.setAttribute('aria-label', '版面模式');
  buttons.forEach((b) => container.appendChild(b));

  function apply() {
    const effective = pinned ?? (NARROW.matches ? 'mobile' : 'desktop');
    root.dataset.layout = effective;
    // Only a *pinned* mobile layout gets the phone-width frame. A real phone
    // is already that wide, and capping it there too would leave a gutter.
    root.dataset.layoutPinned = pinned ? 'true' : 'false';
    for (const btn of buttons) {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === effective));
    }
  }

  NARROW.addEventListener('change', apply);
  apply();
}
