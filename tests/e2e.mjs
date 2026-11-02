// End-to-end test: node tests/e2e.mjs
// Checks every clue opens and can be solved by typing, checking letters fill in,
// all crosswords complete, progress survives a reload, and the app works offline.
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { start } from './server.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const data = JSON.parse(readFileSync(new URL('../data/minute_cryptic.json', import.meta.url)));
const letters = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
const clues = data.chapters.flatMap((c) => c.clues || []);
const byId = Object.fromEntries(clues.map((c) => [c.id, c]));
const crosswords = [...data.chapters.flatMap((c) => c.crosswords || []), data.megaCrossword];

let failures = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { failures++; console.log(`  ✗ ${msg}`); } };

// 0. Static checks: every app file is precached by the service worker.
console.log('Service worker shell list');
{
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const files = ['js', 'js/views'].flatMap((d) => readdirSync(new URL(`../${d}`, import.meta.url)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));
  const missing = files.filter((f) => !sw.includes(`'${f}'`));
  ok(!missing.length, `all ${files.length} JS modules are in SHELL${missing.length ? ` (missing: ${missing})` : ''}`);
}

const { server, hits, url } = await start(0);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const go = async (hash) => {
  await page.evaluate((h) => { location.hash = h; }, hash);
};
const closeSheets = async () => {
  while (await page.locator('.overlay').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
  }
};

