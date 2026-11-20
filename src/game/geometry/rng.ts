/**
 * Seeded pseudo-random number generation (spec §4.1).
 *
 * Only integer ops and exact float division are used, so the output is
 * bit-identical on every JS engine. Do not change this without bumping
 * `GENERATOR_VERSION` (spec §7).
 */

/** A function returning uniformly distributed numbers in `[0, 1)`. */
export type Rng = () => number;

/**
 * Create a mulberry32 PRNG.
 * @param seed Any number; it is truncated to an unsigned 32-bit integer.
 */
export function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a number uniformly from `[min, max)`. Consumes exactly one value from `rng`. */
export function randomRange(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

/** Draw `+1` or `-1` with equal probability. Consumes exactly one value from `rng`. */
export function randomSign(rng: Rng): 1 | -1 {
  return rng() < 0.5 ? 1 : -1;
}
