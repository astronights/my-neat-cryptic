import { DB } from '../data.js';
import { store } from '../store.js';
import { md, inline } from '../md.js';
import { h, header, iconEl, keyboard, onPhysicalKeys, menu, confirmDialog, sheet, announce, toast, copyText, reducedMotion } from '../ui.js';
import { knownLetters, isDone, clueStatus } from '../progress.js';

const WRONG_MSGS = [
  'Not quite. Take another look at the definition.',
  'Not this time. Check the indicator again.',
  'Close, maybe. A hint might help.',
  'Not quite. Try reading the clue a different way.',
];

export function answerBoxes(clue, { letters, big = false } = {}) {
  const el = h('div', { class: `boxes ${big ? 'boxes-big' : ''}`, style: { '--maxw': clue.maxWord } });
  let k = 0;
  clue.parts.forEach((p) => {
    const word = h('div', { class: 'word' });
    for (let j = 0; j < p.len; j++, k++) {
      const L = letters ? letters[k] : '';
      word.append(h('span', { class: `box ${L ? 'filled' : ''}`, 'aria-hidden': 'true' }, h('span', { class: 'box-letter' }, L)));
    }
    if (p.sep === '-') word.append(h('span', { class: 'sep-hyphen', 'aria-hidden': 'true' }, '-'));
    el.append(word);
  });
  if (letters) el.setAttribute('aria-label', `Answer: ${clue.answer}`);
  return h('div', { class: 'boxes-wrap' }, el);
}

