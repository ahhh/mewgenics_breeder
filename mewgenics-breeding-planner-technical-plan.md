# Mewtation Lab — Technical Implementation Plan

**Revision 2.** Revised after reverse-engineering a real save (`steamcampaign01.sav`, 161 cats, day 58, game version 1.1) and cross-checking the breeding maths against the community wiki.

Everything marked **VERIFIED** below was confirmed against that save or against a primary source, not assumed.

---

## 0. What this revision changed, and why

The original plan was directionally right and its central bet — *exact probability, not heuristics* — survives contact with the real data. Eleven things changed:

| # | Original plan said | Reality | Consequence |
|---|---|---|---|
| 1 | Browser-only static site, `<input type="file">` | A web page cannot read a fixed Windows path | Use the **File System Access API** with a persisted handle, so the user picks the save *once*. See §3. |
| 2 | Tables `cats` / `basic_data` / `files` | Tables are `cats`, `furniture`, `files`, `properties`, `winning_teams`. There is no `basic_data`. | §5 |
| 3 | LZ4-decompress "each cat", implying everything is compressed | **Only `cats` blobs are LZ4.** `files`, `furniture`, `properties` are stored raw. | §5 |
| 4 | `save_version` read from the DB, `versions/v19.ts`, `v20.ts`… | Version is a **u32 at byte 0 of every cat blob** (currently `19`). The DB carries a separate `version_string` property (`"1.1"`). | §6 |
| 5 | Parser will need per-version offset tables | The cat blob is a **sequential record**, walkable exactly. Most of it is fixed deltas from the end of the name; two counted lists (temporary buffs, disorders) interrupt it, and the class record is found by shape. Validated 161/161 at `verified` confidence. | §7 — this is the single biggest change |
| 6 | Stimulation influences which parental stat is inherited (formula unspecified) | **VERIFIED**: `P(biased value) = (100 + \|Stim\|) / (200 + \|Stim\|)` | §9 |
| 7 | Ability/mutation genetics are "Phase 2", exact engine unknown | **All the formulas are published and verified.** They are linear and cheap. | §10 — pulled forward into v1 |
| 8 | "If fertility can be reliably decoded…" | **Fertility is decoded.** It is an `f64` in `[1.0, 1.25]` at a fixed offset. Twin chance is exactly `fA × fB − 1`. | §11 |
| 9 | Inbreeding is Milestone 3, computed from a parsed pedigree | The `files.pedigree` blob exists (34 KB) and is *not yet decoded*. Cat blobs do **not** appear to carry parent IDs directly. | §12 — risk called out honestly |
| 11 | `0x0020` in the status bitfield means "dead" | It means **gone from the house** and over-reports deaths roughly 2×. The class record carries an explicit `deathDay`. | §7 |
| 10 | Fixture list of eight synthetic `.sav` variants | We have one real save. Fixtures must be **derived** from it and anonymised. | §16 |

One thing worth stating plainly, because it reframes the whole product: **Stimulation affects stats and traits on wildly different curves.**

```
Stimulation     32      95      200
─────────────────────────────────────
Active ability  100%    100%    100%
Passive ability  37%    100%    100%
Better stat      57%     61%     75%
```

Trait inheritance *saturates* almost immediately. Stat quality has punishing diminishing returns and can never exceed 75% at Stim 200. So the honest advice to a player is rarely "get more Stimulation" — past ~95 it buys almost nothing but stat bias, and stat bias is the expensive one. The app should say this out loud.

---

## 1. Product vision

Build a **fast, private breeding companion for Mewgenics** that reads a player's real save file and answers:

> **"Which cats should I breed, and why?"**

Runs entirely in the browser, hosted as a static site. No save is uploaded, no account, strictly **read-only** — this is a breeding planner, not a save editor. There is already a good save *editor* in the community; there is no good breeding *planner*.

Core loop:

**Load Save → Meet Your Cats → Pick a Goal → See Best Pairs → Understand the Odds → Plan Rooms**

---

## 2. Core principles

### Useful before complicated

The most important screen is not the parser or the cat database. It is **"here are the three pairs you should breed next."** Every technical decision serves that.

### Explain recommendations

Never show an unexplained `93.7 breeding score`. Show:

> **Mumps × Garbage — Excellent Pair**
> - 6/7 stats can inherit a 7
> - Expected base stat total: **38.4**
> - 38% chance of a kitten with at least five 7s
> - Excellent STR/DEX complement
> - Strong chance to inherit *Fireball*
> - Weak point: CHA caps at 5

