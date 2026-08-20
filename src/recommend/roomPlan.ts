import type { Cat } from '../parser/types';
import { analysePair, type PairAnalysis } from '../breeding/pair';
import { sexesCompatible } from '../breeding/eligibility';
import { isAvailable } from '../parser/types';
import { DEFAULT_CUSTOM_GOAL, goalById, type CustomGoal, type GoalId } from './goals';

/**
 * Choosing which pairs to actually set up is not the same problem as ranking
 * pairs, because a cat can only be in one room. Greedily taking the best pair
 * and then the best remaining pair is measurably worse than solving the
 * assignment properly.
 *
 * This is a maximum-weight bipartite matching, solved exactly with the
 * Hungarian algorithm on the (males × females) score matrix, then truncated to
 * the number of breeding rooms available.
 */

export interface PlannedPair {
  analysis: PairAnalysis;
  score: number;
  room: string;
}

export interface RoomPlan {
  pairs: PlannedPair[];
  totalScore: number;
  /** Cats that could have bred but had no room or no partner left. */
  benched: Cat[];
}

export interface RoomPlanOptions {
  rooms: { name: string; stimulation: number }[];
  goal: GoalId;
  custom?: CustomGoal;
}

export function planRooms(cats: Cat[], options: RoomPlanOptions): RoomPlan {
  const custom = options.custom ?? DEFAULT_CUSTOM_GOAL;
  const goal = goalById(options.goal);
  const available = cats.filter(isAvailable);

  // Ditto cats can fill either side, so put them wherever they balance the sides.
  const left: Cat[] = available.filter((c) => c.sex === 'male');
  const right: Cat[] = available.filter((c) => c.sex === 'female');
  for (const ditto of available.filter((c) => c.sex === 'ditto')) {
    (left.length <= right.length ? left : right).push(ditto);
  }

  if (left.length === 0 || right.length === 0 || options.rooms.length === 0) {
    return { pairs: [], totalScore: 0, benched: available };
  }

  // Average Stimulation is the right basis for the matching itself: which pairs
  // go together shouldn't flip room-by-room before rooms are assigned.
  const meanStimulation =
    options.rooms.reduce((sum, r) => sum + r.stimulation, 0) / options.rooms.length;

  const analyses: (PairAnalysis | null)[][] = left.map((a) =>
    right.map((b) => (sexesCompatible(a, b) ? analysePair(a, b, meanStimulation) : null)),
  );
  const weights = analyses.map((row) =>
    row.map((analysis) => (analysis ? goal.score(analysis, custom) : Number.NEGATIVE_INFINITY)),
  );

  const assignment = maxWeightMatching(weights);

  const chosen = assignment
    .map(({ row, column, weight }) => ({ row, column, weight }))
    .filter((m) => Number.isFinite(m.weight) && m.weight > 0)
    .sort((x, y) => y.weight - x.weight)
    .slice(0, options.rooms.length);

  // Best pairs get the highest-Stimulation rooms, then re-analyse at that room's
  // actual Stimulation so the numbers shown are the numbers that will apply.
  const rooms = [...options.rooms].sort((x, y) => y.stimulation - x.stimulation);

  const pairs: PlannedPair[] = chosen.map((match, index) => {
    const room = rooms[index]!;
    const analysis = analysePair(left[match.row]!, right[match.column]!, room.stimulation);
    return { analysis, score: goal.score(analysis, custom), room: room.name };
  });

  const used = new Set(pairs.flatMap((p) => [p.analysis.a.key, p.analysis.b.key]));

  return {
    pairs,
    totalScore: pairs.reduce((sum, p) => sum + p.score, 0),
    benched: available.filter((c) => !used.has(c.key)),
  };
}

interface Match {
  row: number;
  column: number;
  weight: number;
}

/**
 * Hungarian algorithm (Jonker-Volgenant style potentials), maximising weight.
 *
 * Rows are padded to be no longer than columns by transposing, so the O(n²m)
 * loop always runs over the smaller side.
 */
export function maxWeightMatching(weights: number[][]): Match[] {
  const rows = weights.length;
  const columns = weights[0]?.length ?? 0;
  if (rows === 0 || columns === 0) return [];

  const transposed = rows > columns;
  const cost = transposed
    ? Array.from({ length: columns }, (_, c) => Array.from({ length: rows }, (_, r) => -weights[r]![c]!))
    : weights.map((row) => row.map((w) => -w));

  const n = cost.length;
  const m = cost[0]!.length;

  const INF = Number.POSITIVE_INFINITY;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i += 1) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(INF);
    const used = new Array<boolean>(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = INF;
      let j1 = 0;

      for (let j = 1; j <= m; j += 1) {
        if (used[j]) continue;
        const raw = cost[i0 - 1]![j - 1]!;
        const cur = (Number.isFinite(raw) ? raw : 1e12) - u[i0]! - v[j]!;
        if (cur < minv[j]!) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }

      for (let j = 0; j <= m; j += 1) {
        if (used[j]) {
          u[p[j]!] = u[p[j]!]! + delta;
          v[j] = v[j]! - delta;
        } else {
          minv[j] = minv[j]! - delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0]!;
      p[j0] = p[j1]!;
      j0 = j1;
    } while (j0 !== 0);
  }

  const matches: Match[] = [];
  for (let j = 1; j <= m; j += 1) {
    const i = p[j]!;
    if (i === 0) continue;
    const row = transposed ? j - 1 : i - 1;
    const column = transposed ? i - 1 : j - 1;
    matches.push({ row, column, weight: weights[row]?.[column] ?? Number.NEGATIVE_INFINITY });
  }
  return matches;
}