export function clueView(id) {
  const clue = DB.clueById[id];
  if (!clue) {
    return { tab: 'learn', title: 'Not found', el: h('main', { class: 'page' }, header({ back: '#/learn', title: 'Clue not found', big: true }), h('p', { class: 'muted' }, `There’s no clue called “${id}”.`)) };
  }
  const ch = DB.chapterById[clue.chapter];
  const n = clue.letters.length;
  const idx = ch.clues.indexOf(clue);
  const prev = ch.clues[idx - 1];
  const next = ch.clues[idx + 1];
  const nextInBook = DB.allClues[DB.allClues.indexOf(clue) + 1];
  const cs = () => store.s.clues[id] || {};
  const edit = (fn) => store.update((s) => { fn((s.clues[id] ||= {})); });
  const done = () => isDone(id);

  let known = knownLetters(clue);
  let wrong = new Set();
  let wrongTimer = null;
  let popIdx = -1;

  const entry = () => {
    const inp = cs().in || '';
    return Array.from({ length: n }, (_, i) => {
      if (done()) return clue.letters[i];
      if (known.has(i)) return known.get(i).letter;
      const L = inp[i];
      return L && L !== ' ' ? L : '';
    });
  };
  const locked = (i) => known.has(i);
  const saveEntry = (arr) => edit((c) => { c.in = arr.map((x) => x || ' ').join(''); });
  const findUnlocked = (from, dir) => { for (let k = from; k >= 0 && k < n; k += dir) if (!locked(k)) return k; return -1; };

  let cursor = (() => {
    const e = entry();
    const i = e.findIndex((L, k) => !L && !locked(k));
    return i >= 0 ? i : findUnlocked(0, 1);
  })();

  // ---- header ----
  const moreBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'More options', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, iconEl('more'));
  moreBtn.addEventListener('click', () => {
    menu(moreBtn, [
      { label: 'Reveal a letter', disabled: done() || cursor < 0, onClick: revealLetter },
      { label: 'Reveal answer', disabled: done(), onClick: revealAnswer },
      clueStatus(id) !== 'new' ? { label: done() ? 'Try again from scratch' : 'Clear and start over', danger: true, onClick: startOver } : null,
      { label: `Go to chapter ${ch.id}`, onClick: () => { location.hash = `#/chapter/${ch.id}`; } },
    ]);
  });
  const navBtn = (target, dir) => target
    ? h('a', { class: 'icon-btn', href: `#/clue/${target.id}`, 'aria-label': `${dir === 'prev' ? 'Previous' : 'Next'} clue: #${target.number}` }, iconEl(dir))
    : h('span', { class: 'icon-btn disabled', 'aria-hidden': 'true' }, iconEl(dir));

  const top = header({
    back: `#/chapter/${ch.id}`,
    kicker: `Clue #${clue.number} · ${ch.title}`,
    actions: [navBtn(prev, 'prev'), navBtn(next, 'next'), moreBtn],
  });

  // ---- clue + boxes ----
  const clueText = h('h1', { class: 'clue-text', 'data-autofocus': '', html: `${inline(clue.clue)} <span class="enum">(${clue.enumeration})</span>` });

  const boxesEl = h('div', { class: 'boxes', role: 'group', 'aria-label': `Answer, ${n} letters`, style: { '--maxw': clue.maxWord } });
  const boxBtns = [];
  {
    let k = 0;
    clue.parts.forEach((p) => {
      const word = h('div', { class: 'word' });
      for (let j = 0; j < p.len; j++, k++) {
        const i = k;
        const b = h('button', { class: 'box', type: 'button', 'data-i': i, style: { '--i': i }, onclick: () => tapBox(i) }, h('span', { class: 'box-letter' }), h('span', { class: 'box-dot', 'aria-hidden': 'true' }));
        boxBtns.push(b);
        word.append(b);
      }
      if (p.sep === '-') word.append(h('span', { class: 'sep-hyphen', 'aria-hidden': 'true' }, '-'));
      boxesEl.append(word);
    });
  }
  const statusMsg = h('p', { class: 'status-msg', 'aria-hidden': 'true' });
  const chips = h('div', { class: 'chips' });

  // ---- workspace ----
  const pad = h('textarea', { class: 'pad', rows: '3', maxlength: '400', placeholder: 'Jot letters, ideas, crossings…', 'aria-label': 'Scratch pad for this clue' });
  pad.value = store.s.pads[id] || '';
  let padTimer;
  pad.addEventListener('input', () => {
    clearTimeout(padTimer);
    padTimer = setTimeout(() => store.update((s) => { if (pad.value.trim()) s.pads[id] = pad.value; else delete s.pads[id]; }), 400);
  });
  const wheel = anagramWheel(store.s.pads[`${id}~w`] || '', (v) => store.update((s) => { if (v) s.pads[`${id}~w`] = v; else delete s.pads[`${id}~w`]; }));
  const wsPanel = h('div', { class: 'workspace-panel', id: `ws-${id}`, hidden: true },
    h('label', { class: 'ws-label' }, 'Scratch pad', pad),
    wheel.el);
  const wsToggle = h('button', { class: 'workspace-rule', type: 'button', 'aria-expanded': 'false', 'aria-controls': `ws-${id}` }, h('span', {}, 'workspace'));
  wsToggle.addEventListener('click', () => {
    const open = wsPanel.hidden;
    wsPanel.hidden = !open;
    wsToggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => wsPanel.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }), 30);
  });

  // ---- hints ----
  const hintBtn = h('button', { class: 'btn', type: 'button', onclick: showHint }, iconEl('bulb'), h('span', { class: 'hint-btn-label' }, 'Hint'));
  const hintCount = h('span', { class: 'hint-count' });
  const checkBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (done() ? showSolution() : check()) }, 'Check');
  const controls = h('div', { class: 'clue-controls' }, hintBtn, hintCount, checkBtn);
  const hintsEl = h('div', { class: 'hints', 'aria-live': 'polite' });

  const main = h('div', { class: 'clue-main' },
    clueText,
    h('div', { class: 'boxes-wrap' }, boxesEl),
    statusMsg,
    chips,
    wsToggle,
    wsPanel,
    controls,
    hintsEl);
  const kb = keyboard(handleKey, { enterLabel: 'Check' });
  const el = h('div', { class: 'player clue-player' }, top, h('main', { class: 'player-scroll' }, main), h('div', { class: 'player-bottom' }, kb));

  // ---- rendering ----
  function renderBoxes() {
    const e = entry();
    const isDoneNow = done();
    const st = cs().st;
    boxBtns.forEach((b, i) => {
      const L = e[i];
      const k = known.get(i);
      b.querySelector('.box-letter').textContent = L;
      b.className = 'box';
      if (L) b.classList.add('filled');
      if (!isDoneNow && k) b.classList.add('locked', k.kind === 'check' ? 'is-check' : 'is-reveal');
      if (!isDoneNow && i === cursor) b.classList.add('cursor');
      if (wrong.has(i)) b.classList.add('wrong');
      if (isDoneNow) b.classList.add(st === 's' ? 'ok' : 'revealed');
      if (i === popIdx && !reducedMotion()) b.classList.add('pop');
      const parts = [`Box ${i + 1} of ${n}`, L ? `letter ${L}` : 'empty'];
      if (!isDoneNow && k) parts.push(k.kind === 'check' ? 'checking letter' : 'revealed letter');
      if (wrong.has(i)) parts.push('incorrect');
      b.setAttribute('aria-label', parts.join(', '));
      b.setAttribute('aria-current', !isDoneNow && i === cursor ? 'true' : 'false');
      b.disabled = isDoneNow;
    });
    popIdx = -1;
    const full = e.every(Boolean);
    checkBtn.textContent = isDoneNow ? 'See solution' : 'Check';
    checkBtn.disabled = !isDoneNow && !full;
    kb.classList.toggle('kb-disabled', isDoneNow);
  }

  function renderChips() {
    chips.replaceChildren();
    if (!store.s.settings.checking || done()) return;
    for (const k of clue.checks) {
      if (isDone(k.ref)) continue;
      const ref = DB.clueById[k.ref];
      const other = ref.chapter !== clue.chapter ? ` (Ch ${ref.chapter})` : '';
      chips.append(h('a', { class: 'chip', href: `#/clue/${ref.id}` }, `box ${k.box} = box ${k.otherBox} of Clue #${ref.number}${other}`));
    }
  }

  function renderHints() {
    const shown = cs().h || 0;
    const total = clue.hints.length;
    hintCount.textContent = `Hints ${shown} / ${total}`;
    hintBtn.disabled = shown >= total;
    hintBtn.querySelector('.hint-btn-label').textContent = shown >= total ? 'All hints shown' : shown ? 'Next hint' : 'Hint';
    hintsEl.replaceChildren();
    if (shown && clue.hintPreface?.length) {
      hintsEl.append(h('div', { class: 'hint-preface prose' }, clue.hintPreface.map((p) => h('div', { html: md(p) }))));
    }
    clue.hints.slice(0, shown).forEach((step, i) => hintsEl.append(hintCard(step, i)));
  }

  function renderAll() { renderBoxes(); renderChips(); renderHints(); }

  // ---- actions ----
  function tapBox(i) {
    if (done()) return;
    if (locked(i)) {
      const f = findUnlocked(i, 1);
      i = f >= 0 ? f : findUnlocked(i, -1);
    }
    if (i < 0) return;
    cursor = i;
    renderBoxes();
  }

  function typeLetter(L) {
    if (done() || cursor < 0) return;
    const e = entry();
    e[cursor] = L;
    popIdx = cursor;
    if (wrong.delete(cursor)) { /* typing over a wrong letter clears the red */ }
    const nxt = findUnlocked(cursor + 1, 1);
    if (nxt >= 0) cursor = nxt;
    saveEntry(e);
    renderBoxes();
  }

  function backspace() {
    if (done() || cursor < 0) return;
    const e = entry();
    if (e[cursor] && !locked(cursor)) {
      e[cursor] = '';
    } else {
      const p = findUnlocked(cursor - 1, -1);
      if (p < 0) return;
      cursor = p;
      e[cursor] = '';
    }
    wrong.delete(cursor);
    saveEntry(e);
    renderBoxes();
  }

  function moveCursor(dir) {
    if (done()) return;
    const t = findUnlocked(cursor + dir, dir);
    if (t >= 0) { cursor = t; renderBoxes(); }
  }

  function flash(msg) {
    statusMsg.textContent = msg;
    statusMsg.classList.add('show');
  }

  function check() {
    if (done()) return;
    const e = entry();
    if (!e.every(Boolean)) { flash('Fill every box, then check.'); announce('Fill every box, then check.'); return; }
    if (e.join('') === clue.letters) { solve(); return; }
    wrong = new Set(e.map((L, i) => (L !== clue.letters[i] ? i : -1)).filter((i) => i >= 0));
    const attempts = (cs().w || 0) + 1;
    edit((c) => { c.w = attempts; });
    const rightCount = n - wrong.size;
    const msg = rightCount >= n / 2 && n > 3 ? 'Not quite, but some letters fit. Keep going.' : WRONG_MSGS[(attempts - 1) % WRONG_MSGS.length];
    flash(msg);
    announce(`Incorrect. ${msg}`);
    boxesEl.classList.remove('shake');
    void boxesEl.offsetWidth;
    if (!reducedMotion()) boxesEl.classList.add('shake');
    renderBoxes();
    clearTimeout(wrongTimer);
    wrongTimer = setTimeout(() => { wrong.clear(); renderBoxes(); }, 1600);
  }

  function solve() {
    edit((c) => { c.st = 's'; c.hs = c.h || 0; c.at = Date.now(); c.in = clue.letters; });
    wrong.clear();
    statusMsg.classList.remove('show');
    const sc = scoreInfo(clue, cs());
    announce(`Correct. The answer is ${clue.answer}. ${sc.head}`);
    renderAll();
    if (!reducedMotion()) boxesEl.classList.add('celebrate');
    setTimeout(showSolution, reducedMotion() ? 50 : 750);
  }

  async function revealLetter() {
    if (done()) return;
    const e = entry();
    let target = cursor >= 0 && !locked(cursor) && e[cursor] !== clue.letters[cursor] ? cursor : -1;
    if (target < 0) target = e.findIndex((L, i) => !locked(i) && L !== clue.letters[i]);
    if (target < 0) { check(); return; }
    if (!(await confirmDialog('Reveal a letter?', `This shows the letter in box ${target + 1}.`, 'Reveal letter'))) return;
    edit((c) => { c.rv = [...new Set([...(c.rv || []), target])]; });
    known = knownLetters(clue);
    const free = findUnlocked(0, 1);
    if (free < 0) { // every box is known: count it as revealed
      edit((c) => { c.st = 'r'; c.in = clue.letters; });
      renderAll();
      showSolution();
      return;
    }
    if (locked(cursor)) cursor = findUnlocked(cursor, 1) >= 0 ? findUnlocked(cursor, 1) : free;
    announce(`Box ${target + 1} is ${clue.letters[target]}.`);
    renderAll();
    if (entry().every(Boolean) && entry().join('') === clue.letters) solve();
  }

  async function revealAnswer() {
    if (done()) return;
    if (!(await confirmDialog('Reveal the answer?', 'It will count as revealed, not solved. You can retry it later.', 'Reveal answer', true))) return;
    edit((c) => { c.st = 'r'; c.in = clue.letters; });
    announce(`The answer is ${clue.answer}.`);
    renderAll();
    showSolution();
  }

  async function startOver() {
    if (!(await confirmDialog('Start this clue over?', 'Your letters, hints and result for this clue will be cleared.', 'Start over', true))) return;
    store.update((s) => { delete s.clues[id]; });
    known = knownLetters(clue);
    cursor = findUnlocked(0, 1);
    boxesEl.classList.remove('celebrate');
    statusMsg.classList.remove('show');
    renderAll();
  }

  function showHint() {
    const shown = cs().h || 0;
    if (shown >= clue.hints.length) return;
    edit((c) => { c.h = shown + 1; });
    renderHints();
    announce(`Hint ${shown + 1} of ${clue.hints.length}`);
    const cards = hintsEl.querySelectorAll('.hint-card');
    cards[cards.length - 1]?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
  }

  function showSolution() {
    const c = cs();
    const sc = scoreInfo(clue, c);
    const goNext = nextInBook;
    const content = h('div', { class: 'solution' },
      h('p', { class: `score-head ${c.st === 's' ? 'good' : ''}` }, sc.head),
      answerBoxes(clue, { letters: [...clue.letters], big: true }),
      h('p', { class: 'score-line' }, sc.line),
      h('section', { class: 'sol-sec' }, h('h3', { class: 'small-caps' }, 'How it works'), h('div', { class: 'prose', html: md(clue.explanation) })),
      clue.answerNotes?.length ? h('section', { class: 'sol-sec' }, clue.answerNotes.map((t) => h('div', { class: 'side-note' }, iconEl('flag', 'flag'), h('div', { class: 'prose', html: md(t) })))) : null,
      clue.notesAfterSolving?.length
        ? h('section', { class: 'sol-sec' }, h('h3', { class: 'small-caps' }, 'From the authors'),
            clue.notesAfterSolving.map((nt) => h('article', { class: 'card author-card' }, nt.title ? h('h4', {}, nt.title) : null, h('div', { class: 'prose', html: md(nt.text) }))))
        : null,
      h('div', { class: 'btn-col' },
        goNext ? h('a', { class: 'btn btn-primary', href: `#/clue/${goNext.id}` }, goNext.chapter !== clue.chapter ? `Next: Chapter ${goNext.chapter}` : 'Next clue', iconEl('next')) : null,
        h('a', { class: 'btn', href: `#/chapter/${ch.id}` }, 'Back to chapter'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: async () => { toast((await copyText(sc.share)) ? 'Result copied.' : 'Couldn’t copy. Try again.'); } }, iconEl('copy'), 'Copy result')));
    sheet({ title: c.st === 's' ? 'Solved' : 'Answer', content, className: 'solution-sheet' });
  }

  function handleKey(k) {
    if (/^[A-Z]$/.test(k)) typeLetter(k);
    else if (k === 'Backspace') backspace();
    else if (k === 'Enter') (done() ? showSolution() : check());
  }

  const offKeys = onPhysicalKeys((e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveCursor(-1); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor(1); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); backspace(); return; }
    if (e.key === 'Enter') {
      if (e.target?.closest?.('a,button:not(.box)')) return; // let focused buttons/links work
      e.preventDefault(); handleKey('Enter'); return;
    }
    if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
  });

  // Swipe left/right to change clue.
  let sx = 0, sy = 0, st0 = 0;
  main.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; st0 = Date.now(); }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (e.target.closest('textarea, input, .wheel')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - st0 < 600) {
      const target = dx < 0 ? next : prev;
      if (target) location.hash = `#/clue/${target.id}`;
    }
  }, { passive: true });

  renderAll();
  if (done()) boxesEl.classList.add('is-done');

  return {
    tab: 'learn',
    full: true,
    title: `Clue #${clue.number}`,
    el,
    destroy() { offKeys(); clearTimeout(wrongTimer); clearTimeout(padTimer); store.flush(); },
  };
}