### Exact probability, never Monte Carlo

Every mechanic we model is a product of independent, closed-form events. Seven independent binary stat choices give **at most 128 offspring stat vectors per pairing**, enumerable exactly in microseconds. Simulation would only add noise.

### Honest about what we don't know

Inbreeding is a headline feature *and* the one thing not yet decoded. The UI must never invent a number. An undecoded field shows as "unknown", not as `0%`.

---

## 3. Delivery model — how we reach the save file

**Decision: static web app + File System Access API.** Not a desktop app.

The tension: the game runs on Windows and writes to a known path, but a web page cannot read an absolute path unprompted. The File System Access API closes most of that gap:

1. User clicks **FEED ME YOUR SAVE** once and picks the file.
2. We store the returned `FileSystemFileHandle` in **IndexedDB**. Handles survive reloads.
3. On every subsequent visit, one click re-reads it — no file dialog.
4. We poll `handle.getFile().lastModified`; when the game writes a new save, the app offers **"Day 59 detected — refresh?"**

The default Windows location is shown with a copy button so it can be pasted into the picker's address bar:

```
%APPDATA%\Glaiel Games\Mewgenics\<steam-id>\saves\steamcampaign01.sav
```

`%APPDATA%` expands to `C:\Users\<you>\AppData\Roaming`. The `<steam-id>` folder matches the `owner_steamid` property inside the save itself, so once loaded we can echo the exact path back.