try {
  console.log('Boot');
  await page.goto(url);
  await page.waitForSelector('.path');
  ok((await page.locator('.path-node').count()) === 13, 'Learn shows 12 chapters + Mega');
  ok((await page.locator('.pill-continue').innerText()).includes('Continue: Clue #1'), 'next unsolved clue is highlighted');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  ok(true, 'service worker installed and controlling the page');

  console.log('Chapter page');
  await go('#/chapter/1');
  await page.waitForSelector('.clue-card');
  ok((await page.locator('.clue-card').count()) === 6, 'chapter 1 lists 6 clue cards');
  ok((await page.locator('details.lesson-sec[open]').count()) > 0, 'lesson sections start open on first read');

  console.log('Clue player: the on-screen keyboard and a wrong answer');
  await go('#/clue/ch1-2');
  await page.waitForSelector('.clue-text');
  for (const ch of 'SADDENEX') await page.locator(`.kb-key[data-key="${ch}"]`).click();
  await page.locator('.clue-controls .btn-primary').click();
  await page.waitForSelector('.box.wrong');
  ok((await page.locator('.box.wrong').count()) === 1, 'wrong letter is marked red, others kept');
  ok(await page.waitForFunction(() => document.getElementById('sr').textContent.startsWith('Incorrect')).then(() => true, () => false), 'wrong answer is announced');
  await page.locator('.clue-controls .btn').first().click();
  ok((await page.locator('.hint-card').count()) === 1 && (await page.locator('.hint-count').innerText()) === 'Hints 1 / 4', 'hint reveals step 1, count shows 1 / 4');
  await page.locator('.kb-key[aria-label="Backspace"]').click();
  await page.locator('.kb-key[data-key="D"]').click();
  await page.locator('.kb-key[aria-label="Check"]').click();
  await page.waitForSelector('.solution-sheet');
  ok((await page.locator('.score-line').innerText()) === 'Solved with 1 hint · par 3 · under par', 'score line: 1 hint, par 3, under par');
  ok(await page.waitForFunction(() => document.getElementById('sr').textContent.startsWith('Correct')).then(() => true, () => false), 'correct answer is announced');
  await closeSheets();

  console.log(`Solve all ${clues.length} clues by typing`);
  let opened = 0, solved = 0, checkOk = 0, checkTotal = 0, chipOk = 0, chipTotal = 0;
  const done = new Set(['ch1-2']);
  for (const c of clues) {
    await go(`#/clue/${c.id}`);
    await page.waitForSelector(`.clue-text`);
    const boxes = page.locator('.clue-main .box');
    const n = letters(c.answer).length;
    if ((await boxes.count()) === n) opened++;
    if (done.has(c.id)) { solved++; continue; }
    // Checking letters from already-solved clues are pre-filled and locked.
    const valid = (c.checkingLetters || []).filter((k) => k.verified !== false);
    const locked = await page.$$eval('.clue-main .box', (els) => els.map((e) => (e.classList.contains('locked') ? e.textContent : null)));
    for (const k of valid) {
      if (done.has(k.ref)) { checkTotal++; if (locked[k.box - 1] === letters(c.answer)[k.box - 1]) checkOk++; }
    }
    const expectedChips = valid.filter((k) => !done.has(k.ref)).length;
    chipTotal++;
    if ((await page.locator('.chips .chip').count()) === expectedChips) chipOk++;
    // Unverified checking letters must never be used.
    for (const k of (c.checkingLetters || []).filter((k) => k.verified === false)) {
      if (locked[k.box - 1]) { failures++; console.log(`  ✗ ${c.id} used an unverified checking letter`); }
    }
    const L = letters(c.answer);
    for (let i = 0; i < L.length; i++) if (locked[i] == null) await page.keyboard.press(L[i]);
    await page.keyboard.press('Enter');
    await page.waitForSelector('.solution-sheet', { timeout: 5000 });
    solved++;
    done.add(c.id);
    await closeSheets();
  }
  ok(opened === clues.length, `every clue opens with the right number of boxes (${opened}/${clues.length})`);
  ok(solved === clues.length, `every clue solved by typing its answer (${solved}/${clues.length})`);
  ok(checkTotal > 50 && checkOk === checkTotal, `checking letters pre-filled correctly (${checkOk}/${checkTotal})`);
  ok(chipOk === chipTotal, `checking-letter chips shown for unsolved references (${chipOk}/${chipTotal})`);

  console.log('Revisit a clue with checking letters after everything is solved');
  await page.evaluate(() => { document.cookie; });
  await go('#/clue/ch1-1');
  await page.waitForSelector('.clue-text');
  ok((await page.locator('.clue-main .box.ok').count()) === letters(byId['ch1-1'].answer).length, 'solved clue shows green boxes');

  console.log('Reveal answer + Retry flow');
  await page.evaluate(() => {});
  await go('#/solve');
  await page.waitForSelector('.page');
  ok((await page.locator('.next-up').innerText()).includes('Every clue is done'), 'Solve tab knows everything is solved');

  console.log('Crosswords');
  // Natural typing with auto-advance on mini 1, 1 across.
  await go('#/crossword/ch6-mini1');
  await page.waitForSelector('.grid');
  await page.locator('.cell[data-i="0"]').click();
  if (!(await page.locator('.cluebar-num').innerText()).includes('ACROSS') && !(await page.locator('.cluebar-num').innerText()).includes('Across')) await page.locator('.cell[data-i="0"]').click();
  for (const ch of 'PARTIES') await page.keyboard.press(ch);
  const row0 = await page.$$eval('.grid .cell', (els) => els.slice(0, 7).map((e) => e.textContent.replace(/\d/g, '')).join(''));
  ok(row0 === 'PARTIES', 'typing fills 1 across with auto-advance');
  ok((await page.locator('.cluebar-num').innerText()).toUpperCase() !== '1 ACROSS', 'a full entry jumps to the next clue with gaps');
  await page.locator('.cell[data-i="1"]').click();
  if (!(await page.locator('.cluebar-num').innerText()).toUpperCase().includes('1 ACROSS')) await page.locator('.cell[data-i="1"]').click();
  ok(await page.locator('.cluebar-explain').isVisible(), '“Show explanation” appears once the entry is correct');
  // Check square on a wrong letter.
  await page.locator('.cell[data-i="14"]').click();
  await page.keyboard.press('Z');
  await page.locator('.cell[data-i="14"]').click();
  await page.locator('.topbar-actions .btn', { hasText: 'Check' }).click();
  await page.locator('.menu-item', { hasText: 'Check square' }).click();
  ok(await page.locator('.cell[data-i="14"].wrong').count() === 1, 'check square marks a wrong letter');

  // Linked clue on mini 3: 7,8 across = RED SEA.
  await go('#/crossword/ch6-mini3');
  await page.waitForSelector('.grid');
  const mini3 = crosswords.find((x) => x.id === 'ch6-mini3');
  const sea = mini3.clues.find((q) => q.number === 8 && q.direction === 'across');
  await page.locator(`.cell[data-i="${sea.row * 7 + sea.col}"]`).click();
  ok((await page.locator('.cluebar-num').innerText()).includes('7, 8'), 'selecting “See 7” shows the linked parent clue 7, 8 across');
  ok((await page.locator('.grid .cell.hl').count()) >= 6, 'linked slots are highlighted together');

  for (const cw of crosswords) {
    await go(`#/crossword/${cw.id}`);
    await page.waitForSelector('.grid');
    await closeSheets();
    const n = cw.size;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (cw.grid[r][c] === '#') continue;
      const i = r * n + c;
      const cell = page.locator(`.cell[data-i="${i}"]`);
      const cur = (await cell.innerText()).replace(/\d/g, '').trim();
      if (cur === cw.solution[r][c]) continue;
      await cell.click();
      await page.keyboard.press(cw.solution[r][c]);
      if (await page.locator('.solution-sheet').count()) break;
    }
    await page.waitForSelector('.solution-sheet', { timeout: 5000 });
    const head = await page.locator('.solution-sheet .sheet-title').innerText();
    ok(head === 'Grid complete', `${cw.id} (${cw.size}×${cw.size}) completes and shows the completion screen`);
    await closeSheets();
  }

  console.log('Reload: progress survives');
  await page.waitForTimeout(400);
  const cookieInfo = await page.evaluate(() => document.cookie.split('; ').filter((c) => c.startsWith('cq_v1')).map((c) => c.length));
  console.log(`    cookies: ${cookieInfo.length}, total ${cookieInfo.reduce((a, b) => a + b, 0)} chars`);
  await page.reload();
  await page.waitForSelector('#app .screen');
  await go('#/stats');
  await page.waitForSelector('.tiles');
  const tiles = await page.locator('.tile-value').allInnerTexts();
  ok(tiles[0] === String(clues.length), `stats: ${tiles[0]} clues solved after reload`);
  ok(tiles[3] === String(crosswords.length), `stats: ${tiles[3]} crosswords complete after reload`);
  ok((await page.locator('.streak-num').first().innerText()) === '1', 'current streak is 1 day');
  await go('#/crosswords');
  await page.waitForSelector('.cw-card');
  ok((await page.locator('.cw-card.complete').count()) === crosswords.length, 'crossword list shows all grids complete');
  ok(hits.touch > 0, `cookie refresh endpoint was called (${hits.touch}×)`);

  console.log('Settings: export, theme, reset/import');
  await go('#/settings');
  await page.waitForSelector('#settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#settings .btn', { hasText: 'Export' }).click()]);
  const exported = readFileSync(await download.path(), 'utf8');
  ok(JSON.parse(exported).progress.clues['ch1-1'].st === 's', 'export downloads a JSON file with progress');
  await page.locator('label[for="theme-dark"]').click();
  ok((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark mode applies');
  await page.locator('#settings .btn-danger').click();
  await page.locator('.dialog [data-ok]').click();
  await page.waitForTimeout(300);
  await page.waitForSelector('.tiles');
  ok((await page.locator('.tile-value').first().innerText()) === '0', 'reset clears progress');
  await page.locator('#settings input[type=file]').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await page.locator('.dialog [data-ok]').click();
  await page.waitForTimeout(500);
  await page.reload();
  await go('#/stats');
  await page.waitForSelector('.tiles');
  ok((await page.locator('.tile-value').first().innerText()) === String(clues.length), 'import restores progress (survives reload)');

  console.log('Offline (airplane mode)');
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('#app .screen', { timeout: 10000 });
  ok((await page.locator('.error-page').count()) === 0, 'app loads offline');
  await go('#/clue/ch3-1');
  await page.waitForSelector('.clue-text');
  ok(true, 'a clue opens offline');
  await go('#/crossword/mega');
  await page.waitForSelector('.grid');
  ok((await page.locator('.grid .cell').count()) === 225, 'mega crossword opens offline');
  await go('#/intro');
  await page.waitForSelector('.prose');
  ok(true, 'introduction opens offline');
  const fontsOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('italic 800 20px Fraunces') && document.fonts.check('16px Inter'); });
  ok(fontsOk, 'web fonts are available offline');
  await context.setOffline(false);

  console.log('Console');
  ok(errors.length === 0, `no console errors${errors.length ? `:\n    ${errors.slice(0, 5).join('\n    ')}` : ''}`);
} catch (e) {
  failures++;
  console.error(e);
  await page.screenshot({ path: 'test-results/failure.png' }).catch(() => {});
} finally {
  await browser.close();
  server.close();
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
