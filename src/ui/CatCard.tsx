import { statTotal, unavailableReason, type Cat } from '../parser/types';
import { describeFertility } from '../breeding/fertility';
import { humanise } from '../breeding/pair';
import { SexMark, StatRow } from './Bits';
import './CatCard.css';

/**
 * A specimen card. Base stats are the headline because base stats are the only
 * thing that breeds — the number the game shows you includes level-up bonuses
 * that a kitten will never inherit, and confusing the two is the single easiest
 * way to breed the wrong cats.
 */
export function CatCard({
  cat,
  onSelect,
  selected,
  compact,
}: {
  cat: Cat;
  onSelect?: (cat: Cat) => void;
  selected?: boolean;
  compact?: boolean;
}) {
  const reason = unavailableReason(cat);
  const levelled = statTotal(cat.levelBonuses) > 0;

  const body = (
    <>
      <header className="catcard__head">
        <div className="catcard__name">
          {cat.name} <SexMark cat={cat} />
        </div>
        <div className="stamp catcard__meta">
          {cat.className}
          {cat.level ? ` · lv ${cat.level}` : ''}
          {cat.ageDays !== null ? ` · ${cat.ageDays}d` : ''}
        </div>
      </header>

      <StatRow stats={cat.baseStats} />

      <div className="catcard__foot">
        <span className="stamp">
          base total <b className="num">{statTotal(cat.baseStats)}</b>
          {levelled && (
            <span className="catcard__levelled" title="What the game displays, including level-up bonuses. Not inherited.">
              {' '}
              (shows {statTotal(cat.displayStats)})
            </span>
          )}
        </span>
        {reason ? (
          <span className="stamp catcard__reason">{reason}</span>
        ) : (
          <span className="stamp catcard__room">{cat.room}</span>
        )}
      </div>

      {!compact && (cat.abilities.length > 0 || cat.passives.length > 0) && (
        <ul className="catcard__traits">
          {[...cat.abilities, ...cat.passives].slice(0, 4).map((trait) => (
            <li key={trait}>{humanise(trait)}</li>
          ))}
        </ul>
      )}

      {!compact && (
        <div className="stamp catcard__fertility">
          fertility {describeFertility(cat.fertility)}
          {cat.fertility !== null && <span className="num"> · {cat.fertility.toFixed(3)}</span>}
        </div>
      )}
    </>
  );

  const className = `card catcard${cat.isDead ? ' catcard--dead' : ''}${selected ? ' catcard--selected' : ''}`;

  return onSelect ? (
    <button type="button" className={className} onClick={() => onSelect(cat)} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <article className={className}>{body}</article>
  );
}
