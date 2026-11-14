// M2 acceptance: the API key never reaches the client bundle.
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

describe('client bundle', () => {
  it('contains neither the key value nor its name', () => {
    const fake = 'rk_fake_SHOULD_NOT_LEAK_9f3a';
    const out = path.join('node_modules', '.cache', 'bundle-test');
    execSync(`npx vite build --outDir ${out} --emptyOutDir --logLevel error`, {
      env: { ...process.env, REACTOR_API_KEY: fake },
      stdio: 'pipe',
    });
    const files = fs.readdirSync(path.join(out, 'assets')).map((f) => path.join(out, 'assets', f));
    files.push(path.join(out, 'index.html'));
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      expect(text.includes(fake), f).toBe(false);
      expect(text.includes('REACTOR_API_KEY'), f).toBe(false);
    }
    // the Reactor SDK is loaded lazily, not in the entry chunk
    const entry = files.find((f) => /index-.*\.js$/.test(f))!;
    expect(fs.readFileSync(entry, 'utf8').includes('trackReceived')).toBe(false);
  }, 120_000);
});
