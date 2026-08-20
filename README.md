# Mewtation Lab

A breeding planner for [Mewgenics](https://store.steampowered.com/app/1487270/Mewgenics/).
Point it at your save and it reads every cat in your house, works out the exact
odds for every pairing you could set up tonight, and tells you which two to put
in a room together — and why.

Runs entirely in your browser. Your save never leaves your computer, and nothing
is ever written back to it.

**Unofficial.** Not affiliated with or endorsed by the makers of Mewgenics.

---

## What it does

- **Reads your real save** — SQLite container, LZ4-compressed cat records, decoded
  exactly rather than guessed at.
- **Separates base stats from level-up bonuses.** Only base stats are inherited.
  The number the game shows you includes bonuses no kitten will ever get, and
  ranking by that number recommends the wrong cats.
- **Computes exact probabilities, not simulations.** Seven independent coin flips
  give at most 128 possible kittens per pairing, so the whole distribution is
  enumerable. Every percentage in the app is exact.
- **Explains itself.** No unexplained scores.
- **Plans your whole house.** A cat can only be in one room, so choosing which
  pairs to actually run is a maximum-weight matching problem, not a top-N list.
- **Admits what it doesn't know.** Inbreeding shows as *unknown*, never as 0%.

## Getting your save

On Windows, Mewgenics keeps saves here:

```
%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves\steamcampaign01.sav
```

`%APPDATA%` is `C:\Users\<you>\AppData\Roaming`. There is a `backup\` folder
beside it if you need a spare copy.

In Chrome or Edge, pick the file once and the app remembers it — after that it
is one click, and it notices when Mewgenics writes a new day. Other browsers get
drag-and-drop.

## Running it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build
```

If you drop a `.sav` in the project root, `npm run dev` will serve it at
`?sample` so you can work on the UI without clicking through a file picker. That
route exists only in the dev server and never reaches a build. Save files are
gitignored, and the deploy workflow refuses to publish a build containing one.

## How it is put together

```
src/parser/      .sav → typed Cat[]. No UI, no framework.
  lz4.ts         block decompressor (~40 lines, no dependency)
  reader.ts      sequential reader for the engine's serialisation format
  catBlob.ts     the cat record layout
  saveFile.ts    driver-shaped loader, so tests need no WASM

src/breeding/    the maths. Pure functions, exhaustively tested.
  inheritance.ts exact offspring distribution
  traits.ts      ability, passive, mutation, disorder chances
  fertility.ts   twin chance
  pair.ts        analysis + the explanation engine

src/recommend/   goals, ranking, and the room optimiser
src/save/        browser file access (sql.js, File System Access API)
src/ui/          React components
```

The parser, the maths, and the UI are deliberately separate. When Mewgenics
changes its save format only `src/parser/` should need touching, and if this ever
becomes a desktop app the other two layers move across unchanged.

## The mechanics it models

| Mechanic | Formula |
|---|---|
| Stat inheritance | `P(biased value) = (100 + \|Stim\|) / (200 + \|Stim\|)` |
| Active ability | `20% + 2.5% × Stim`, guaranteed at 32 |
| Second active | `2% + 0.5% × Stim` |
| Passive ability | `5% + 1% × Stim`, guaranteed at 95 |
| Mutation over ordinary part | `50% + 50% × Stim / (200 + \|Stim\|)` |
| Twin chance | `fertilityA × fertilityB − 1` |
| Disorder | 15% roll per parent |

Sources are in [CREDITS.md](CREDITS.md).

One consequence is worth stating up front, because it reframes how you should
play: **traits saturate almost immediately and stats never do.**

| Stimulation | 32 | 95 | 200 |
|---|---|---|---|
| Active ability | 100% | 100% | 100% |
| Passive ability | 37% | 100% | 100% |
| Better stat | 57% | 61% | 75% |

Past about 95 Stimulation, more buys you almost nothing but stat bias — and stat
bias can never beat 75%, no matter how good your furniture is.

## Status

Working: save parsing, cat browser, exact stat genetics, pair ranking, goals,
pair lab, room optimiser, explanations.

Next: decoding `files.pedigree` so inbreeding becomes a real number instead of an
honest *unknown*. See the [technical plan](mewgenics-breeding-planner-technical-plan.md).

## Licence

MIT. See [LICENSE](LICENSE).
