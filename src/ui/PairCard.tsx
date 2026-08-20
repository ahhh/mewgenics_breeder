import { statTotal } from '../parser/types';
import { chanceOfSevens, formatPercent, type PairAnalysis } from '../breeding/pair';
import { TIER_BLURB } from '../recommend/rank';
import { Field, LedgerChart, Reasons, SexMark, StatRow } from './Bits';
import { InheritanceStrip } from './InheritanceStrip';
import './PairCard.css';

export function PairCard({
  analysis,
  tier,
  onInspect,
  expanded,
}: {
  analysis: PairAnalysis;
  tier?: string;
  onInspect?: () => void;
  expanded?: boolean;
}) {
  const { a, b } = analysis;
  const maxTotal = 49;

  return (
    <article className="card paircard">
      <header className="paircard__head">
        <div className="paircard__names">
          <span className="paircard__name">
            {a.name} <SexMark cat={a} />
          </span>
          <span className="paircard__heart" aria-hidden="true">
            ♥
          </span>
          <span className="paircard__name">
            {b.name} <SexMark cat={b} />
          </span>
        </div>
        {tier && (
          <div className={`paircard__tier paircard__tier--${tier}`}>
            <span className="paircard__tier-letter">{tier}</span>
            <span className="stamp">{TIER_BLURB[tier]}</span>
          </div>
        )}
      </header>

      <div className="paircard__figures">
        <Field label="genetic ceiling" value={`${analysis.ceilingTotal} / ${maxTotal}`} />
        <Field label="expected total" value={analysis.expectedTotal.toFixed(1)} />
        <Field label="expected 7s" value={analysis.expectedSevens.toFixed(2)} />
        <Field label="five 7s or more" value={formatPercent(chanceOfSevens(analysis, 5))} />
        <Field
          label="twin chance"
          value={analysis.twinChance === null ? 'unknown' : formatPercent(analysis.twinChance)}
          tone={analysis.twinChance === null ? 'unknown' : undefined}
        />
        <Field label="inbreeding" value="unknown" tone="unknown" />
      </div>

      <InheritanceStrip
        a={a.baseStats}
        b={b.baseStats}
        stimulation={analysis.stimulation}
        nameA={a.name}
        nameB={b.name}
      />

      <Reasons reasons={analysis.reasons.slice(0, expanded ? 12 : 4)} />

      {expanded && (
        <div className="paircard__deep">
          <div className="paircard__parents">
            <div>
              <div className="stamp">{a.name} base ({statTotal(a.baseStats)})</div>
              <StatRow stats={a.baseStats} />
            </div>
            <div>
              <div className="stamp">{b.name} base ({statTotal(b.baseStats)})</div>
              <StatRow stats={b.baseStats} />
            </div>
            <div>
              <div className="stamp">best possible kitten ({analysis.ceilingTotal})</div>
              <StatRow stats={analysis.ceiling} />
            </div>
            <div>
              <div className="stamp">expected kitten ({analysis.expectedTotal.toFixed(1)})</div>
              <StatRow stats={analysis.expected} />
            </div>
          </div>

          <div className="paircard__charts">
            <LedgerChart
              distribution={analysis.sevensDistribution}
              label="number of 7s"
              highlight={(v) => v >= 5}
            />
            <LedgerChart
              distribution={analysis.totalDistribution}
              label="total base stats"
              highlight={(v) => v >= analysis.ceilingTotal - 2}
            />
          </div>

          {(analysis.abilityOdds.length > 0 || analysis.passiveOdds.length > 0) && (
            <div className="paircard__traits">
              <div className="stamp">inheritable traits at stimulation {analysis.stimulation}</div>
              {[...analysis.abilityOdds, ...analysis.passiveOdds].map((trait) => (
                <Field key={trait.name} label={trait.name} value={formatPercent(trait.chance)} />
              ))}
            </div>
          )}
        </div>
      )}

      {onInspect && !expanded && (
        <button type="button" className="btn btn--ghost paircard__cta" onClick={onInspect}>
          Inspect the baby
        </button>
      )}
    </article>
  );
}
