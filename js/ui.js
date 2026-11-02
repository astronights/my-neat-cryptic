// Small DOM helpers, icons and shared widgets.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
        else el.style[prop] = val;
      }
    }
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const svg = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  learn: svg('<path d="M4 19c3-1 4-4 8-4s5 3 8 2"/><circle cx="6" cy="7" r="2"/><circle cx="18" cy="9" r="2"/><path d="M8 7h3a3 3 0 0 1 0 6"/>'),
  solve: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  grid: svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/><rect x="9" y="9" width="6" height="6" fill="currentColor"/>'),
  stats: svg('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  prev: svg('<path d="M15 5l-7 7 7 7"/>'),
  next: svg('<path d="M9 5l7 7-7 7"/>'),
  more: svg('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  bulb: svg('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>'),
  // A slightly wobbly, hand-drawn flag for side notes.
  flag: svg('<path d="M5.5 21.5c-.2-6 .3-12.3-.3-18"/><path d="M5.4 4.2c2.6-1.3 4.6.6 7.2-.4 2.2-.8 3.6-.7 5.6.1-.6 2.6-.4 4.6.3 6.9-2.2-.8-3.6-.6-5.8.2-2.5 1-4.6-.9-7.1.3"/>', 'stroke-width="1.7"'),
  check: svg('<path d="M4 12.5l5 5L20 6.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  backspace: svg('<path d="M21 5H8l-6 7 6 7h13z"/><path d="M12 9l6 6M18 9l-6 6"/>'),
  enter: svg('<path d="M20 5v7a3 3 0 0 1-3 3H5"/><path d="M9 11l-4 4 4 4"/>'),
  shuffle: svg('<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>'),
  list: svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  book: svg('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 21.5A2.5 2.5 0 0 1 6.5 19H20v3H6.5"/>'),
  play: svg('<path d="M7 4l13 8-13 8z"/>'),
  random: svg('<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  retry: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
};

export const iconEl = (name, cls = '') => h('span', { class: `icon ${cls}`, html: icons[name] });

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Screen-reader announcements.
export function announce(msg) {
  const sr = document.getElementById('sr');
  if (!sr) return;
  sr.textContent = '';
  setTimeout(() => { sr.textContent = msg; }, 30);
}

export function toast(msg, opts = {}) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, msg));
  if (opts.action) {
    el.append(h('button', { class: 'toast-action', type: 'button', onclick: () => { opts.onAction?.(); el.remove(); } }, opts.action));
  }
  host.append(el);
  if (!opts.sticky) setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, opts.timeout || 2600);
  return el;
}

// Bottom sheet / dialog. Returns { el, close }.
let openSheets = [];
export function sheet({ title, content, className = '', onClose, labelledBy } = {}) {
  const prevFocus = document.activeElement;
  const titleId = 'sheet-' + Math.random().toString(36).slice(2, 8);
  const panel = h('div', { class: `sheet ${className}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledBy || (title ? titleId : null), tabindex: '-1' });
  const closeBtn = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'Close', onclick: () => close() }, iconEl('close'));
  panel.append(h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }), title ? h('h2', { id: titleId, class: 'sheet-title' }, title) : null, closeBtn));
  const body = h('div', { class: 'sheet-body' }, content);
  panel.append(body);
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (e.target === overlay) close(); } }, panel);
  const onKey = (e) => { if (e.key === 'Escape' && openSheets[openSheets.length - 1] === api) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));
  panel.focus({ preventScroll: true });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openSheets = openSheets.filter((s) => s !== api);
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.remove('open');
    setTimeout(() => overlay.remove(), reducedMotion() ? 0 : 220);
    onClose?.();
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus({ preventScroll: true });
  }
  const api = { el: panel, body, close };
  openSheets.push(api);
  return api;
}
export const closeAllSheets = () => [...openSheets].forEach((s) => s.close());
export const sheetOpen = () => openSheets.length > 0;

export function confirmDialog(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { answered = true; resolve(v); s.close(); };
    const content = h('div', { class: 'confirm' },
      text ? h('p', {}, text) : null,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, 'Cancel'),
        h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'button', 'data-ok': '', onclick: () => done(true) }, okLabel)));
    const s = sheet({ title, content, className: 'dialog', onClose: () => { if (!answered) resolve(false); } });
    s.el.querySelector('[data-ok]').focus();
  });
}

// Popover menu anchored to a button.
export function menu(anchor, items) {
  document.querySelector('.menu')?.remove();
  const el = h('div', { class: 'menu', role: 'menu' },
    items.filter(Boolean).map((it) =>
      h('button', { class: `menu-item ${it.danger ? 'danger' : ''}`, role: 'menuitem', type: 'button', disabled: it.disabled, onclick: () => { close(); it.onClick(); } }, it.label)));
  document.body.append(el);
  const r = anchor.getBoundingClientRect();
  el.style.top = `${r.bottom + 6 + scrollY}px`;
  el.style.right = `${Math.max(8, document.documentElement.clientWidth - r.right)}px`;
  anchor.setAttribute('aria-expanded', 'true');
  const first = el.querySelector('button:not([disabled])');
  first?.focus();
  const onDoc = (e) => { if (!el.contains(e.target) && e.target !== anchor) close(); };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.focus(); }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const btns = [...el.querySelectorAll('button:not([disabled])')];
      const i = btns.indexOf(document.activeElement);
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', onDoc), 0);
  document.addEventListener('keydown', onKey, true);
  function close() {
    el.remove();
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc);
    document.removeEventListener('keydown', onKey, true);
  }
  return { close };
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    return ok;
  }
}

export function applySettings(settings) {
  const root = document.documentElement;
  if (settings.theme === 'light' || settings.theme === 'dark') root.dataset.theme = settings.theme;
  else delete root.dataset.theme;
  root.classList.toggle('large', !!settings.large);
  const dark = settings.theme === 'dark' || (settings.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#121212' : '#ffffff'));
}

// Progress ring SVG.
export function ring(done, total, size = 52, label = '') {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = total ? done / total : 0;
  return h('span', {
    class: `ring ${total && done === total ? 'complete' : ''}`,
    style: { width: `${size}px`, height: `${size}px` },
    html: `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-track"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg><span class="ring-label">${label}</span>`,
  });
}

