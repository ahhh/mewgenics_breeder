import { beforeAll, describe, expect, it } from 'vitest';
import { unwrapCatBlob } from '../src/parser/lz4';
import { KNOWN_CAT_FORMAT } from '../src/parser/catBlob';
import { parseSave, type SaveTables } from '../src/parser/saveFile';
import { STAT_KEYS, type ParsedSave } from '../src/parser/types';
import { hasRealSave, loadRealSaveTables } from './realSave';

const describeReal = hasRealSave() ? describe : describe.skip;

// Vitest still runs a skipped suite's body to collect its tests, so the save
// has to be read in beforeAll — a top-level read would fire on CI, where there
// is no save, and fail the run instead of skipping it.
describeReal('parsing the real save', () => {
  let tables: SaveTables;
  let save: ParsedSave;

  beforeAll(() => {
    tables = loadRealSaveTables();
    save = parseSave(tables, 'steamcampaign01.sav');
  });

  it('finds every cat', () => {
    expect(tables.cats.size).toBe(161);
    expect(save.cats).toHaveLength(161);
    expect(save.stats.failed).toBe(0);
  });

  it('decompresses every blob to its declared length', () => {
    for (const [key, wrapped] of tables.cats) {
      const declared = new DataView(wrapped.buffer, wrapped.byteOffset).getUint32(0, true);
      const { data, variant } = unwrapCatBlob(wrapped);
      expect(data.length, `cat ${key}`).toBe(declared);
      expect(variant, `cat ${key}`).toBe('A');
    }
  });

  it('reads the save properties', () => {
    expect(save.properties.currentDay).toBe(58);
    expect(save.properties.versionString).toBe('1.1');
    expect(save.rooms).toEqual(['Attic', 'Floor1_Large']);
  });

  it('parses every cat with full confidence', () => {
    const notVerified = save.cats.filter((c) => c.parseConfidence !== 'verified');
    expect(notVerified.map((c) => `${c.key}:${c.name}:${c.warnings.join(';')}`)).toEqual([]);
  });

  it('agrees on the cat format version', () => {
    expect(save.unknownVersions).toEqual([]);
    for (const cat of save.cats) expect(cat.formatVersion).toBe(KNOWN_CAT_FORMAT);
  });

  it('keeps every base stat in range', () => {
    for (const cat of save.cats) {
      for (const key of STAT_KEYS) {
        expect(cat.baseStats[key], `${cat.name}.${key}`).toBeGreaterThanOrEqual(1);
        expect(cat.baseStats[key], `${cat.name}.${key}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it('keeps every fertility inside the documented 1.0–1.25 band', () => {
    for (const cat of save.cats) {
      expect(cat.fertility, cat.name).not.toBeNull();
      expect(cat.fertility!).toBeGreaterThanOrEqual(1);
      expect(cat.fertility!).toBeLessThanOrEqual(1.25);
    }
  });

  it('reads a known cat exactly', () => {
    const wagner = save.cats.find((c) => c.key === 1)!;
    expect(wagner.name).toBe('Wagner');
    expect(wagner.sex).toBe('male');
    expect(wagner.namePool).toBe('male37');
    expect(Object.values(wagner.baseStats)).toEqual([6, 3, 5, 6, 4, 5, 6]);
    expect(wagner.className).toBe('Colorless');
    expect(wagner.birthdayDay).toBe(-2);
    expect(wagner.ageDays).toBe(60);
    expect(wagner.isDead).toBe(false);
    expect(wagner.deathDay).toBe(-1);
  });

  it('gives every cat a recognised sex', () => {
    for (const cat of save.cats) expect(cat.sex, cat.name).not.toBe('unknown');
  });

  it('assigns rooms only to housed cats', () => {
    const housed = save.cats.filter((c) => c.room !== null);
    expect(housed).toHaveLength(25);
    for (const cat of housed) {
      expect(cat.isDead, `${cat.name} is dead but in a room`).toBe(false);
      expect(cat.flags.donated, `${cat.name} is donated but in a room`).toBe(false);
      expect(cat.flags.goneFromHouse, `${cat.name} is flagged gone but in a room`).toBe(false);
    }
  });

  it('finds an appearance table for every cat', () => {
    for (const cat of save.cats) {
      expect(cat.mutations, cat.name).toHaveLength(14);
      expect(cat.coatId, cat.name).not.toBeNull();
    }
  });

  it('never reports a death day in the future or before birth', () => {
    for (const cat of save.cats) {
      if (!cat.isDead) continue;
      expect(cat.deathDay!, cat.name).toBeGreaterThanOrEqual(cat.birthdayDay!);
      expect(cat.deathDay!, cat.name).toBeLessThanOrEqual(save.properties.currentDay!);
    }
  });

  it('reads plausible classes', () => {
    const known = new Set([
      'Colorless', 'Tank', 'Medic', 'Necromancer', 'Hunter', 'Fighter',
      'Mage', 'Druid', 'Thief', 'Psychic', 'Monk', 'Tinkerer', 'Butcher', 'Jester',
    ]);
    for (const cat of save.cats) expect(known, `${cat.name}: ${cat.className}`).toContain(cat.className);
  });
});
