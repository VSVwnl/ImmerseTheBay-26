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

import { writeEval } from '../server/plugin';

describe('eval results log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-eval-'));
  it('starts a run, appends episodes, archives the previous run', () => {
    writeEval(dir, { kind: 'eval-start', tag: 'smoke', runId: 'r1', protocol: { seeds: [1] } });
    writeEval(dir, { kind: 'eval', tag: 'smoke', runId: 'r1', world: 'lab', policy: 'multi', seed: 1, success: true, steps: 30, wall: 'stub' });
    const f = path.join(dir, 'results', 'eval-smoke.json');
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).episodes).toHaveLength(1);
    expect(() => writeEval(dir, { kind: 'eval', tag: 'smoke', runId: 'other', world: 'lab' })).toThrow();
    writeEval(dir, { kind: 'eval-start', tag: 'smoke', runId: 'r2', protocol: {} });
    expect(JSON.parse(fs.readFileSync(f, 'utf8')).episodes).toHaveLength(0);
    expect(fs.existsSync(path.join(dir, 'results', 'eval-smoke.r1.json'))).toBe(true);
    expect(() => writeEval(dir, { kind: 'eval-start', tag: '../x', runId: 'r3' })).toThrow();
  });
});

describe('/api/robot probe', () => {
  it('reports no summary, then smoke, then the real one first; and whether the policy port listens', async () => {
    const { robotProbe } = await import('../server/plugin');
    const net = await import('node:net');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backlot-robot-'));
    const srv = net.createServer().listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    const port = (srv.address() as { port: number }).port;
    expect(await robotProbe(dir, port)).toEqual({ summary: null, tag: '', policyServer: false });
    fs.mkdirSync(path.join(dir, 'results'));
    fs.writeFileSync(path.join(dir, 'results', 'summary-smoke.json'), '{"tag":"smoke"}');
    expect(await robotProbe(dir, port)).toEqual({ summary: { tag: 'smoke' }, tag: 'smoke', policyServer: true });
    fs.writeFileSync(path.join(dir, 'results', 'summary.json'), '{"tag":""}');
    srv.close();
    await new Promise((r) => srv.once('close', r));
    expect(await robotProbe(dir, port)).toEqual({ summary: { tag: '' }, tag: '', policyServer: false });
  });
});