There is also a `backup\` sibling folder written by the game.

### Browser support and fallback

| Browser | Behaviour |
|---|---|
| Chrome / Edge on Windows | Full: remembered handle, one-click reload, change detection |
| Firefox / Safari | Drag-and-drop or file picker each time; everything else identical |

Feature-detect `window.showOpenFilePicker`. Never let the fallback path feel like an error state.

### Why not a desktop app

A Tauri build would give true zero-pick auto-discovery and a filesystem watcher. It costs a release pipeline, code signing, an antivirus-false-positive support burden, and a binary nobody can try from a link. Revisit as **Milestone 8**, once the web app has proven the analysis is worth installing something for. The parser and engine are deliberately UI-free so they port unchanged.

---

## 4. Technology stack

| Layer | Choice | Note |
|---|---|---|
| Language | TypeScript (strict) | |
| UI | React 19 | |
| Build | Vite | |
| Styling | Plain CSS + custom properties | No framework; the look is bespoke |
| SQLite | `sql.js` (WASM) | Only WASM dependency |
| LZ4 | **Hand-written, ~40 lines** | See §5 — avoids a dependency and the variant ambiguity |
| State | React state + small contexts | No Redux |
| Persistence | IndexedDB (file handle), `localStorage` (prefs) | |
| Tests | Vitest | Parser tests run against the real save locally |
| Hosting | GitHub Pages | |

Writing the LZ4 decoder ourselves is a deliberate call. It is a well-specified ~40-line block-format decoder, we only ever *decompress*, and it removes a WASM/npm dependency whose two competing "variants" caused confusion in prior community tools.

---

## 5. Save file container — **VERIFIED**

The `.sav` is a plain SQLite 3 database (`user_version = 1`).

```sql
CREATE TABLE cats          (key INTEGER PRIMARY KEY, data BLOB) STRICT;
CREATE TABLE furniture     (key INTEGER PRIMARY KEY, data BLOB) STRICT;
CREATE TABLE files         (key TEXT    PRIMARY KEY, data BLOB) STRICT;
CREATE TABLE properties    (key TEXT    PRIMARY KEY, data ANY ) STRICT;
CREATE TABLE winning_teams (key INTEGER PRIMARY KEY, data BLOB) STRICT;
```

| Table | Rows in sample | Compression |
|---|---|---|
| `cats` | 161 | **LZ4 block** |
| `furniture` | 46 | raw |
| `files` | 14 | raw |
| `properties` | 128 | raw scalars |
| `winning_teams` | 0 | — |

### Cat blob compression

```
[u32 uncompressed_size][ raw LZ4 block stream ]
```

All 161 blobs in the sample use this layout and round-trip to exactly `uncompressed_size`. A second variant `[u32 uncomp][u32 comp][stream]` is reported by other tools; we **detect** it (try the 8-byte header first, verify the decompressed length matches, else fall back) but have never observed it. If we ever see one, we log a warning rather than guessing.

### `files` keys present

`save_file_cat`, `unlocks`, `house_unlocks`, `house_state`, `name_gen_history_w`, `pedigree`, `inventory_backpack`, `inventory_storage`, `inventory_trash`, `npc_progress`, `chapter_map`, `adventure_state`, `trollengine_state`, `tutorial_tokens`

### `properties` we consume

| Key | Sample | Use |
|---|---|---|
| `current_day` | `58` | age = `current_day − birthday` |
| `version_string` | `"1.1"` | compatibility banner |
| `owner_steamid` | `76561198231405128` | echo the exact save path back to the user; **never displayed in full, never transmitted** |
| `house_gold` / `house_food` | `7436` / `128` | home dashboard |
| `save_file_next_cat_mutation` | `30` | mutation RNG cursor (informational) |

---

## 6. Version handling

Every cat blob starts with a **u32 format version**, currently `19`.

```ts
const version = u32(blob, 0);
if (version !== KNOWN_CAT_FORMAT) {
  // parse anyway, but mark every cat parseConfidence: "unknown"
  // and show the banner below
}
```

> **We found a save version we haven't tested yet.**
> Your save was not modified. Cat format version: 20 (we know 19).

We do **not** ship a `versions/v19.ts`, `v20.ts` directory. That was premature: one format is known, and speculative version modules are dead code that rots. Instead the parser is a single sequential reader whose field deltas are named constants in one table. When version 20 appears, we diff and branch *then*.

---

## 7. Cat blob layout — **VERIFIED, 161/161**

This is the most important correction in the revision. The blob is **not** a fixed-offset struct requiring per-version offset tables, and it does **not** require the heuristic "scan for seven plausible integers" approach used by existing community tools. It is a **sequential serialisation with a deterministic shape**.

Two string encodings appear:

- **Wide string** — `u64 char_count` + `char_count × 2` bytes UTF-16LE. Used for the cat's name.
- **Narrow string** — `u64 byte_count` + `byte_count` bytes ASCII. Used for every identifier.

Two variable-length fields sit before the stats block — the name and the collar — so anchor on the end of each:

```
NAME_END   = 0x14 + nameLength * 2
COLLAR_END = end of the narrow string at NAME_END + 0x18
```

and everything else falls out. (The collar is `"None"` in all 161 sample cats, which makes it look like a fixed field; anchoring on its end rather than on `NAME_END` costs nothing and survives a cat that is actually wearing something.)

| Offset | Type | Field | Sample |
|---|---|---|---|
| `0x00` | u32 | format version | `19` |
| `0x04` | u64 | unique cat id | `0x40BA43CED9C92133` |
| `0x0C` | u64 | name length (chars) | `6` |
| `0x14` | UTF-16LE | name | `"Wagner"` |
| `NAME_END + 0x08` | u16 | **sex** | `0` |
| `NAME_END + 0x0C` | u16 | sex (duplicate — validate they match) | `0` |
| `NAME_END + 0x10` | u16 | **status flags** | see below |
| `NAME_END + 0x18` | narrow str | collar / `"None"` | `"None"` |
| *(collar end) + 60* | f64 | **fertility** | `1.116281` |
| *(collar end) + 368* | narrow str | name-pool id | `"male37"` |
| *(pool end) + 8* | 7 × i32 | **base stats** | `6 3 5 6 4 5 6` |
| *(+28)* | 7 × i32 | level-up bonuses | `0 0 0 1 0 0 0` |
| *(+28)* … `+28` | narrow str | combat status effect | `"none"` |
| *(status end)* | u32 | current HP (`0x3FFFFFFF` = full) | `1073741823` |

Stat order is **STR, DEX, CON, INT, SPD, CHA, LCK**. Base stats observed in `[3, 7]`; validate `[1, 10]` and flag outliers.

The name-pool id (`"male37"`, `"female17"`, `"terminator"`) is the generator pool the name came from — cosmetic, but a useful parse checksum, and it identifies special cats.

### Sex — **VERIFIED**

| Value | Meaning | Breeds with |
|---|---|---|
| `0` | Male | Female, Ditto |
| `1` | Female | Male, Ditto |
| `2` | Ditto | anyone |

Stored twice; in all 161 samples both copies agreed. Disagreement ⇒ `parseConfidence: "partial"`.

### Status flags — u16 bitfield at `NAME_END + 0x10`

| Bit | Meaning | Confidence |
|---|---|---|
| `0x0020` | **gone from the house** — dead, donated or departed | high — 50/161, and never set on a cat present in `house_state` |
| `0x4000` | **donated** | high — 19/161, none of which have a death day |
| `0x8000` | **buried** (in the graveyard) | high — 19/161, all with a death day |

Observed raw values: `0, 1, 3, 17, 33, 35, 2049, 2051, 4099, 8193, 16385, 16387, 32801, 32803, 33827`. Every housed cat has flags in `{0, 1, 3}`.

Note the correction: `0x0020` is **not** "dead", which is how community tools read it. Use `deathDay` for that. Bits `0x0800`, `0x1000`, `0x2000` and `0x0010` remain unexplained; the parser keeps `flags.raw` so we can crowdsource the rest rather than guessing.

### Two counted lists interrupt the walk

Implementation turned up two variable-length regions that are invisible in most cats, because most cats have zero entries in them. Both read as flat padding until you meet a cat that doesn't:

1. **Temporary buffs**, immediately after the HP field: six bytes, then a `u32` count, then that many `[narrow string][u32]` records. One cat in 161 (`Kitsey`, mid-`TempStrengthUp`) has a non-zero count — and that one cat desynchronises any parser that treats the region as fixed padding.
2. **Disorders**, between the passives and the class record: a list whose length depends on how many disorders the cat carries. Entries look like `[u32 5][u8 present]`, with a name and payload following when present. `Cordyceps` and `TheTick` appear here.

The second one is why the class record cannot be reached by a fixed offset.

### Class, level, birthday — and death

The record is:

```
[u64 len][ASCII className][i32 level][f64 xp][i64 birthdayDay][i64 deathDay]
```

`deathDay` is `-1` while the cat is alive. **This is the correct "is this cat dead" signal**, not the status bitfield: flag `0x0020` marks *gone from the house* — which covers death, donation and departure alike — and over-reports deaths by roughly half (50 flagged vs 32 with an actual death day).

A cat's displayed age should be measured to its death day, not to today, or every cat in the graveyard keeps ageing.

Classes observed: `Colorless` (89 — the unclassed default), `Tank`, `Medic`, `Hunter`, `Necromancer`, `Fighter`, `Druid`, `Mage`, `Thief`, `Psychic`.

Because of the disorder list, this record is located **by shape rather than by offset**: scan for a candidate where all five fields are simultaneously plausible — alphabetic name of sane length, level in `0..99`, finite non-negative xp, birthday inside the campaign, and a death day that is either `-1` or falls between birth and today — and take the last match. Five simultaneous constraints is a far stronger filter than the "scan for seven ints that look like stats" approach used by existing tools, and it resolves 161/161.

### Mutations — appearance table

A fixed table of one 16-byte header (`f32 scale`, `u32 coat_id`, …) followed by **14 × 20-byte slots**:

| Slot | Part | Symmetry |
|---|---|---|
| 1 | Body | symmetric |
| 2 | Head | symmetric |
| 3 | Tail | symmetric |
| 4 / 5 | Rear leg L / R | pair |
| 6 / 7 | Front leg L / R | pair |
| 8 / 9 | Eye L / R | pair |
| 10 / 11 | Brow L / R | pair |
| 12 / 13 | Ear L / R | pair |
| 14 | Mouth | symmetric |

Slot id `< 300` is an ordinary part; `>= 300` is a mutation. The plan's original `mutations: { body, head, tail, leftEye, ... }` model is right, and the L/R pairing matters because defects replace *asymmetric pairs*.

### Sequential-walk discipline

The parser walks forward and asserts at each step. Any assertion failure sets `parseConfidence` and pushes a `warning`, but **never aborts the load** — one malformed cat must not cost you the other 160. Target: `verified` for ≥ 95% of cats on a known version.

---

## 8. Normalised model

The rest of the app never sees a byte offset.

```ts
interface Cat {
  key: number;                 // cats.key — stable within a save
  id64: bigint;                // unique id from the blob
  name: string;
  sex: 'male' | 'female' | 'ditto';

