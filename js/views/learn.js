import { APP } from '../config.js';
import { DB } from '../data.js';
import { store } from '../store.js';
import { md, inline } from '../md.js';
import { h, header, iconEl, ring } from '../ui.js';
import { chapterProgress, nextUnsolved, clueStatus, statusLabel, crosswordProgress } from '../progress.js';
import { crosswordCard } from './crosswords.js';

export function learnView() {
  const next = nextUnsolved();
  const nextCh = next ? DB.chapterById[next.chapter] : null;
  const settingsBtn = h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, iconEl('gear'));

  const intro = h('div', { class: 'book-links' },
    h('a', { class: 'card book-link', href: '#/intro' }, iconEl('book'), h('span', {}, h('strong', {}, 'Introduction'), h('small', {}, 'Start here'))),
    h('a', { class: 'card book-link', href: '#/conclusion' }, iconEl('book'), h('span', {}, h('strong', {}, 'Conclusion'), h('small', {}, 'Where to from here'))));

  const cont = next
    ? h('a', { class: 'card continue-card', href: `#/clue/${next.id}` },
        h('div', { class: 'kicker' }, `Continue · Ch ${nextCh.id} · ${nextCh.title}`),
        h('div', { class: 'continue-clue serif', html: `${inline(next.clue)} <span class="enum">(${next.enumeration})</span>` }),
        h('span', { class: 'btn btn-primary btn-sm' }, iconEl('play'), `Clue #${next.number}`))
    : h('div', { class: 'card continue-card done' }, h('div', { class: 'kicker' }, 'All done'), h('p', { class: 'serif' }, 'You’ve worked through every clue. Try the Mega crossword next.'));

  const nodes = DB.chapters.map((ch, i) => {
    const { done, total } = chapterProgress(ch);
    const isCurrent = nextCh && nextCh.id === ch.id;
    return h('li', { class: `path-node ${i % 2 ? 'right' : 'left'} ${isCurrent ? 'current' : ''} ${total && done === total ? 'complete' : ''}` },
      h('a', { class: 'path-link', href: `#/chapter/${ch.id}`, 'aria-label': `Chapter ${ch.id}, ${ch.title}, ${done} of ${total} ${ch.kind === 'minis' ? 'grids complete' : 'clues done'}` },
        ring(done, total, 60, String(ch.id)),
        h('span', { class: 'path-info' },
          h('span', { class: 'path-title' }, ch.title),
          h('span', { class: 'path-meta' }, ch.kind === 'minis' ? `${done} / ${total} grids` : `${done} / ${total} clues`))),
      isCurrent ? h('a', { class: 'pill pill-continue', href: `#/clue/${next.id}` }, `Continue: Clue #${next.number}`) : null);
  });
  const mega = DB.crosswordById.mega;
  const mp = crosswordProgress(mega);
  nodes.push(h('li', { class: `path-node ${DB.chapters.length % 2 ? 'right' : 'left'} ${mp.done ? 'complete' : ''}` },
    h('a', { class: 'path-link', href: '#/crossword/mega' },
      ring(mp.done ? 1 : 0, 1, 60, '★'),
      h('span', { class: 'path-info' }, h('span', { class: 'path-title' }, mega.title), h('span', { class: 'path-meta' }, mp.done ? 'Complete' : `${mp.filled} / ${mp.total} squares`)))));

  return {
    tab: 'learn',
    el: h('main', { class: 'page' },
      header({ title: APP.name, kicker: APP.tagline, big: true, actions: [settingsBtn] }),
      intro,
      cont,
      h('h2', { class: 'section-title' }, 'Your path'),
      h('ol', { class: 'path' }, nodes)),
  };
}

export function chapterView(id) {
  const ch = DB.chapterById[id];
  if (!ch) return { tab: 'learn', title: 'Not found', el: h('main', { class: 'page' }, header({ back: '#/learn', title: 'Chapter not found', big: true })) };
  const firstRead = !store.s.read[ch.id];
  const { done, total } = chapterProgress(ch);
  const next = ch.kind === 'clues' ? ch.clues.find((c) => clueStatus(c.id) !== 'solved' && clueStatus(c.id) !== 'revealed') : null;

  const lesson = ch.lesson.length
    ? h('section', { class: 'lesson', 'aria-label': 'Lesson' },
        ch.lesson.map((sec, i) =>
          h('details', { class: 'lesson-sec', open: firstRead || null },
            h('summary', {}, h('span', {}, sec.title || (i === 0 ? 'Lesson' : `Part ${i + 1}`))),
            h('div', { class: 'prose', html: md(sec.text) }))))
    : null;

  const list = ch.kind === 'clues'
    ? h('ul', { class: 'clue-list' }, ch.clues.map((c) => h('li', {}, clueCard(c))))
    : h('ul', { class: 'cw-list' }, ch.crosswords.map((cw) => h('li', {}, crosswordCard(cw))));

  return {
    tab: 'learn',
    title: ch.title,
    el: h('main', { class: 'page' },
      header({ back: '#/learn', kicker: `Chapter ${ch.id}`, title: ch.title, big: true }),
      h('div', { class: 'chapter-meta' },
        ring(done, total, 44, ''),
        h('span', {}, ch.kind === 'minis' ? `${done} of ${total} grids complete` : `${done} of ${total} clues done`),
        next ? h('a', { class: 'btn btn-primary btn-sm', href: `#/clue/${next.id}` }, iconEl('play'), `Clue #${next.number}`) : null),
      lesson,
      h('h2', { class: 'section-title' }, ch.kind === 'clues' ? 'Clues' : 'Grids'),
      list),
    mounted() {
      if (firstRead) store.update((s) => { s.read[ch.id] = 1; });
    },
  };
}

export function clueCard(c, extra = '') {
  const status = clueStatus(c.id);
  return h('a', { class: `card clue-card status-${status}`, href: `#/clue/${c.id}` },
    h('span', { class: 'clue-num' }, `#${c.number}`),
    h('span', { class: 'clue-card-body' },
      extra ? h('span', { class: 'kicker' }, extra) : null,
      h('span', { class: 'clue-card-text serif', html: `${inline(c.clue)} <span class="enum">(${c.enumeration})</span>` }),
      h('span', { class: `status status-${status}` }, status === 'solved' ? iconEl('check', 'icon-sm') : null, statusLabel(c.id))));
}

export function textView(kind) {
  const sections = DB[kind] || [];
  const title = kind === 'introduction' ? 'Introduction' : 'Conclusion';
  return {
    tab: 'learn',
    title,
    el: h('main', { class: 'page' },
      header({ back: '#/learn', kicker: 'From the book', title, big: true }),
      h('article', { class: 'prose long' },
        sections.map((s) => [s.title ? h('h2', {}, s.title) : null, h('div', { html: md(s.text) })])),
      kind === 'introduction'
        ? h('a', { class: 'btn btn-primary', href: '#/chapter/1' }, 'Start Chapter 1')
        : h('a', { class: 'btn', href: '#/learn' }, 'Back to Learn')),
  };
}
