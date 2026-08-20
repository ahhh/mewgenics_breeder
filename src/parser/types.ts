export const STAT_KEYS = ['str', 'dex', 'con', 'int', 'spd', 'cha', 'luck'] as const;
export type StatKey = (typeof STAT_KEYS)[number];

export const STAT_LABELS: Record<StatKey, string> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  spd: 'SPD',
  cha: 'CHA',
  luck: 'LCK',
};

export type Stats = Record<StatKey, number>;

export function makeStats(values: readonly number[]): Stats {
  return {
    str: values[0] ?? 0,
    dex: values[1] ?? 0,
    con: values[2] ?? 0,
    int: values[3] ?? 0,
    spd: values[4] ?? 0,
    cha: values[5] ?? 0,
    luck: values[6] ?? 0,
  };
}

export function statTotal(s: Stats): number {
  return STAT_KEYS.reduce((sum, k) => sum + s[k], 0);
}

export type CatSex = 'male' | 'female' | 'ditto' | 'unknown';

export const SEX_BY_CODE: Record<number, CatSex> = { 0: 'male', 1: 'female', 2: 'ditto' };

export type ParseConfidence = 'verified' | 'partial' | 'unknown';

/**
 * The u16 bitfield at NAME_END + 0x10.
 *
 * Only some bits are understood, and `dead` is deliberately NOT read from here
 * — the class record carries an explicit death day, which is unambiguous. Bit
 * 0x0020 marks "no longer in your house", which covers death, donation and
 * departure alike, so using it as "dead" would over-report.
 */
export interface CatFlags {
  raw: number;
  /** 0x4000 — given away. */
  donated: boolean;
  /** 0x8000 — laid to rest in the graveyard. */
  buried: boolean;
  /** 0x0020 — gone from the house for any reason. */
  goneFromHouse: boolean;
}

export const MUTATION_SLOTS = [
  { index: 1, label: 'Body', category: 'body', pairWith: null },
  { index: 2, label: 'Head', category: 'head', pairWith: null },
  { index: 3, label: 'Tail', category: 'tail', pairWith: null },
  { index: 4, label: 'Rear Leg L', category: 'legs', pairWith: 5 },
  { index: 5, label: 'Rear Leg R', category: 'legs', pairWith: 4 },
  { index: 6, label: 'Front Leg L', category: 'legs', pairWith: 7 },
  { index: 7, label: 'Front Leg R', category: 'legs', pairWith: 6 },
  { index: 8, label: 'Eye L', category: 'eyes', pairWith: 9 },
  { index: 9, label: 'Eye R', category: 'eyes', pairWith: 8 },
  { index: 10, label: 'Brow L', category: 'eyebrows', pairWith: 11 },
  { index: 11, label: 'Brow R', category: 'eyebrows', pairWith: 10 },
  { index: 12, label: 'Ear L', category: 'ears', pairWith: 13 },
  { index: 13, label: 'Ear R', category: 'ears', pairWith: 12 },
  { index: 14, label: 'Mouth', category: 'mouth', pairWith: null },
] as const;

/** Slot ids at or above this threshold are mutations rather than ordinary parts. */
export const MUTATION_THRESHOLD = 300;

export interface MutationSlot {
  index: number;
  label: string;
  category: string;
  partId: number;
  isMutation: boolean;
}

/** Full HP is stored as this sentinel rather than the actual maximum. */
export const HP_FULL_SENTINEL = 0x3fffffff;

export interface Cat {
  /** `cats.key` — stable within one save file. */
  key: number;
  /** Unique id from the blob; stable across saves. */
  id64: bigint;
  formatVersion: number;

  name: string;
  sex: CatSex;
  /** Name-generator pool the name came from, e.g. "male37", "terminator". */
  namePool: string;

  /** The ONLY stats that are inherited. */
  baseStats: Stats;
  /** Earned through levelling. Never inherited. */
  levelBonuses: Stats;
  /** What the game shows: base + level bonuses. Not inherited. */
  displayStats: Stats;

  className: string;
  level: number | null;

  birthdayDay: number | null;
  /** -1 while alive; the day the cat died otherwise. */
  deathDay: number | null;
  isDead: boolean;
  ageDays: number | null;
  isAdult: boolean;

  /** 1.0 – 1.25. Hidden in game. */
  fertility: number | null;

  room: string | null;
  onAdventure: boolean;

  hp: number | null;
  atFullHp: boolean;
  statusEffect: string;
  /** Temporary combat buffs, e.g. "TempStrengthUp 1". Not inherited. */
  tempBuffs: string[];

  movement: string;
  basicAttack: string;
  /** Active ability slots, "None" entries removed. */
  abilities: string[];
  /** Passive abilities, "None" entries removed. */
  passives: string[];

  mutations: MutationSlot[];
  coatId: number | null;

  flags: CatFlags;

  parseConfidence: ParseConfidence;
  warnings: string[];
}

/**
 * A cat can take part in tonight's breeding only if it is alive, grown, at home
 * in a room, and not away on an adventure.
 */
export function isAvailable(cat: Cat): boolean {
  return !cat.isDead && !cat.flags.donated && cat.isAdult && !cat.onAdventure && cat.room !== null;
}

/** How a cat should be described when it is not available to breed. */
export function unavailableReason(cat: Cat): string | null {
  if (cat.isDead) return 'dead';
  if (cat.flags.donated) return 'donated';
  if (cat.onAdventure) return 'on an adventure';
  if (cat.room === null) return 'not in your house';
  if (!cat.isAdult) return 'still a kitten';
  return null;
}

export interface SaveProperties {
  currentDay: number | null;
  versionString: string | null;
  houseGold: number | null;
  houseFood: number | null;
  ownerSteamId: string | null;
  raw: Map<string, string | number | Uint8Array | null>;
}

export interface RoomOccupant {
  key: number;
  room: string;
  x: number;
  y: number;
}

export interface ParsedSave {
  fileName: string;
  cats: Cat[];
  properties: SaveProperties;
  rooms: string[];
  /** Cat blob format versions we did not expect to see. */
  unknownVersions: number[];
  stats: {
    total: number;
    verified: number;
    partial: number;
    failed: number;
  };
}
