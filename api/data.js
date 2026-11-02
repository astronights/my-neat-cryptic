// GET /api/data → the book JSON, read from Vercel Blob or Neon Postgres.
//
// Which store is used:
//   DATA_SOURCE=blob|neon   (optional; otherwise whichever is configured)
//   Blob: BLOB_READ_WRITE_TOKEN (added automatically when you connect a Blob store)
//         BLOB_ACCESS=private|public (optional), BLOB_PATHNAME (default data/minute_cryptic.json).
//         If the file isn't at that path (e.g. uploaded in the dashboard), the newest
//         blob named minute_cryptic*.json anywhere in the store is used.
//   Neon: DATABASE_URL (added automatically by the Neon integration)
//
// Upload the file with the Vercel dashboard (Storage → your Blob store → Upload),
// or with: npm run upload:blob   or   npm run upload:neon

const PATHNAME = process.env.BLOB_PATHNAME || 'data/minute_cryptic.json';
const DATA_KEY = process.env.DATA_KEY || 'minute_cryptic';

async function fromBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) return null;
  const { get, list } = await import('@vercel/blob');
  // Try the configured access first, then the other one (stores can be public or private).
  const preferred = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';
  const accesses = [preferred, preferred === 'public' ? 'private' : 'public'];
  const read = async (where) => {
    for (const access of accesses) {
      try {
        const res = await get(where, { access });
        if (res && res.statusCode === 200) return await new Response(res.stream).text();
      } catch { /* wrong access type or not found: try the next */ }
    }
    return null;
  };
  // 1. The exact path the upload script uses.
  const exact = await read(PATHNAME);
  if (exact) return exact;
  // 2. Uploaded through the dashboard: find any "minute_cryptic*.json" (any folder,
  //    with or without a random suffix) and use the newest.
  const found = [];
  let cursor;
  do {
    const page = await list({ cursor, limit: 1000 });
    found.push(...page.blobs.filter((b) => /(^|\/)minute_cryptic[^/]*\.json$/i.test(b.pathname)));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  found.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return found.length ? read(found[0].url) : null;
}

async function fromNeon() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  const rows = await sql`select data::text as data from app_data where key = ${DATA_KEY} limit 1`;
  return rows[0]?.data ?? null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).end();
  }
  const order = process.env.DATA_SOURCE === 'neon' ? [fromNeon, fromBlob] : [fromBlob, fromNeon];
  const errors = [];
  for (const source of order) {
    try {
      const text = await source();
      if (text) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('X-Cookie-Refresh', '1'); // tells the app /api/touch exists
        // Cache at the edge for a day; the service worker keeps its own offline copy.
        res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800');
        return res.status(200).send(text);
      }
    } catch (e) {
      errors.push(`${source.name}: ${e.message}`);
    }
  }
  console.error('api/data: no data found', errors);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'Puzzle data not found. Run the upload script (see README).', details: errors });
}
