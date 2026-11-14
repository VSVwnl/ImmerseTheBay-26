// Vite dev-server middleware: same origin as the app, so the headset sees one host.
//   POST /api/log      attempt records -> data/sessions/<sessionId>/<attemptId>.json
import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const SAFE = /^[A-Za-z0-9._-]{1,80}$/;

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
  const dir = path.join(dataDir, 'sessions', sid);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${aid}.json`);
  fs.writeFileSync(file, JSON.stringify(rec));
  return file;
}

export function backlotServer(opts: { root?: string } = {}): Plugin {
  const root = opts.root ?? process.cwd();
  const dataDir = path.join(root, 'data');
  return {
    name: 'backlot-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        try {
          if (url.pathname === '/api/log' && req.method === 'POST') {
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