  baseStats: Stats;            // the ONLY thing that breeds
  levelBonuses: Stats;         // does NOT breed
  className: string;
  level: number | null;

  birthdayDay: number | null;
  ageDays: number | null;      // currentDay - birthdayDay
  isAdult: boolean;

  fertility: number | null;    // 1.0 .. 1.25
  room: string | null;         // from files.house_state
  hp: number | null;
  statusEffect: string;

  mutations: MutationSlot[];
  coatId: number | null;
  abilities: string[];
  passives: string[];

  flags: { raw: number; dead: boolean; donated: boolean; retired: boolean };

  parseConfidence: 'verified' | 'partial' | 'unknown';
  warnings: string[];
}

interface Stats { str; dex; con; int: number; spd; cha; luck: number }
```

**`baseStats` vs `levelBonuses` is the single most important distinction in the app.** Only base stats are inherited — the wiki is explicit that kittens inherit "the base stats of their parents, the ones without pluses or minuses in the stat line". A tool that ranks by *displayed* stats would recommend the wrong cats, confidently. Every breeding calculation uses `baseStats` and the UI must show why the number differs from the one in-game.

---

## 9. Stat inheritance — **VERIFIED**

Each of the seven stats is inherited independently. One parent's value is copied; there is no averaging.

```
P(biased value) = (100 + |Stimulation|) / (200 + |Stimulation|)
```

Positive Stimulation biases toward the **higher** parent value; negative Stimulation biases toward the **lower**.

| Stim | P(better) |
|---|---|
| 0 | 50.0% |
| 32 | 56.9% |
| 50 | 60.0% |
| 100 | 66.7% |
| 200 | 75.0% |

When both parents share a value the choice is degenerate and that stat is deterministic — which shrinks the outcome space below 128 and is worth surfacing ("4 of 7 stats are already locked in").

```ts
function statDistribution(a: number, b: number, stim: number): Map<number, number> {
  if (a === b) return new Map([[a, 1]]);
  const p = (100 + Math.abs(stim)) / (200 + Math.abs(stim));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return stim >= 0 ? new Map([[hi, p], [lo, 1 - p]])
                   : new Map([[lo, p], [hi, 1 - p]]);
}
```

Enumerating the Cartesian product of the seven distributions gives the **exact** joint offspring distribution. From it, exactly (not approximately):

- P(total ≥ N), and the full distribution of the total
- P(at least k stats ≥ 7), and E[number of 7s]
- P(STR ≥ 7 **and** DEX ≥ 7) — joint, not a product of marginals
- best and worst possible kitten
- P(kitten strictly dominates either parent)

### Genetic complement

The insight the app is built to sell: a pair's **ceiling** is `max(a, b)` per stat, so two mediocre cats with *opposite* weaknesses beat two good similar cats.

```
MUM  STR 7  DEX 3  CON 7  INT 2  SPD 7  CHA 4  LCK 3   (total 33)
DAD  STR 4  DEX 7  CON 5  INT 7  SPD 4  CHA 7  LCK 7   (total 41)
────────────────────────────────────────────────────
CEIL     7      7      7      7      7      7      7   → PERFECT COMPLEMENT
```

Neither parent is good. Every kitten stat *can* be a 7.

---

## 10. Trait inheritance — **VERIFIED**, and pulled into v1

The original plan deferred all of this. It shouldn't have: the formulas are published, linear, and trivially cheap.

| Mechanic | Chance | Saturates at |
|---|---|---|
| Active ability, 1st attempt | `20% + 2.5% × Stim` | Stim 32 |
| Active ability, 2nd attempt | `2% + 0.5% × Stim` | Stim 196 |
| Passive ability | `5% + 1% × Stim` | Stim 95 |
| Mutation over ordinary part | `50% + 50% × Stim / (200 + \|Stim\|)` | asymptotic → 100% |
| Disorder from each parent | flat `15%` per parent | — |

All chances clamp to `[0, 1]`.

Notes that affect correctness:

- The first active-ability attempt can **overwrite** a collarless ability; the second *adds*. They are not interchangeable.
- If exactly one parent has **Skill Share+**, that parent's other passive is **guaranteed** to pass. This is a special case, not a probability — model it explicitly.
- Mutation inheritance is per body slot, choosing one parent's version of that slot, with the formula above biasing toward whichever version is a mutation.

---

## 11. Fertility and litter size — **VERIFIED**

Fertility is an `f64` in `[1.0, 1.25]`, 60 bytes past the end of the collar string. Present and in range for all 161 cats.

```
P(twins) = fertilityA × fertilityB − 1
```

Maximum 56.25% (`1.25²−1`). The game rolls fertility as the *lower* of two uniform draws in `[1.0, 1.25]`, so the mean is ≈ 1.0833 and typical twin chance ≈ 17.4%.

Fertility is hidden in-game, which makes it a genuine reason to use the tool — but it must **not** dominate genetic scoring. Twins of a mediocre pairing are worse than one kitten from a great one. Surface it as a separate column, weighted low by default.

---

## 12. Inbreeding — honest status

Inbreeding is a first-class feature and is **the one thing not yet decoded**.

What is known:

- A kitten's inbreeding coefficient equals the **kinship between its parents**.
- Tiers: `<10%` not inbred · `10–25%` slightly · `25–50%` moderately · `50–80%` highly · `>80%` extremely.
- Parent–child chains climb `0% → 25% → 37.5% → 50% → …` reaching 82.6% by the ninth generation.
- Extra disorder chance when fewer than two were inherited: `max(2%, 0.4 × inbreeding − 6%)`, capped at 34%.
- Birth-defect chance: `1.5 × inbreeding`, guaranteed at 66.6%. Above 90% inbreeding two *asymmetric* parts are replaced instead of one symmetric part.

### Decoding progress — `files.pedigree` (34,704 bytes, uncompressed)

Substantially cracked, not yet finished. Confirmed so far:

**Header** — `i64 -11`, `u64 161` (matches the cat count), `u64 255`.

**The 255 is a hash-table capacity.** From `0x18` there are `255 + 16 + 1 = 272` control bytes, and the final 16 duplicate the first 16 — the signature of a `phmap`/abseil `flat_hash_map`, which clones the first control group at the end so SIMD probing can wrap without branching. The p0lymeric analysis repo independently reconstructs `phmap` types for this engine, which corroborates it. Slots begin at `0x128`.

**Two record shapes are present.** Some carry a cat and its parents:

```
[i64 catKey][i64 parentA][i64 parentB][f64 inbreedingCoefficient]
```

and there is a **kinship pair table** whose entries are 24 bytes:

```
[i64 catA][i64 catB][f64 kinship]
```

292 entries hold a genuine kinship value — filtered by requiring a dyadic rational in `[1/8192, 1]`, which is what kinship coefficients always are and which almost nothing else in a binary blob is. Samples: `(51, 81) → 0.25`, `(43, 44) → 0.25`, `(40, 55) → 0.09375`, `(132, 116) → 0.015625`, `(148, 116) → 0.2578125`.

**The two shapes cross-check.** Cat 108's record gives parents 51 and 81 with coefficient `0.25`, and the pair table independently stores `kinship(51, 81) = 0.25` — exactly the wiki's rule that a kitten's inbreeding equals the kinship between its parents. Cat 108's ancestor list also contains 51, i.e. parent–child breeding, whose coefficient is 0.25. Three independent facts agree.

**Still to do:** pin down the exact slot stride and the boundary between the two record shapes (observed gaps between coefficients are 24, 48, 72, 96, 120 — consistent with 24-byte entries separated by zero-kinship or differently-shaped neighbours), then confirm the table covers every living pair. Once framed, inbreeding becomes a direct lookup rather than a pedigree walk, which is far cheaper than this plan originally assumed.

**Until the framing is finished**, the UI shows inbreeding as **"unknown"** and says so. It does not show `0%`. A breeding planner that silently reports zero inbreeding for a pair of siblings is worse than one that admits ignorance — it would actively cause the harm it exists to prevent.

Decoding `pedigree` is **Milestone 3** and the highest-value work after v1 ships.

---

## 13. Eligibility and compatibility

Breeding is not directed — you place cats in a room and the game rolls at end of day. So the room planner is the *primary* interaction, not a bonus feature.

Requirements:

- Both cats **adults** (kittens cannot breed)
- Both in the **same room** at end of day
- Compatible sexes: male×female, or ditto×anyone
- Neither flagged as blocked from breeding (applies to humanoid strays)

Acceptance chance: `15% × initiator_charisma × partner_libido × lover_mult × sexuality_mult`, rejected below 5%.

Libido and sexuality are not yet located in the blob. Until they are, the app models **genetic quality of the outcome**, not the odds of the encounter, and labels that distinction clearly. Default recommendations exclude dead, donated, non-adult, and away-on-adventure cats, with an **Include unavailable cats** toggle for bloodline planning.

---

## 14. Recommendation engine

Metrics are kept separate internally and weighted per goal; users see reasons, never coefficients.

```ts
interface PairMetrics {
  expectedStatTotal: number;
  expectedSevens: number;
  statCeiling: number;
  complementScore: number;
  targetProbability: number;
  abilityValue: number;
  mutationValue: number;
  twinChance: number;
  inbreedingRisk: number | null;   // null = unknown, never 0
}
```

Goals: **Best Overall**, **Perfect Stats**, **Build a Cat** (weighted user targets), **Safe Outcross** (blocked until pedigree lands — greyed out with the reason shown), **Mutation Hunter**, **Ability Hunter**.

Explanations are generated from structured rules, not string templates glued to scores:

```
WHY THIS PAIR?
  ✓ Covers all seven stats at 7
  ✓ Very strong DEX complement (3 → 7)
  ✓ 74% chance to pass Nine Lives at this Stimulation
  ✓ Above-average twin chance (31%)
  ⚠ Neither parent contributes high CHA — kittens cap at 5
  ? Inbreeding unknown (pedigree not yet decoded)
