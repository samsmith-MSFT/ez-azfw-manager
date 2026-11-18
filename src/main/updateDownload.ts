// Downloads an update package and proves it is the file the release published. No Electron here,
// so it is tested with a fake fetch and a temporary folder.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { isGitHubDownloadHost } from '../shared/update';

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

/** Larger than any real package (about 125 MB today); stops a wrong or hostile file early. */
export const MAX_PACKAGE_BYTES = 400 * 1024 * 1024;
const MAX_TEXT_BYTES = 256 * 1024;

function checkFinalUrl(res: Response, requested: string): void {
  // A redirect may only lead to GitHub's own hosts.
  if (!isGitHubDownloadHost(res.url || requested))
    throw new Error('The download was redirected to an unexpected host.');
}

/** A small text file (the checksum list). */
export async function fetchText(
  fetchFn: FetchFn,
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetchFn(url, { signal });
  checkFinalUrl(res, url);
  if (!res.ok) throw new Error(`GitHub answered ${res.status}.`);
  const text = await res.text();
  if (text.length > MAX_TEXT_BYTES)
    throw new Error('The checksum file is larger than expected.');
  return text;
}

export interface DownloadOptions {
  fetchFn: FetchFn;
  url: string;
  /** Lower-case hex SHA-256 the file must have. */
  sha256: string;
  /** Size the release lists for the file; the download may not exceed it. */
  expectedSize: number;
  destPath: string;
  onProgress: (received: number, total: number) => void;
  onVerifying: () => void;
  signal?: AbortSignal;
}

/**
 * Streams the file to `destPath`, hashing as it goes. The file only appears at `destPath` once
 * its size and SHA-256 match; otherwise nothing is left behind.
 */
export async function downloadVerified(opts: DownloadOptions): Promise<void> {
  const limit = Math.min(
    opts.expectedSize || MAX_PACKAGE_BYTES,
    MAX_PACKAGE_BYTES,
  );
  const res = await opts.fetchFn(opts.url, { signal: opts.signal });
  checkFinalUrl(res, opts.url);
  if (!res.ok || !res.body) throw new Error(`GitHub answered ${res.status}.`);
  const declared = Number(res.headers.get('content-length')) || 0;
  if (declared > limit)
    throw new Error('The download is larger than the release lists.');
  const total = declared || opts.expectedSize;

  const part = `${opts.destPath}.part`;
  await fsp.rm(part, { force: true });
  const hash = createHash('sha256');
  let received = 0;
  const out = fs.createWriteStream(part, { mode: 0o600 });
  const failed = new Promise<never>((_, reject) => out.once('error', reject));
  failed.catch(() => undefined);
  try {
    const body = Readable.fromWeb(
      res.body as import('node:stream/web').ReadableStream,
    );
    for await (const chunk of body as AsyncIterable<Buffer>) {
      received += chunk.length;
      if (received > limit)
        throw new Error('The download is larger than the release lists.');
      hash.update(chunk);
      if (!out.write(chunk))
        await Promise.race([
          new Promise<void>((resolve) => out.once('drain', resolve)),
          failed,
        ]);
      opts.onProgress(received, total);
    }
    await Promise.race([
      new Promise<void>((resolve) => {
        out.once('close', resolve);
        out.end();
      }),
      failed,
    ]);
    opts.onVerifying();
    if (opts.expectedSize && received !== opts.expectedSize)
      throw new Error('The download is incomplete.');
    if (hash.digest('hex') !== opts.sha256.toLowerCase())
      throw new Error(
        "The downloaded file doesn't match the published checksum, so it was discarded.",
      );
    await fsp.rm(opts.destPath, { force: true });
    await fsp.rename(part, opts.destPath);
  } catch (err) {
    out.destroy();
    await fsp.rm(part, { force: true });
    throw err;
  }
}
