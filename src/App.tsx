import { useCallback, useEffect, useState } from 'react';
import type { ParsedSave } from './parser/types';
import { SaveFormatError, readSaveFile } from './save/loadSave';
import {
  ensureReadable,
  forgetHandle,
  pickSaveFile,
  recallHandle,
  rememberHandle,
  supportsFileHandles,
} from './save/handleStore';
import { RoughEdgeFilter } from './ui/Bits';
import { Welcome } from './ui/Welcome';
import { Home } from './ui/Home';
import { CatsScreen } from './ui/CatsScreen';
import { BreedScreen } from './ui/BreedScreen';
import { PairLab } from './ui/PairLab';
import { RoomPlanScreen } from './ui/RoomPlanScreen';
import './ui/App.css';

type Tab = 'home' | 'cats' | 'breed' | 'lab' | 'rooms';

const TABS: { id: Tab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'cats', label: 'Catalog' },
  { id: 'breed', label: 'Breed' },
  { id: 'lab', label: 'Pair lab' },
  { id: 'rooms', label: 'Rooms' },
];

const STIMULATION_KEY = 'mewtation-lab:stimulation';

export function App() {
  const [save, setSave] = useState<ParsedSave | null>(null);
  const [handle, setHandle] = useState<FileSystemFileHandle | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freshSave, setFreshSave] = useState(false);
  const [stimulation, setStimulation] = useState(() => {
    const stored = Number(localStorage.getItem(STIMULATION_KEY));
    return Number.isFinite(stored) && stored !== 0 ? stored : 50;
  });

  useEffect(() => {
    localStorage.setItem(STIMULATION_KEY, String(stimulation));
  }, [stimulation]);

  useEffect(() => {
    if (!supportsFileHandles()) return;
    void recallHandle().then(setHandle);
  }, []);


  const load = useCallback(async (file: File) => {
    setBusy('Digging through the litter box…');
    setError(null);
    try {
      const parsed = await readSaveFile(file);
      setSave(parsed);
      setFreshSave(false);
      setTab('home');
    } catch (err) {
      setError(
        err instanceof SaveFormatError
          ? err.message
          : 'We could not read that file. If it is a Mewgenics save, this is our bug, not yours.',
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const openFromHandle = useCallback(
    async (target: FileSystemFileHandle) => {
      if (!(await ensureReadable(target))) {
        setError('We need permission to read that file. Try picking it again.');
        return;
      }
      await load(await target.getFile());
    },
    [load],
  );

  const browse = useCallback(() => {
    document.getElementById('fallback-input')?.click();
  }, []);

  const pick = useCallback(async () => {
    if (!supportsFileHandles()) {
      browse();
      return;
    }
    const picked = await pickSaveFile();
    if (!picked) return;
    setHandle(picked);
    await rememberHandle(picked);
    await openFromHandle(picked);
  }, [browse, openFromHandle]);

  // Development affordance: `?sample` loads the save sitting in the project
  // root, so the UI can be worked on without clicking through a file picker.
  // The route that serves it exists only in the dev server.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (!new URLSearchParams(window.location.search).has('sample')) return;
    void (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}__dev/sample.sav`);
      if (!response.ok) return;
      await load(new File([await response.blob()], 'steamcampaign01.sav'));
    })();
  }, [load]);

  // Watch the file the player chose. When Mewgenics writes a new day, offer it
  // rather than silently replacing what they are looking at.
  useEffect(() => {
    if (!handle || !save) return;
    let lastSeen = 0;
    const timer = setInterval(async () => {
      try {
        if ((await handle.queryPermission({ mode: 'read' })) !== 'granted') return;
        const file = await handle.getFile();
        if (lastSeen === 0) lastSeen = file.lastModified;
        else if (file.lastModified > lastSeen) {
          lastSeen = file.lastModified;
          setFreshSave(true);
        }
      } catch {
        // The file moved or was deleted; leave what we have on screen.
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [handle, save]);

  if (!save) {
    return (
      <>
        <RoughEdgeFilter />
        <Welcome
          onPick={pick}
          onBrowse={browse}
          onDrop={load}
          onReopen={() => handle && void openFromHandle(handle)}
          hasRemembered={handle !== null}
          busy={busy}
          error={error}
        />
        <input
          id="fallback-input"
          type="file"
          accept=".sav"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
          }}
        />
      </>
    );
  }

  return (
    <>
      <RoughEdgeFilter />
      <div className="shell">
        <header className="shell__bar">
          <div className="shell__brand">
            <span className="shell__mark">Mewtation Lab</span>
            <span className="stamp shell__file">
              {save.fileName} · day {save.properties.currentDay ?? '?'} · {save.cats.length} cats
            </span>
          </div>

          <nav className="shell__nav" aria-label="Sections">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className={`tab${tab === entry.id ? ' tab--on' : ''}`}
                onClick={() => setTab(entry.id)}
                aria-current={tab === entry.id ? 'page' : undefined}
              >
                {entry.label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            className="btn btn--ghost btn--small"
            onClick={() => {
              setSave(null);
              void forgetHandle();
              setHandle(null);
            }}
          >
            Close save
          </button>
        </header>

        {freshSave && handle && (
          <div className="notice notice--fresh">
            <span>Mewgenics just saved. A new day may be waiting.</span>
            <button type="button" className="btn btn--small" onClick={() => void openFromHandle(handle)}>
              Re-read the save
            </button>
          </div>
        )}

        <main className="shell__main">
          {tab === 'home' && <Home save={save} stimulation={stimulation} onGoBreed={() => setTab('breed')} />}
          {tab === 'cats' && <CatsScreen cats={save.cats} />}
          {tab === 'breed' && (
            <BreedScreen cats={save.cats} stimulation={stimulation} onStimulation={setStimulation} />
          )}
          {tab === 'lab' && (
            <PairLab cats={save.cats} stimulation={stimulation} onStimulation={setStimulation} />
          )}
          {tab === 'rooms' && (
            <RoomPlanScreen
              cats={save.cats}
              rooms={save.rooms.length > 0 ? save.rooms : ['Bedroom']}
              defaultStimulation={stimulation}
            />
          )}
        </main>

        <footer className="shell__foot stamp">
          Unofficial companion tool. Not affiliated with or endorsed by the makers of Mewgenics. Your
          save stayed on this computer.
        </footer>
      </div>
    </>
  );
}
