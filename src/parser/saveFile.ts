import { unwrapCatBlob } from './lz4';
import { parseCatBlob } from './catBlob';
import { parseAdventureKeys, parseHouseState } from './houseState';
import type { Cat, ParsedSave, SaveProperties } from './types';

/** Days before a kitten becomes an adult and is able to breed. */
export const ADULT_AGE_DAYS = 3;

/**
 * The minimal shape we need from a SQLite driver. Keeping the loader driver-shaped
 * rather than sql.js-shaped means the parser is testable in Node against the
 * `sqlite3` CLI or better-sqlite3, with no WASM in the test path.
 */
export interface SaveTables {
  cats: Map<number, Uint8Array>;
  files: Map<string, Uint8Array>;
  properties: Map<string, string | number | Uint8Array | null>;
}

export function parseSave(tables: SaveTables, fileName: string): ParsedSave {
  const properties = readProperties(tables.properties);

  const houseState = tables.files.get('house_state');
  const roomByKey = new Map<number, string>();
  if (houseState) {
    for (const occupant of parseHouseState(houseState)) roomByKey.set(occupant.key, occupant.room);
  }

  const adventureState = tables.files.get('adventure_state');
  const adventureKeys = new Set(adventureState ? parseAdventureKeys(adventureState) : []);

  const cats: Cat[] = [];
  const unknownVersions = new Set<number>();
  let failed = 0;

  for (const [key, wrapped] of [...tables.cats.entries()].sort((a, b) => a[0] - b[0])) {
    let blob: Uint8Array;
    try {
      blob = unwrapCatBlob(wrapped).data;
    } catch {
      failed += 1;
      continue;
    }

    const { cat } = parseCatBlob(blob, {
      key,
      currentDay: properties.currentDay,
      room: roomByKey.get(key) ?? null,
      onAdventure: adventureKeys.has(key),
      adultAgeDays: ADULT_AGE_DAYS,
    });

    if (!cat) {
      failed += 1;
      continue;
    }
    if (cat.formatVersion !== 19) unknownVersions.add(cat.formatVersion);
    cats.push(cat);
  }

  const rooms = [...new Set([...roomByKey.values()])].sort();

  return {
    fileName,
    cats,
    properties,
    rooms,
    unknownVersions: [...unknownVersions],
    stats: {
      total: tables.cats.size,
      verified: cats.filter((c) => c.parseConfidence === 'verified').length,
      partial: cats.filter((c) => c.parseConfidence === 'partial').length,
      failed,
    },
  };
}

function readProperties(raw: Map<string, string | number | Uint8Array | null>): SaveProperties {
  const num = (key: string): number | null => {
    const v = raw.get(key);
    return typeof v === 'number' ? v : null;
  };
  const str = (key: string): string | null => {
    const v = raw.get(key);
    return typeof v === 'string' ? v : null;
  };

  return {
    currentDay: num('current_day'),
    versionString: str('version_string'),
    houseGold: num('house_gold'),
    houseFood: num('house_food'),
    // Parsed so we can echo the exact save path back to the user.
    // Never rendered in full, never transmitted.
    ownerSteamId: str('owner_steamid'),
    raw,
  };
}
