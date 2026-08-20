import { isAvailable, type Cat } from '../parser/types';

/**
 * Breeding happens automatically at the end of each day between two adult cats
 * sharing a room — you cannot pick a pair directly, you can only decide who
 * lives where. That is why the room planner, not the pair list, is the thing
 * a player actually acts on.
 */

/** Ditto cats breed with anyone; otherwise the pair must be male × female. */
export function sexesCompatible(a: Cat, b: Cat): boolean {
  if (a.sex === 'unknown' || b.sex === 'unknown') return false;
  if (a.sex === 'ditto' || b.sex === 'ditto') return true;
  return a.sex !== b.sex;
}

export function canBreed(a: Cat, b: Cat): boolean {
  if (a.key === b.key) return false;
  return sexesCompatible(a, b) && isAvailable(a) && isAvailable(b);
}

/**
 * Every unordered pair worth evaluating.
 *
 * `includeUnavailable` relaxes the alive/adult/at-home checks so a player can
 * plan a bloodline around a kitten that has not grown up yet.
 */
export function eligiblePairs(cats: Cat[], includeUnavailable = false): [Cat, Cat][] {
  const pool = includeUnavailable ? cats.filter((c) => !c.isDead) : cats.filter(isAvailable);
  const pairs: [Cat, Cat][] = [];

  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      const a = pool[i]!;
      const b = pool[j]!;
      if (sexesCompatible(a, b)) pairs.push([a, b]);
    }
  }
  return pairs;
}