// On-screen QWERTY keyboard. Never focuses a text input, so the phone keyboard stays closed.
export function keyboard(onKey, { enterLabel = 'Enter' } = {}) {
  const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  const press = (k) => (e) => { e.preventDefault(); onKey(k); };
  const el = h('div', { class: 'kb', role: 'group', 'aria-label': 'Keyboard' },
    rows.map((row, ri) =>
      h('div', { class: 'kb-row' },
        ri === 2 ? h('button', { class: 'kb-key kb-wide', type: 'button', 'aria-label': enterLabel, onclick: press('Enter') }, iconEl('enter'), h('span', { class: 'kb-wide-label' }, enterLabel)) : null,
        [...row].map((ch) => h('button', { class: 'kb-key', type: 'button', 'data-key': ch, onclick: press(ch) }, ch)),
        ri === 2 ? h('button', { class: 'kb-key kb-wide', type: 'button', 'aria-label': 'Backspace', onclick: press('Backspace') }, iconEl('backspace')) : null)));
  // Prevent buttons from stealing focus on mouse down (keeps focus ring logic tidy).
  el.addEventListener('mousedown', (e) => e.preventDefault());
  return el;
}

// Physical keyboard handler that ignores typing in real text fields.
export function onPhysicalKeys(handler) {
  const fn = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (sheetOpen() || document.querySelector('.menu')) return;
    handler(e);
  };
  document.addEventListener('keydown', fn);
  return () => document.removeEventListener('keydown', fn);
}

// Header bar used by most screens.
export function header({ title, kicker, back, actions = [], big = false }) {
  return h('header', { class: `topbar ${big ? 'big' : ''}` },
    back ? h('a', { class: 'icon-btn', href: back, 'aria-label': 'Back' }, iconEl('back')) : h('span', { class: 'topbar-spacer' }),
    h('div', { class: 'topbar-title' },
      kicker ? h('div', { class: 'kicker' }, kicker) : null,
      title ? h(big ? 'h1' : 'div', { class: big ? 'page-title' : 'topbar-heading' }, title) : null),
    h('div', { class: 'topbar-actions' }, actions));
}

export function tabbar(active) {
  const tabs = [
    ['learn', 'Learn', '#/learn', 'learn'],
    ['solve', 'Solve', '#/solve', 'solve'],
    ['crosswords', 'Crosswords', '#/crosswords', 'grid'],
    ['stats', 'Stats', '#/stats', 'stats'],
  ];
  return h('nav', { class: 'tabbar', 'aria-label': 'Main' },
    tabs.map(([key, label, href, ic]) =>
      h('a', { class: `tab ${active === key ? 'active' : ''}`, href, 'aria-current': active === key ? 'page' : null }, iconEl(ic), h('span', {}, label))));
}
