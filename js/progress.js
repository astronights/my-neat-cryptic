// Derived progress: statuses, known letters, streaks.
import { DB } from './data.js';
import { store } from './store.js';

export const clueState = (id) => store.s.clues[id] || {};

export function clueStatus(id) {
  const c = store.s.clues[id];
  if (!c) return 'new';
  if (c.st === 's') return 'solved';
  if (c.st === 'r') return 'revealed';
  if ((c.in && c.in.trim()) || c.h || (c.rv && c.rv.length)) return 'progress';
  return 'new';
}
export const isDone = (id) => { const s = clueStatus(id); return s === 'solved' || s === 'revealed'; };

export function statusLabel(id) {
  const c = clueState(id);
  switch (clueStatus(id)) {
    case 'solved': return c.hs ? `Solved with ${c.hs} hint${c.hs === 1 ? '' : 's'}` : 'Solved';
    case 'revealed': return 'Revealed';
    case 'progress': return 'In progress';
    default: return 'Unsolved';
  }
}

// Letters the player already knows: checking letters from solved clues, and
// letters they revealed. Map of box index → { letter, kind, ref? }.
export function knownLetters(clue) {
  const m = new Map();
  if (store.s.settings.checking) {
    for (const k of clue.checks) if (isDone(k.ref)) m.set(k.idx, { letter: clue.letters[k.idx], kind: 'check', ref: k.ref });
  }
  for (const i of clueState(clue.id).rv || []) m.set(i, { letter: clue.letters[i], kind: 'reveal' });
  return m;
}

export function chapterProgress(ch) {
  if (ch.kind === 'minis') {
    const total = ch.crosswords.length;
    return { done: ch.crosswords.filter((cw) => crosswordProgress(cw).done).length, total };
  }
  return { done: ch.clues.filter((c) => isDone(c.id)).length, total: ch.clues.length };
}

export function nextUnsolved(chapterId) {
  const list = chapterId ? DB.chapterById[chapterId].clues : DB.allClues;
  return list.find((c) => !isDone(c.id)) || null;
}

export function nextClueAfter(clue) {
  const i = DB.allClues.indexOf(clue);
  return DB.allClues.slice(i + 1).find((c) => !isDone(c.id)) || DB.allClues[i + 1] || null;
}

export function crosswordProgress(cw) {
  const s = store.s.cw[cw.id];
  if (!s || !s.f) return { filled: 0, total: cw.white, done: false, state: s };
  let filled = 0;
  for (const cell of cw.cells) if (!cell.black && s.f[cell.i] && s.f[cell.i] !== ' ') filled++;
  return { filled, total: cw.white, done: !!s.done, state: s };
}

export const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function streaks(now = Date.now()) {
  const days = new Set();
  for (const c of Object.values(store.s.clues)) if (c.st === 's' && c.at) days.add(dayKey(c.at));
  const prev = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d - 1, 12).getTime());
  };
  let current = 0;
  let k = dayKey(now);
  if (!days.has(k)) k = prev(k);
  while (days.has(k)) { current++; k = prev(k); }
  let best = 0;
  for (const day of days) {
    if (days.has(prev(day))) continue; // only start counting at the first day of a run
    let len = 0;
    let [y, m, d] = day.split('-').map(Number);
    let cur = day;
    while (days.has(cur)) { len++; d++; cur = dayKey(new Date(y, m - 1, d, 12).getTime()); }
    best = Math.max(best, len);
  }
  return { current, best, days: days.size };
}

export const fmtTime = (ms) => {
  const s = Math.floor((ms || 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
};
