// In-app update: pure helpers for reading GitHub releases and choosing the right package. The
// main process does the network and file work; everything here is unit-tested without Electron.

/** The repository whose releases the app updates from. */
export const UPDATE_REPO = 'samsmith-MSFT/ez-azfw-manager';

/** Where all releases are listed; opened by the manual "Check for updates" option. */
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPO}/releases`;

export const CHECKSUMS_FILE = 'SHA256SUMS.txt';

/**
 * How an update gets applied on this install:
 * - installer: Windows setup program (asks for administrator rights itself)
 * - portable: Windows portable file, replaced by a new copy next to it
 * - appimage: Linux AppImage, replaced in place
 * - manual: anything else (macOS, development): the package is saved for the user to open
 */
export type InstallMode = 'installer' | 'portable' | 'appimage' | 'manual';

export interface ReleaseNotes {
  /** 1.6.1 (no leading v). */
  version: string;
  tag: string;
  name: string;
  publishedAt?: string;
  /** Patch notes as Markdown. */
  notes: string;
  /** The release page on GitHub. */
  url: string;
}

export interface UpdateInfo {
  currentVersion: string;
  available: boolean;
  /** Newest release, when one is available. */
  latestVersion?: string;
  /** Every release newer than the running version, newest first. */
  releases: ReleaseNotes[];
  installMode: InstallMode;
  /** True when automatic checks are turned off (EZAZFW_NO_UPDATE_CHECK=1). */
  checksDisabled: boolean;
}

export type UpdateStage =
  | 'downloading'
  | 'verifying'
  | 'installing'
  | 'saved'
  | 'error';

export interface UpdateProgress {
  stage: UpdateStage;
  received: number;
  /** Total download size in bytes; 0 when not known. */
  total: number;
  message?: string;
  /** Where the package was saved (stage "saved"). */
  savedPath?: string;
}

export interface ReleaseAsset {
  name: string;
  size: number;
  url: string;
}

/** A release as read from GitHub, with its downloadable files. */
export interface ParsedRelease extends ReleaseNotes {
  assets: ReleaseAsset[];
}

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const MAX_NOTES_CHARS = 20_000;

/** "1.6.1" or "v1.6.1" as [1, 6, 1]; undefined for anything else (including pre-releases). */
export function parseVersion(v: string): [number, number, number] | undefined {
  const m = VERSION.exec(v.trim().replace(/^v/, ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** Negative when a is older than b, 0 when equal, positive when newer; NaN if either is invalid. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return NaN;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * The patch notes part of a release description. Releases from this repository list the download
 * table first and the changes after a "What's changed" heading; anything else is used as is.
 */
export function releaseNotesText(body: string): string {
  const m = /^#{1,3}\s*what[’']s changed\s*$/im.exec(body);
  const notes = m ? body.slice(m.index + m[0].length) : body;
  return notes.trim().slice(0, MAX_NOTES_CHARS);
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/**
 * Published releases newer than `current`, newest first. The response is untrusted JSON, so every
 * field is checked; drafts, pre-releases and tags that aren't plain versions are ignored.
 */
export function newerReleases(raw: unknown, current: string): ParsedRelease[] {
  if (!Array.isArray(raw) || !parseVersion(current)) return [];
  const releases: ParsedRelease[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const tag = str(r.tag_name);
    const url = str(r.html_url);
    if (!tag || !url || r.draft !== false || r.prerelease !== false) continue;
    const version = tag.replace(/^v/, '');
    if (!tag.startsWith('v') || !parseVersion(version)) continue;
    if (!(compareVersions(version, current) > 0)) continue;
    const assets: ReleaseAsset[] = [];
    if (Array.isArray(r.assets))
      for (const a of r.assets) {
        const asset = a as Record<string, unknown> | null;
        const name = str(asset?.name);
        const link = str(asset?.browser_download_url);
        const size = asset?.size;
        if (name && link && typeof size === 'number' && size >= 0)
          assets.push({ name, size, url: link });
      }
    releases.push({
      version,
      tag,
      name: str(r.name) || `Version ${version}`,
      publishedAt: str(r.published_at),
      notes: releaseNotesText(str(r.body) ?? ''),
      url,
      assets,
    });
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

/** The release page, only when it really is a page of this repository. */
export function isReleasePageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.host === 'github.com' &&
      u.pathname
        .toLowerCase()
        .startsWith(`/${UPDATE_REPO.toLowerCase()}/releases/`)
    );
  } catch {
    return false;
  }
}

/** A package link must point at this repository's release download for exactly this tag and file. */
export function isTrustedAssetUrl(
  url: string,
  tag: string,
  name: string,
): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      u.host === 'github.com' &&
      !u.search &&
      decodeURIComponent(u.pathname).toLowerCase() ===
        `/${UPDATE_REPO}/releases/download/${tag}/${name}`.toLowerCase()
    );
  } catch {
    return false;
  }
}

/** GitHub serves release files from its own hosts, after a redirect. Nothing else is accepted. */
export function isGitHubDownloadHost(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === 'https:' &&
      (u.host === 'github.com' ||
        u.host === 'githubusercontent.com' ||
        u.host.endsWith('.githubusercontent.com'))
    );
  } catch {
    return false;
  }
}

/** The release file for this platform, named as the release workflow names them. */
export function platformAssetName(
  version: string,
  platform: string,
  arch: string,
  mode: InstallMode,
): string | undefined {
  const base = `ez-azfw-manager-${version}`;
  if (platform === 'win32') {
    if (arch !== 'x64' && arch !== 'arm64') return undefined;
    return `${base}-win-${arch}-${mode === 'portable' ? 'portable' : 'setup'}.exe`;
  }
  if (platform === 'darwin')
    return arch === 'x64' || arch === 'arm64'
      ? `${base}-mac-${arch}.zip`
      : undefined;
  if (platform === 'linux' && arch === 'x64')
    return `${base}-linux-x86_64.AppImage`;
  return undefined;
}

/** File name to SHA-256 (lower case) from the `sha256sum` style SHA256SUMS.txt. */
export function parseChecksums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (m) sums.set(m[2].trim(), m[1].toLowerCase());
  }
  return sums;
}

export function installModeFor(env: {
  platform: string;
  packaged: boolean;
  portableFile?: string;
  appImage?: string;
}): InstallMode {
  if (!env.packaged) return 'manual';
  if (env.platform === 'win32')
    return env.portableFile ? 'portable' : 'installer';
  if (env.platform === 'linux' && env.appImage) return 'appimage';
  return 'manual';
}

/** What the update button will do, in plain words, for the dialog. */
export const INSTALL_HELP: Record<
  InstallMode,
  { action: string; detail: string }
> = {
  installer: {
    action: 'Download and install',
    detail:
      'The installer is downloaded and checked, then opens. Windows asks for administrator rights; the installer closes this app, updates it and starts the new version. Your drafts, history and sign-in are kept.',
  },
  portable: {
    action: 'Download and restart',
    detail:
      'The new version is downloaded and checked, saved next to this file, and started. The old file stays; delete it when you like. Your drafts, history and sign-in are kept.',
  },
  appimage: {
    action: 'Download and restart',
    detail:
      'The new version is downloaded and checked, replaces this AppImage, and the app restarts. Your drafts, history and sign-in are kept.',
  },
  manual: {
    action: 'Download',
    detail:
      'The new version is downloaded and checked, then shown in your folder. Open it (on macOS, unzip it and replace the old app) to finish the update. Your drafts, history and sign-in are kept.',
  },
};