```

### Performance and caching

`N` eligible cats ⇒ `O(N²)` pairs; 100 cats = 4,950 pairs × ≤128 outcomes = trivial. The sample save has 25 housed cats — 300 pairs. No Web Worker needed for v1; add one only when multi-generation search arrives.

```ts
pairCache.set(`${a.key}:${b.key}:${stimulation}:${goalHash}`, result);
```

Re-sorting must never recompute. Changing Stimulation invalidates only probability-dependent values, not the pair set.

---

## 15. Room planning

Ranking pairs individually is half the problem — a cat can only be in one room. Choosing a set of non-overlapping pairs is a **maximum-weight bipartite matching** over the male×female score matrix, constrained by room count. Greedy selection is measurably worse and this is where the tool beats a spreadsheet.

Rooms carry their own Stimulation, entered manually in v1 (the sample save has `Attic` and `Floor1_Large`, read from `files.house_state`). Deriving Stimulation from `furniture` automatically requires the game's furniture stat tables, which are the developer's data and which we will not redistribute — see §18.

---

## 16. Testing

The original fixture list (eight synthetic `.sav` variants across versions and LZ4 variants) described saves we do not have and cannot fabricate. Replace it with what is real:

1. **Local golden test.** `steamcampaign01.sav` sits in the working tree, **gitignored**. Tests skip with a clear message when it is absent so CI stays green.
2. **Committed derived fixtures.** From the real save, extract a handful of individual cat blobs, rename the cats, and commit those as small binary fixtures. They carry no Steam ID and no personal data.
3. **Invariant tests over all 161 cats** — the real regression net:
   - every blob decompresses to its declared length
   - version is `19` for all
   - both sex copies agree; value ∈ {0,1,2}
   - all 7 base stats ∈ `[1,10]`
   - fertility ∈ `[1.0, 1.25]`
   - the sequential walk consumes the record without desync
   - ≥ 95% reach `parseConfidence: "verified"`
4. **Engine tests** — pure functions, no fixtures:
   - identical parents ⇒ deterministic kitten
   - Stim 0 ⇒ exactly 50/50
   - Stim 100 ⇒ 2/3 exactly
   - negative Stim inverts the bias
   - probabilities sum to 1 (within 1e-12)
   - `P(twins) = fA·fB − 1`
   - joint ≠ product of marginals where stats are correlated by the shared draw

---

## 17. Interface

Five destinations: **HOME · CATS · BREED · PAIR LAB · ROOM PLAN**.

Look: Mewgenics-*adjacent*, never a clone. Dirty white, paper grey, charcoal, black; sparse sickly-green, faded-pink, mustard, muted-red accents. Irregular black borders, stamped labels, slightly rotated cards, deliberately imperfect separators. Original monochrome doodles only.

Terminology stays playful — `GOOD GENES`, `ABSOLUTE SPECIMEN`, `GENETIC DISASTER`, `COUSINS? UH OH.`, `MUTANT JACKPOT`, *"Digging through the litter box…"*, *"This does not appear to contain cats."* — but **every number and warning stays precise.** Jokes in the chrome, never in the data.

Success criterion: landing page to useful recommendation in **under 30 seconds**, without instructions.

---

## 18. Privacy, licensing, assets

**Privacy.** No backend, no upload endpoint, no analytics containing save data, no network request involving save contents. Parsing happens in browser memory. The save is dropped on reload unless the user opts into the remembered handle. `owner_steamid` is parsed but never displayed in full and never leaves the page.

**Licensing.** Community research informed this format spec. Facts about a file format are not copyrightable, but implementations are:

- [`michael-trinity/mewgenics-savegame-editor`](https://github.com/michael-trinity/mewgenics-savegame-editor) — **MIT**. Compatible; credit in `CREDITS.md`. Our parser is an independent implementation with a different (sequential, non-heuristic) design.
- [`accessiblefish/mewgenics-save-editor`](https://github.com/accessiblefish/mewgenics-save-editor) — **AGPL-3.0**. **Do not copy code.** Documentation may inform the spec.
- [`p0lymeric/mewgenics_analysis`](https://github.com/p0lymeric/mewgenics_analysis) — MIT.
- [The Mewgenics Wiki](https://mewgenics.wiki.gg/wiki/Breeding) — source for every breeding formula in §9–§13.

Ship `LICENSE` and `CREDITS.md`.

**Assets.** Do not redistribute the game's extracted JSON data or art. Create original logo, doodles, icons, textures. State clearly:

> Unofficial companion tool. Not affiliated with or endorsed by the developers or publisher of Mewgenics.

---

## 19. Milestones

**M0 — Parser** — ✅ **shipped**
Vite/TS repo · SQLite via sql.js · hand-written LZ4 · sequential cat parser · house_state rooms · properties · invariant tests over 161 cats, all at `verified` confidence.

**M1 — Cat browser** — ✅ **shipped**
Search, filter by availability/living/all, sort by any stat, specimen cards. Base vs. displayed stats made obvious on every card.

**M2 — Stat breeding engine** — ✅ **shipped**
Eligible pair generation · Stimulation control with all three saturation curves · exact 128-outcome distribution · expected/ceiling/floor · P(k sevens) · complement detection · ranked pairs with tiers · Pair Lab · generated explanations.

**M3 — Pedigree & inbreeding** — *highest value after v1*
Decode `files.pedigree` · kinship → offspring CoI · common-ancestor display · defect/disorder risk · Safe Outcross mode.

**M4 — Traits** — *partially shipped*
Active/passive odds and the Ability Hunter goal are in. **Still to do:** the Skill Share+ guaranteed-pass special case, parsing the disorder list now that its location is known, and a curated notion of which traits are desirable — right now the app reports trait odds neutrally, because it has no basis for calling `Anxiety` a worse inheritance than `Leader`.

**M5 — Mutations**
Per-slot inheritance with the mutation-bias formula · L/R pair handling · Mutation Hunter.

**M6 — Room optimiser** — ✅ **shipped ahead of schedule** (the matching was cheaper than expected)
Per-room Stimulation · maximum-weight bipartite matching (Hungarian) · auto-assign · global score · benched list.
*Still to do:* pair exclusions, drag-and-drop override, and ditto×ditto pairings — dittos currently fill whichever side of the bipartite graph is shorter, so two of them are never matched together.

**M7 — Monster Builder**
Weighted multi-trait goals · P(satisfying build) · shareable presets.

**M8 — Desktop wrapper (optional)**
Tauri shell around the same engine for true auto-discovery and live watching.

### Minimum viable public release (M0–M2) — **complete**

```
✓ Read .sav directly, 100% client-side
✓ Remembered file handle + change detection on Windows
✓ Parse cats: name, sex, base stats, class, level, age, room, status, fertility
✓ Distinguish base stats from level-up bonuses
✓ Filter and search cats
✓ Set room Stimulation
✓ Evaluate every valid pairing
✓ Exact stat-inheritance probabilities
✓ Rank complementary pairs, show expected / ceiling / P(k sevens)
✓ Twin chance
✓ Explain every recommendation
✓ Compare pairs side by side
✓ Say "unknown" for inbreeding rather than guessing
✓ Deploy to GitHub Pages
```

---

## 20. Definition of success

A player loads their save and says:

> *"Oh damn, I never would have thought to breed those two."*

…and then immediately understands **why**.

The differentiator is not "it ranks cats". It is: **it understands your whole house, knows what you're trying to breed, tells you the best way to get it, and shows you the real odds — including when it doesn't know.**
