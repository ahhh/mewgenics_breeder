import { useMemo } from 'react';
import { isAvailable, type ParsedSave } from '../parser/types';
import { rankPairs } from '../recommend/rank';
import { PairCard } from './PairCard';
import './Screens.css';

export function Home({
  save,
  stimulation,
  onGoBreed,
}: {
  save: ParsedSave;
  stimulation: number;
  onGoBreed: () => void;
}) {
  const best = useMemo(
    () => rankPairs(save.cats, { stimulation, goal: 'overall', limit: 1 })[0] ?? null,
    [save.cats, stimulation],
  );

  const living = save.cats.filter((c) => !c.isDead);
  const available = save.cats.filter(isAvailable);
  const pairCount = useMemo(
    () => rankPairs(save.cats, { stimulation, goal: 'overall' }).length,
    [save.cats, stimulation],
  );

  return (
    <section className="screen">
      <div className="card card--sunk tally">
        <Tally figure={save.properties.currentDay ?? '—'} label="day" />
        <Tally figure={living.length} label="living cats" />
        <Tally figure={available.length} label="can breed tonight" />
        <Tally figure={pairCount} label="possible pairings" />
        <Tally figure={save.cats.filter((c) => c.isDead).length} label="in the ground" />
      </div>

      {best ? (
        <>
          <header className="screen__head">
            <h2 className="screen__title">Tonight's best idea</h2>
            <p className="screen__lede">
              Out of {pairCount} pairings you could arrange, this one produces the best kittens at
              Stimulation {stimulation}.
            </p>
          </header>
          <PairCard analysis={best.analysis} tier={best.tier} onInspect={onGoBreed} />
        </>
      ) : (
        <p className="empty">
          Nobody in the house can breed tonight. You need two adults of compatible sexes at home.
        </p>
      )}

      {save.stats.partial > 0 && (
        <p className="notice notice--warn">
          {save.stats.partial} of {save.stats.total} cats decoded only partially. Their numbers may be
          wrong; everything else is fine.
        </p>
      )}
      {save.unknownVersions.length > 0 && (
        <p className="notice notice--warn">
          This save uses a cat format we have not tested ({save.unknownVersions.join(', ')}). Your save
          was not modified, but treat these numbers with suspicion.
        </p>
      )}
    </section>
  );
}

function Tally({ figure, label }: { figure: number | string; label: string }) {
  return (
    <div className="tally__item">
      <div className="tally__figure num">{figure}</div>
      <div className="stamp">{label}</div>
    </div>
  );
}
