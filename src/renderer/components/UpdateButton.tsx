import { useEffect, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import { Modal } from './Modal';
import { ReleaseNotesView } from './ReleaseNotesView';
import {
  INSTALL_HELP,
  type UpdateInfo,
  type UpdateProgress,
} from '../../shared/update';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// One shared check for the whole window: the title bar is mounted again for each screen.
let current: UpdateInfo | undefined;
let started = false;
const listeners = new Set<() => void>();

function check(): void {
  window.api
    .checkForUpdate()
    .then((info) => {
      current = info;
      listeners.forEach((l) => l());
    })
    // Offline or rate limited: stay quiet, try again later.
    .catch(() => undefined);
}

function useUpdateInfo(): UpdateInfo | undefined {
  useEffect(() => {
    if (started) return;
    started = true;
    check();
    setInterval(check, CHECK_EVERY_MS);
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function progressText(p: UpdateProgress): string {
  if (p.stage === 'downloading')
    return p.total
      ? `Downloading ${megabytes(p.received)} of ${megabytes(p.total)}`
      : `Downloading ${megabytes(p.received)}`;
  if (p.stage === 'verifying') return 'Checking the download…';
  return p.message ?? '';
}

/** Shown at the top of the window when a newer version is published on GitHub. */
export function UpdateButton() {
  const info = useUpdateInfo();
  const [open, setOpen] = useState(false);
  if (!info?.available || !info.latestVersion) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={`Version ${info.latestVersion} is available. You have ${info.currentVersion}.`}
        className="no-drag mr-2 flex h-6 items-center gap-1.5 rounded bg-azure px-2.5 text-xs font-semibold text-ink-950 hover:bg-azure-hover"
      >
        <Download size={13} aria-hidden />
        Update to v{info.latestVersion}
      </button>
      {open && <UpdateDialog info={info} onClose={() => setOpen(false)} />}
    </>
  );
}

function UpdateDialog({
  info,
  onClose,
}: {
  info: UpdateInfo;
  onClose: () => void;
}) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<UpdateProgress>();
  const [result, setResult] = useState<UpdateProgress>();
  const [error, setError] = useState<string>();
  const help = INSTALL_HELP[info.installMode];

  useEffect(() => window.api.onUpdateProgress(setProgress), []);

  const update = async () => {
    setError(undefined);
    setWorking(true);
    try {
      setResult(await window.api.installUpdate());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const done = !!result;
  return (
    <Modal
      title={`Update to version ${info.latestVersion}`}
      subtitle={`You have version ${info.currentVersion}`}
      onClose={working ? () => undefined : onClose}
      widthClass="max-w-2xl"
      footer={
        <>
          <button
            className="btn-ghost mr-auto"
            disabled={working}
            onClick={() =>
              void window.api
                .openReleasePage()
                .catch((e: Error) => setError(e.message))
            }
          >
            View on GitHub
          </button>
          <button className="btn-outline" disabled={working} onClick={onClose}>
            {done ? 'Close' : 'Later'}
          </button>
          {!done && (
            <button
              className="btn-primary"
              disabled={working}
              onClick={() => void update()}
            >
              {working ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {help.action}
            </button>
          )}
        </>
      }
    >
      <p className="mb-4 text-sm text-fg-muted">{help.detail}</p>

      {(working || done) && progress && (
        <div className="mb-4" role="status">
          {!done && progress.stage === 'downloading' && progress.total > 0 && (
            <div
              className="mb-1.5 h-1.5 bg-ink-800"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(
                (progress.received / progress.total) * 100,
              )}
              aria-label="Download progress"
            >
              <div
                className="h-full bg-azure"
                style={{
                  width: `${Math.min(100, (progress.received / progress.total) * 100)}%`,
                }}
              />
            </div>
          )}
          <p className="flex items-center gap-2 text-sm text-fg">
            {done ? (
              <CheckCircle2 size={14} className="text-allow" />
            ) : (
              <Loader2 size={14} className="animate-spin text-azure" />
            )}
            {done
              ? result.stage === 'saved'
                ? `Saved to ${result.savedPath}. It is shown in your folder.`
                : (result.message ?? 'Updating…')
              : progressText(progress)}
          </p>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 flex gap-2 border border-deny/40 bg-deny/10 p-3 text-sm text-deny"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      <div className="space-y-5">
        {info.releases.map((r) => (
          <section key={r.tag}>
            <h3 className="mb-1.5 flex items-baseline gap-2 text-sm font-semibold text-fg">
              Version {r.version}
              {r.publishedAt && (
                <span className="text-xs font-normal text-fg-faint">
                  {new Date(r.publishedAt).toLocaleDateString()}
                </span>
              )}
            </h3>
            <ReleaseNotesView notes={r.notes} />
          </section>
        ))}
      </div>
    </Modal>
  );
}
