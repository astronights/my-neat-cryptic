import { DB } from '../data.js';
import { h, header, ring } from '../ui.js';
import { crosswordProgress, fmtTime } from '../progress.js';

export function crosswordCard(cw) {
  const p = crosswordProgress(cw);
  const f = p.state?.f || '';
  const thumb = h('span', { class: 'cw-thumb', style: { '--n': cw.size }, 'aria-hidden': 'true' },
    cw.cells.map((c) => h('span', { class: c.black ? 'b' : f[c.i] && f[c.i] !== ' ' ? 'f' : '' })));
  const setLabel = cw.chapter ? `Set ${cw.chapter === 6 ? 1 : 2} · Chapter ${cw.chapter}` : `${cw.size}×${cw.size}`;
  const meta = p.done ? `Complete · ${fmtTime(p.state.t)}` : p.filled ? `${p.filled} / ${p.total} squares` : 'Not started';
  return h('a', { class: `card cw-card ${p.done ? 'complete' : ''}`, href: `#/crossword/${cw.id}` },
    thumb,
    h('span', { class: 'cw-card-body' },
      h('span', { class: 'kicker' }, setLabel),
      h('span', { class: 'cw-title' }, cw.title),
      h('span', { class: `status ${p.done ? 'status-solved' : ''}` }, meta)),
    ring(p.done ? p.total : p.filled, p.total, 40, ''));
}

export function crosswordsView() {
  const sets = DB.chapters.filter((ch) => ch.kind === 'minis');
  const all = DB.crosswords;
  const complete = all.filter((cw) => crosswordProgress(cw).done).length;
  return {
    tab: 'crosswords',
    title: 'Crosswords',
    el: h('main', { class: 'page' },
      header({ kicker: `${complete} of ${all.length} complete`, title: 'Crosswords', big: true }),
      sets.map((ch, i) => h('section', {},
        h('h2', { class: 'section-title' }, `Set ${i + 1}: ${ch.title}`),
        h('ul', { class: 'cw-list' }, ch.crosswords.map((cw) => h('li', {}, crosswordCard(cw)))))),
      h('section', {},
        h('h2', { class: 'section-title' }, 'The big one'),
        h('ul', { class: 'cw-list' }, h('li', {}, crosswordCard(DB.crosswordById.mega))))),
  };
}
