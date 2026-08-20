import { STAT_KEYS, makeStats, type StatKey, type Stats } from '../parser/types';

/**
 * Mewgenics stat inheritance.
 *
 * Each of the seven stats is inherited independently: the kitten copies one
 * parent's value outright. There is no averaging. Stimulation biases which
 * parent wins.
 *
 *     P(biased value) = (100 + |Stimulation|) / (200 + |Stimulation|)
 *
 * Positive Stimulation biases toward the higher value, negative toward the
 * lower. The curve is punishing: even Stimulation 200 only reaches 75%.
 *
 * Because the seven draws are independent there are at most 2^7 = 128 possible
 * kittens, so the whole distribution is enumerable exactly. No simulation.
 */

/** The stat value the game treats as maxed. */
export const PERFECT_STAT = 7;

export function biasProbability(stimulation: number): number {
  const s = Math.abs(stimulation);
  return (100 + s) / (200 + s);
}

export interface StatOutcome {
  value: number;
  probability: number;
}

/** The marginal distribution of one stat, given both parents' values. */
export function statDistribution(a: number, b: number, stimulation: number): StatOutcome[] {
  if (a === b) return [{ value: a, probability: 1 }];

  const p = biasProbability(stimulation);
  const high = Math.max(a, b);
  const low = Math.min(a, b);

  return stimulation >= 0
    ? [
        { value: high, probability: p },
        { value: low, probability: 1 - p },
      ]
    : [
        { value: low, probability: p },
        { value: high, probability: 1 - p },
      ];
}

export interface Kitten {
  stats: Stats;
  probability: number;
}

/**
 * Every possible kitten, with its exact probability.
 *
 * At most 128 entries, and fewer whenever the parents already agree on a stat
 * — which is worth surfacing to the player as "locked in".
 */
export function enumerateKittens(a: Stats, b: Stats, stimulation: number): Kitten[] {
  const perStat = STAT_KEYS.map((key) => statDistribution(a[key], b[key], stimulation));

  let kittens: Kitten[] = [{ stats: makeStats([]), probability: 1 }];

  perStat.forEach((outcomes, index) => {
    const key = STAT_KEYS[index]!;
    const next: Kitten[] = [];
    for (const kitten of kittens) {
      for (const outcome of outcomes) {
        next.push({
          stats: { ...kitten.stats, [key]: outcome.value },
          probability: kitten.probability * outcome.probability,
        });
      }
    }
    kittens = next;
  });

  return kittens;
}

/** Stats where both parents already agree — no dice are rolled for these. */
export function lockedStats(a: Stats, b: Stats): StatKey[] {
  return STAT_KEYS.filter((key) => a[key] === b[key]);
}

/** The best kitten this pair could possibly produce, and the worst. */
export function statCeiling(a: Stats, b: Stats): Stats {
  return makeStats(STAT_KEYS.map((key) => Math.max(a[key], b[key])));
}

export function statFloor(a: Stats, b: Stats): Stats {
  return makeStats(STAT_KEYS.map((key) => Math.min(a[key], b[key])));
}

/** Per-stat expected value. Cheap: the marginals suffice, no enumeration. */
export function expectedStats(a: Stats, b: Stats, stimulation: number): Stats {
  return makeStats(
    STAT_KEYS.map((key) =>
      statDistribution(a[key], b[key], stimulation).reduce(
        (sum, o) => sum + o.value * o.probability,
        0,
      ),
    ),
  );
}

export interface Distribution {
  /** value → probability, ascending by value. */
  entries: { value: number; probability: number }[];
  mean: number;
}

function toDistribution(weights: Map<number, number>): Distribution {
  const entries = [...weights.entries()]
    .map(([value, probability]) => ({ value, probability }))
    .sort((x, y) => x.value - y.value);
  return { entries, mean: entries.reduce((sum, e) => sum + e.value * e.probability, 0) };
}

/** Exact distribution of the kitten's total base stats. */
export function totalDistribution(kittens: Kitten[]): Distribution {
  const weights = new Map<number, number>();
  for (const kitten of kittens) {
    const total = STAT_KEYS.reduce((sum, key) => sum + kitten.stats[key], 0);
    weights.set(total, (weights.get(total) ?? 0) + kitten.probability);
  }
  return toDistribution(weights);
}

/** Exact distribution of how many stats reach `threshold` or better. */
export function highStatDistribution(kittens: Kitten[], threshold = PERFECT_STAT): Distribution {
  const weights = new Map<number, number>();
  for (const kitten of kittens) {
    const count = STAT_KEYS.reduce((n, key) => n + (kitten.stats[key] >= threshold ? 1 : 0), 0);
    weights.set(count, (weights.get(count) ?? 0) + kitten.probability);
  }
  return toDistribution(weights);
}

/** Total probability of every kitten satisfying `predicate`. */
export function probabilityOf(kittens: Kitten[], predicate: (stats: Stats) => boolean): number {
  let total = 0;
  for (const kitten of kittens) if (predicate(kitten.stats)) total += kitten.probability;
  return total;
}

/** P(at least `count` stats reach `threshold`). */
export function probabilityAtLeast(
  distribution: Distribution,
  count: number,
): number {
  return distribution.entries
    .filter((e) => e.value >= count)
    .reduce((sum, e) => sum + e.probability, 0);
}
