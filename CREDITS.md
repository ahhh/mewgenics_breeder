# Credits

Mewtation Lab is an independent implementation, but it stands on community
research into the Mewgenics save format. Facts about a file format are not
copyrightable; implementations are. Where a project's licence is incompatible
with ours, its code was not used — only its documentation informed our spec.

## Save format research

- **[michael-trinity/mewgenics-savegame-editor](https://github.com/michael-trinity/mewgenics-savegame-editor)** — MIT.
  Confirmed the SQLite container, the LZ4 wrapper, the UTF-16 name field, the sex
  encoding, the appearance-table shape, and the HP sentinel. Our parser is a
  separate design: it walks the cat record sequentially rather than scanning the
  blob for plausible-looking integers, which is why it resolves fields that
  heuristic scanning misses.
- **[p0lymeric/mewgenics_analysis](https://github.com/p0lymeric/mewgenics_analysis)** — MIT.
  Engine type reconstructions and analysis tooling.
- **[accessiblefish/mewgenics-save-editor](https://github.com/accessiblefish/mewgenics-save-editor)** — AGPL-3.0.
  **No code from this project is used.** Referenced for documentation only.

## Game mechanics

- **[The Mewgenics Wiki](https://mewgenics.wiki.gg/wiki/Breeding)** — source for every
  breeding formula in this app: stat inheritance bias, ability and passive
  inheritance, mutation bias, fertility and twin chance, disorder and birth-defect
  rates, and the inbreeding tiers.

## Findings contributed back

Reverse-engineering for this project established some things we have not seen
documented elsewhere:

- The cat record is a **deterministic sequential serialisation**. Anchored at the
  end of the name, every field lands at a constant delta. Validated on 161 cats.
- **Fertility** is an `f64` at a fixed offset, always inside the documented
  `[1.0, 1.25]` band — so twin chance can be computed exactly before breeding.
- The class record ends with an **`i64` death day**, `-1` while the cat is alive.
  This is a cleaner "is dead" signal than the status bitfield, whose `0x0020` bit
  means "gone from the house" and over-reports deaths by roughly half.
- Between the passives and the class sits a **variable-length disorder list**,
  which is why fixed-offset walks to the class record fail on some cats.
- After the HP field sits a **counted list of temporary buffs**, which reads as
  flat padding until you meet a cat that is mid-buff.

## Not affiliated

Mewgenics is made by Edmund McMillen and Tyler Glaiel. This tool is unofficial
and is not affiliated with or endorsed by them or their publisher. It ships no
game assets and reads save files without modifying them.
