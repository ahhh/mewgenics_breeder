import { useMemo, useState } from 'react';
import type { Cat } from '../parser/types';
import { GOALS, type GoalId } from '../recommend/goals';
import { rankPairs } from '../recommend/rank';
import { PairCard } from './PairCard';
import { StimulationDial } from './StimulationDial';
import './Screens.css';

export function BreedScreen({
  cats,
  stimulation,
  onStimulation,
}: {
  cats: Cat[];
  stimulation: number;
  onStimulation: (value: number) => void;
}) {
  const [goal, setGoal] = useState<GoalId>('overall');
  const [includeUnavailable, setIncludeUnavailable] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const ranked = useMemo(
    () => rankPairs(cats, { stimulation, goal, includeUnavailable, limit: 24 }),
    [cats, stimulation, goal, includeUnavailable],
  );

  const activeGoal = GOALS.find((g) => g.id === goal)!;

  return (
    <section className="screen">
      <header className="screen__head">
        <h2 className="screen__title">Tonight's best ideas</h2>
        <p className="screen__lede">
          Two adult cats sharing a room may breed at the end of the day. These are the pairings worth
          arranging, with the exact odds behind each one.
        </p>
      </header>

      <div className="breed__controls">
        <div className="card card--sunk goals">
          <span className="stamp">what are you breeding for</span>
          <div className="goals__row">
            {GOALS.filter((g) => g.id !== 'custom').map((option) => (
              <button
                key={option.id}
                type="button"
                className={`chip${goal === option.id ? ' chip--on' : ''}`}
                onClick={() => setGoal(option.id)}
                aria-pressed={goal === option.id}
              >
                {option.name}
              </button>
            ))}
          </div>
          <p className="goals__blurb">{activeGoal.blurb}</p>
          <label className="toggle">
            <input
              type="checkbox"
              checked={includeUnavailable}
              onChange={(e) => setIncludeUnavailable(e.target.checked)}
            />
            <span>Include cats who can't breed tonight (for planning ahead)</span>
          </label>
        </div>

        <StimulationDial value={stimulation} onChange={onStimulation} />
      </div>

      {ranked.length === 0 ? (
        <p className="empty">
          No pairings available. You need at least one male and one female adult at home — or a ditto,
          who will pair with anyone.
        </p>
      ) : (
        <div className="grid grid--pairs">
          {ranked.map(({ analysis, tier }) => {
            const id = `${analysis.a.key}-${analysis.b.key}`;
            return (
              <PairCard
                key={id}
                analysis={analysis}
                tier={tier}
                expanded={expanded === id}
                onInspect={() => setExpanded(id)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
