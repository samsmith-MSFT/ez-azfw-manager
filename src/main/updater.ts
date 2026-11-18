// In-app update from GitHub Releases: find a newer release, download the package for this
// platform, check it against the release's published SHA-256, then apply it.
import { app, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import {
  CHECKSUMS_FILE,
  RELEASES_PAGE_URL,
  UPDATE_REPO,
  installModeFor,
  isReleasePageUrl,
  isTrustedAssetUrl,
  newerReleases,
  parseChecksums,
  platformAssetName,
  type InstallMode,
  type ParsedRelease,
  type UpdateInfo,
  type UpdateProgress,
} from '../shared/update';
import { downloadVerified, fetchText, type FetchFn } from './updateDownload';
import { candidate } from './candidate';
import { loadState } from './store';

const RELEASES_URL = `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=20`;
const CHECK_TIMEOUT_MS = 15_000;

let releases: ParsedRelease[] = [];
let installing = false;

const netFetch: FetchFn = (url, init) => net.fetch(url, init);

function installMode(): InstallMode {
  return installModeFor({
    platform: process.platform,
    packaged: app.isPackaged,
    portableFile: process.env.PORTABLE_EXECUTABLE_FILE,
    appImage: process.env.APPIMAGE,
  });
}

/** Set EZAZFW_NO_UPDATE_CHECK=1 to keep the app from contacting GitHub for updates. */
function checksDisabled(): boolean {
  return process.env.EZAZFW_NO_UPDATE_CHECK === '1';
}

function toInfo(): UpdateInfo {
  return {
    currentVersion: app.getVersion(),
    available: releases.length > 0,
    latestVersion: releases[0]?.version,
    releases: releases.map(({ assets: _assets, ...notes }) => notes),
    installMode: installMode(),
    checksDisabled: checksDisabled(),
  };
}

/** Asks GitHub for releases newer than the running version. */
export async function checkForUpdate(
  fetchFn: FetchFn = netFetch,
): Promise<UpdateInfo> {
  if (checksDisabled()) return toInfo();
  const res = await fetchFn(RELEASES_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  releases = newerReleases(await res.json(), app.getVersion());
  return toInfo();
}

/** Opens the newest release's page in the browser, or the list of releases when there is none. */
export async function openReleasePage(): Promise<void> {
  const url = releases[0]?.url ?? RELEASES_PAGE_URL;
  if (!isReleasePageUrl(url) && url !== RELEASES_PAGE_URL)
    throw new Error('No update to show.');
  await shell.openExternal(url);
}

async function writable(dir: string): Promise<boolean> {
  try {
    await fsp.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Starts the new portable copy once this process has let go of the single-instance lock. */
function launchDetached(file: string): Promise<void> {
  // The portable launcher's own variables must not leak into the new copy.
  const env = { ...process.env };
  delete env.PORTABLE_EXECUTABLE_FILE;
  delete env.PORTABLE_EXECUTABLE_DIR;
  delete env.PORTABLE_EXECUTABLE_APP_FILENAME;
  return new Promise((resolve, reject) => {
    const child = spawn(file, [], { detached: true, stdio: 'ignore', env });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

/**
 * Downloads, verifies and applies the newest release. Progress is reported along the way; the
 * result is the final stage ("installing" when the app is about to close or restart, "saved"
 * when the user has to open the package themselves).
 */
export async function installUpdate(
  onProgress: (p: UpdateProgress) => void,
): Promise<UpdateProgress> {
  if (installing) throw new Error('An update is already in progress.');
  const release = releases[0];
  if (!release) throw new Error('No update is available.');
  if (candidate.unsaved)
    throw new Error(
      'You have unsaved draft changes. Save or revert them first, then update.',
    );
  if (loadState().activeCommits.length)
    throw new Error(
      'A commit to Azure is still running. Update after it has finished.',
    );
  installing = true;
  try {
    return await run(release, onProgress);
  } finally {
    installing = false;
  }
}

async function run(
  release: ParsedRelease,
  onProgress: (p: UpdateProgress) => void,
): Promise<UpdateProgress> {
  const mode = installMode();
  const assetName = platformAssetName(
    release.version,
    process.platform,
    process.arch,
    mode,
  );
  const asset = release.assets.find((a) => a.name === assetName);
  const sums = release.assets.find((a) => a.name === CHECKSUMS_FILE);
  if (!assetName || !asset)
    throw new Error(
      `Version ${release.version} has no download for this computer. Use "View on GitHub".`,
    );
  if (!sums)
    throw new Error(
      `Version ${release.version} has no published checksums, so it can't be verified.`,
    );
  for (const a of [asset, sums])
    if (!isTrustedAssetUrl(a.url, release.tag, a.name))
      throw new Error('The release lists an unexpected download address.');

  const expected = parseChecksums(await fetchText(netFetch, sums.url)).get(
    assetName,
  );
  if (!expected) throw new Error(`No checksum is published for ${assetName}.`);

  // Where the package goes. A replaceable install needs a folder it can write to; otherwise the
  // package is saved to Downloads for the user to open.
  let target: InstallMode = mode;
  let dir: string;
  if (mode === 'appimage' || mode === 'portable') {
    const home = path.dirname(
      mode === 'appimage'
        ? (process.env.APPIMAGE as string)
        : (process.env.PORTABLE_EXECUTABLE_FILE as string),
    );
    if (await writable(home)) dir = home;
    else {
      target = 'manual';
      dir = app.getPath('downloads');
    }
  } else if (mode === 'installer') {
    dir = path.join(app.getPath('temp'), 'ez-azfw-manager-update');
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });
  } else dir = app.getPath('downloads');

  const dest =
    target === 'appimage'
      ? path.join(
          dir,
          `.${path.basename(process.env.APPIMAGE as string)}.update`,
        )
      : path.join(dir, assetName);

  await downloadVerified({
    fetchFn: netFetch,
    url: asset.url,
    sha256: expected,
    expectedSize: asset.size,
    destPath: dest,
    onProgress: (received, total) =>
      onProgress({ stage: 'downloading', received, total }),
    onVerifying: () =>
      onProgress({
        stage: 'verifying',
        received: asset.size,
        total: asset.size,
      }),
  });

  const done = (p: Partial<UpdateProgress>): UpdateProgress => ({
    stage: 'installing',
    received: asset.size,
    total: asset.size,
    ...p,
  });

  if (target === 'installer') {
    // ShellExecute, so Windows can show its administrator prompt for the installer.
    const failure = await shell.openPath(dest);
    if (failure) throw new Error(`Couldn't open the installer: ${failure}`);
    return done({
      message:
        'The installer is open. Follow its steps; it closes this app when it is time.',
    });
  }

  if (target === 'portable') {
    app.releaseSingleInstanceLock();
    try {
      await launchDetached(dest);
    } catch (err) {
      // Nothing started, so this copy has to keep the lock.
      app.requestSingleInstanceLock();
      throw new Error(
        `Couldn't start the new version: ${(err as Error).message}`,
      );
    }
    app.quit();
    return done({ message: 'Starting the new version…' });
  }

  if (target === 'appimage') {
    const current = process.env.APPIMAGE as string;
    await fsp.chmod(dest, 0o755);
    await fsp.rename(dest, current);
    app.releaseSingleInstanceLock();
    app.relaunch({ execPath: current });
    app.quit();
    return done({ message: 'Restarting with the new version…' });
  }

  shell.showItemInFolder(dest);
  return done({ stage: 'saved', savedPath: dest });
}
