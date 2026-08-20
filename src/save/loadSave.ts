import initSqlJs, { type SqlJsStatic } from 'sql.js';
// The browser build of sql.js asks for `sql-wasm-browser.wasm` — a different
// file name from the Node build's `sql-wasm.wasm`. Importing the binary through
// Vite pins the URL to the file the bundler actually resolved, so the name can
// never drift from the package and the path is always correct for the deploy
// base. A hand-copied public/ asset gave us neither, and 404'd every load.
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { parseSave, type SaveTables } from '../parser/saveFile';
import type { ParsedSave } from '../parser/types';

/**
 * Reading the .sav in the browser.
 *
 * sql.js runs SQLite as WASM entirely in page memory. The file is never sent
 * anywhere — there is no endpoint to send it to.
 */

let sqlPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs({ locateFile: () => wasmUrl }).catch((cause: unknown) => {
    // Let the next attempt retry instead of caching the failure forever.
    sqlPromise = null;
    throw new SaveFormatError(
      'The SQLite engine did not load, so we never got as far as your save. Check your connection and reload the page.',
      { cause },
    );
  });
  return sqlPromise;
}

export class SaveFormatError extends Error {
  override name = 'SaveFormatError';
}

export async function readSaveFile(file: File): Promise<ParsedSave> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (!looksLikeSqlite(bytes)) {
    throw new SaveFormatError('This does not appear to contain cats. Mewgenics saves are SQLite databases.');
  }

  const SQL = await loadSqlJs();
  let db;
  try {
    db = new SQL.Database(bytes);
  } catch {
    throw new SaveFormatError('That file is a database, but a broken one. Try the copy in your backup folder.');
  }

  try {
    const tables = readTables(db);
    if (tables.cats.size === 0) {
      throw new SaveFormatError('That save has no cats in it. Is it a fresh campaign?');
    }
    return parseSave(tables, file.name);
  } finally {
    db.close();
  }
}

const SQLITE_MAGIC = 'SQLite format 3\0';

function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  for (let i = 0; i < SQLITE_MAGIC.length; i += 1) {
    if (bytes[i] !== SQLITE_MAGIC.charCodeAt(i)) return false;
  }
  return true;
}

type Db = InstanceType<SqlJsStatic['Database']>;

function readTables(db: Db): SaveTables {
  const cats = new Map<number, Uint8Array>();
  for (const row of iterate(db, 'select key, data from cats')) {
    if (row[1] instanceof Uint8Array) cats.set(Number(row[0]), row[1]);
  }

  const files = new Map<string, Uint8Array>();
  for (const row of iterate(db, 'select key, data from files')) {
    if (row[1] instanceof Uint8Array) files.set(String(row[0]), row[1]);
  }

  const properties = new Map<string, string | number | Uint8Array | null>();
  for (const row of iterate(db, 'select key, data from properties')) {
    properties.set(String(row[0]), row[1] as string | number | Uint8Array | null);
  }

  return { cats, files, properties };
}

function* iterate(db: Db, sql: string): Generator<unknown[]> {
  let statement;
  try {
    statement = db.prepare(sql);
  } catch {
    // A table we expected is missing — treat it as empty rather than failing
    // the whole load, so one unfamiliar save shape doesn't cost the player
    // everything else in the file.
    return;
  }
  try {
    while (statement.step()) yield statement.get();
  } finally {
    statement.free();
  }
}
