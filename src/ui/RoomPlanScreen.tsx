import { useMemo, useState } from 'react';
import { isAvailable, type Cat } from '../parser/types';
import { GOALS, type GoalId } from '../recommend/goals';
import { planRooms } from '../recommend/roomPlan';
import { PairCard } from './PairCard';
import './Screens.css';

/**
 * Ranking pairs is only half the problem: a cat can be in one room, so the
 * pairs you actually set up have to not overlap. Taking the top pair and then
 * the best remaining pair gives a worse house than solving the assignment
 * properly, which is what this does.
 */
export function RoomPlanScreen({
  cats,
  rooms,
  defaultStimulation,
}: {
  cats: Cat[];
  rooms: string[];
  defaultStimulation: number;
}) {
  const [goal, setGoal] = useState<GoalId>('overall');
  const [stimByRoom, setStimByRoom] = useState<Record<string, number>>(() =>
    Object.fromEntries(rooms.map((room) => [room, defaultStimulation])),
  );

  const roomConfig = useMemo(
    () => rooms.map((name) => ({ name, stimulation: stimByRoom[name] ?? defaultStimulation })),
    [rooms, stimByRoom, defaultStimulation],
  );

  const plan = useMemo(() => planRooms(cats, { rooms: roomConfig, goal }), [cats, roomConfig, goal]);

  const available = cats.filter(isAvailable).length;

  return (
    <section className="screen">
      <header className="screen__head">
        <h2 className="screen__title">Room plan</h2>
        <p className="screen__lede">
          The best set of pairings you can run at once, given that nobody can be in two rooms. Give
          each room its real Stimulation and the plan re-solves.
        </p>
      </header>

      <div className="card card--sunk goals">
        <span className="stamp">optimise every room for</span>
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
      </div>

      <div className="card card--sunk rooms">
        <span className="stamp">stimulation per room</span>
        <div className="rooms__list">
          {rooms.map((room) => (
            <label className="rooms__row" key={room}>
              <span className="rooms__name">{room}</span>
              <input
                type="number"
                className="num"
                min={-200}
                max={200}
                value={stimByRoom[room] ?? defaultStimulation}
                onChange={(e) =>
                  setStimByRoom((current) => ({ ...current, [room]: Number(e.target.value) || 0 }))
                }
              />
            </label>
          ))}
        </div>
        <p className="rooms__note">
          Mewgenics does not store a room's Stimulation in a form we can read yet, so these come from
          you. Check the number the game shows on each room.
        </p>
      </div>

      {plan.pairs.length === 0 ? (
        <p className="empty">
          Nothing to plan. {available === 0 ? 'No cats are available to breed tonight.' : 'You need at least one compatible pairing.'}
        </p>
      ) : (
        <div className="grid grid--pairs">
          {plan.pairs.map((planned) => (
            <div className="planned" key={`${planned.analysis.a.key}-${planned.analysis.b.key}`}>
              <div className="planned__room stamp-box">{planned.room}</div>
              <PairCard analysis={planned.analysis} />
            </div>
          ))}
        </div>
      )}

      {plan.benched.length > 0 && (
        <div className="card card--sunk benched">
          <span className="stamp">left out of tonight's plan · {plan.benched.length} cats</span>
          <p className="benched__list">{plan.benched.map((c) => c.name).join(' · ')}</p>
        </div>
      )}
    </section>
  );
}
