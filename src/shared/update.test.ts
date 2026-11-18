import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  installModeFor,
  isGitHubDownloadHost,
  isReleasePageUrl,
  isTrustedAssetUrl,
  newerReleases,
  parseChecksums,
  parseVersion,
  platformAssetName,
  releaseNotesText,
} from './update';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `EZ AzFW Manager ${tag}`,
  draft: false,
  prerelease: false,
  published_at: '2026-11-18T10:00:00Z',
  html_url: `https://github.com/samsmith-MSFT/ez-azfw-manager/releases/tag/${tag}`,
  body: "## Download\n\ntable\n\n## What's changed\n\n### Fixed\n\n- A fix.\n",
  assets: [
    {
      name: `ez-azfw-manager-${tag.slice(1)}-win-x64-setup.exe`,
      size: 10,
      browser_download_url: `https://github.com/samsmith-MSFT/ez-azfw-manager/releases/download/${tag}/ez-azfw-manager-${tag.slice(1)}-win-x64-setup.exe`,
    },
  ],
  ...extra,
});

describe('versions', () => {
  it('parses plain versions only', () => {
    expect(parseVersion('1.6.1')).toEqual([1, 6, 1]);
    expect(parseVersion('v1.6.1')).toEqual([1, 6, 1]);
    expect(parseVersion('1.6.1-beta.1')).toBeUndefined();
    expect(parseVersion('1.6')).toBeUndefined();
  });

  it('compares numerically, not as text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.6.1', '1.6.1')).toBe(0);
    expect(compareVersions('1.6.0', '1.6.1')).toBeLessThan(0);
    expect(compareVersions('x', '1.0.0')).toBeNaN();
  });
});

describe('releaseNotesText', () => {
  it("keeps what follows the What's changed heading", () => {
    expect(
      releaseNotesText('## Download\n\nx\n\n## What’s changed\n\n- A\n'),
    ).toBe('- A');
  });

  it('uses the whole body when there is no such heading', () => {
    expect(releaseNotesText('  Just notes.  ')).toBe('Just notes.');
  });
});

describe('newerReleases', () => {
  it('returns published newer releases, newest first', () => {
    const found = newerReleases(
      [release('v1.6.0'), release('v1.7.0'), release('v1.6.1')],
      '1.6.0',
    );
    expect(found.map((r) => r.version)).toEqual(['1.7.0', '1.6.1']);
    expect(found[0].notes).toContain('A fix.');
    expect(found[0].assets).toHaveLength(1);
  });

  it('skips drafts, pre-releases and odd tags', () => {
    expect(
      newerReleases(
        [
          release('v2.0.0', { draft: true }),
          release('v2.0.1', { prerelease: true }),
          release('v2.0.2-rc.1'),
          release('2.0.3'),
        ],
        '1.0.0',
      ),
    ).toEqual([]);
  });

  it('survives malformed responses', () => {
    expect(newerReleases({ message: 'rate limited' }, '1.0.0')).toEqual([]);
    expect(newerReleases([null, 5, 'x', {}], '1.0.0')).toEqual([]);
    expect(newerReleases([release('v1.1.0')], 'dev')).toEqual([]);
    const odd = newerReleases(
      [release('v1.1.0', { assets: [null, { name: 3 }, { name: 'a' }] })],
      '1.0.0',
    );
    expect(odd[0].assets).toEqual([]);
  });
});

