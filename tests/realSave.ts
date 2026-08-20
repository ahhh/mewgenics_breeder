import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SaveTables } from '../src/parser/saveFile';

/**
 * The real save is gitignored — it carries a Steam ID and personal data. Tests
 * that need it skip cleanly when it is absent so CI stays green.
 *
 * We shell out to the sqlite3 CLI rather than loading sql.js: it keeps WASM out
 * of the test path, and it proves the parser is independent of the driver.
 */
export const REAL_SAVE_PATH = resolve(import.meta.dirname, '../steamcampaign01.sav');

/**
 * A bare existsSync is not enough: sqlite3 creates an empty database for any
 * path it is handed, so a stray or truncated file would sail past the check and
 * then fail deep inside a query. Ask sqlite3 for the cats table instead.
 */
export function hasRealSave(): boolean {
  if (!existsSync(REAL_SAVE_PATH)) return false;
  try {
    const tables = execFileSync(
      'sqlite3',
      [REAL_SAVE_PATH, "select name from sqlite_master where type='table';"],
      { encoding: 'utf8' },
    );
    return tables.split('\n').includes('cats');
  } catch {
    return false;
  }
}

function query(sql: string): string {
  return execFileSync('sqlite3', [REAL_SAVE_PATH, sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function loadRealSaveTables(): SaveTables {
  const cats = new Map<number, Uint8Array>();
  for (const line of query("select key || '|' || hex(data) from cats;").trim().split('\n')) {
    const [key, hex] = line.split('|');
    if (!key || !hex) continue;
    cats.set(Number(key), hexToBytes(hex));
  }

  const files = new Map<string, Uint8Array>();
  for (const line of query("select key || '|' || hex(data) from files;").trim().split('\n')) {
    const [key, hex] = line.split('|');
    if (!key) continue;
    files.set(key, hexToBytes(hex ?? ''));
  }

  const properties = new Map<string, string | number | Uint8Array | null>();
  for (const line of query("select key || '|' || typeof(data) || '|' || coalesce(cast(data as text),'') from properties;")
    .trim()
    .split('\n')) {
    const [key, type, ...rest] = line.split('|');
    if (!key) continue;
    const value = rest.join('|');
    properties.set(key, type === 'integer' || type === 'real' ? Number(value) : value);
  }

  return { cats, files, properties };
}
