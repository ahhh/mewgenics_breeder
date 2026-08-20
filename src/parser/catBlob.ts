import { BinaryReader, ReadError, isPrintableAscii } from './reader';
import {
  HP_FULL_SENTINEL,
  MUTATION_SLOTS,
  MUTATION_THRESHOLD,
  SEX_BY_CODE,
  makeStats,
  type Cat,
  type CatFlags,
  type MutationSlot,
  type ParseConfidence,
  type Stats,
} from './types';

/** The only cat blob format version we have seen and validated. */
export const KNOWN_CAT_FORMAT = 19;

/**
 * A cat blob is a sequential serialisation, not a fixed-offset struct. Every
 * variable-length field is a length-prefixed string, so the parser walks
 * forward and the deltas between fields are constant.
 *
 * These are the constants of that walk, all validated against 161 real cats.
 */
const LAYOUT = {
  /** From the end of the name to the u16 sex code. */
  SEX_FROM_NAME_END: 0x08,
  /** The sex code is stored twice; the copies must agree. */
  SEX_COPY_FROM_NAME_END: 0x0c,
  FLAGS_FROM_NAME_END: 0x10,
  /** Collar / equipment slot name. "None" in every cat observed. */
  COLLAR_FROM_NAME_END: 0x18,
  /** From the end of the collar string to the fertility double. */
  FERTILITY_FROM_COLLAR_END: 60,
  /** From the end of the collar string to the name-pool string. */
  NAME_POOL_FROM_COLLAR_END: 368,
  /** Between the name-pool string and the base stats sits one f64. */
  STATS_FROM_NAME_POOL_END: 8,
  /** Base stats, then level bonuses, then a fixed gap to the status string. */
  STATUS_FROM_LEVEL_BONUS_END: 28,
  /**
   * After the status string comes the HP u32, six bytes, then a counted list of
   * temporary buffs ("TempStrengthUp 1"), and only then the ability run.
   * Almost every cat has zero buffs, which is why this region looks like flat
   * padding until you meet a cat that is mid-buff.
   */
  TEMP_BUFFS_FROM_HP_END: 6,
  ABILITY_SLOT_COUNT: 11,
  PASSIVE_RECORD_COUNT: 3,
} as const;

/**
 * The class record: narrow className, i32 level, f64 xp, i64 birthdayDay,
 * i64 deathDay (-1 while the cat is alive).
 *
 * It cannot be reached by a fixed offset: between the passives and the class
 * sits a variable-length disorder list, whose length depends on how many
 * disorders the cat carries. Instead we locate the record by its shape — five
 * fields that must all be simultaneously plausible — and take the last match.
 * That is a far stronger constraint than scanning for "seven ints that look
 * like stats", and it resolves all 161 cats in the reference save.
 */
const CLASS_RECORD = {
  MIN_SEARCH_OFFSET: 0x100,
  MIN_NAME_LENGTH: 3,
  MAX_NAME_LENGTH: 32,
  MAX_LEVEL: 99,
  MAX_XP: 1e6,
  /** Starter cats are born slightly before day 0. */
  MIN_BIRTHDAY: -30,
  /** Used when the save has no current_day to bound against. */
  FALLBACK_MAX_DAY: 100_000,
} as const;

/**
 * Positions within the 11-slot ability run.
 *
 * The run is: movement, basic attack, four active slots, a repeat of the
 * equipped active, three empties, then the passive.
 */
const ABILITY_RUN = {
  MOVEMENT: 0,
  BASIC_ATTACK: 1,
  ACTIVE_START: 2,
  ACTIVE_END: 6, // exclusive
  TRAILING_PASSIVE: 10,
} as const;

const EMPTY_SLOT_NAMES = new Set(['None', 'none', '']);

export interface CatParseContext {
  key: number;
  currentDay: number | null;
  room: string | null;
  onAdventure: boolean;
  /** Age in days at which a kitten becomes an adult and can breed. */
  adultAgeDays: number;
}

