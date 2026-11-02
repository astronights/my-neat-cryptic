import { DB } from '../data.js';
import { store } from '../store.js';
import { md, inline } from '../md.js';
import { h, header, iconEl, keyboard, onPhysicalKeys, menu, confirmDialog, sheet, announce, toast } from '../ui.js';
import { fmtTime } from '../progress.js';

const bitsToSet = (s) => { const out = new Set(); for (let i = 0; i < (s || '').length; i++) if (s[i] === '1') out.add(i); return out; };
const setToBits = (set, len) => { let s = ''; for (let i = 0; i < len; i++) s += set.has(i) ? '1' : '0'; return s.replace(/0+$/, ''); };

export function gridView(id) {
  const cw = DB.crosswordById[id];
  if (!cw) return { tab: 'crosswords', title: 'Not found', el: h('main', { class: 'page' }, header({ back: '#/crosswords', title: 'Crossword not found', big: true })) };
  const N = cw.size;
  const total = N * N;
  const saved = store.s.cw[id] || {};
  const blank = cw.cells.map((c) => (c.black ? '#' : ' ')).join('');
  const fill = (saved.f && saved.f.length === total ? saved.f : blank).split('');
  const checked = bitsToSet(saved.ck);
  const revealed = bitsToSet(saved.rv);
  const wrong = new Set();
  let elapsed = saved.t || 0;
  let doneAt = saved.done || 0;
  let runningSince = 0;

  const slotOf = (i, dir) => cw.cells[i].slots[dir];
  const firstSlot = cw.slots[cw.order[0]];
  let sel = { cell: firstSlot.cells[0], dir: firstSlot.dir };
  const letter = (i) => (fill[i] && fill[i] !== ' ' && fill[i] !== '#' ? fill[i] : '');
  const isCorrect = (i) => letter(i) === cw.cells[i].sol;
  const isLocked = (i) => revealed.has(i) || (checked.has(i) && isCorrect(i)) || !!doneAt;
  const curKey = () => slotOf(sel.cell, sel.dir) || slotOf(sel.cell, sel.dir === 'across' ? 'down' : 'across');
  const groupOf = (key) => cw.slots[key].group;
  const groupCells = (key) => groupOf(key).flatMap((k) => cw.slots[k].cells);
  const parentOf = (key) => cw.slots[cw.slots[key].parent];
  const entryCorrect = (key) => groupCells(cw.slots[key].parent).every(isCorrect);
  const clueLabel = (p) => {
    const nums = p.group.length > 1 ? p.group.map((k) => cw.slots[k].number).join(', ') : String(p.number);
    return `${nums} ${p.dir === 'across' ? 'Across' : 'Down'}`;
  };

  // ---- persistence + timer ----
  function persist() {
    tickTime();
    store.update((s) => {
      s.cw[id] = { f: fill.join(''), ck: setToBits(checked, total), rv: setToBits(revealed, total), t: Math.round(elapsed), ...(doneAt ? { done: doneAt } : {}) };
    });
  }
  function tickTime() {
    if (runningSince) { const now = Date.now(); elapsed += now - runningSince; runningSince = now; }
  }
  const startTimer = () => { if (!doneAt && !runningSince && document.visibilityState === 'visible') runningSince = Date.now(); };
  const stopTimer = () => { tickTime(); runningSince = 0; };
  const timerEl = h('span', { class: 'timer', 'aria-label': 'Time' }, fmtTime(elapsed));
  const interval = setInterval(() => { tickTime(); timerEl.textContent = fmtTime(elapsed); }, 1000);
  const onVis = () => { if (document.visibilityState === 'hidden') { stopTimer(); persist(); store.flush(); } else startTimer(); };
  document.addEventListener('visibilitychange', onVis);

  // ---- DOM ----
  const checkBtn = h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-haspopup': 'menu' }, 'Check');
  const revealBtn = h('button', { class: 'btn btn-sm btn-ghost', type: 'button', 'aria-haspopup': 'menu' }, 'Reveal');
  const listBtn = h('button', { class: 'icon-btn only-narrow', type: 'button', 'aria-label': 'All clues', onclick: openListSheet }, iconEl('list'));
  checkBtn.addEventListener('click', () => menu(checkBtn, [
    { label: 'Check square', onClick: () => doCheck([sel.cell]), disabled: !!doneAt },
    { label: 'Check word', onClick: () => doCheck(groupCells(curKey())), disabled: !!doneAt },
    { label: 'Check grid', onClick: () => doCheck(cw.cells.filter((c) => !c.black).map((c) => c.i)), disabled: !!doneAt },
  ]));
  revealBtn.addEventListener('click', () => menu(revealBtn, [
    { label: 'Reveal square', onClick: () => doReveal([sel.cell]), disabled: !!doneAt },
    { label: 'Reveal word', onClick: () => doReveal(groupCells(curKey())), disabled: !!doneAt },
    { label: 'Clear grid and start over', danger: true, onClick: resetGrid },
  ]));

  const top = header({
    back: '#/crosswords',
    kicker: cw.chapter ? `Set ${cw.chapter === 6 ? 1 : 2} · ${cw.title}` : cw.title,
    title: timerEl,
    actions: [checkBtn, revealBtn, listBtn],
  });

  const gridEl = h('div', { class: 'grid', role: 'group', 'aria-label': `${cw.title} grid, ${N} by ${N}`, style: { '--n': N } });
  const cellEls = cw.cells.map((c) => {
    if (c.black) return h('div', { class: 'cell black', 'aria-hidden': 'true' });
    return h('button', { class: 'cell', type: 'button', tabindex: '-1', 'data-i': c.i, onclick: () => tapCell(c.i) },
      c.num ? h('span', { class: 'cell-num', 'aria-hidden': 'true' }, c.num) : null,
      h('span', { class: 'cell-letter' }));
  });
  gridEl.append(...cellEls);

  const barText = h('button', { class: 'cluebar-text', type: 'button', onclick: () => (matchMedia('(min-width: 900px)').matches ? toggleDir() : openListSheet()) });
  const explainBtn = h('button', { class: 'btn btn-sm cluebar-explain', type: 'button', onclick: () => explain(parentOf(curKey()).key) }, 'Show explanation');
  const bar = h('div', { class: 'cluebar' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous clue', onclick: () => stepClue(-1) }, iconEl('prev')),
    h('div', { class: 'cluebar-mid' }, barText, explainBtn),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next clue', onclick: () => stepClue(1) }, iconEl('next')));

  const asideList = h('aside', { class: 'cw-clues only-wide', 'aria-label': 'Clues' });
  const doneBanner = h('div', { class: 'done-banner', hidden: true });
  const kb = keyboard(handleKey, { enterLabel: 'Next clue' });
  const el = h('div', { class: 'player grid-player' },
    top,
    h('main', { class: 'player-scroll' },
      h('div', { class: 'grid-layout' },
        h('div', { class: 'grid-col' }, doneBanner, h('div', { class: 'grid-wrap' }, gridEl)),
        asideList)),
    h('div', { class: 'player-bottom' }, bar, kb));

  // ---- rendering ----
  function render() {
    const key = curKey();
    const parent = parentOf(key);
    const hl = new Set(groupCells(parent.key));
    cw.cells.forEach((c) => {
      if (c.black) return;
      const b = cellEls[c.i];
      const L = letter(c.i);
      b.querySelector('.cell-letter').textContent = L;
      b.classList.toggle('hl', hl.has(c.i));
      b.classList.toggle('cur', c.i === sel.cell);
      b.classList.toggle('wrong', wrong.has(c.i));
      b.classList.toggle('rv', revealed.has(c.i));
      b.classList.toggle('ok', !revealed.has(c.i) && checked.has(c.i) && isCorrect(c.i));
      b.tabIndex = c.i === sel.cell ? 0 : -1;
      const where = [c.slots.across && `${cw.slots[c.slots.across].number} across`, c.slots.down && `${cw.slots[c.slots.down].number} down`].filter(Boolean).join(', ');
      const flags = [revealed.has(c.i) && 'revealed', wrong.has(c.i) && 'incorrect', checked.has(c.i) && isCorrect(c.i) && !revealed.has(c.i) && 'checked correct'].filter(Boolean);
      b.setAttribute('aria-label', `Row ${c.r + 1}, column ${c.c + 1}, ${where}. ${L ? `Letter ${L}` : 'Empty'}${flags.length ? `, ${flags.join(', ')}` : ''}`);
    });
    gridEl.classList.toggle('is-done', !!doneAt);
    const q = parent.q;
    barText.innerHTML = `<span class="cluebar-num">${clueLabel(parent)}</span> <span class="cluebar-clue">${inline(q.clue)} <span class="enum">(${q.enumeration || q.length})</span></span>`;
    explainBtn.hidden = !(q.explanation && entryCorrect(parent.key));
    doneBanner.hidden = !doneAt;
    if (doneAt) doneBanner.textContent = `Complete in ${fmtTime(elapsed)}. Tap any clue to read its explanation.`;
    kb.classList.toggle('kb-disabled', !!doneAt);
    renderList(asideList);
  }

  function renderList(container) {
    const activeParent = parentOf(curKey()).key;
    container.replaceChildren(...['across', 'down'].map((dir) =>
      h('section', { class: 'cw-clue-sec' },
        h('h3', { class: 'small-caps' }, dir === 'across' ? 'Across' : 'Down'),
        h('ol', {}, cw[dir].map((s) => {
          const parent = parentOf(s.key);
          const isChild = parent.key !== s.key;
          const correct = entryCorrect(s.key);
          const q = s.q;
          return h('li', { class: `cw-clue ${parent.key === activeParent ? 'active' : ''} ${correct ? 'correct' : ''}` },
            h('button', { class: 'cw-clue-btn', type: 'button', onclick: () => { selectSlot(parent.key); container.closest('.sheet') && listSheet?.close(); } },
              h('span', { class: 'cw-clue-num' }, isChild ? s.number : clueLabel(s).replace(/ (Across|Down)$/, '')),
              h('span', { class: 'cw-clue-text', html: isChild ? `<em>See ${parent.number}</em>` : `${inline(q.clue)} <span class="enum">(${q.enumeration || q.length})</span>` }),
              correct ? iconEl('check', 'icon-sm') : null),
            !isChild && correct && q.explanation ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', onclick: () => explain(s.key) }, 'Explain') : null);
        })))));
    // Keep the active clue visible inside its own scroll box (never scroll the page).
    const active = container.querySelector('.cw-clue.active');
    const scroller = container.closest('.sheet-body') || container;
    if (active && scroller.scrollHeight > scroller.clientHeight) {
      const a = active.getBoundingClientRect(), b = scroller.getBoundingClientRect();
      if (a.top < b.top) scroller.scrollTop -= b.top - a.top + 8;
      else if (a.bottom > b.bottom) scroller.scrollTop += a.bottom - b.bottom + 8;
    }
  }

  // ---- selection ----
  function selectSlot(key) {
    const parent = parentOf(key);
    const cells = groupCells(parent.key);
    sel = { cell: cells.find((i) => !letter(i)) ?? cells[0], dir: parent.dir };
    render();
  }
  function tapCell(i) {
    if (i === sel.cell) toggleDir();
    else {
      sel.cell = i;
      if (!slotOf(i, sel.dir)) sel.dir = sel.dir === 'across' ? 'down' : 'across';
      render();
    }
    cellEls[i].focus({ preventScroll: true });
  }
  function toggleDir() {
    const other = sel.dir === 'across' ? 'down' : 'across';
    if (slotOf(sel.cell, other)) { sel.dir = other; render(); }
  }
  function stepClue(d) {
    const cur = parentOf(curKey()).key;
    const i = cw.order.indexOf(cur);
    selectSlot(cw.order[(i + d + cw.order.length) % cw.order.length]);
  }
  function move(dr, dc) {
    const dir = dc ? 'across' : 'down';
    if (sel.dir !== dir && slotOf(sel.cell, dir)) { sel.dir = dir; render(); return; }
    let r = cw.cells[sel.cell].r + dr, c = cw.cells[sel.cell].c + dc;
    while (r >= 0 && r < N && c >= 0 && c < N) {
      const i = r * N + c;
      if (!cw.cells[i].black) { sel.cell = i; if (!slotOf(i, sel.dir)) sel.dir = dir; render(); return; }
      r += dr; c += dc;
    }
  }

  // ---- input ----
  function typeLetter(L) {
    if (doneAt) return;
    startTimer();
    const cells = groupCells(parentOf(curKey()).key);
    if (!isLocked(sel.cell)) { fill[sel.cell] = L; wrong.delete(sel.cell); }
    const pos = cells.indexOf(sel.cell);
    const empty = (i) => !letter(i) && !isLocked(i);
    const after = cells.slice(pos + 1).find(empty);
    const before = cells.slice(0, pos).find(empty);
    if (after != null) sel.cell = after;
    else if (before != null) sel.cell = before;
    else {
      // Entry full: jump to the next clue that still has gaps.
      const start = cw.order.indexOf(parentOf(curKey()).key);
      let moved = false;
      for (let k = 1; k <= cw.order.length; k++) {
        const key = cw.order[(start + k) % cw.order.length];
        const gap = groupCells(key).find(empty);
        if (gap != null) { sel = { cell: gap, dir: cw.slots[key].dir }; moved = true; break; }
      }
      if (!moved && pos + 1 < cells.length) sel.cell = cells[pos + 1];
    }
    afterChange();
  }
  function backspace() {
    if (doneAt) return;
    const cells = groupCells(parentOf(curKey()).key);
    if (letter(sel.cell) && !isLocked(sel.cell)) {
      fill[sel.cell] = ' ';
    } else {
      const pos = cells.indexOf(sel.cell);
      if (pos > 0) {
        sel.cell = cells[pos - 1];
        if (!slotOf(sel.cell, sel.dir)) sel.dir = sel.dir === 'across' ? 'down' : 'across';
        if (!isLocked(sel.cell)) fill[sel.cell] = ' ';
      }
    }
    wrong.delete(sel.cell);
    afterChange();
  }

  function afterChange() {
    const complete = cw.cells.every((c) => c.black || isCorrect(c.i));
    if (complete && !doneAt) {
      stopTimer();
      doneAt = Date.now();
      persist();
      render();
      announce(`Grid complete in ${fmtTime(elapsed)}.`);
      setTimeout(showComplete, 300);
      return;
    }
    persist();
    render();
    cellEls[sel.cell]?.focus({ preventScroll: true });
  }

  function doCheck(cells) {
    let bad = 0, good = 0;
    for (const i of cells) {
      if (!letter(i)) continue;
      checked.add(i);
      if (isCorrect(i)) good++; else { wrong.add(i); bad++; }
    }
    const msg = !good && !bad ? 'Nothing to check yet.' : bad ? `${bad} square${bad === 1 ? '' : 's'} not right yet.` : 'All correct so far.';
    toast(msg);
    announce(msg);
    persist();
    render();
  }
  function doReveal(cells) {
    startTimer();
    for (const i of cells) {
      if (isCorrect(i)) continue;
      fill[i] = cw.cells[i].sol;
      revealed.add(i);
      wrong.delete(i);
    }
    afterChange();
  }
  async function resetGrid() {
    if (!(await confirmDialog('Clear this grid?', 'All letters, checks and the timer for this grid will be reset.', 'Clear grid', true))) return;
    fill.splice(0, fill.length, ...blank.split(''));
    checked.clear(); revealed.clear(); wrong.clear();
    elapsed = 0; doneAt = 0; runningSince = 0;
    store.update((s) => { delete s.cw[id]; });
    startTimer();
    selectSlot(cw.order[0]);
  }

  function explain(key) {
    const s = parentOf(key);
    const q = s.q;
    sheet({
      title: `${clueLabel(s)}`,
      className: 'explain-sheet',
      content: h('div', {},
        h('p', { class: 'serif explain-clue', html: `${inline(q.clue)} <span class="enum">(${q.enumeration || q.length})</span>` }),
        h('p', { class: 'explain-answer' }, q.answer || q.slotAnswer),
        h('div', { class: 'prose', html: md(q.explanation) })),
    });
  }

  let listSheet = null;
  function openListSheet() {
    const box = h('div', { class: 'cw-clues' });
    renderList(box);
    listSheet = sheet({ title: 'Clues', content: box, className: 'list-sheet', onClose: () => { listSheet = null; } });
  }

  function showComplete() {
    const ck = checked.size;
    const rv = revealed.size;
    sheet({
      title: 'Grid complete',
      className: 'solution-sheet',
      content: h('div', { class: 'solution' },
        h('p', { class: 'score-head good' }, rv ? 'Done. Every square filled in.' : ck ? 'Nicely done.' : 'Clean grid. Lovely work.'),
        h('div', { class: 'complete-stats' },
          h('div', {}, h('strong', {}, fmtTime(elapsed)), h('span', {}, 'time')),
          h('div', {}, h('strong', {}, String(ck)), h('span', {}, `square${ck === 1 ? '' : 's'} checked`)),
          h('div', {}, h('strong', {}, String(rv)), h('span', {}, `square${rv === 1 ? '' : 's'} revealed`))),
        h('p', { class: 'muted' }, 'Tap any clue to read how it works.'),
        h('div', { class: 'btn-col' },
          h('a', { class: 'btn btn-primary', href: '#/crosswords' }, 'Back to crosswords'),
          h('button', { class: 'btn', type: 'button', onclick: (e) => e.target.closest('.overlay')?.querySelector('.sheet-close')?.click() }, 'Look at the grid'))),
    });
  }

  function handleKey(k) {
    if (/^[A-Z]$/.test(k)) typeLetter(k);
    else if (k === 'Backspace') backspace();
    else if (k === 'Enter') stepClue(1);
  }

  const offKeys = onPhysicalKeys((e) => {
    const k = e.key;
    if (k === 'ArrowLeft') { e.preventDefault(); move(0, -1); }
    else if (k === 'ArrowRight') { e.preventDefault(); move(0, 1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1, 0); }
    else if (k === 'ArrowDown') { e.preventDefault(); move(1, 0); }
    else if (k === 'Tab') { e.preventDefault(); stepClue(e.shiftKey ? -1 : 1); }
    else if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); backspace(); }
    else if (k === ' ' && e.target?.classList?.contains('cell')) { e.preventDefault(); toggleDir(); }
    else if (k === 'Enter') { if (e.target?.closest?.('a,button:not(.cell)')) return; e.preventDefault(); stepClue(1); }
    else if (/^[a-zA-Z]$/.test(k)) { e.preventDefault(); typeLetter(k.toUpperCase()); }
  });

  if (!doneAt) { const firstEmpty = cw.order.find((k) => groupCells(k).some((i) => !letter(i))); if (firstEmpty) selectSlot(firstEmpty); }
  render();
  startTimer();

  return {
    tab: 'crosswords',
    full: true,
    title: cw.title,
    el,
    destroy() {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      offKeys();
      stopTimer();
      if (store.s.cw[id] || fill.some((x, i) => x !== blank[i])) persist();
      store.flush();
    },
  };
}
