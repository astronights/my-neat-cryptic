import { APP } from './config.js';
import { loadData, DB } from './data.js';
import { store } from './store.js';
import { h, tabbar, toast, applySettings, closeAllSheets } from './ui.js';
import { learnView, chapterView, textView } from './views/learn.js';
import { clueView } from './views/clue.js';
import { solveView } from './views/solve.js';
import { crosswordsView } from './views/crosswords.js';
import { gridView } from './views/grid.js';
import { statsView } from './views/stats.js';

const app = document.getElementById('app');
let current = null;

const routes = [
  [/^\/(learn)?$/, () => learnView()],
  [/^\/intro$/, () => textView('introduction')],
  [/^\/conclusion$/, () => textView('conclusion')],
  [/^\/chapter\/(\w+)$/, (id) => chapterView(id)],
  [/^\/clue\/([\w-]+)$/, (id) => clueView(id)],
  [/^\/solve$/, () => solveView()],
  [/^\/crosswords$/, () => crosswordsView()],
  [/^\/crossword\/([\w-]+)$/, (id) => gridView(id)],
  [/^\/stats$/, () => statsView()],
  [/^\/settings$/, () => statsView({ settings: true })],
];

function route() {
  const path = decodeURIComponent(location.hash.replace(/^#/, '')) || '/learn';
  let view = null;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) { view = fn(...m.slice(1)); break; }
  }
  if (!view) view = notFound();
  closeAllSheets();
  document.querySelector('.menu')?.remove();
  current?.destroy?.();
  current = view;
  const screen = h('div', { class: `screen ${view.full ? 'screen-full' : ''}` }, view.el, view.full ? null : tabbar(view.tab));
  app.replaceChildren(screen);
  document.title = view.title ? `${view.title} · ${APP.name}` : APP.name;
  if (!view.keepScroll) window.scrollTo(0, 0);
  view.mounted?.();
  // Move focus to the page for screen readers / keyboard users on navigation.
  const target = screen.querySelector('[data-autofocus]') || screen.querySelector('h1');
  if (target) { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); }
}

function notFound() {
  return {
    tab: 'learn',
    title: 'Not found',
    el: h('main', { class: 'page' },
      h('h1', { class: 'page-title' }, 'Nothing here'),
      h('p', { class: 'muted' }, 'That page doesn’t exist.'),
      h('a', { class: 'btn btn-primary', href: '#/learn' }, 'Go to Learn')),
  };
}

function renderError(err) {
  app.replaceChildren(h('main', { class: 'page error-page', role: 'alert' },
    h('h1', { class: 'page-title' }, 'Something went wrong'),
    h('p', {}, 'The puzzles couldn’t be loaded.'),
    h('pre', { class: 'error-detail' }, String(err?.message || err)),
    h('p', { class: 'muted' }, 'If you’re offline, connect once so the app can save everything for offline use.'),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, 'Try again')));
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (worker) => {
      if (document.querySelector('.toast-update')) return;
      const t = toast('Update available.', { action: 'Reload', sticky: true, onAction: () => worker.postMessage('SKIP_WAITING') });
      t.classList.add('toast-update');
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch((e) => console.warn('Service worker registration failed', e));
}

async function main() {
  try {
    await Promise.all([loadData(), store.init()]);
  } catch (e) {
    renderError(e);
    registerSW();
    return;
  }
  applySettings(store.s.settings);
  if (DB.serverCookies) store.enableServerRefresh();
  store.on((s) => applySettings(s.settings));
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applySettings(store.s.settings));
  if (store.loadError) toast('Saved progress couldn’t be read, so you’re starting fresh.', { timeout: 5000 });
  addEventListener('hashchange', route);
  route();
  registerSW();
}

main();
