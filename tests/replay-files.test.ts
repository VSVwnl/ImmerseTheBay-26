// Acceptance: every saved attempt replays (its target/grip samples, same seed) to the same success state.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { replayRecord, type AttemptRecord } from '../src/tasks/recorder';

const root = path.join('data', 'sessions');
const files: string[] = [];
if (fs.existsSync(root))
  for (const sid of fs.readdirSync(root))
    for (const f of fs.readdirSync(path.join(root, sid))) if (f.endsWith('.json')) files.push(path.join(root, sid, f));

describe.skipIf(files.length === 0)(`replay of ${files.length} saved attempts`, () => {
  it.each(files)('%s', (file) => {
    const rec = JSON.parse(fs.readFileSync(file, 'utf8')) as AttemptRecord;
    const out = replayRecord(rec);
    expect(out.success).toBe(rec.success);
    expect(out.drops).toBe(rec.drops);
    expect(out.wrongBin).toBe(rec.wrongBin);
  });
});
