import { STAT_KEYS, STAT_LABELS, type Stats } from '../parser/types';
import { statDistribution } from '../breeding/inheritance';
import './InheritanceStrip.css';

/**
 * The signature view: seven coin flips, drawn.
 *
 * Every other breeding tool shows you a score. This shows the actual mechanic —
 * for each stat, which parent's value is on the table and how the dice are
 * weighted. Stats the parents already agree on are drawn fused, because no dice
 * are rolled for those at all.
 */
export function InheritanceStrip({
  a,
  b,
  stimulation,
  nameA,
  nameB,
}: {
  a: Stats;
  b: Stats;
  stimulation: number;
  nameA: string;
  nameB: string;
}) {
  return (
    <div className="strip">
      <div className="strip__legend">
        <span className="stamp">{nameA}</span>
        <span className="strip__legend-mid stamp">inherits one value per stat from</span>
        <span className="stamp">{nameB}</span>
      </div>

      <div className="strip__track" role="list">
        {STAT_KEYS.map((key) => {
          const outcomes = statDistribution(a[key], b[key], stimulation);
          const locked = outcomes.length === 1;

          return (
            <div className="strip__col" role="listitem" key={key}>
              <div className="strip__stat stamp">{STAT_LABELS[key]}</div>

              <div className={`strip__stack${locked ? ' strip__stack--locked' : ''}`}>
                {outcomes.map((outcome, index) => (
                  <div
                    key={`${outcome.value}-${index}`}
                    className={`strip__cell${index === 0 && !locked ? ' strip__cell--favoured' : ''}${
                      outcome.value >= 7 ? ' strip__cell--perfect' : ''
                    }`}
                    style={{ flexGrow: Math.max(outcome.probability, 0.12) }}
                    title={`${Math.round(outcome.probability * 100)}% chance of ${outcome.value} ${STAT_LABELS[key]}`}
                  >
                    <span className="strip__value num">{outcome.value}</span>
                    {!locked && (
                      <span className="strip__odds num">{Math.round(outcome.probability * 100)}%</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="strip__foot stamp">{locked ? 'same' : `${a[key]} / ${b[key]}`}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
