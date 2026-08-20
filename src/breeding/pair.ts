import {
  STAT_KEYS,
  STAT_LABELS,
  statTotal,
  type Cat,
  type StatKey,
  type Stats,
} from '../parser/types';
import {
  PERFECT_STAT,
  enumerateKittens,
  expectedStats,
  highStatDistribution,
  lockedStats,
  probabilityAtLeast,
  probabilityOf,
  statCeiling,
  statFloor,
  totalDistribution,
  type Distribution,
  type Kitten,
} from './inheritance';
import { twinChance } from './fertility';
import {
  activeAbilityChance,
  passiveAbilityChance,
  secondActiveAbilityChance,
  traitInheritanceChance,
} from './traits';

export interface TraitOdds {
  name: string;
  /** How many of the two parents carry it. */
  parents: number;
  chance: number;
}

export type ReasonTone = 'great' | 'good' | 'neutral' | 'warning' | 'unknown';

export interface Reason {
  tone: ReasonTone;
  text: string;
}

export interface PairAnalysis {
  a: Cat;
  b: Cat;
  stimulation: number;

  /** Every possible kitten with its exact probability. At most 128. */
  kittens: Kitten[];
  lockedIn: StatKey[];

  expected: Stats;
  ceiling: Stats;
  floor: Stats;

  expectedTotal: number;
  ceilingTotal: number;
  totalDistribution: Distribution;
  sevensDistribution: Distribution;
  expectedSevens: number;

  /** Stats where the pair can produce a 7 that neither parent duplicates. */
  complements: { key: StatKey; from: number; to: number }[];
  /** Stats that can never reach 7 from this pairing. */
  capped: { key: StatKey; ceiling: number }[];

  abilityOdds: TraitOdds[];
  passiveOdds: TraitOdds[];

  twinChance: number | null;
  /** null means "we cannot know yet" — never rendered as 0. */
  inbreeding: number | null;

  reasons: Reason[];
}

export function analysePair(a: Cat, b: Cat, stimulation: number): PairAnalysis {
  const kittens = enumerateKittens(a.baseStats, b.baseStats, stimulation);
  const expected = expectedStats(a.baseStats, b.baseStats, stimulation);
  const ceiling = statCeiling(a.baseStats, b.baseStats);
  const floor = statFloor(a.baseStats, b.baseStats);

  const totals = totalDistribution(kittens);
  const sevens = highStatDistribution(kittens, PERFECT_STAT);

  const complements = STAT_KEYS.filter(
    (key) => ceiling[key] >= PERFECT_STAT && floor[key] < PERFECT_STAT,
  ).map((key) => ({ key, from: floor[key], to: ceiling[key] }));

  const capped = STAT_KEYS.filter((key) => ceiling[key] < PERFECT_STAT).map((key) => ({
    key,
    ceiling: ceiling[key],
  }));

  const abilityOdds = traitOdds(a.abilities, b.abilities, (n) =>
    traitInheritanceChance(
      n,
      Math.max(activeAbilityChance(stimulation), secondActiveAbilityChance(stimulation)),
    ),
  );
  const passiveOdds = traitOdds(a.passives, b.passives, (n) =>
    traitInheritanceChance(n, passiveAbilityChance(stimulation)),
  );

  const analysis: PairAnalysis = {
    a,
    b,
    stimulation,
    kittens,
    lockedIn: lockedStats(a.baseStats, b.baseStats),
    expected,
    ceiling,
    floor,
    expectedTotal: totals.mean,
    ceilingTotal: statTotal(ceiling),
    totalDistribution: totals,
    sevensDistribution: sevens,
    expectedSevens: sevens.mean,
    complements,
    capped,
    abilityOdds,
    passiveOdds,
    twinChance: twinChance(a.fertility, b.fertility),
    // Requires a decoded pedigree. Deliberately null, never 0 — see the plan.
    inbreeding: null,
    reasons: [],
  };

  analysis.reasons = explain(analysis);
  return analysis;
}

function traitOdds(
  fromA: string[],
  fromB: string[],
  chanceFor: (parentCount: number) => number,
): TraitOdds[] {
  const counts = new Map<string, number>();
  for (const name of new Set(fromA)) counts.set(name, (counts.get(name) ?? 0) + 1);
  for (const name of new Set(fromB)) counts.set(name, (counts.get(name) ?? 0) + 1);

  return [...counts.entries()]
    .map(([name, parents]) => ({ name, parents, chance: chanceFor(parents) }))
    .sort((x, y) => y.chance - x.chance || x.name.localeCompare(y.name));
}

