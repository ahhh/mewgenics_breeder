import { useState } from 'react';
import { supportsFileHandles } from '../save/handleStore';
import './Welcome.css';

const DEFAULT_PATH = '%APPDATA%\\Glaiel Games\\Mewgenics\\<steam-id>\\saves';

export function Welcome({
  onPick,
  onBrowse,
  onDrop,
  onReopen,
  hasRemembered,
  busy,
  error,
}: {
  onPick: () => void;
  onBrowse: () => void;
  onDrop: (file: File) => void;
  onReopen: () => void;
  hasRemembered: boolean;
  busy: string | null;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(DEFAULT_PATH);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={`welcome${dragging ? ' welcome--dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onDrop(file);
      }}
    >
      <div className="card welcome__card">
        <div className="welcome__masthead">
          <h1 className="welcome__title">Mewtation Lab</h1>
          <p className="stamp welcome__sub">unofficial breeding science · department of cat genetics</p>
        </div>

        <p className="welcome__pitch">
          Point us at your save and we will read every cat in the house, work out the exact odds for
          every pairing you could set up tonight, and tell you which two to put in a room together —
          and why.
        </p>

        <div className="welcome__actions">
          {hasRemembered && (
            <button type="button" className="btn btn--primary" onClick={onReopen} disabled={busy !== null}>
              {busy ?? 'Open the same save again'}
            </button>
          )}
          <button
            type="button"
            className={`btn ${hasRemembered ? '' : 'btn--primary'}`}
            onClick={onPick}
            disabled={busy !== null}
          >
            {hasRemembered ? 'Choose a different save' : (busy ?? 'Feed me your save')}
          </button>
        </div>

        {error && <p className="welcome__error">{error}</p>}

        <div className="card card--sunk welcome__where">
          <div className="stamp">where Mewgenics keeps it on Windows</div>
          <code className="welcome__path">{DEFAULT_PATH}</code>
          <div className="welcome__where-row">
            <button type="button" className="btn btn--ghost btn--small" onClick={copyPath}>
              {copied ? 'Copied' : 'Copy path'}
            </button>
            <span className="welcome__hint">
              The file is called <code>steamcampaign01.sav</code>. Paste the path into Explorer's
              address bar to find it.
            </span>
          </div>
        </div>

        {supportsFileHandles() && (
          <div className="card card--sunk welcome__where">
            <div className="stamp">if Chrome says the folder contains system files</div>
            <p className="welcome__hint">
              That is Chrome refusing to let any web page browse <code>%APPDATA%</code>. It is not
              something we can talk it out of. Two ways round it:
            </p>
            <ul className="welcome__waysround">
              <li>
                <strong>Drag <code>steamcampaign01.sav</code> from Explorer onto this page.</strong>{' '}
                Dropping a file is not blocked, and neither is{' '}
                <button type="button" className="linkish" onClick={onBrowse}>
                  the plain file dialog
                </button>
                .
              </li>
              <li>
                <strong>Or copy the save to your Desktop</strong> and open that copy. Only a copy
                opened from an allowed folder can be re-read on later visits — so if you want
                one-click reloads, copy it again after each in-game day.
              </li>
            </ul>
          </div>
        )}

        <ul className="welcome__promises">
          <li>Your save never leaves this computer. There is no server to send it to.</li>
          <li>We only read. Nothing is ever written back to your save.</li>
          {supportsFileHandles() ? (
            <li>We remember which file you picked, so next time it is one click.</li>
          ) : (
            <li>
              Your browser can't remember file choices — drag the save here, or use Chrome or Edge for
              one-click reloads.
            </li>
          )}
        </ul>
      </div>

      <p className="welcome__drophint stamp">or drop the .sav anywhere on this page</p>
    </div>
  );
}
