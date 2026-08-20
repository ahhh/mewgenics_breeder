import { STAT_KEYS, statTotal, type StatKey, type Stats } from '../parser/types';
import { PERFECT_STAT, probabilityOf } from '../breeding/inheritance';
import { chanceOfSevens, type PairAnalysis } from '../breeding/pair';

/**
 * There is no single notion of "best pair", so the app never pretends there is.
 * A goal turns a pair analysis into one comparable number, and each goal is
 * explicit about what it is optimising for.
 */
export type GoalId = 'overall' | 'perfect' | 'complement' | 'traits' | 'litter' | 'custom';

export interface StatTarget {
  key: StatKey;
  minimum: number;
  weight: number;
}

export interface CustomGoal {
  stats: StatTarget[];
  traits: string[];
}

export interface Goal {
  id: GoalId;
  name: string;
  blurb: string;
  score: (analysis: PairAnalysis, custom: CustomGoal) => number;
}

const MAX_TOTAL = PERFECT_STAT * STAT_KEYS.length;

export const GOALS: Goal[] = [
  {
    id: 'overall',
    name: 'Best Overall',
    blurb: 'Balanced long-term genetic quality — expected stats, ceiling and a little trait value.',
    score: (a) =>
      0.55 * (a.expectedTotal / MAX_TOTAL) +
      0.25 * (a.ceilingTotal / MAX_TOTAL) +
      0.12 * (a.expectedSevens / STAT_KEYS.length) +
      0.08 * traitValue(a),
  },
  {
    id: 'perfect',
    name: 'Perfect Stats',
    blurb: 'Maximise the odds of a kitten with as many 7s as possible.',
    score: (a) =>
      0.6 * (a.expectedSevens / STAT_KEYS.length) +
      0.25 * chanceOfSevens(a, 5) +
      0.15 * chanceOfSevens(a, 6),
  },
  {
    id: 'complement',
    name: 'Genetic Complement',
    blurb: 'Pairs whose weaknesses cancel out — the ones you would never think of.',
    score: (a) => {
      const gap = a.complements.reduce((sum, c) => sum + (c.to - c.from), 0);
      return 0.6 * (a.ceilingTotal / MAX_TOTAL) + 0.4 * Math.min(1, gap / 20);
    },
  },
  {
    id: 'traits',
    name: 'Ability Hunter',
    blurb: 'Favour pairs most likely to pass on their abilities and passives.',
    score: (a) => 0.75 * traitValue(a) + 0.25 * (a.expectedTotal / MAX_TOTAL),
  },
  {
    id: 'litter',
    name: 'Big Litters',
    blurb: 'Weight twin chance heavily — more kittens per night, quality second.',
    score: (a) => 0.6 * (a.twinChance ?? 0) + 0.4 * (a.expectedTotal / MAX_TOTAL),
  },
  {
    id: 'custom',
    name: 'Make a Monster',
    blurb: 'You pick the targets. We compute the exact odds of hitting them.',
    score: (a, custom) => customScore(a, custom),
  },
];

export const DEFAULT_CUSTOM_GOAL: CustomGoal = { stats: [], traits: [] };

export function goalById(id: GoalId): Goal {
  return GOALS.find((g) => g.id === id) ?? GOALS[0]!;
}

function traitValue(a: PairAnalysis): number {
  const all = [...a.abilityOdds, ...a.passiveOdds];
  if (all.length === 0) return 0;
  const best = all.slice(0, 4).reduce((sum, t) => sum + t.chance, 0);
  return Math.min(1, best / 2);
}

/**
 * The exact probability that a kitten satisfies every stat target at once,
 * blended with weighted per-target odds so that near-misses still rank.
 */
export function customScore(a: PairAnalysis, custom: CustomGoal): number {
  if (custom.stats.length === 0 && custom.traits.length === 0) {
    return a.expectedTotal / MAX_TOTAL;
  }

  const jointStat =
    custom.stats.length > 0
      ? probabilityOf(a.kittens, (stats) => custom.stats.every((t) => stats[t.key] >= t.minimum))
      : 1;

  const weighted =
    custom.stats.length > 0
      ? custom.stats.reduce((sum, target) => {
          const p = probabilityOf(a.kittens, (stats) => stats[target.key] >= target.minimum);
          return sum + p * target.weight;
        }, 0) / custom.stats.reduce((sum, t) => sum + t.weight, 0)
      : 1;

  const traitChance =
    custom.traits.length > 0
      ? custom.traits.reduce((product, name) => {
          const odds = [...a.abilityOdds, ...a.passiveOdds].find((t) => t.name === name);
          return product * (odds?.chance ?? 0);
        }, 1)
      : 1;

  return 0.5 * jointStat + 0.3 * weighted + 0.2 * traitChance;
}

/** P(a kitten hits every stat target simultaneously). Exact, not a product of marginals. */
export function targetProbability(a: PairAnalysis, custom: CustomGoal): number | null {
  if (custom.stats.length === 0) return null;
  return probabilityOf(a.kittens, (stats) => custom.stats.every((t) => stats[t.key] >= t.minimum));
}

export function bestPossibleTotal(stats: Stats): number {
  return statTotal(stats);
}
