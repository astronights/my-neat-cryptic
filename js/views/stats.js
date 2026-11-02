import { DB } from '../data.js';
import { store } from '../store.js';
import { STORE_KEY } from '../config.js';
import { h, header, confirmDialog, toast } from '../ui.js';
import { chapterProgress, crosswordProgress, streaks } from '../progress.js';

export function statsView({ settings: jumpToSettings = false } = {}) {
  const S = store.s;
  const solvedClues = DB.allClues.filter((c) => S.clues[c.id]?.st === 's');
  const revealedCount = DB.allClues.filter((c) => S.clues[c.id]?.st === 'r').length;
  const noHints = solvedClues.filter((c) => !S.clues[c.id].hs && !(S.clues[c.id].rv || []).length).length;
  const avgHints = solvedClues.length ? solvedClues.reduce((a, c) => a + (S.clues[c.id].hs || 0), 0) / solvedClues.length : 0;
  const avgPar = solvedClues.length ? solvedClues.reduce((a, c) => a + c.par, 0) / solvedClues.length : 0;
  const underPar = solvedClues.filter((c) => (S.clues[c.id].hs || 0) < c.par).length;
  const cwDone = DB.crosswords.filter((cw) => crosswordProgress(cw).done).length;
  const st = streaks();

  const tile = (value, label, sub) => h('div', { class: 'tile' }, h('strong', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label), sub ? h('span', { class: 'tile-sub' }, sub) : null);

  const bars = h('ul', { class: 'bars' }, DB.chapters.map((ch) => {
    const { done, total } = chapterProgress(ch);
    const pct = total ? Math.round((done / total) * 100) : 0;
    return h('li', {},
      h('a', { class: 'bar-row', href: `#/chapter/${ch.id}`, 'aria-label': `Chapter ${ch.id}, ${ch.title}: ${done} of ${total}` },
        h('span', { class: 'bar-label' }, h('span', { class: 'bar-num' }, ch.id), ch.title),
        h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${done === total ? 'full' : ''}`, style: { width: `${pct}%` } })),
        h('span', { class: 'bar-val' }, `${done}/${total}`)));
  }));

  return {
    tab: 'stats',
    title: jumpToSettings ? 'Settings' : 'Stats',
    el: h('main', { class: 'page' },
      header({ kicker: 'Your progress', title: 'Stats', big: true }),
      h('div', { class: 'tiles' },
        tile(`${solvedClues.length}`, 'clues solved', `of ${DB.allClues.length}${revealedCount ? ` · ${revealedCount} revealed` : ''}`),
        tile(`${noHints}`, 'without hints'),
        tile(solvedClues.length ? avgHints.toFixed(1) : '–', 'hints per clue', solvedClues.length ? `par ${avgPar.toFixed(1)} · ${underPar} under par` : 'par appears once you solve'),
        tile(`${cwDone}`, 'crosswords done', `of ${DB.crosswords.length}`)),
      h('div', { class: 'streaks card' },
        h('div', {}, h('strong', { class: 'streak-num' }, String(st.current)), h('span', {}, `day${st.current === 1 ? '' : 's'} current streak`)),
        h('div', {}, h('strong', { class: 'streak-num' }, String(st.best)), h('span', {}, 'best streak')),
        h('p', { class: 'muted small' }, st.current ? 'Solve a clue each day to keep it going.' : 'Solve a clue today to start a streak.')),
      h('h2', { class: 'section-title' }, 'By chapter'),
      bars,
      settingsSection()),
    mounted() {
      if (jumpToSettings) document.getElementById('settings')?.scrollIntoView();
    },
    keepScroll: false,
  };
}

function settingsSection() {
  const S = store.s;
  const sw = (label, desc, key) => {
    const input = h('input', { type: 'checkbox', role: 'switch', class: 'switch-input' });
    input.checked = !!S.settings[key];
    input.addEventListener('change', () => store.update((s) => { s.settings[key] = input.checked; }));
    return h('label', { class: 'setting' }, h('span', { class: 'setting-text' }, h('strong', {}, label), desc ? h('small', {}, desc) : null), input, h('span', { class: 'switch', 'aria-hidden': 'true' }));
  };
  const themeOpts = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];
  const theme = h('fieldset', { class: 'setting segmented-wrap' },
    h('legend', { class: 'setting-text' }, h('strong', {}, 'Appearance')),
    h('div', { class: 'segmented' }, themeOpts.map(([v, label]) => {
      const input = h('input', { type: 'radio', name: 'theme', value: v, id: `theme-${v}` });
      input.checked = S.settings.theme === v;
      input.addEventListener('change', () => store.update((s) => { s.settings.theme = v; }));
      return [input, h('label', { for: `theme-${v}` }, label)];
    })));

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (!(await confirmDialog('Import progress?', 'This replaces your current progress on this device.', 'Import', true))) return;
      await store.importJSON(text);
      toast('Progress imported.');
      location.hash = '#/stats';
      dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (e) {
      toast(e.message || 'That file couldn’t be imported.');
    }
  });
  const exportProgress = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `cryptic-progress-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    toast('Progress exported.');
  };
  const reset = async () => {
    if (!(await confirmDialog('Reset all progress?', 'Every solved clue, crossword and note on this device will be cleared. This can’t be undone.', 'Reset everything', true))) return;
    await store.reset();
    toast('Progress reset.');
    dispatchEvent(new HashChangeEvent('hashchange'));
  };

  const kb = (store.sizeBytes() / 1024).toFixed(1);
  return h('section', { id: 'settings', class: 'settings', 'aria-labelledby': 'settings-title' },
    h('h2', { class: 'section-title', id: 'settings-title' }, 'Settings'),
    h('div', { class: 'card settings-card' },
      sw('Use checking letters', 'Letters from solved clues fill in automatically.', 'checking'),
      theme,
      sw('Larger text', 'Bigger type for reading lessons and clues.', 'large')),
    h('h3', { class: 'small-caps' }, 'Progress'),
    h('div', { class: 'card settings-card' },
      h('p', { class: 'muted small' }, `Saved in cookies on this device (${kb} KB, key “${STORE_KEY}”). Export a copy to move it to another device.`),
      h('div', { class: 'btn-row wrap' },
        h('button', { class: 'btn', type: 'button', onclick: exportProgress }, 'Export'),
        h('button', { class: 'btn', type: 'button', onclick: () => fileInput.click() }, 'Import'),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: reset }, 'Reset')),
      fileInput));
}
