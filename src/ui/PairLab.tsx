import { useMemo, useState } from 'react';
import { isAvailable, type Cat } from '../parser/types';
import { analysePair } from '../breeding/pair';
import { sexesCompatible } from '../breeding/eligibility';
import { CatCard } from './CatCard';
import { PairCard } from './PairCard';
import { StimulationDial } from './StimulationDial';
import './Screens.css';

/**
 * Pick any two cats and see the real numbers — including pairings the ranked
 * list would never suggest, and pairings that cannot happen at all.
 */
export function PairLab({
  cats,
  stimulation,
  onStimulation,
}: {
  cats: Cat[];
  stimulation: number;
  onStimulation: (value: number) => void;
}) {
  const [picked, setPicked] = useState<Cat[]>([]);
  const [showAll, setShowAll] = useState(false);

  const pool = useMemo(
    () => (showAll ? cats.filter((c) => !c.isDead) : cats.filter(isAvailable)),
    [cats, showAll],
  );

  const toggle = (cat: Cat) => {
    setPicked((current) => {
      if (current.some((c) => c.key === cat.key)) return current.filter((c) => c.key !== cat.key);
      return [...current.slice(-1), cat];
    });
  };

  const [a, b] = picked;
  const analysis = a && b ? analysePair(a, b, stimulation) : null;
  const impossible = a && b ? !sexesCompatible(a, b) : false;

  return (
    <section className="screen">
      <header className="screen__head">
        <h2 className="screen__title">Pair lab</h2>
        <p className="screen__lede">Choose two cats. We will show you every kitten they could make.</p>
      </header>

      <StimulationDial value={stimulation} onChange={onStimulation} />

      {impossible && (
        <p className="notice notice--warn">
          {a!.name} and {b!.name} cannot produce kittens — they need to be male and female, or one of
          them a ditto. The genetics below are hypothetical.
        </p>
      )}

      {analysis && <PairCard analysis={analysis} expanded />}

      {!analysis && (
        <p className="empty">
          {picked.length === 0 ? 'Pick a cat to begin.' : 'Pick one more.'}
        </p>
      )}

      <div className="card card--sunk toolbar">
        <label className="toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          <span>Show cats who can't breed tonight</span>
        </label>
        <div className="toolbar__count stamp">{pool.length} to choose from</div>
      </div>

      <div className="grid grid--cats">
        {pool.map((cat) => (
          <CatCard
            key={cat.key}
            cat={cat}
            compact
            selected={picked.some((c) => c.key === cat.key)}
            onSelect={toggle}
          />
        ))}
      </div>
    </section>
  );
}
