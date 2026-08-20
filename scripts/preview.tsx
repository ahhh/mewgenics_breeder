/**
 * Renders the real screens to a standalone HTML file using the developer's own
 * save, so the design can be reviewed without a browser session. Dev tooling —
 * never part of a build.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseSave } from '../src/parser/saveFile';
import { isAvailable } from '../src/parser/types';
import { rankPairs } from '../src/recommend/rank';
import { planRooms } from '../src/recommend/roomPlan';
import { loadRealSaveTables } from '../tests/realSave';
import { PairCard } from '../src/ui/PairCard';
import { CatCard } from '../src/ui/CatCard';
import { RoughEdgeFilter } from '../src/ui/Bits';
import { StimulationDial } from '../src/ui/StimulationDial';

const save = parseSave(loadRealSaveTables(), 'steamcampaign01.sav');
const stim = 50;
const ranked = rankPairs(save.cats, { stimulation: stim, goal: 'overall', limit: 3 });
const plan = planRooms(save.cats, {
  rooms: save.rooms.map((name, i) => ({ name, stimulation: i === 0 ? 71 : 48 })),
  goal: 'overall',
});
const living = save.cats.filter((c) => !c.isDead);
const available = save.cats.filter(isAvailable);
const allPairs = rankPairs(save.cats, { stimulation: stim, goal: 'overall' });

const css = ['theme/theme.css', 'ui/App.css', 'ui/Screens.css', 'ui/Bits.css', 'ui/CatCard.css', 'ui/PairCard.css', 'ui/InheritanceStrip.css']
  .map((f) => readFileSync(resolve(import.meta.dirname, '../src', f), 'utf8'))
  .join('\n')
  .replace(/@import url\([^)]*\);/g, '');

const body = renderToStaticMarkup(
  <>
    <RoughEdgeFilter />
    <div className="shell">
      <header className="shell__bar">
        <div className="shell__brand">
          <span className="shell__mark">Mewtation Lab</span>
          <span className="stamp shell__file">
            steamcampaign01.sav · day {save.properties.currentDay} · {save.cats.length} cats
          </span>
        </div>
        <nav className="shell__nav">
          {['Home', 'Catalog', 'Breed', 'Pair lab', 'Rooms'].map((t, i) => (
            <button key={t} className={`tab${i === 0 ? ' tab--on' : ''}`}>{t}</button>
          ))}
        </nav>
        <button className="btn btn--ghost btn--small">Close save</button>
      </header>

      <main className="shell__main">
        <section className="screen">
          <div className="card card--sunk tally">
            {[
              [save.properties.currentDay, 'day'],
              [living.length, 'living cats'],
              [available.length, 'can breed tonight'],
              [allPairs.length, 'possible pairings'],
              [save.cats.length - living.length, 'in the ground'],
            ].map(([figure, label]) => (
              <div className="tally__item" key={String(label)}>
                <div className="tally__figure num">{figure}</div>
                <div className="stamp">{label}</div>
              </div>
            ))}
          </div>

          <header className="screen__head">
            <h2 className="screen__title">Tonight's best idea</h2>
            <p className="screen__lede">
              Out of {allPairs.length} pairings you could arrange, this one produces the best kittens
              at Stimulation {stim}.
            </p>
          </header>

          <PairCard analysis={ranked[0]!.analysis} tier={ranked[0]!.tier} expanded />

          <header className="screen__head">
            <h2 className="screen__title">Runners-up</h2>
          </header>
          <div className="grid grid--pairs">
            {ranked.slice(1).map((r) => (
              <PairCard key={r.analysis.a.key + '-' + r.analysis.b.key} analysis={r.analysis} tier={r.tier} onInspect={() => {}} />
            ))}
          </div>

          <header className="screen__head">
            <h2 className="screen__title">Room plan</h2>
            <p className="screen__lede">The best set of pairings you can run at once.</p>
          </header>
          <div className="grid grid--pairs">
            {plan.pairs.map((p) => (
              <div className="planned" key={p.analysis.a.key + '-' + p.analysis.b.key}>
                <div className="planned__room stamp-box">{p.room}</div>
                <PairCard analysis={p.analysis} />
              </div>
            ))}
          </div>

          <header className="screen__head">
            <h2 className="screen__title">Stimulation, and when to stop</h2>
          </header>
          <div className="breed__controls">
            <StimulationDial value={30} onChange={() => {}} />
            <StimulationDial value={120} onChange={() => {}} />
          </div>

          <header className="screen__head">
            <h2 className="screen__title">The catalog</h2>
          </header>
          <div className="grid grid--cats">
            {[...available].slice(0, 8).map((cat) => (
              <CatCard key={cat.key} cat={cat} />
            ))}
          </div>
        </section>
      </main>

      <footer className="shell__foot stamp">
        Unofficial companion tool. Not affiliated with or endorsed by the makers of Mewgenics.
      </footer>
    </div>
  </>,
);

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mewtation Lab — design preview</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Special+Elite&display=swap" rel="stylesheet">
<style>${css}</style></head><body>${body}</body></html>`;

const out = resolve(import.meta.dirname, '../preview.html');
writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024).toFixed(0)} kB)`);
