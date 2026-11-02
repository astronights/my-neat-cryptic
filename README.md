# Clueworthy

A static, offline-first PWA for learning and solving cryptic crossword clues:
12 chapters of lessons and 101 clues, 6 mini crosswords and a 15×15 Mega crossword.
Plain HTML + CSS + vanilla ES modules. No build step, no framework.

> **Renaming:** "Clueworthy" is a placeholder. Run `node scripts/rename.mjs "New Name" "Short"`
> to update `js/config.js`, `index.html` and `manifest.webmanifest` together, then bump
> `VERSION` in `sw.js`.

## File tree

```
index.html               App shell (relative URLs only, works from a sub-path)
manifest.webmanifest     PWA manifest (standalone, portrait)
sw.js                    Service worker: precaches shell, data and fonts; versioned cache
css/app.css              All styles (light + dark tokens, reduced motion)
js/config.js             App name, data URLs, storage key
js/app.js                Hash router, boot, update toast
js/data.js               Loads + validates the JSON once, builds indexes
js/store.js              Progress in cookies (compressed, chunked, versioned)
js/progress.js           Statuses, checking letters, streaks
js/md.js                 Tiny safe markdown renderer (**bold**, lists, paragraphs)
js/ui.js                 DOM helper, icons, sheets, menus, toasts, on-screen keyboard
js/views/learn.js        Learn path, chapter page, introduction/conclusion
js/views/clue.js         Clue player, hints, solution sheet, workspace + anagram wheel
js/views/solve.js        Next up, random, chapter filter, retry
js/views/crosswords.js   Crossword list
js/views/grid.js         Crossword grid player
js/views/stats.js        Stats + settings (export / import / reset)
icons/                   icon.svg, 192/512 PNGs, maskable, apple-touch-icon
data/minute_cryptic.json Book data (git-ignored; see "Data" below)
api/data.js              Vercel function: serves the data from Vercel Blob or Neon
api/touch.js             Vercel function: re-issues progress cookies with a long lifetime
scripts/upload-data.mjs  Moves the data file into Vercel Blob or Neon
scripts/make-icons.mjs   Regenerates the icons
scripts/rename.mjs       Renames the app
tests/e2e.mjs            Playwright end-to-end test
vercel.json              Headers + rewrite of the data path to /api/data
```

## Run locally

Put the data file at `data/minute_cryptic.json`, then:

```bash
npx serve .
```

Open the URL it prints. (Any static server works. Service workers need `localhost` or HTTPS.)

Run the tests (needs Playwright + Chromium):

```bash
npm test
```

They check that every clue opens and solves by typing, checking letters fill in, all 7
crosswords complete, progress survives a reload, export/import/reset work, the app works
offline, and there are no console errors.

## Data

`data/minute_cryptic.json` is git-ignored so the book content isn't in the repo. The app
loads `data/minute_cryptic.json`; on Vercel, `vercel.json` rewrites that path to
`/api/data`, which reads it from Vercel Blob or Neon.

### Easiest: upload in the Vercel dashboard (no CLI)

1. In your Vercel project, open **Storage** → **Create Database** → **Blob** and connect it to
   the project (this adds `BLOB_READ_WRITE_TOKEN` automatically).
2. Open the Blob store's **Browser** tab and click **Upload**. Pick `minute_cryptic.json`.
   Any folder is fine, and so is a random suffix on the name: `/api/data` uses the newest blob
   named `minute_cryptic*.json`. Public and private stores both work.
3. Redeploy the project (Deployments → ⋯ → Redeploy) so the function picks up the new
   environment variable.
4. Check `https://<your-site>/api/data` shows the JSON.

### Or: upload with the script

Credentials come from the environment or `.env.local`. Without the Vercel CLI, copy
`BLOB_READ_WRITE_TOKEN` (or `DATABASE_URL` for Neon) from the project's **Settings →
Environment Variables** into a `.env.local` file instead of running `vercel env pull`.

```bash
npm install
```

```bash
vercel env pull .env.local
```

Then **one** of:

```bash
npm run upload:blob
```

```bash
npm run upload:neon
```

- **Vercel Blob:** create a Blob store (Storage → Blob) and connect it to the project. This sets
  `BLOB_READ_WRITE_TOKEN`. The file is stored privately at `data/minute_cryptic.json`.
  (Add `-- --access public` if your store is public, and set `BLOB_ACCESS=public` in Vercel.)
- **Neon:** add Neon (Storage → Neon) to the project. This sets `DATABASE_URL`. The script
  creates the table `app_data(key, data jsonb, updated_at)` and upserts the row `minute_cryptic`.
  If you have both stores connected, set `DATA_SOURCE=neon`.

Add `-- --move` to delete the local file after uploading.

## Deploy to Vercel

1. Push the repo and import it in Vercel. Framework preset: **Other**. No build command.
2. Connect Blob or Neon and run the upload script (above).
3. Redeploy. Open the site once while online; after that it works offline.

## Deploy to GitHub Pages or Netlify

These hosts have no functions, so serve the data as a static file: remove the
`data/minute_cryptic.json` line from `.gitignore` and commit the file.

- **GitHub Pages:** Settings → Pages → deploy from branch, folder `/ (root)`. The app uses only
  relative URLs, so `/<repo>/` works.
- **Netlify:** drag the folder onto app.netlify.com/drop, or connect the repo with no build
  command and publish directory `.`.

## Progress storage

Progress is stored in **cookies** (key `cq_v1`): JSON → deflate → base64url, split into ≤3.8 KB
chunks (`cq_v1_0`, `cq_v1_1`, …). With everything solved it's about 2.5 KB. Cookies have
`SameSite=Lax`, `Secure` on HTTPS, and a 400-day lifetime.

Safari caps cookies written by JavaScript at 7 days. On Vercel, after each save the app calls
`POST /api/touch`, which sends the same cookies back as real `Set-Cookie` headers so they keep
the full lifetime. Nothing is stored on the server. Export a backup from Settings now and then
anyway.

## Updating the app

Change files, then bump `VERSION` in `sw.js`. Open copies show "Update available" with a
Reload button that switches to the new version.

## Install on your phone

- **iPhone (Safari):** open the site → Share → **Add to Home Screen** → Add.
- **Android (Chrome):** open the site → ⋮ menu → **Install app** (or **Add to Home screen**).

Open it once while online so everything is saved for offline use.
