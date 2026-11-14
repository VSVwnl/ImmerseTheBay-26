// Vite dev-server middleware: same origin as the app, so the headset sees one host.
//   POST /api/log      attempt records -> data/sessions/<sessionId>/<attemptId>.json
//   POST /api/token    mints a short-lived Reactor session token (503 without a key)
//   GET  /api/token    { available: boolean } without minting anything
//   POST /api/usage    Orbis session heartbeat -> data/orbis-usage.json; GET returns the totals
import { loadEnv, type Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// ids may contain dots but never start with one ('.', '..', hidden files)
const SAFE = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,79}$/;

/** Reject cross-site writes: JSON content type (forces a CORS preflight) and same-origin if Origin is sent. */
export function checkSameOrigin(req: IncomingMessage): string | null {
  const ct = String(req.headers['content-type'] ?? '');
  if (!ct.startsWith('application/json')) return 'content-type must be application/json';
  const origin = req.headers.origin;
  if (origin) {
    const host = req.headers.host;
    try {
      if (new URL(origin).host !== host) return 'cross-origin request rejected';
    } catch {
      return 'bad origin';
    }
  }
  return null;
}

export function readBody(req: IncomingMessage, limit = 50 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

/** Write an attempt record. Returns the file path. Throws on bad ids. */
export function writeAttempt(dataDir: string, rec: { sessionId?: unknown; attemptId?: unknown }): string {
  const sid = String(rec.sessionId ?? '');
  const aid = String(rec.attemptId ?? '');
  if (!SAFE.test(sid) || !SAFE.test(aid)) throw new Error('bad sessionId/attemptId');
  const base = path.resolve(dataDir, 'sessions');
  const dir = path.resolve(base, sid);
  const file = path.resolve(dir, `${aid}.json`);
  if (!dir.startsWith(base + path.sep) || !file.startsWith(dir + path.sep)) throw new Error('bad path');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rec), { flag: 'wx' }); // never overwrite an existing record
  return file;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export const TOKEN_BODY = {
  expires_after: 21600,
  authorization_details: [
    {
      type: 'session',
      resources: { models: { match: ['reactor/visko-orbis-stable'] } },
      constraints: { max_sessions: 200 },
    },
  ],
};

type Usage = Record<string, { readyAt: number; until: number }>;

export function usageSummary(u: Usage) {
  const sessions = Object.values(u);
  const seconds = sessions.reduce((a, s) => a + Math.max(0, (s.until - s.readyAt) / 1000), 0);
  return { sessions: sessions.length, minutes: Math.round((seconds / 60) * 10) / 10 };
}

export function backlotServer(opts: { root?: string } = {}): Plugin {
  const root = opts.root ?? process.cwd();
  const dataDir = path.join(root, 'data');
  const usageFile = path.join(dataDir, 'orbis-usage.json');
  let apiKey = '';
  const readUsage = (): Usage => {
    try {
      return JSON.parse(fs.readFileSync(usageFile, 'utf8'));
    } catch {
      return {};
    }
  };
  return {
    name: 'backlot-server',
    configResolved(config) {
      // read from .env on the server only; no VITE_ prefix, so it never reaches the client bundle
      const env = loadEnv(config.mode, config.envDir || root, '');
      apiKey = (env.REACTOR_API_KEY ?? '').trim();
      if (apiKey && !apiKey.startsWith('rk_')) console.warn('[backlot] REACTOR_API_KEY does not start with rk_');
      if (!apiKey || apiKey === 'rk_your_key_here') apiKey = '';
      console.info(`[backlot] Orbis key ${apiKey ? 'found' : 'not set: stub world'}`);
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname.startsWith('/api/') && !LOCAL_HOST.test(String(req.headers.host ?? '')))
          return sendJson(res, 403, { ok: false, error: 'host not allowed' });
        try {
          if (url.pathname === '/api/token' && req.method === 'GET') {
            return sendJson(res, 200, { available: !!apiKey }, { 'Cache-Control': 'private, no-store' });
          }
          if (url.pathname === '/api/token' && req.method === 'POST') {
            const bad = checkSameOrigin(req);
            if (bad) return sendJson(res, 403, { ok: false, error: bad });
            if (!apiKey) return sendJson(res, 503, { ok: false, error: 'no REACTOR_API_KEY' });
            const r = await fetch('https://api.reactor.inc/tokens', {
              method: 'POST',
              headers: { 'Reactor-API-Key': apiKey, 'Content-Type': 'application/json' },
              body: JSON.stringify(TOKEN_BODY),
            });
            const text = await r.text();
            if (!r.ok) {
              console.warn(`[backlot] token mint failed ${r.status}: ${text.slice(0, 200)}`);
              return sendJson(res, 502, { ok: false, error: `token mint failed (${r.status})` });
            }
            const { jwt, expires_at } = JSON.parse(text);
            return sendJson(res, 200, { jwt, expires_at }, { 'Cache-Control': 'private, no-store' });
          }
          if (url.pathname === '/api/usage' && req.method === 'POST') {
            const bad = checkSameOrigin(req);
            if (bad) return sendJson(res, 403, { ok: false, error: bad });
            const b = JSON.parse(await readBody(req, 4096));
            const key = String(b.key ?? '');
            if (!SAFE.test(key) || !Number.isFinite(b.readyAt) || !Number.isFinite(b.until)) throw new Error('bad usage');
            const u = readUsage();
            u[key] = { readyAt: b.readyAt, until: Math.max(b.until, u[key]?.until ?? 0) };
            fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(usageFile, JSON.stringify(u, null, 1));
            return sendJson(res, 200, { ok: true });
          }
          if (url.pathname === '/api/usage' && req.method === 'GET') {
            return sendJson(res, 200, usageSummary(readUsage()));
          }
          if (url.pathname === '/api/log' && req.method === 'POST') {
            const bad = checkSameOrigin(req);
            if (bad) return sendJson(res, 403, { ok: false, error: bad });
            const body = JSON.parse(await readBody(req));
            const file = writeAttempt(dataDir, body);
            return sendJson(res, 200, { ok: true, file: path.relative(root, file) });
          }
        } catch (e) {
          return sendJson(res, 400, { ok: false, error: String((e as Error).message ?? e) });
        }
        next();
      });
    },
  };
}
