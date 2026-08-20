import { biasProbability } from '../breeding/inheritance';
import { activeAbilityChance, passiveAbilityChance } from '../breeding/traits';
import './Screens.css';

/**
 * Stimulation is the one number the player controls, and its three effects run
 * on completely different curves — abilities are guaranteed by 32, passives by
 * 95, while stat bias crawls to a hard ceiling of 75%. Showing all three at once
 * is the difference between "raise Stimulation" and knowing when to stop.
 */
export function StimulationDial({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="card card--sunk dial">
      <div className="dial__top">
        <label className="dial__label" htmlFor="stim">
          <span className="stamp">room stimulation</span>
          <input
            id="stim"
            type="number"
            className="dial__number num"
            value={value}
            min={-200}
            max={200}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
          />
        </label>
        <input
          type="range"
          className="dial__range"
          min={-200}
          max={200}
          step={1}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label="Room stimulation"
        />
      </div>

      <dl className="dial__effects">
        <Effect label="better stat" value={biasProbability(value)} note={value < 0 ? 'biased low' : undefined} />
        <Effect label="active ability" value={activeAbilityChance(value)} note={value >= 32 ? 'maxed' : 'maxes at 32'} />
        <Effect label="passive" value={passiveAbilityChance(value)} note={value >= 95 ? 'maxed' : 'maxes at 95'} />
      </dl>

      <p className="dial__note">
        {value >= 95
          ? 'Traits are already guaranteed. Past here, more Stimulation only nudges stat bias, and stat bias tops out at 75%.'
          : value >= 32
            ? 'Abilities are guaranteed. Push toward 95 to lock in passives too.'
            : 'Below 32, abilities often fail to pass at all — the cheapest win available to you.'}
      </p>
    </div>
  );
}

function Effect({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="dial__effect">
      <dt className="stamp">{label}</dt>
      <dd className="num">{Math.round(value * 100)}%</dd>
      {note && <dd className="dial__note-small stamp">{note}</dd>}
    </div>
  );
}

const clamp = (n: number): number => (Number.isFinite(n) ? Math.min(200, Math.max(-200, Math.round(n))) : 0);
