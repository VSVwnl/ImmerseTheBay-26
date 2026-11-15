import { describe, expect, it } from 'vitest';
import { PokeLatch } from '../src/ui/poke';

const ids = (...a: string[]) => new Set(a);

describe('PokeLatch', () => {
  it('one poke presses once even when the button under the finger changes (Stop -> Start)', () => {
    const l = new PokeLatch();
    expect(l.update(ids(), 0)).toBe(null);
    expect(l.update(ids('stop'), 100)).toBe('stop');
    // the panel now shows Start in the same place; the finger is still there
    expect(l.update(ids('start'), 120)).toBe(null);
    expect(l.update(ids('start'), 2000)).toBe(null); // still not released
    expect(l.update(ids(), 2100)).toBe(null); // finger leaves
    expect(l.update(ids('start'), 2200)).toBe('start'); // a new, deliberate poke
  });

  it('holding a finger in a button does not repeat; leaving and re-entering does (after the debounce)', () => {
    const l = new PokeLatch();
    expect(l.update(ids('a'), 0)).toBe('a');
    expect(l.update(ids('a'), 50)).toBe(null);
    expect(l.update(ids(), 100)).toBe(null);
    expect(l.update(ids('a'), 150)).toBe(null); // within 400 ms debounce
    expect(l.update(ids(), 200)).toBe(null);
    expect(l.update(ids('a'), 700)).toBe('a');
  });

  it('two fingertips in two buttons at once press only one', () => {
    const l = new PokeLatch();
    const fired = [l.update(ids('a', 'b'), 0), l.update(ids('a', 'b'), 20)];
    expect(fired.filter(Boolean)).toHaveLength(1);
  });
});
