import { describe, expect, it } from 'vitest';
import {
  defaultWindowBounds,
  minimumWindowSize,
  parseWindowState,
  restoreWindowBounds,
} from './windowState';

describe('window bounds', () => {
  it('centres the preferred window on a large display work area', () => {
    expect(
      defaultWindowBounds({ x: 0, y: 0, width: 1920, height: 1080 }),
    ).toEqual({ x: 240, y: 90, width: 1440, height: 900 });
  });

  it('shrinks the preferred size to at most 95% of a smaller work area', () => {
    expect(
      defaultWindowBounds({ x: 50, y: 40, width: 1280, height: 690 }),
    ).toEqual({ x: 166, y: 58, width: 1048, height: 655 });
  });

  it('clamps the 900 by 600 minimum to the available display work area', () => {
    expect(minimumWindowSize({ x: 0, y: 0, width: 800, height: 520 })).toEqual({
      width: 800,
      height: 520,
    });
  });

  it('restores normal bounds on a connected display, including a secondary display', () => {
    const displays = [
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1440, height: 900 },
    ];
    expect(
      restoreWindowBounds(
        { x: 2050, y: 80, width: 1100, height: 680 },
        displays,
      ),
    ).toEqual({ x: 2050, y: 80, width: 1100, height: 680 });
  });

  it('refuses bounds whose former monitor is no longer connected', () => {
    expect(
      restoreWindowBounds({ x: 2800, y: 100, width: 1100, height: 680 }, [
        { x: 0, y: 0, width: 1920, height: 1080 },
      ]),
    ).toBeUndefined();
  });

  it('requires a visible title strip and at least 200 by 100 px of the saved window', () => {
    const display = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(
      restoreWindowBounds({ x: 100, y: -100, width: 1100, height: 680 }, [
        display,
      ]),
    ).toBeUndefined();
    expect(
      restoreWindowBounds({ x: -950, y: 100, width: 1100, height: 680 }, [
        display,
      ]),
    ).toBeUndefined();
  });

  it('shrinks saved bounds that no longer fit the connected display', () => {
    expect(
      restoreWindowBounds({ x: 140, y: 80, width: 2560, height: 1600 }, [
        { x: 0, y: 0, width: 1280, height: 720 },
      ]),
    ).toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });

  it('sanitizes persisted state and rejects malformed bounds', () => {
    expect(
      parseWindowState({
        version: 1,
        bounds: { x: -50, y: 20, width: 1200, height: 800 },
        maximized: true,
        zoomFactor: 20,
      }),
    ).toEqual({
      version: 1,
      bounds: { x: -50, y: 20, width: 1200, height: 800 },
      maximized: true,
      zoomFactor: 3,
    });
    expect(
      parseWindowState({
        version: 1,
        bounds: { x: 0, y: 0, width: -1, height: 800 },
        maximized: false,
        zoomFactor: 1,
      }),
    ).toBeUndefined();
  });
});
