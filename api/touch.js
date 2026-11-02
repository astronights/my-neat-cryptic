// POST /api/touch?path=/  → re-sends the progress cookies from the server.
//
// Safari limits cookies written by JavaScript to 7 days. Cookies set by the
// server in an HTTP response get the full lifetime, so the app calls this after
// saving. Nothing is stored server-side: we only echo back the app's own cookies.

const PREFIX = 'cq_v1';
const MAX_AGE = 400 * 24 * 60 * 60; // the most browsers allow

export default function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  const raw = String(req.query?.path || '/');
  const path = /^\/[A-Za-z0-9._~\-/]*$/.test(raw) ? raw : '/';
  const secure = (req.headers['x-forwarded-proto'] || 'https') === 'https' ? '; Secure' : '';
  const out = [];
  for (const part of String(req.headers.cookie || '').split(/;\s*/)) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    if (name !== PREFIX && !name.startsWith(`${PREFIX}_`)) continue;
    if (!/^[A-Za-z0-9_\-.,]*$/.test(value)) continue; // our cookies are base64url/ASCII only
    out.push(`${name}=${value}; Path=${path}; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`);
  }
  if (out.length) res.setHeader('Set-Cookie', out);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(204).end();
}
