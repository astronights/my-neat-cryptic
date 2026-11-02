// Loads the book JSON once, validates it, and builds lookup indexes.
import { DATA_URLS } from './config.js';

export const DB = {};

const lettersOf = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');

export async function loadData() {
  const errors = [];
  for (const url of DATA_URLS) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let json;
      try { json = await res.json(); } catch { throw new Error('not valid JSON'); }
      const problems = validate(json);
      if (problems.length) {
        const e = new Error(`The data file has problems:\n- ${problems.slice(0, 8).join('\n- ')}`);
        e.fatal = true;
        throw e;
      }
      Object.assign(DB, buildIndex(json));
      // Set by api/data.js on Vercel: the cookie-refresh endpoint is available.
      DB.serverCookies = res.headers.get('x-cookie-refresh') === '1';
      return DB;
    } catch (e) {
      if (e.fatal) throw e;
      errors.push(`${url}: ${e.message}`);
    }
  }
  throw new Error(`Couldn’t load the puzzle data.\n${errors.join('\n')}`);
}

function validate(d) {
  const p = [];
  const isArr = Array.isArray;
  if (!d || typeof d !== 'object') return ['Root is not an object.'];
  if (!isArr(d.chapters) || !d.chapters.length) p.push('chapters is missing.');
  if (!isArr(d.introduction)) p.push('introduction is missing.');
  if (!isArr(d.conclusion)) p.push('conclusion is missing.');
  const ids = new Set();
  const allClues = [];
  for (const ch of d.chapters || []) {
    if (ch.id == null || !ch.title) p.push(`A chapter is missing id/title.`);
    if (!isArr(ch.lesson)) p.push(`Chapter ${ch.id} has no lesson.`);
    if (ch.kind === 'clues') {
      if (!isArr(ch.clues) || !ch.clues.length) p.push(`Chapter ${ch.id} has no clues.`);
      for (const c of ch.clues || []) {
        allClues.push(c);
        if (!c.id || ids.has(c.id)) p.push(`Clue id ${c.id} is missing or duplicated.`);
        ids.add(c.id);
        if (!c.clue || !c.answer) p.push(`Clue ${c.id} needs clue text and an answer.`);
        if (!isArr(c.lengths) || c.lengths.reduce((a, b) => a + b, 0) !== lettersOf(c.answer).length)
          p.push(`Clue ${c.id}: lengths don’t match the answer.`);
        if (!isArr(c.hints) || !c.hints.length) p.push(`Clue ${c.id} has no hints.`);
      }
    } else if (ch.kind === 'minis') {
      for (const cw of ch.crosswords || []) p.push(...validateCrossword(cw));
    } else p.push(`Chapter ${ch.id} has unknown kind “${ch.kind}”.`);
  }
  for (const c of allClues)
    for (const k of c.checkingLetters || [])
      if (k.verified !== false && !ids.has(k.ref)) p.push(`Clue ${c.id} refers to unknown clue ${k.ref}.`);
  if (d.megaCrossword) p.push(...validateCrossword(d.megaCrossword));
  else p.push('megaCrossword is missing.');
  return p;
}

function validateCrossword(cw) {
  const p = [];
  const n = cw?.size;
  if (!cw?.id || !n) return [`A crossword is missing id/size.`];
  const rowsOk = (rows) => Array.isArray(rows) && rows.length === n && rows.every((r) => r.length === n);
  if (!rowsOk(cw.grid) || !rowsOk(cw.solution)) return [`Crossword ${cw.id}: grid/solution must be ${n}×${n}.`];
  for (const q of cw.clues || []) {
    let s = '';
    for (let i = 0; i < q.length; i++) {
      const r = q.row + (q.direction === 'down' ? i : 0);
      const c = q.col + (q.direction === 'across' ? i : 0);
      s += cw.solution[r]?.[c] ?? '?';
    }
    if (s !== q.slotAnswer) p.push(`Crossword ${cw.id} ${q.number} ${q.direction} doesn’t fit the solution.`);
  }
  return p;
}

