import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { checkSameOrigin, writeAttempt } from '../server/plugin';

describe('/api/log safety', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-'));
  it('writes a record under data/sessions', () => {
    const f = writeAttempt(dir, { sessionId: '2026-11-14T10-12-03Z-ab12', attemptId: '0001' });
    expect(f.startsWith(path.join(dir, 'sessions'))).toBe(true);
    expect(fs.existsSync(f)).toBe(true);
  });
  it('rejects traversal and dot ids', () => {
    for (const sessionId of ['..', '.', '../x', '.hidden', 'a/b', 'a\b', ''])
      expect(() => writeAttempt(dir, { sessionId, attemptId: '0001' })).toThrow();
    expect(() => writeAttempt(dir, { sessionId: 'ok', attemptId: '..' })).toThrow();
  });
  it('never overwrites an existing record', () => {
    writeAttempt(dir, { sessionId: 's2', attemptId: '0001' });
    expect(() => writeAttempt(dir, { sessionId: 's2', attemptId: '0001' })).toThrow();
  });
  it('rejects cross-origin and non-JSON posts', () => {
    const req = (h: Record<string, string>) => ({ headers: { host: 'localhost:5173', ...h } }) as unknown as IncomingMessage;
    expect(checkSameOrigin(req({ 'content-type': 'application/json' }))).toBe(null);
    expect(checkSameOrigin(req({ 'content-type': 'application/json', origin: 'http://localhost:5173' }))).toBe(null);
    expect(checkSameOrigin(req({ 'content-type': 'application/json', origin: 'https://evil.example' }))).not.toBe(null);
    expect(checkSameOrigin(req({ 'content-type': 'text/plain' }))).not.toBe(null);
  });
});
