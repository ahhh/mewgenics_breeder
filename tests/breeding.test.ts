import { describe, expect, it } from 'vitest';
import {
  biasProbability,
  enumerateKittens,
  expectedStats,
  highStatDistribution,
  probabilityOf,
  statCeiling,
  statDistribution,
  totalDistribution,
} from '../src/breeding/inheritance';
import {
  activeAbilityChance,
  mutationBias,
  passiveAbilityChance,
  traitInheritanceChance,
} from '../src/breeding/traits';
import { MAX_TWIN_CHANCE, twinChance } from '../src/breeding/fertility';
import { maxWeightMatching } from '../src/recommend/roomPlan';
import { makeStats, statTotal, type Stats } from '../src/parser/types';

const mum: Stats = makeStats([7, 3, 7, 2, 7, 4, 3]);
const dad: Stats = makeStats([4, 7, 5, 7, 4, 7, 7]);

describe('stimulation bias', () => {
  it('matches the documented reference points', () => {
    expect(biasProbability(0)).toBeCloseTo(0.5, 12);
    expect(biasProbability(100)).toBeCloseTo(2 / 3, 12);
    expect(biasProbability(200)).toBeCloseTo(0.75, 12);
  });

  it('never exceeds 75% even at absurd stimulation', () => {
    expect(biasProbability(1000)).toBeLessThan(0.92);
    expect(biasProbability(200)).toBeCloseTo(0.75, 12);
  });

  it('is symmetric in the magnitude of stimulation', () => {
    expect(biasProbability(-140)).toBeCloseTo(biasProbability(140), 12);
  });
});

describe('a single stat', () => {
  it('is deterministic when both parents agree', () => {
    expect(statDistribution(5, 5, 0)).toEqual([{ value: 5, probability: 1 }]);
    expect(statDistribution(5, 5, 200)).toEqual([{ value: 5, probability: 1 }]);
  });

  it('is a coin flip at zero stimulation', () => {
    const d = statDistribution(3, 7, 0);
    expect(d.map((o) => o.probability)).toEqual([0.5, 0.5]);
  });

  it('favours the higher value with positive stimulation', () => {
    const [first] = statDistribution(3, 7, 100);
    expect(first!.value).toBe(7);
    expect(first!.probability).toBeCloseTo(2 / 3, 12);
  });

  it('favours the lower value with negative stimulation', () => {
    const [first] = statDistribution(3, 7, -100);
    expect(first!.value).toBe(3);
    expect(first!.probability).toBeCloseTo(2 / 3, 12);
  });

  it('always sums to one', () => {
    for (const stim of [-200, -37, 0, 1, 32, 95, 200]) {
      for (let a = 1; a <= 7; a += 1) {
        for (let b = 1; b <= 7; b += 1) {
          const total = statDistribution(a, b, stim).reduce((s, o) => s + o.probability, 0);
          expect(total, `a=${a} b=${b} stim=${stim}`).toBeCloseTo(1, 12);
        }
      }
    }
  });
});

