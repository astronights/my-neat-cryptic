// App identity and settings. To rename the app, run:
//   node scripts/rename.mjs "New Name" "Short"
// (it updates this file, index.html and manifest.webmanifest together).
export const APP = {
  name: 'Clueworthy',
  shortName: 'Clueworthy',
  tagline: 'Cryptic clues, one at a time.',
};

// Where the book data is loaded from, in order. The first URL is the static
// file (local dev, GitHub Pages, Netlify). The second is the Vercel function
// that reads it from Vercel Blob or Neon (see scripts/upload-data.mjs).
export const DATA_URLS = ['data/minute_cryptic.json', 'api/data'];

// Progress is stored in cookies under this versioned key.
// Bump the number if the progress format ever changes incompatibly.
export const STORE_KEY = 'cq_v1';

// Optional endpoint that re-issues the progress cookies from the server, so
// Safari doesn't cap them at 7 days. Set to null to disable.
export const COOKIE_REFRESH_URL = 'api/touch';
