import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { downloadVerified, fetchText, type FetchFn } from './updateDownload';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ez-azfw-update-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const sha = (data: Buffer) => createHash('sha256').update(data).digest('hex');

function serve(
  data: Buffer,
  init: ResponseInit & { url?: string } = {},
): FetchFn {
  return async (url) => {
    const res = new Response(new Uint8Array(data), {
      status: 200,
      headers: { 'content-length': String(data.length) },
      ...init,
    });
    Object.defineProperty(res, 'url', { value: init.url ?? url });
    return res;
  };
}

const base = (data: Buffer) => ({
  url: 'https://github.com/samsmith-MSFT/ez-azfw-manager/releases/download/v1/x.exe',
  sha256: sha(data),
  expectedSize: data.length,
  onProgress: vi.fn(),
  onVerifying: vi.fn(),
});

describe('downloadVerified', () => {
  it('writes the file once its checksum matches', async () => {
    const data = Buffer.from('package bytes'.repeat(1000));
    const dest = path.join(dir, 'x.exe');
    const opts = base(data);
    await downloadVerified({ ...opts, fetchFn: serve(data), destPath: dest });
    expect(fs.readFileSync(dest)).toEqual(data);
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
    expect(opts.onVerifying).toHaveBeenCalled();
    expect(opts.onProgress).toHaveBeenLastCalledWith(data.length, data.length);
  });

  it('discards a file whose checksum differs', async () => {
    const data = Buffer.from('tampered');
    const dest = path.join(dir, 'x.exe');
    await expect(
      downloadVerified({
        ...base(data),
        sha256: sha(Buffer.from('original')),
        fetchFn: serve(data),
        destPath: dest,
      }),
    ).rejects.toThrow(/checksum/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a file larger than the release lists', async () => {
    const data = Buffer.from('x'.repeat(100));
    const dest = path.join(dir, 'x.exe');
    await expect(
      downloadVerified({
        ...base(data),
        expectedSize: 10,
        fetchFn: serve(data, { headers: {} }),
        destPath: dest,
      }),
    ).rejects.toThrow(/larger/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses an incomplete download', async () => {
    const data = Buffer.from('short');
    const dest = path.join(dir, 'x.exe');
    await expect(
      downloadVerified({
        ...base(data),
        expectedSize: 50,
        fetchFn: serve(data, { headers: {} }),
        destPath: dest,
      }),
    ).rejects.toThrow(/incomplete/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('refuses a redirect away from GitHub', async () => {
    const data = Buffer.from('x');
    await expect(
      downloadVerified({
        ...base(data),
        fetchFn: serve(data, { url: 'https://evil.example/x.exe' }),
        destPath: path.join(dir, 'x.exe'),
      }),
    ).rejects.toThrow(/unexpected host/);
  });

  it('reports a failed request', async () => {
    const data = Buffer.from('x');
    await expect(
      downloadVerified({
        ...base(data),
        fetchFn: serve(data, { status: 404 }),
        destPath: path.join(dir, 'x.exe'),
      }),
    ).rejects.toThrow(/404/);
  });
});

describe('fetchText', () => {
  it('returns the text', async () => {
    expect(
      await fetchText(serve(Buffer.from('hello')), 'https://github.com/x'),
    ).toBe('hello');
  });

  it('refuses an unexpected host and oversized text', async () => {
    await expect(
      fetchText(
        serve(Buffer.from('x'), { url: 'https://evil.example/' }),
        'https://github.com/x',
      ),
    ).rejects.toThrow(/unexpected host/);
    await expect(
      fetchText(
        serve(Buffer.from('x'.repeat(300_000))),
        'https://github.com/x',
      ),
    ).rejects.toThrow(/larger/);
  });
});
