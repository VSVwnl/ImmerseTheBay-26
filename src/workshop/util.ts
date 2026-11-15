import type { Rng } from './types';

export const between = (rng: Rng, [lo, hi]: [number, number]) => lo + rng() * (hi - lo);