function hintCard(step, i) {
  return h('article', { class: 'hint-card', 'aria-label': `Hint ${i + 1}` },
    h('span', { class: 'hint-num', 'aria-hidden': 'true' }, String(i + 1)),
    h('div', { class: 'hint-body' },
      h('div', { class: `prose ${step.image ? 'hint-image' : ''}`, html: md(step.text) }),
      (step.notes || []).map((note) => h('aside', { class: 'side-note' }, iconEl('flag', 'flag'), h('div', { class: 'prose', html: md(note) })))));
}

export function scoreInfo(clue, c) {
  const par = clue.par;
  const total = clue.hints.length;
  if (c.st === 'r') {
    const used = c.h || 0;
    return {
      head: 'Answer revealed. No harm done.',
      line: `Revealed · par ${par}. You can retry it from Solve.`,
      share: `Clue ${clue.id} 👀 ${'💡'.repeat(used)}${'⬜'.repeat(total - used)}`,
    };
  }
  const hs = c.hs || 0;
  const rl = (c.rv || []).length;
  const verdict = hs < par ? 'under par' : hs === par ? 'on par' : 'over par';
  const head = hs === 0 && !rl ? 'Clean solve. No hints needed.'
    : verdict === 'under par' ? 'Nice – under par.'
    : verdict === 'on par' ? 'Right on par. Well played.'
    : 'Got there. That’s what hints are for.';
  const hintsTxt = hs ? `Solved with ${hs} hint${hs === 1 ? '' : 's'}` : 'Solved with no hints';
  const rlTxt = rl ? ` and ${rl} revealed letter${rl === 1 ? '' : 's'}` : '';
  return {
    head,
    line: `${hintsTxt}${rlTxt} · par ${par} · ${verdict}`,
    share: `Clue ${clue.id} ✅ ${'💡'.repeat(hs)}${'⬜'.repeat(Math.max(0, total - hs))}`,
  };
}