export interface CatParseResult {
  cat: Cat | null;
  error: string | null;
}

export function parseCatBlob(blob: Uint8Array, ctx: CatParseContext): CatParseResult {
  const warnings: string[] = [];
  let confidence: ParseConfidence = 'verified';

  const degrade = (level: Exclude<ParseConfidence, 'verified'>, message: string): void => {
    warnings.push(message);
    if (level === 'unknown' || confidence === 'verified') confidence = level;
  };

  try {
    const r = new BinaryReader(blob);

    const formatVersion = r.u32();
    if (formatVersion !== KNOWN_CAT_FORMAT) {
      degrade('unknown', `unrecognised cat format version ${formatVersion} (we know ${KNOWN_CAT_FORMAT})`);
    }

    const id64 = r.u64();
    const name = r.seek(0x0c).wideString(128);
    const nameEnd = r.offset;

    const sexCode = r.seek(nameEnd + LAYOUT.SEX_FROM_NAME_END).u16();
    const sexCopy = r.seek(nameEnd + LAYOUT.SEX_COPY_FROM_NAME_END).u16();
    if (sexCode !== sexCopy) {
      degrade('partial', `sex codes disagree (${sexCode} vs ${sexCopy})`);
    }
    const sex = SEX_BY_CODE[sexCode] ?? 'unknown';
    if (sex === 'unknown') degrade('partial', `unrecognised sex code ${sexCode}`);

    const flags = readFlags(r.seek(nameEnd + LAYOUT.FLAGS_FROM_NAME_END).u16());

    // The collar string is variable-length, so everything after it is measured
    // from its end rather than from the start of the record.
    r.seek(nameEnd + LAYOUT.COLLAR_FROM_NAME_END);
    r.narrowString(64);
    const collarEnd = r.offset;

    const fertility = r.seek(collarEnd + LAYOUT.FERTILITY_FROM_COLLAR_END).f64();
    const fertilityValid = Number.isFinite(fertility) && fertility >= 1 && fertility <= 1.2500001;
    if (!fertilityValid) degrade('partial', `fertility ${fertility} outside the expected 1.0–1.25`);

    const namePool = r.seek(collarEnd + LAYOUT.NAME_POOL_FROM_COLLAR_END).narrowString(64);

    r.skip(LAYOUT.STATS_FROM_NAME_POOL_END);
    const baseValues = readSeven(r);
    const levelValues = readSeven(r);

    const outOfRange = baseValues.filter((v) => v < 1 || v > 10);
    if (outOfRange.length > 0) {
      degrade('partial', `base stats out of the expected 1–10 range: ${baseValues.join(', ')}`);
    }
    const baseStats = makeStats(baseValues);
    const levelBonuses = makeStats(levelValues);

    const statusEffect = r.skip(LAYOUT.STATUS_FROM_LEVEL_BONUS_END).narrowString(64);
    const hp = r.u32();

    r.skip(LAYOUT.TEMP_BUFFS_FROM_HP_END);
    const tempBuffCount = r.u32();
    if (tempBuffCount > 64) {
      degrade('partial', `implausible temporary-buff count ${tempBuffCount}`);
    }
    const tempBuffs: string[] = [];
    for (let i = 0; i < Math.min(tempBuffCount, 64); i += 1) {
      tempBuffs.push(r.narrowString(64));
      r.u32(); // remaining duration or stack count
    }

    const abilityRun: string[] = [];
    for (let i = 0; i < LAYOUT.ABILITY_SLOT_COUNT; i += 1) abilityRun.push(r.narrowString(64));

    const passiveRecords: string[] = [];
    for (let i = 0; i < LAYOUT.PASSIVE_RECORD_COUNT; i += 1) {
      r.u32(); // tier — always 1 in the sample; kept for future use
      passiveRecords.push(r.narrowString(64));
    }

    const tail = findClassRecord(blob, ctx.currentDay, degrade);

    // A dead cat's age is its age at death, not how long ago it was born.
    const asOfDay =
      tail.deathDay !== null && tail.deathDay !== -1 ? tail.deathDay : ctx.currentDay;
    const ageDays = asOfDay !== null && tail.birthdayDay !== null ? asOfDay - tail.birthdayDay : null;

    const passives = [abilityRun[ABILITY_RUN.TRAILING_PASSIVE] ?? '', ...passiveRecords].filter(
      (s) => !EMPTY_SLOT_NAMES.has(s),
    );

    const cat: Cat = {
      key: ctx.key,
      id64,
      formatVersion,
      name,
      sex,
      namePool,
      baseStats,
      levelBonuses,
      displayStats: addStats(baseStats, levelBonuses),
      className: tail.className,
      level: tail.level,
      birthdayDay: tail.birthdayDay,
      deathDay: tail.deathDay,
      isDead: tail.deathDay !== null && tail.deathDay !== -1,
      ageDays,
      isAdult: ageDays === null ? true : ageDays >= ctx.adultAgeDays,
      fertility: fertilityValid ? fertility : null,
      room: ctx.room,
      onAdventure: ctx.onAdventure,
      hp: hp === HP_FULL_SENTINEL ? null : hp,
      atFullHp: hp === HP_FULL_SENTINEL,
      statusEffect,
      tempBuffs,
      movement: abilityRun[ABILITY_RUN.MOVEMENT] ?? '',
      basicAttack: abilityRun[ABILITY_RUN.BASIC_ATTACK] ?? '',
      abilities: dedupe(
        abilityRun
          .slice(ABILITY_RUN.ACTIVE_START, ABILITY_RUN.ACTIVE_END)
          .filter((s) => !EMPTY_SLOT_NAMES.has(s)),
      ),
      passives: dedupe(passives),
      mutations: findMutationTable(blob),
      coatId: findCoatId(blob),
      flags,
      parseConfidence: confidence,
      warnings,
    };

    return { cat, error: null };
  } catch (err) {
    const message = err instanceof ReadError || err instanceof Error ? err.message : String(err);
    return { cat: null, error: message };
  }
}

