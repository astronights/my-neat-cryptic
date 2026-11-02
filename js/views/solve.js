import { DB } from '../data.js';
import { store } from '../store.js';
import { h, header, iconEl, toast } from '../ui.js';
import { nextUnsolved, isDone, clueStatus } from '../progress.js';
import { clueCard } from './learn.js';

let filter = 'all'; // remembered for the session

export function solveView() {
  const next = nextUnsolved();
  const unsolved = DB.allClues.filter((c) => !isDone(c.id));
  const revealed = DB.allClues.filter((c) => clueStatus(c.id) === 'revealed');
  const clueChapters = DB.chapters.filter((ch) => ch.kind === 'clues');

  const random = () => {
    const pool = unsolved.filter((c) => c.id !== next?.id);
    const pick = (pool.length ? pool : unsolved)[Math.floor(Math.random() * (pool.length || unsolved.length))];
    if (pick) location.hash = `#/clue/${pick.id}`;
    else toast('Everything’s solved. Try Retry or the crosswords.');
  };

  const listEl = h('ul', { class: 'clue-list' });
  const chipsEl = h('div', { class: 'filter-chips', role: 'radiogroup', 'aria-label': 'Filter by chapter' });
  function renderList() {
    const chosen = filter === 'all' ? DB.allClues : DB.chapterById[filter].clues;
    const items = chosen.filter((c) => !isDone(c.id));
    listEl.replaceChildren(...(items.length
      ? items.map((c) => h('li', {}, clueCard(c, filter === 'all' ? `Ch ${c.chapter} · ${DB.chapterById[c.chapter].title}` : '')))
      : [h('li', { class: 'empty' }, 'Nothing left to solve here. Nice work.')]));
    chipsEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === String(filter))));
  }
  const chip = (f, label) => h('button', { class: 'chip chip-filter', type: 'button', role: 'radio', 'data-f': f, onclick: () => { filter = f; renderList(); } }, label);
  chipsEl.append(chip('all', 'All'), ...clueChapters.map((ch) => chip(String(ch.id), `${ch.id} · ${ch.title}`)));
  renderList();

  const retry = revealed.length
    ? h('section', {},
        h('h2', { class: 'section-title' }, 'Retry'),
        h('p', { class: 'muted small' }, 'Clues you revealed. Give them another go.'),
        h('ul', { class: 'clue-list' }, revealed.map((c) => h('li', { class: 'retry-row' },
          clueCard(c, `Ch ${c.chapter} · ${DB.chapterById[c.chapter].title}`),
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => {
            store.update((s) => { delete s.clues[c.id]; });
            location.hash = `#/clue/${c.id}`;
          } }, iconEl('retry'), 'Retry')))))
    : null;

  return {
    tab: 'solve',
    title: 'Solve',
    el: h('main', { class: 'page' },
      header({ kicker: 'Quick play', title: 'Solve', big: true }),
      next
        ? h('section', { class: 'card next-up' },
            h('div', { class: 'kicker' }, `Next up · Ch ${next.chapter} · ${DB.chapterById[next.chapter].title}`),
            h('p', { class: 'next-clue serif' }, next.clue, ' ', h('span', { class: 'enum' }, `(${next.enumeration})`)),
            h('div', { class: 'btn-row' },
              h('a', { class: 'btn btn-primary', href: `#/clue/${next.id}` }, iconEl('play'), `Play Clue #${next.number}`),
              h('button', { class: 'btn', type: 'button', onclick: random }, iconEl('random'), 'Random unsolved')))
        : h('section', { class: 'card next-up' }, h('p', { class: 'serif' }, 'Every clue is done. Impressive.')),
      retry,
      h('h2', { class: 'section-title' }, 'Unsolved clues'),
      chipsEl,
      listEl),
  };
}