// "3,2,6" → [{len:3, sep:' '}, {len:2, sep:' '}, {len:6, sep:''}]; "4-3" uses '-'.
function parseParts(clue) {
  const seps = String(clue.enumeration || '').match(/[,\- ]/g) || [];
  return clue.lengths.map((len, i) => ({ len, sep: i < seps.length ? (seps[i] === '-' ? '-' : ' ') : '' }));
}

function buildIndex(d) {
  const clueById = {};
  const chapterById = {};
  const allClues = [];
  const crosswords = [];
  const crosswordById = {};
  for (const ch of d.chapters) {
    chapterById[ch.id] = ch;
    ch.clues = ch.clues || [];
    ch.clues.forEach((c, i) => {
      c.letters = lettersOf(c.answer);
      c.parts = parseParts(c);
      c.maxWord = Math.max(...c.lengths);
      c.index = i;
      c.par = Math.max(1, c.hints.length - 1);
      clueById[c.id] = c;
      allClues.push(c);
    });
    for (const cw of ch.crosswords || []) {
      prepCrossword(cw, ch);
      crosswords.push(cw);
    }
  }
  // Only use checking letters that are verified and actually consistent.
  for (const c of allClues) {
    c.checks = (c.checkingLetters || [])
      .filter((k) => k.verified !== false && clueById[k.ref])
      .map((k) => ({ ...k, idx: k.box - 1, otherIdx: k.otherBox - 1 }))
      .filter((k) => clueById[k.ref].letters[k.otherIdx] === c.letters[k.idx]);
  }
  prepCrossword(d.megaCrossword, null);
  crosswords.push(d.megaCrossword);
  for (const cw of crosswords) crosswordById[cw.id] = cw;
  return {
    raw: d,
    title: d.title,
    introduction: d.introduction,
    conclusion: d.conclusion,
    chapters: d.chapters,
    chapterById,
    clueById,
    allClues,
    crosswords,
    crosswordById,
  };
}

function prepCrossword(cw, chapter) {
  const n = cw.size;
  cw.chapter = chapter ? chapter.id : null;
  cw.cells = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      cw.cells.push({
        i: r * n + c, r, c,
        black: cw.grid[r][c] === '#',
        sol: cw.solution[r][c],
        num: cw.numbers?.[r]?.[c] || 0,
        slots: {},
      });
  cw.white = cw.cells.filter((x) => !x.black).length;
  cw.slots = {};
  cw.order = [];
  for (const q of cw.clues) {
    const key = q.number + (q.direction === 'across' ? 'A' : 'D');
    const cells = [];
    for (let i = 0; i < q.length; i++) {
      const r = q.row + (q.direction === 'down' ? i : 0);
      const c = q.col + (q.direction === 'across' ? i : 0);
      cells.push(r * n + c);
    }
    const slot = { key, q, dir: q.direction, number: q.number, cells };
    cw.slots[key] = slot;
    for (const i of cells) cw.cells[i].slots[q.direction] = key;
  }
  // Linked groups: e.g. 7 across has linkedNumbers [7, 8]; 8 across says "See 7".
  const find = (num, dir) => cw.slots[num + (dir === 'across' ? 'A' : 'D')] || cw.slots[num + (dir === 'across' ? 'D' : 'A')];
  for (const s of Object.values(cw.slots)) s.group = [s.key];
  for (const s of Object.values(cw.slots)) {
    if (s.q.linkedNumbers?.length) {
      const group = s.q.linkedNumbers.map((num) => find(num, s.dir)?.key).filter(Boolean);
      for (const k of group) { cw.slots[k].group = group; cw.slots[k].parent = s.key; }
    }
  }
  for (const s of Object.values(cw.slots)) {
    if (s.q.linkedTo != null && !s.parent) {
      const p = find(s.q.linkedTo, s.dir);
      if (p) s.parent = p.key;
    }
    if (!s.parent) s.parent = s.key;
  }
  const sorted = (dir) => Object.values(cw.slots).filter((s) => s.dir === dir).sort((a, b) => a.number - b.number);
  cw.across = sorted('across');
  cw.down = sorted('down');
  // Navigation order: one stop per clue (linked children are skipped).
  cw.order = [...cw.across, ...cw.down].filter((s) => s.parent === s.key).map((s) => s.key);
}