function readSeven(r: BinaryReader): number[] {
  const out: number[] = [];
  for (let i = 0; i < 7; i += 1) out.push(r.i32());
  return out;
}

function addStats(a: Stats, b: Stats): Stats {
  return {
    str: a.str + b.str,
    dex: a.dex + b.dex,
    con: a.con + b.con,
    int: a.int + b.int,
    spd: a.spd + b.spd,
    cha: a.cha + b.cha,
    luck: a.luck + b.luck,
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function readFlags(raw: number): CatFlags {
  return {
    raw,
    goneFromHouse: (raw & 0x0020) !== 0,
    donated: (raw & 0x4000) !== 0,
    buried: (raw & 0x8000) !== 0,
  };
}

interface ClassRecord {
  className: string;
  level: number | null;
  birthdayDay: number | null;
  /** -1 while the cat is alive. */
  deathDay: number | null;
}

/**
 * Locate the class record by shape.
 *
 * Every candidate must satisfy all five field constraints at once — an
 * alphabetic name of sane length, a plausible level, a non-negative finite xp,
 * a birthday inside the campaign, and a death day that is either the
 * still-alive sentinel or falls between birth and today. False positives would
 * need all five to line up by chance.
 *
 * The last match wins: the record sits near the end of the blob.
 */
function findClassRecord(
  blob: Uint8Array,
  currentDay: number | null,
  degrade: (level: Exclude<ParseConfidence, 'verified'>, message: string) => void,
): ClassRecord {
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const maxDay = currentDay ?? CLASS_RECORD.FALLBACK_MAX_DAY;
  let best: ClassRecord | null = null;

  for (let offset = CLASS_RECORD.MIN_SEARCH_OFFSET; offset + 8 < blob.length; offset += 1) {
    const length = Number(view.getBigUint64(offset, true));
    if (length < CLASS_RECORD.MIN_NAME_LENGTH || length > CLASS_RECORD.MAX_NAME_LENGTH) continue;

    const nameStart = offset + 8;
    const recordEnd = nameStart + length + 28;
    if (recordEnd > blob.length) continue;
    if (!isAlphabetic(blob, nameStart, length)) continue;

    const fieldsAt = nameStart + length;
    const level = view.getInt32(fieldsAt, true);
    if (level < 0 || level > CLASS_RECORD.MAX_LEVEL) continue;

    const xp = view.getFloat64(fieldsAt + 4, true);
    if (!Number.isFinite(xp) || xp < 0 || xp >= CLASS_RECORD.MAX_XP) continue;

    const birthdayDay = Number(view.getBigInt64(fieldsAt + 12, true));
    if (birthdayDay < CLASS_RECORD.MIN_BIRTHDAY || birthdayDay > maxDay) continue;

    const deathDay = Number(view.getBigInt64(fieldsAt + 20, true));
    if (deathDay !== -1 && (deathDay < birthdayDay || deathDay > maxDay)) continue;

    let className = '';
    for (let i = 0; i < length; i += 1) className += String.fromCharCode(blob[nameStart + i]!);
    best = { className, level, birthdayDay, deathDay };
  }

  if (!best) {
    degrade('partial', 'could not locate the class/birthday record');
    return { className: '', level: null, birthdayDay: null, deathDay: null };
  }
  return best;
}

function isAlphabetic(bytes: Uint8Array, start: number, length: number): boolean {
  for (let i = 0; i < length; i += 1) {
    const c = bytes[start + i]!;
    const isUpper = c >= 0x41 && c <= 0x5a;
    const isLower = c >= 0x61 && c <= 0x7a;
    if (!isUpper && !isLower) return false;
  }
  return true;
}

const MUT_TABLE_BYTES = 16 + 14 * 20;

/**
 * The appearance table is a 16-byte header (f32 scale, u32 coatId, ...) followed
 * by fourteen 20-byte body-part slots. It is not at a constant distance from the
 * fields above, so it is located by shape: slots carry the same coat id as the
 * header, which is a strong signature.
 */
function locateMutationTable(blob: Uint8Array): number | null {
  if (blob.length < MUT_TABLE_BYTES) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  let bestOffset: number | null = null;
  let bestMatches = -1;

  for (let base = 0; base <= blob.length - MUT_TABLE_BYTES; base += 1) {
    const scale = view.getFloat32(base, true);
    if (!(scale >= 0.05 && scale <= 20)) continue;
    const coatId = view.getUint32(base + 4, true);
    if (coatId === 0 || coatId > 20000) continue;
    if (view.getUint32(base + 8, true) > 500) continue;

    let matches = 0;
    for (let i = 0; i < 14; i += 1) {
      const slotCoat = view.getUint32(base + 16 + i * 20 + 4, true);
      if (slotCoat === coatId || slotCoat === 0) matches += 1;
    }
    if (matches < 10) continue;
    if (matches > bestMatches) {
      bestMatches = matches;
      bestOffset = base;
    }
  }
  return bestOffset;
}

function findMutationTable(blob: Uint8Array): MutationSlot[] {
  const base = locateMutationTable(blob);
  if (base === null) return [];
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);

  return MUTATION_SLOTS.map((slot, i) => {
    const partId = view.getUint32(base + 16 + i * 20, true);
    return {
      index: slot.index,
      label: slot.label,
      category: slot.category,
      partId,
      isMutation: partId >= MUTATION_THRESHOLD,
    };
  });
}

function findCoatId(blob: Uint8Array): number | null {
  const base = locateMutationTable(blob);
  if (base === null) return null;
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  return view.getUint32(base + 4, true);
}

export { isPrintableAscii };
