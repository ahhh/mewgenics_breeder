import type { Cat } from '../parser/types';
import { analysePair, type PairAnalysis } from '../breeding/pair';
import { eligiblePairs } from '../breeding/eligibility';
import { DEFAULT_CUSTOM_GOAL, goalById, type CustomGoal, type GoalId } from './goals';

export interface RankedPair {
  analysis: PairAnalysis;
  score: number;
  /** S / A / B / C / D, assigned by score relative to the best pair found. */
  tier: string;
}

export interface RankOptions {
  stimulation: number;
  goal: GoalId;
  custom?: CustomGoal;
  includeUnavailable?: boolean;
  limit?: number;
}

/**
 * Analyse and rank every eligible pairing.
 *
 * O(N²) pairs × at most 128 kittens each. For a realistic house of 25 cats that
 * is a few hundred pairs, so this stays well inside a frame and needs no worker.
 */
export function rankPairs(cats: Cat[], options: RankOptions): RankedPair[] {
  const custom = options.custom ?? DEFAULT_CUSTOM_GOAL;
  const goal = goalById(options.goal);

  const ranked = eligiblePairs(cats, options.includeUnavailable ?? false).map(([a, b]) => {
    const analysis = analysePair(a, b, options.stimulation);
    return { analysis, score: goal.score(analysis, custom), tier: '' };
  });

  ranked.sort((x, y) => y.score - x.score);

  // Tier by position within the actual spread of this house, not by ratio to the
  // best score. Raw goal scores cluster in a narrow band (every pair sums seven
  // stats out of a possible 49), so a ratio test would hand out S to everything.
  const best = ranked[0]?.score ?? 0;
  const worst = ranked.at(-1)?.score ?? 0;
  const spread = best - worst;
  for (const pair of ranked) {
    pair.tier = spread > 1e-9 ? tierFor((pair.score - worst) / spread) : 'B';
  }

  return options.limit ? ranked.slice(0, options.limit) : ranked;
}

/** `normalised` is 0 for the worst pair in the house and 1 for the best. */
function tierFor(normalised: number): string {
  if (normalised >= 0.92) return 'S';
  if (normalised >= 0.75) return 'A';
  if (normalised >= 0.5) return 'B';
  if (normalised >= 0.25) return 'C';
  return 'D';
}

export const TIER_BLURB: Record<string, string> = {
  S: 'ABSOLUTE SPECIMENS',
  A: 'VERY GOOD GENES',
  B: 'GOOD GENES',
  C: 'PASSABLE',
  D: 'GENETIC DISASTER',
};
