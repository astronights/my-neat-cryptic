#!/usr/bin/env node
// Moves the puzzle data into Vercel Blob or Neon so it doesn't need to live in the repo.
//
// Usage:
//   node scripts/upload-data.mjs blob [file] [--access private|public] [--move]
//   node scripts/upload-data.mjs neon [file] [--move]
//
//   file      defaults to data/minute_cryptic.json
//   --move    delete the local file after a successful upload
//
// Credentials come from the environment or from .env.local / .env
// (run `vercel env pull .env.local` to fetch them from your Vercel project):
//   blob → BLOB_READ_WRITE_TOKEN
//   neon → DATABASE_URL (or POSTGRES_URL)

import { readFileSync, existsSync, unlinkSync } from 'node:fs';

const args = process.argv.slice(2);
const target = args[0];
const flags = new Set(args.filter((a) => a.startsWith('--')));
const accessIdx = args.indexOf('--access');
const access = accessIdx > -1 ? args[accessIdx + 1] : process.env.BLOB_ACCESS || 'private';
const file = args.slice(1).find((a, i, arr) => !a.startsWith('--') && arr[i - 1] !== '--access') || 'data/minute_cryptic.json';
const PATHNAME = process.env.BLOB_PATHNAME || 'data/minute_cryptic.json';
const DATA_KEY = process.env.DATA_KEY || 'minute_cryptic';

function loadEnvFiles() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m || process.env[m[1]] !== undefined) continue;
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
}

function die(msg) { console.error(`\n✗ ${msg}\n`); process.exit(1); }

if (!['blob', 'neon'].includes(target)) die('Say where to upload: `blob` or `neon`.\n  e.g. node scripts/upload-data.mjs blob');
if (!existsSync(file)) die(`Can't find ${file}.`);
loadEnvFiles();

const text = readFileSync(file, 'utf8');
let parsed;
try { parsed = JSON.parse(text); } catch { die(`${file} is not valid JSON.`); }
if (!Array.isArray(parsed.chapters) || !parsed.megaCrossword) die(`${file} doesn't look like the puzzle data (no chapters/megaCrossword).`);
const minified = JSON.stringify(parsed);
console.log(`Read ${file} (${(minified.length / 1024).toFixed(0)} KB, ${parsed.chapters.length} chapters).`);

if (target === 'blob') {
  if (!process.env.BLOB_READ_WRITE_TOKEN) die('BLOB_READ_WRITE_TOKEN is not set. Create a Blob store in Vercel (Storage → Blob), connect it to the project, then run `vercel env pull .env.local`.');
  const { put } = await import('@vercel/blob');
  const blob = await put(PATHNAME, minified, {
    access,
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  console.log(`✓ Uploaded to Vercel Blob (${access}): ${blob.pathname}`);
  if (access !== 'private') console.log(`  Public URL: ${blob.url}`);
  console.log(`  The /api/data function reads it with BLOB_ACCESS=${access}${access === 'private' ? ' (the default)' : ' – set this env var in Vercel'}.`);
} else {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) die('DATABASE_URL is not set. Add Neon to the project (Storage → Neon), then run `vercel env pull .env.local`.');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  await sql`create table if not exists app_data (key text primary key, data jsonb not null, updated_at timestamptz not null default now())`;
  await sql`insert into app_data (key, data, updated_at) values (${DATA_KEY}, ${minified}::jsonb, now())
            on conflict (key) do update set data = excluded.data, updated_at = now()`;
  const [row] = await sql`select key, pg_column_size(data) as bytes, updated_at from app_data where key = ${DATA_KEY}`;
  console.log(`✓ Stored in Neon table app_data, key "${row.key}" (${(row.bytes / 1024).toFixed(0)} KB, ${new Date(row.updated_at).toISOString()}).`);
  console.log('  Set DATA_SOURCE=neon in Vercel if you also have a Blob store connected.');
}

if (flags.has('--move')) {
  unlinkSync(file);
  console.log(`✓ Deleted local ${file}. The app on Vercel now loads it from /api/data.`);
} else {
  console.log(`  (Local ${file} kept. Add --move to delete it after uploading.)`);
}
