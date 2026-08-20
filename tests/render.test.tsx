import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSave } from '../src/parser/saveFile';
import { isAvailable, type ParsedSave } from '../src/parser/types';
import { analysePair } from '../src/breeding/pair';
import { rankPairs } from '../src/recommend/rank';
import { planRooms } from '../src/recommend/roomPlan';
import { CatCard } from '../src/ui/CatCard';
import { PairCard } from '../src/ui/PairCard';
import { InheritanceStrip } from '../src/ui/InheritanceStrip';
import { hasRealSave, loadRealSaveTables } from './realSave';

const describeReal = hasRealSave() ? describe : describe.skip;

// See parser.test.ts: a skipped suite's body still runs, so the save must be
// read in beforeAll rather than at the top level.
describeReal('rendering against a real save', () => {
  let save: ParsedSave;
  let available: ParsedSave['cats'];

  beforeAll(() => {
    save = parseSave(loadRealSaveTables(), 'steamcampaign01.sav');
    available = save.cats.filter(isAvailable);
  });

  it('renders a card for every cat without throwing', () => {
    for (const cat of save.cats) {
      const html = renderToStaticMarkup(<CatCard cat={cat} />);
      expect(html, cat.name).toContain(cat.name);
    }
  });

  it('renders a pair card with the real figures', () => {
    const top = rankPairs(save.cats, { stimulation: 50, goal: 'overall', limit: 1 })[0]!;
    const html = renderToStaticMarkup(<PairCard analysis={top.analysis} tier={top.tier} expanded />);
    expect(html).toContain(top.analysis.a.name);
    expect(html).toContain(top.analysis.b.name);
    // Inbreeding must read as unknown, never as a fabricated zero.
    expect(html).toContain('unknown');
    expect(html).not.toMatch(/inbreeding<\/span><span[^>]*>0/i);
  });

  it('renders the inheritance strip for every top pairing', () => {
    for (const { analysis } of rankPairs(save.cats, { stimulation: 100, goal: 'perfect', limit: 10 })) {
      const html = renderToStaticMarkup(
        <InheritanceStrip
          a={analysis.a.baseStats}
          b={analysis.b.baseStats}
          stimulation={100}
          nameA={analysis.a.name}
          nameB={analysis.b.name}
        />,
      );
      expect(html).toContain('STR');
      expect(html).toContain('67%');
    }
  });

  it('survives every goal at extreme stimulation', () => {
    for (const goal of ['overall', 'perfect', 'complement', 'traits', 'litter'] as const) {
      for (const stimulation of [-200, 0, 200]) {
        const ranked = rankPairs(save.cats, { stimulation, goal, limit: 3 });
        for (const { analysis } of ranked) {
          expect(() => renderToStaticMarkup(<PairCard analysis={analysis} expanded />)).not.toThrow();
        }
      }
    }
  });

  it('renders a room plan that never reuses a cat', () => {
    const plan = planRooms(save.cats, {
      rooms: save.rooms.map((name, i) => ({ name, stimulation: i === 0 ? 71 : 48 })),
      goal: 'overall',
    });
    const used = plan.pairs.flatMap((p) => [p.analysis.a.key, p.analysis.b.key]);
    expect(new Set(used).size).toBe(used.length);
    expect(plan.pairs.length).toBeLessThanOrEqual(save.rooms.length);
    for (const planned of plan.pairs) {
      expect(renderToStaticMarkup(<PairCard analysis={planned.analysis} />)).toContain(planned.analysis.a.name);
    }
  });

  it('only ever pairs cats who could actually breed', () => {
    for (const { analysis } of rankPairs(save.cats, { stimulation: 50, goal: 'overall' })) {
      expect(isAvailable(analysis.a), analysis.a.name).toBe(true);
      expect(isAvailable(analysis.b), analysis.b.name).toBe(true);
      expect(analysis.a.key).not.toBe(analysis.b.key);
      const sexes = [analysis.a.sex, analysis.b.sex];
      expect(sexes.includes('ditto') || sexes[0] !== sexes[1]).toBe(true);
    }
    expect(available.length).toBeGreaterThan(0);
  });

  it('analyses every possible pairing in the house quickly', () => {
    const started = performance.now();
    const all = rankPairs(save.cats, { stimulation: 50, goal: 'overall' });
    const elapsed = performance.now() - started;
    expect(all.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(1000);
  });

  it('keeps every pair probability sane', () => {
    for (const [a, b] of available.slice(0, 6).flatMap((x, i) => available.slice(i + 1, i + 3).map((y) => [x, y] as const))) {
      const analysis = analysePair(a, b, 75);
      const sum = analysis.kittens.reduce((s, k) => s + k.probability, 0);
      expect(sum).toBeCloseTo(1, 10);
      expect(analysis.expectedTotal).toBeLessThanOrEqual(analysis.ceilingTotal + 1e-9);
      expect(analysis.inbreeding).toBeNull();
    }
  });
});
