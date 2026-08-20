import type { ReactNode } from 'react';
import { STAT_KEYS, STAT_LABELS, type Cat, type Stats } from '../parser/types';
import { PERFECT_STAT, type Distribution } from '../breeding/inheritance';
import type { Reason } from '../breeding/pair';
import './Bits.css';

/**
 * The displacement filter that gives every card a hand-cut edge. It is applied
 * to border-only pseudo-elements, never to content, so nothing legible is
 * distorted. Rendered once, at the root.
 */
export function RoughEdgeFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}>
      <filter id="torn-edge">
        <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves="3" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export function Stamp({ children, tone }: { children: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return <span className={`stamp-box${tone ? ` stamp-box--${tone}` : ''}`}>{children}</span>;
}

export function StatRow({ stats, compare }: { stats: Stats; compare?: Stats }) {
  return (
    <div className="statrow">
      {STAT_KEYS.map((key) => {
        const value = stats[key];
        const delta = compare ? value - compare[key] : 0;
        return (
          <div className="statrow__cell" key={key}>
            <div className="stamp statrow__label">{STAT_LABELS[key]}</div>
            <div className={`statrow__value num${value >= PERFECT_STAT ? ' statrow__value--max' : ''}`}>
              {Number.isInteger(value) ? value : value.toFixed(1)}
            </div>
            {compare && delta !== 0 && (
              <div className={`statrow__delta num${delta > 0 ? ' is-up' : ' is-down'}`}>
                {delta > 0 ? '+' : ''}
                {delta}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A histogram drawn as a ledger: label, bar, figure. */
export function LedgerChart({
  distribution,
  label,
  formatValue = (v: number) => String(v),
  highlight,
}: {
  distribution: Distribution;
  label: string;
  formatValue?: (value: number) => string;
  highlight?: (value: number) => boolean;
}) {
  const peak = Math.max(...distribution.entries.map((e) => e.probability), 0.0001);
  const rows = [...distribution.entries].reverse().filter((e) => e.probability > 0.0005);

  return (
    <div className="ledger">
      <div className="stamp ledger__title">{label}</div>
      {rows.map((entry) => (
        <div className={`ledger__row${highlight?.(entry.value) ? ' is-hot' : ''}`} key={entry.value}>
          <div className="ledger__key num">{formatValue(entry.value)}</div>
          <div className="ledger__bar">
            <div className="ledger__fill" style={{ width: `${(entry.probability / peak) * 100}%` }} />
          </div>
          <div className="ledger__pct num">{(entry.probability * 100).toFixed(entry.probability < 0.1 ? 1 : 0)}%</div>
        </div>
      ))}
    </div>
  );
}

export function Reasons({ reasons }: { reasons: Reason[] }) {
  const glyph: Record<Reason['tone'], string> = {
    great: '★',
    good: '✓',
    neutral: '·',
    warning: '!',
    unknown: '?',
  };
  return (
    <ul className="reasons">
      {reasons.map((reason, i) => (
        <li className={`reasons__item reasons__item--${reason.tone}`} key={i}>
          <span className="reasons__glyph" aria-hidden="true">
            {glyph[reason.tone]}
          </span>
          <span>{reason.text}</span>
        </li>
      ))}
    </ul>
  );
}

export function SexMark({ cat }: { cat: Cat }) {
  const mark = cat.sex === 'male' ? '♂' : cat.sex === 'female' ? '♀' : cat.sex === 'ditto' ? '⚲' : '?';
  return (
    <span className={`sexmark sexmark--${cat.sex}`} title={cat.sex}>
      {mark}
    </span>
  );
}

export function Field({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className="field">
      <span className="stamp field__label">{label}</span>
      <span className={`field__value num${tone ? ` field__value--${tone}` : ''}`}>{value}</span>
    </div>
  );
}
