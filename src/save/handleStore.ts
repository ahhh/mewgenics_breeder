/**
 * Remembering the save file between visits.
 *
 * A web page cannot open `%APPDATA%\Glaiel Games\Mewgenics\...` on its own, but
 * a FileSystemFileHandle survives in IndexedDB, so the player picks the file
 * once and every later visit is a single click. This is the whole reason the
 * app can stay a static site instead of becoming a desktop install.
 */

const DB_NAME = 'mewtation-lab';
const STORE = 'handles';
const KEY = 'save-file';

export function supportsFileHandles(): boolean {
  return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function rememberHandle(handle: FileSystemFileHandle): Promise<void> {
  await withStore('readwrite', (store) => store.put(handle, KEY));
}

export async function recallHandle(): Promise<FileSystemFileHandle | null> {
  try {
    return (await withStore<FileSystemFileHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function forgetHandle(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // Nothing to forget.
  }
}

/**
 * Chrome drops read permission between sessions, so a recalled handle has to be
 * re-authorised. `requestPermission` must be called from a user gesture.
 */
export async function ensureReadable(handle: FileSystemFileHandle): Promise<boolean> {
  const options = { mode: 'read' } as const;
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

export async function pickSaveFile(): Promise<FileSystemFileHandle | null> {
  if (!supportsFileHandles()) return null;
  try {
    const [handle] = await window.showOpenFilePicker!({
      types: [{ description: 'Mewgenics save', accept: { 'application/octet-stream': ['.sav'] } }],
      excludeAcceptAllOption: false,
      multiple: false,
    });
    return handle ?? null;
  } catch {
    // The picker was dismissed.
    return null;
  }
}
