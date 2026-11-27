import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Modal } from './Modal';
import { ReleaseNotesView } from './ReleaseNotesView';
import {
  INSTALL_HELP,
  type UpdateInfo,
  type UpdateProgress,
} from '../../shared/update';

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

// One shared check for the whole window: the title bar is mounted again for each screen.
interface UpdateState {
  info?: UpdateInfo;
  /** A check is running (from either the timer or the button). */
  checking: boolean;
}
let state: UpdateState = { checking: false };
let started = false;
let running: Promise<UpdateInfo> | undefined;
const listeners = new Set<() => void>();

function setState(next: UpdateState): void {
  state = next;
  listeners.forEach((l) => l());
}

/** Asks the main process for a newer release; overlapping calls share one request. */
function check(): Promise<UpdateInfo> {
  if (running) return running;
  setState({ ...state, checking: true });
  running = window.api
    .checkForUpdate()
    .then((info) => {
      setState({ info, checking: false });
      return info;
    })
    .catch((err: unknown) => {
      setState({ ...state, checking: false });
      throw err;
    })
    .finally(() => {
      running = undefined;
    });
  return running;
}

function useUpdateState(): UpdateState {
  useEffect(() => {
    if (started) return;
    started = true;
    // The background check stays quiet when offline or rate limited and tries again later.
    const quietly = () => void check().catch(() => undefined);
    quietly();
    setInterval(quietly, CHECK_EVERY_MS);
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
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

type ManualResult =
  | { kind: 'current'; info: UpdateInfo }
  | { kind: 'error'; message: string };

/**
 * Top-of-window update control: "Check for updates" until a newer version is published on
 * GitHub, then "Update to vX.Y.Z", which opens the release notes and the installer. A manual
 * check that finds nothing (or fails) answers in a small dialog.
 */
export function UpdateButton({ compact = false }: { compact?: boolean }) {
  const { info, checking } = useUpdateState();
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<ManualResult>();

  const checkNow = () => {
    check()
      .then((found) => {
        if (found.available) setOpen(true);
        else setManual({ kind: 'current', info: found });
      })
      .catch((err: Error) =>
        setManual({ kind: 'error', message: err.message }),
      );
  };

  if (info?.available && info.latestVersion)
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Version ${info.latestVersion} is available. You have ${info.currentVersion}.`}
          aria-label={`Update to version ${info.latestVersion}`}
          className="no-drag mr-2 flex h-6 items-center gap-1.5 rounded bg-azure px-2 text-xs font-semibold text-ink-950 hover:bg-azure-hover"
        >
          <Download size={13} aria-hidden />
          {!compact && <span>Update to v{info.latestVersion}</span>}
        </button>
        {open && <UpdateDialog info={info} onClose={() => setOpen(false)} />}
      </>
    );

  return (
    <>
      <button
        type="button"
        onClick={checkNow}
        disabled={checking}
        title={
          info
            ? `You have version ${info.currentVersion}. Check GitHub for a newer version.`
            : 'Check GitHub for a newer version.'
        }
        aria-label={checking ? 'Checking for updates' : 'Check for updates'}
        className="no-drag mr-2 flex h-6 items-center gap-1.5 rounded border border-line px-2 text-xs font-medium text-fg-muted hover:bg-ink-800 hover:text-fg disabled:opacity-70"
      >
        {checking ? (
          <Loader2 size={13} className="animate-spin" aria-hidden />
        ) : (
          <RefreshCw size={13} aria-hidden />
        )}
        {!compact && (
          <span>{checking ? 'Checking…' : 'Check for updates'}</span>
        )}
      </button>
      {manual && (
        <CheckResultDialog
          result={manual}
          currentVersion={info?.currentVersion}
          onClose={() => setManual(undefined)}
        />
      )}
    </>
  );
}

/** The answer to a manual check when there is nothing to install, with a way to the releases. */
function CheckResultDialog({
  result,
  currentVersion,
  onClose,
}: {
  result: ManualResult;
  currentVersion?: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string>();
  const version =
    result.kind === 'current' ? result.info.currentVersion : currentVersion;
  const disabled = result.kind === 'current' && result.info.checksDisabled;
  return (
    <Modal
      title="Check for updates"
      subtitle={version ? `You have version ${version}` : undefined}
      onClose={onClose}
      widthClass="max-w-md"
      footer={
        <>
          <button
            className="btn-outline"
            onClick={() =>
              void window.api
                .openReleasePage()
                .catch((e: Error) => setError(e.message))
            }
          >
            Open releases on GitHub
          </button>
          <button className="btn-primary" onClick={onClose} autoFocus>
            Close
          </button>
        </>
      }
    >
      {result.kind === 'error' ? (
        <div
          role="alert"
          className="flex gap-2 border border-deny/40 bg-deny-fill/10 p-3 text-sm text-deny"
        >
          <AlertTriangle size={16} className="shrink-0" />
          <span className="break-words">
            Couldn't check for updates: {result.message} You can still look for
            a newer version on the releases page.
          </span>
        </div>
      ) : disabled ? (
        <p className="text-sm text-fg-muted">
          Update checks are turned off on this device. Open the releases page to
          see whether a newer version is available.
        </p>
      ) : (
        <p className="flex items-center gap-2 text-sm text-fg">
          <CheckCircle2 size={14} className="text-allow" />
          You're up to date.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-deny">
          {error}
        </p>
      )}
    </Modal>
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
          className="mb-4 flex gap-2 border border-deny/40 bg-deny-fill/10 p-3 text-sm text-deny"
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
