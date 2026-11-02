#!/usr/bin/env node
// Renames the app everywhere it appears: js/config.js, index.html, manifest.webmanifest.
// Usage: node scripts/rename.mjs "Full Name" ["Short Name"]
import { readFileSync, writeFileSync } from 'node:fs';

const [name, short = name] = process.argv.slice(2);
if (!name) { console.error('Usage: node scripts/rename.mjs "Full Name" ["Short Name"]'); process.exit(1); }
const q = (s) => JSON.stringify(s);

const edit = (file, fn) => { const before = readFileSync(file, 'utf8'); const after = fn(before); writeFileSync(file, after); console.log(`${before === after ? '·' : '✓'} ${file}`); };

edit('js/config.js', (s) => s
  .replace(/(\n\s*name: )'[^']*'/, `$1${q(name).replace(/^"|"$/g, "'")}`)
  .replace(/(\n\s*shortName: )'[^']*'/, `$1${q(short).replace(/^"|"$/g, "'")}`));
edit('index.html', (s) => s
  .replace(/<title>[^<]*<\/title>/, `<title>${name.replace(/</g, '&lt;')}</title>`)
  .replace(/(apple-mobile-web-app-title" content=")[^"]*"/, `$1${short.replace(/"/g, '&quot;')}"`));
edit('manifest.webmanifest', (s) => {
  const m = JSON.parse(s);
  m.name = name;
  m.short_name = short;
  return JSON.stringify(m, null, 2) + '\n';
});
console.log('Done. Bump VERSION in sw.js so installed copies pick up the change.');