describe('the offspring distribution', () => {
  it('enumerates 2^7 kittens when every stat differs', () => {
    expect(enumerateKittens(mum, dad, 50)).toHaveLength(128);
  });

  it('collapses when parents share stats', () => {
    const twin = makeStats([5, 5, 5, 5, 5, 5, 5]);
    expect(enumerateKittens(twin, twin, 50)).toHaveLength(1);
    const oneDifferent = makeStats([6, 5, 5, 5, 5, 5, 5]);
    expect(enumerateKittens(twin, oneDifferent, 50)).toHaveLength(2);
  });

  it('produces identical kittens from identical parents', () => {
    const twin = makeStats([4, 5, 6, 7, 3, 5, 6]);
    const kittens = enumerateKittens(twin, twin, 0);
    expect(kittens).toHaveLength(1);
    expect(kittens[0]!.stats).toEqual(twin);
    expect(kittens[0]!.probability).toBe(1);
  });

  it('sums to exactly one', () => {
    for (const stim of [-200, 0, 32, 95, 200]) {
      const total = enumerateKittens(mum, dad, stim).reduce((s, k) => s + k.probability, 0);
      expect(total, `stim=${stim}`).toBeCloseTo(1, 12);
    }
  });

  it('never produces a stat neither parent had', () => {
    for (const kitten of enumerateKittens(mum, dad, 50)) {
      for (const key of Object.keys(kitten.stats) as (keyof Stats)[]) {
        expect([mum[key], dad[key]]).toContain(kitten.stats[key]);
      }
    }
  });

  it('has a mean total equal to the sum of the per-stat means', () => {
    const kittens = enumerateKittens(mum, dad, 77);
    expect(totalDistribution(kittens).mean).toBeCloseTo(statTotal(expectedStats(mum, dad, 77)), 10);
  });

  it('recognises a perfect genetic complement', () => {
    // Neither parent is good; every stat ceiling is 7.
    expect(Object.values(statCeiling(mum, dad))).toEqual([7, 7, 7, 7, 7, 7, 7]);
    expect(statTotal(mum)).toBe(33);
    expect(statTotal(dad)).toBe(41);
  });

  it('can reach a perfect kitten from two imperfect parents', () => {
    const kittens = enumerateKittens(mum, dad, 200);
    const perfect = probabilityOf(kittens, (s) => statTotal(s) === 49);
    expect(perfect).toBeCloseTo(0.75 ** 7, 12);
  });

  it('computes joint probabilities, not products of marginals', () => {
    // STR is 7 only from mum, DEX is 7 only from dad — independent draws.
    const kittens = enumerateKittens(mum, dad, 0);
    const both = probabilityOf(kittens, (s) => s.str >= 7 && s.dex >= 7);
    expect(both).toBeCloseTo(0.25, 12);
  });

  it('gives a sevens distribution that sums to one and spans 0..7', () => {
    const d = highStatDistribution(enumerateKittens(mum, dad, 100));
    expect(d.entries.reduce((s, e) => s + e.probability, 0)).toBeCloseTo(1, 12);
    expect(d.entries[0]!.value).toBe(0);
    expect(d.entries.at(-1)!.value).toBe(7);
    expect(d.mean).toBeCloseTo(7 * (2 / 3), 10);
  });
});

describe('trait inheritance', () => {
  it('guarantees an active ability at stimulation 32', () => {
    expect(activeAbilityChance(0)).toBeCloseTo(0.2, 12);
    expect(activeAbilityChance(32)).toBeCloseTo(1, 12);
    expect(activeAbilityChance(100)).toBe(1);
  });

  it('guarantees a passive at stimulation 95', () => {
    expect(passiveAbilityChance(0)).toBeCloseTo(0.05, 12);
    expect(passiveAbilityChance(95)).toBeCloseTo(1, 12);
  });

  it('biases body parts toward mutations only with positive stimulation', () => {
    expect(mutationBias(0)).toBeCloseTo(0.5, 12);
    expect(mutationBias(200)).toBeCloseTo(0.75, 12);
    expect(mutationBias(-200)).toBeCloseTo(0.25, 12);
  });

  it('treats two carrier parents as two independent rolls', () => {
    expect(traitInheritanceChance(0, 0.5)).toBe(0);
    expect(traitInheritanceChance(1, 0.5)).toBeCloseTo(0.5, 12);
    expect(traitInheritanceChance(2, 0.5)).toBeCloseTo(0.75, 12);
  });
});

describe('litter size', () => {
  it('is the product of the parents fertilities minus one', () => {
    expect(twinChance(1, 1)).toBeCloseTo(0, 12);
    expect(twinChance(1.25, 1.25)).toBeCloseTo(MAX_TWIN_CHANCE, 12);
    expect(twinChance(1.1, 1.2)).toBeCloseTo(0.32, 12);
  });

  it('is unknown when a parent fertility could not be read', () => {
    expect(twinChance(null, 1.2)).toBeNull();
  });
});

describe('room assignment', () => {
  it('beats the greedy choice when the greedy choice blocks a better plan', () => {
    // Greedy takes 10 then is left with 1 (total 11); optimal takes 9 + 9 = 18.
    const weights = [
      [10, 9],
      [9, 1],
    ];
    const matching = maxWeightMatching(weights);
    const total = matching.reduce((sum, m) => sum + m.weight, 0);
    expect(total).toBe(18);
  });

  it('never assigns a cat to two partners', () => {
    const weights = [
      [5, 3, 1],
      [2, 8, 4],
      [7, 1, 6],
    ];
    const matching = maxWeightMatching(weights);
    expect(new Set(matching.map((m) => m.row)).size).toBe(matching.length);
    expect(new Set(matching.map((m) => m.column)).size).toBe(matching.length);
  });

  it('handles lopsided pools', () => {
    expect(maxWeightMatching([[1, 2, 3, 4]])).toHaveLength(1);
    expect(maxWeightMatching([[1], [2], [3]])).toHaveLength(1);
    expect(maxWeightMatching([])).toEqual([]);
  });
});
