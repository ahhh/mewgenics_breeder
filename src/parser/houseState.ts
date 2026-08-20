import { BinaryReader } from './reader';
import type { RoomOccupant } from './types';

/**
 * `files.house_state` — which cat is standing in which room.
 * Stored uncompressed: u32 version, u32 count, then count entries of
 * u32 key, u32 unknown, narrow room name, and three f64 coordinates.
 */
export function parseHouseState(blob: Uint8Array): RoomOccupant[] {
  const r = new BinaryReader(blob);
  const version = r.u32();
  const count = r.u32();
  if (version !== 0 || count > 4096) return [];

  const out: RoomOccupant[] = [];
  for (let i = 0; i < count; i += 1) {
    const key = r.u32();
    r.u32(); // unknown, zero in every sample
    const room = r.narrowString(64);
    const x = r.f64();
    const y = r.f64();
    r.f64(); // third coordinate — depth or facing
    out.push({ key, room, x, y });
  }
  return out;
}

/**
 * `files.adventure_state` — cat keys currently away on an adventure.
 * Those cats are not in the house and cannot breed tonight.
 */
export function parseAdventureKeys(blob: Uint8Array): number[] {
  try {
    const r = new BinaryReader(blob);
    r.u32(); // version
    const count = r.u32();
    if (count > 32) return [];
    const keys: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const packed = r.u64();
      const high = Number((packed >> 32n) & 0xffffffffn);
      const low = Number(packed & 0xffffffffn);
      const key = high !== 0 ? high : low;
      if (key <= 0 || key > 1_000_000) return [];
      keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}
