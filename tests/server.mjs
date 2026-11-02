// Minimal static server for tests. Emulates the Vercel bits we rely on:
// /api/touch (cookie refresh) and the X-Cookie-Refresh header on the data.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import touch from '../api/touch.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function adapt(res) {
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => res.end(b);
  res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  return res;
}

export function start(port = 0, { vercel = true } = {}) {
  const hits = { touch: 0 };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (vercel && url.pathname === '/api/touch') {
      hits.touch++;
      req.query = Object.fromEntries(url.searchParams);
      return touch(req, adapt(res));
    }
    let p = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT) || /node_modules|\.git/.test(file)) { res.statusCode = 403; return res.end(); }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error();
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      if (vercel && p.endsWith('minute_cryptic.json')) res.setHeader('X-Cookie-Refresh', '1');
      res.end(await readFile(file));
    } catch {
      res.statusCode = 404;
      res.end('Not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, hits, url: `http://127.0.0.1:${server.address().port}/` })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await start(Number(process.env.PORT) || 8080);
  console.log(`Serving on ${url}`);
}