describe('trusted addresses', () => {
  const ok =
    'https://github.com/samsmith-MSFT/ez-azfw-manager/releases/download/v1.6.1/ez-azfw-manager-1.6.1-win-x64-setup.exe';

  it('accepts exactly this repository, tag and file', () => {
    expect(
      isTrustedAssetUrl(
        ok,
        'v1.6.1',
        'ez-azfw-manager-1.6.1-win-x64-setup.exe',
      ),
    ).toBe(true);
  });

  it('rejects other repositories, tags, files, hosts and schemes', () => {
    const name = 'ez-azfw-manager-1.6.1-win-x64-setup.exe';
    expect(
      isTrustedAssetUrl(ok.replace('samsmith-MSFT', 'evil'), 'v1.6.1', name),
    ).toBe(false);
    expect(isTrustedAssetUrl(ok, 'v1.6.2', name)).toBe(false);
    expect(isTrustedAssetUrl(ok, 'v1.6.1', 'other.exe')).toBe(false);
    expect(
      isTrustedAssetUrl(
        ok.replace('github.com', 'github.com.evil.io'),
        'v1.6.1',
        name,
      ),
    ).toBe(false);
    expect(isTrustedAssetUrl(ok.replace('https', 'http'), 'v1.6.1', name)).toBe(
      false,
    );
    expect(isTrustedAssetUrl(`${ok}?x=1`, 'v1.6.1', name)).toBe(false);
  });

  it('limits redirects to GitHub hosts', () => {
    expect(
      isGitHubDownloadHost('https://release-assets.githubusercontent.com/x'),
    ).toBe(true);
    expect(isGitHubDownloadHost('https://github.com/x')).toBe(true);
    expect(isGitHubDownloadHost('https://evilgithubusercontent.com/x')).toBe(
      false,
    );
    expect(isGitHubDownloadHost('http://github.com/x')).toBe(false);
    expect(isGitHubDownloadHost('not a url')).toBe(false);
  });

  it('opens only this repository release pages', () => {
    expect(
      isReleasePageUrl(
        'https://github.com/samsmith-MSFT/ez-azfw-manager/releases/tag/v1.6.1',
      ),
    ).toBe(true);
    expect(
      isReleasePageUrl('https://github.com/other/repo/releases/tag/v1'),
    ).toBe(false);
    expect(isReleasePageUrl('file:///C:/Windows/System32/calc.exe')).toBe(
      false,
    );
  });
});

describe('platformAssetName', () => {
  it('matches the release workflow file names', () => {
    expect(platformAssetName('1.6.1', 'win32', 'x64', 'installer')).toBe(
      'ez-azfw-manager-1.6.1-win-x64-setup.exe',
    );
    expect(platformAssetName('1.6.1', 'win32', 'arm64', 'portable')).toBe(
      'ez-azfw-manager-1.6.1-win-arm64-portable.exe',
    );
    expect(platformAssetName('1.6.1', 'darwin', 'arm64', 'manual')).toBe(
      'ez-azfw-manager-1.6.1-mac-arm64.zip',
    );
    expect(platformAssetName('1.6.1', 'linux', 'x64', 'appimage')).toBe(
      'ez-azfw-manager-1.6.1-linux-x86_64.AppImage',
    );
    expect(
      platformAssetName('1.6.1', 'linux', 'arm64', 'appimage'),
    ).toBeUndefined();
    expect(
      platformAssetName('1.6.1', 'win32', 'ia32', 'installer'),
    ).toBeUndefined();
  });
});

describe('parseChecksums', () => {
  const a = 'a'.repeat(64);
  const b = 'B'.repeat(64);

  it('reads sha256sum output', () => {
    const sums = parseChecksums(`${a}  one.exe\r\n${b} *two.zip\nnot a line\n`);
    expect(sums.get('one.exe')).toBe(a);
    expect(sums.get('two.zip')).toBe('b'.repeat(64));
    expect(sums.size).toBe(2);
  });
});

describe('installModeFor', () => {
  it('chooses how the update is applied', () => {
    const base = { platform: 'win32', packaged: true };
    expect(installModeFor(base)).toBe('installer');
    expect(installModeFor({ ...base, portableFile: 'C:\\x.exe' })).toBe(
      'portable',
    );
    expect(
      installModeFor({
        platform: 'linux',
        packaged: true,
        appImage: '/a.AppImage',
      }),
    ).toBe('appimage');
    expect(installModeFor({ platform: 'linux', packaged: true })).toBe(
      'manual',
    );
    expect(installModeFor({ platform: 'darwin', packaged: true })).toBe(
      'manual',
    );
    expect(installModeFor({ platform: 'win32', packaged: false })).toBe(
      'manual',
    );
  });
});