// Letters arranged in a circle; Shuffle rearranges them.
function anagramWheel(initial, onChange) {
  const input = h('input', { class: 'wheel-input', type: 'text', maxlength: '16', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'Type letters', 'aria-label': 'Letters for the anagram wheel' });
  input.value = initial;
  const ring = h('div', { class: 'wheel', 'aria-hidden': 'true' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  let order = [];
  let spans = [];
  const letters = () => input.value.toUpperCase().replace(/[^A-Z]/g, '').split('');
  function build() {
    const ls = letters();
    ring.replaceChildren();
    spans = ls.map((L) => { const s = h('span', { class: 'wheel-letter' }, L); ring.append(s); return s; });
    order = ls.map((_, i) => i);
    place();
  }
  function place() {
    const len = spans.length;
    const radius = len <= 1 ? 0 : 38 + Math.min(len, 12) * 2.5;
    order.forEach((letterIdx, pos) => {
      const a = (pos / len) * Math.PI * 2 - Math.PI / 2;
      spans[letterIdx].style.transform = `translate(${Math.cos(a) * radius}px, ${Math.sin(a) * radius}px)`;
    });
    live.textContent = order.map((i) => spans[i].textContent).join(' ');
  }
  function shuffle() {
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    place();
  }
  input.addEventListener('input', () => { build(); onChange(input.value.trim()); });
  build();
  const el = h('div', { class: 'wheel-tool' },
    h('div', { class: 'ws-label' }, 'Anagram wheel'),
    h('div', { class: 'wheel-row' }, input, h('button', { class: 'btn btn-sm', type: 'button', onclick: shuffle }, iconEl('shuffle'), 'Shuffle')),
    ring, live);
  return { el };
}
