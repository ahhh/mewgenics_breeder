import { useMemo, useState } from 'react';
import { STAT_KEYS, STAT_LABELS, isAvailable, statTotal, type Cat, type StatKey } from '../parser/types';
import { CatCard } from './CatCard';
import './Screens.css';

type SortKey = StatKey | 'total' | 'name' | 'age';
type Filter = 'available' | 'living' | 'all';

export function CatsScreen({ cats }: { cats: Cat[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('available');
  const [sort, setSort] = useState<SortKey>('total');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pool = cats.filter((cat) => {
      if (filter === 'available' && !isAvailable(cat)) return false;
      if (filter === 'living' && cat.isDead) return false;
      if (!needle) return true;
      return (
        cat.name.toLowerCase().includes(needle) ||
        cat.className.toLowerCase().includes(needle) ||
        [...cat.abilities, ...cat.passives].some((t) => t.toLowerCase().includes(needle))
      );
    });

    return pool.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'age') return (b.ageDays ?? 0) - (a.ageDays ?? 0);
      if (sort === 'total') return statTotal(b.baseStats) - statTotal(a.baseStats);
      return b.baseStats[sort] - a.baseStats[sort];
    });
  }, [cats, query, filter, sort]);

  return (
    <section className="screen">
      <header className="screen__head">
        <h2 className="screen__title">The catalog</h2>
        <p className="screen__lede">
          Every cat we found, ranked by the stats that actually breed. The figure in brackets is what
          the game shows you — it includes level-up bonuses, which no kitten ever inherits.
        </p>
      </header>

      <div className="card card--sunk toolbar">
        <label className="toolbar__field">
          <span className="stamp">search</span>
          <input
            type="search"
            value={query}
            placeholder="name, class or trait"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <label className="toolbar__field">
          <span className="stamp">show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="available">Can breed tonight</option>
            <option value="living">Living</option>
            <option value="all">Everyone, including the dead</option>
          </select>
        </label>

        <label className="toolbar__field">
          <span className="stamp">sort by</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="total">Base total</option>
            <option value="name">Name</option>
            <option value="age">Age</option>
            {STAT_KEYS.map((key) => (
              <option key={key} value={key}>
                {STAT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        <div className="toolbar__count stamp">
          {shown.length} of {cats.length}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="empty">No cats match that. Try widening the filter.</p>
      ) : (
        <div className="grid grid--cats">
          {shown.map((cat) => (
            <CatCard key={cat.key} cat={cat} />
          ))}
        </div>
      )}
    </section>
  );
}
