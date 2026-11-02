// Progress storage in cookies.
//
// The whole progress object is JSON → deflate (when the browser supports
// CompressionStream) → base64url, then split across cookies:
//   cq_v1      = "<chunkCount>"
//   cq_v1_0..n = chunk text (≤ 3800 chars each, under the 4 KB cookie limit)
//   cq_v1_ui   = "<theme>,<large>"  (tiny plain cookie so the theme applies before first paint)
//
// Cookies set from JavaScript are capped at 7 days by Safari, so after each
// save we also ping COOKIE_REFRESH_URL (a Vercel function) which re-sends the
// same cookies from the server with a 400-day lifetime. This only happens when
// the data response carried an X-Cookie-Refresh header (i.e. on Vercel); on
// static hosts cookies just use the browser's own limits.

import { STORE_KEY, COOKIE_REFRESH_URL } from './config.js';

const CHUNK = 3800;
const MAX_AGE = 400 * 24 * 60 * 60; // browsers cap cookie lifetime at 400 days
const BASE_PATH = new URL('./', location.href).pathname;
const SECURE = location.protocol === 'https:';

export const defaultState = () => ({
  v: 1,
  clues: {}, // id → { in, h, hs, st: 's'|'r', at, rv: [idx], w }
  cw: {}, // id → { f, ck, rv, t, done }
  pads: {}, // id → scratch text
  read: {}, // chapterId → 1 once the lesson has been read
  settings: { checking: true, theme: 'system', large: false },
});

let state = defaultState();
const listeners = new Set();
let saveTimer = null;
let dirty = false;
let refreshAvailable = false; // turned on by enableServerRefresh() when the host supports it
let lastRefresh = 0;

function readCookies() {
  const out = {};
  for (const part of document.cookie.split(/;\s*/)) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq < 0 ? part : part.slice(0, eq);
    out[k] = eq < 0 ? '' : part.slice(eq + 1);
  }
  return out;
}

function setCookie(name, value, maxAge = MAX_AGE) {
  document.cookie = `${name}=${value}; Path=${BASE_PATH}; Max-Age=${maxAge}; SameSite=Lax${SECURE ? '; Secure' : ''}`;
}

// --- encoding -------------------------------------------------------------
function toB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64u(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

async function encode(obj) {
  const json = JSON.stringify(obj);
  if (canZip) {
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return 'z' + toB64u(new Uint8Array(await new Response(stream).arrayBuffer()));
    } catch { /* fall through */ }
  }
  return encodeSync(obj);
}
const encodeSync = (obj) => 'j' + toB64u(new TextEncoder().encode(JSON.stringify(obj)));

async function decode(str) {
  const bytes = fromB64u(str.slice(1));
  if (str[0] === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(stream).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

// --- read/write -----------------------------------------------------------
function writeEncoded(str) {
  const jar = readCookies();
  const oldCount = parseInt(jar[STORE_KEY], 10) || 0;
  const count = Math.max(1, Math.ceil(str.length / CHUNK));
  for (let i = 0; i < count; i++) setCookie(`${STORE_KEY}_${i}`, str.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = count; i < oldCount; i++) setCookie(`${STORE_KEY}_${i}`, '', 0);
  setCookie(STORE_KEY, String(count));
  const s = state.settings;
  setCookie(`${STORE_KEY}_ui`, `${s.theme},${s.large ? 1 : 0}`);
  lastSize = str.length;
}
let lastSize = 0;

async function loadFromCookies() {
  const jar = readCookies();
  const count = parseInt(jar[STORE_KEY], 10);
  if (!count) return null;
  let str = '';
  for (let i = 0; i < count; i++) {
    const part = jar[`${STORE_KEY}_${i}`];
    if (part == null) throw new Error('Saved progress is incomplete.');
    str += part;
  }
  lastSize = str.length;
  return decode(str);
}

function normalise(obj) {
  const d = defaultState();
  if (!obj || typeof obj !== 'object') return d;
  return {
    v: 1,
    clues: obj.clues && typeof obj.clues === 'object' ? obj.clues : {},
    cw: obj.cw && typeof obj.cw === 'object' ? obj.cw : {},
    pads: obj.pads && typeof obj.pads === 'object' ? obj.pads : {},
    read: obj.read && typeof obj.read === 'object' ? obj.read : {},
    settings: { ...d.settings, ...(obj.settings || {}) },
  };
}

async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  writeEncoded(await encode(state));
  refreshOnServer();
}

function flushSync() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!dirty) return;
  dirty = false;
  writeEncoded(encodeSync(state));
}

function refreshOnServer(force) {
  if (!refreshAvailable || !navigator.onLine || location.protocol === 'file:') return;
  const now = Date.now();
  if (!force && now - lastRefresh < 60_000) return;
  lastRefresh = now;
  fetch(`${COOKIE_REFRESH_URL}?path=${encodeURIComponent(BASE_PATH)}`, { method: 'POST', credentials: 'same-origin' })
    .then((r) => { if (r.status === 404 || r.status === 405) refreshAvailable = false; })
    .catch(() => {});
}

export const store = {
  get s() { return state; },
  async init() {
    try {
      state = normalise(await loadFromCookies());
    } catch (e) {
      console.warn('Could not read saved progress; starting fresh.', e);
      state = defaultState();
      store.loadError = true;
    }
    addEventListener('pagehide', flushSync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSync(); });
    return state;
  },
  update(fn) {
    fn(state);
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
    listeners.forEach((l) => l(state));
  },
  flush,
  enableServerRefresh() {
    if (!COOKIE_REFRESH_URL) return;
    refreshAvailable = true;
    refreshOnServer(true);
  },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  replace(obj) {
    state = normalise(obj);
    dirty = true;
    listeners.forEach((l) => l(state));
    return flush();
  },
  reset() { return store.replace(defaultState()); },
  exportJSON() { return JSON.stringify({ app: 'cryptic-pwa', key: STORE_KEY, exported: new Date().toISOString(), progress: state }, null, 2); },
  importJSON(text) {
    const obj = JSON.parse(text);
    const p = obj && obj.progress ? obj.progress : obj;
    if (!p || typeof p !== 'object' || (!p.clues && !p.cw)) throw new Error('That file doesn’t look like exported progress.');
    return store.replace(p);
  },
  sizeBytes() { return lastSize; },
};