/** P(at least `count` stats reach 7). */
export function chanceOfSevens(analysis: PairAnalysis, count: number): number {
  return probabilityAtLeast(analysis.sevensDistribution, count);
}

/** P(the kitten's total beats both parents'). */
export function chanceOfBeatingParents(analysis: PairAnalysis): number {
  const best = Math.max(statTotal(analysis.a.baseStats), statTotal(analysis.b.baseStats));
  return probabilityOf(analysis.kittens, (stats) => statTotal(stats) > best);
}

const MAX_TOTAL = PERFECT_STAT * STAT_KEYS.length;

function explain(analysis: PairAnalysis): Reason[] {
  const reasons: Reason[] = [];
  const { ceiling, ceilingTotal, complements, capped, lockedIn } = analysis;

  const perfectCeiling = STAT_KEYS.every((key) => ceiling[key] >= PERFECT_STAT);
  if (perfectCeiling) {
    reasons.push({
      tone: 'great',
      text: 'Together they cover all seven stats at 7 — every kitten stat can be maxed.',
    });
  } else if (ceilingTotal >= MAX_TOTAL - 3) {
    reasons.push({
      tone: 'good',
      text: `Near-perfect genetic ceiling (${ceilingTotal} of ${MAX_TOTAL}).`,
    });
  }

  const bigComplements = complements.filter((c) => c.to - c.from >= 3);
  for (const c of bigComplements.slice(0, 3)) {
    reasons.push({
      tone: bigComplements.length >= 3 ? 'great' : 'good',
      text: `Strong ${STAT_LABELS[c.key]} complement — one parent covers the other's ${c.from}.`,
    });
  }

  const fiveOrMore = chanceOfSevens(analysis, 5);
  if (fiveOrMore >= 0.25) {
    reasons.push({
      tone: fiveOrMore >= 0.4 ? 'great' : 'good',
      text: `${formatPercent(fiveOrMore)} chance of a kitten with five or more 7s.`,
    });
  }

  const beatsParents = chanceOfBeatingParents(analysis);
  if (beatsParents >= 0.5) {
    reasons.push({
      tone: 'good',
      text: `${formatPercent(beatsParents)} chance the kitten out-totals both parents.`,
    });
  }

  // Traits are reported neutrally. We have no curated list of which passives are
  // desirable — "Anxiety" and "Leader" both arrive here as inheritable traits —
  // so calling any of them a reason the pair is *good* would be a guess. If the
  // player has asked for a specific trait, the goal scoring already rewards it.
  const strongTraits = [...analysis.passiveOdds, ...analysis.abilityOdds].filter(
    (t) => t.chance >= 0.5,
  );
  for (const trait of strongTraits.slice(0, 2)) {
    reasons.push({
      tone: 'neutral',
      text: `${formatPercent(trait.chance)} chance to pass on ${humanise(trait.name)}.`,
    });
  }

  if (analysis.twinChance !== null && analysis.twinChance >= 0.25) {
    reasons.push({
      tone: 'good',
      text: `High twin chance (${formatPercent(analysis.twinChance)}) — both parents are fertile.`,
    });
  }

  if (lockedIn.length >= 4) {
    reasons.push({
      tone: 'good',
      text: `${lockedIn.length} of 7 stats are already identical, so there is little to roll wrong.`,
    });
  }

  if (capped.length > 0) {
    const worst = [...capped].sort((x, y) => x.ceiling - y.ceiling).slice(0, 2);
    reasons.push({
      tone: 'warning',
      text: `Neither parent has high ${worst.map((c) => STAT_LABELS[c.key]).join(' or ')} — kittens cap at ${worst.map((c) => c.ceiling).join('/')}.`,
    });
  }

  if (analysis.stimulation < 32) {
    reasons.push({
      tone: 'warning',
      text: `At Stimulation ${analysis.stimulation}, abilities pass only ${formatPercent(activeAbilityChance(analysis.stimulation))} of the time. 32 guarantees it.`,
    });
  }

  reasons.push({
    tone: 'unknown',
    text: 'Inbreeding unknown — the pedigree in this save is not decoded yet.',
  });

  return reasons;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/** "BasicShortLobbed" → "Basic Short Lobbed" */
export function humanise(id: string): string {
  return id
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}
