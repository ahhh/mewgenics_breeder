import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The bug this pins down: sql.js ships two builds whose wasm files have
 * different names. The Node build fetches `sql-wasm.wasm`; the browser build —
 * the one bundlers resolve, and therefore the one the deployed page runs —
 * fetches `sql-wasm-browser.wasm`. We were serving a hand-copied
 * `public/sql-wasm.wasm`, so every upload 404'd before it reached the parser.
 *
 * Nothing else in the suite catches this: the parser tests deliberately drive
 * SQLite through the `sqlite3` CLI, so no test ever loads the WASM the browser
 * loads. This test watches the seam between the two instead.
 */

const require = createRequire(import.meta.url);
// sql.js does not export ./package.json, so reach it via a path its exports map
// does allow and walk back up to the package root.
const packageRoot = dirname(dirname(require.resolve('sql.js/dist/sql-wasm.js')));
const packageJsonPath = resolve(packageRoot, 'package.json');
const loadSaveSource = readFileSync(resolve(import.meta.dirname, '../src/save/loadSave.ts'), 'utf8');

/** The entry a bundler picks for the browser, straight from the package's own exports map. */
function browserEntry(): string {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
    exports?: Record<string, { browser?: string }>;
  };
  const entry = pkg.exports?.['.']?.browser;
  expect(entry, 'sql.js no longer declares a browser export — re-check which wasm it loads').toBeTruthy();
  return resolve(packageRoot, entry!);
}

/** The wasm file that build will ask `locateFile` for. */
function requestedWasmName(): string {
  const names = [...new Set(readFileSync(browserEntry(), 'utf8').match(/sql-wasm[\w-]*\.wasm/g) ?? [])];
  expect(names, 'expected the browser build to name exactly one wasm file').toHaveLength(1);
  return names[0]!;
}

describe('sql.js wasm wiring', () => {
  it('imports the exact wasm the browser build of sql.js asks for', () => {
    expect(loadSaveSource).toContain(`sql.js/dist/${requestedWasmName()}?url`);
  });

  it('resolves that wasm to a real file, so the bundler can emit it', () => {
    const wasm = readFileSync(resolve(packageRoot, 'dist', requestedWasmName()));
    // \0asm — if this is not a wasm module, locateFile is pointing somewhere wrong.
    expect([...wasm.subarray(0, 4)]).toEqual([0x00, 0x61, 0x73, 0x6d]);
  });

  it('serves the wasm through the bundler rather than a hand-copied public/ asset', () => {
    // A locateFile that rebuilds the name from its argument is how the two drifted apart.
    expect(loadSaveSource).not.toMatch(/locateFile:\s*\(\w+\)\s*=>/);
  });
});
