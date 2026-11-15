import type { Rng } from './types';

/** "a can", "an egg" */
export const an = (word: string) => (/^[aeiou]/i.test(word) ? 'an ' : 'a ') + word;

export const between = (rng: Rng, [lo, hi]: [number, number]) => lo + rng() * (hi - lo);
