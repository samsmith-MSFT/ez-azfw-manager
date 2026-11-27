import { describe, expect, it, vi } from 'vitest';
import {
  createZoomController,
  normaliseZoom,
  stepZoom,
  titleBarGeometry,
} from './zoom';

describe('zoom steps', () => {
  it('moves between the supported discrete zoom factors and clamps at the ends', () => {
    expect(stepZoom(1, 'in')).toBe(1.1);
    expect(stepZoom(1.1, 'out')).toBe(1);
    expect(stepZoom(0.75, 'out')).toBe(0.75);
    expect(stepZoom(3, 'in')).toBe(3);
  });

  it('normalises persisted and IPC values to a supported step', () => {
    expect(normaliseZoom(1.47)).toBe(1.5);
    expect(normaliseZoom(20)).toBe(3);
    expect(normaliseZoom(0.1)).toBe(0.75);
    expect(normaliseZoom(Number.NaN)).toBe(1);
  });

  it('scales native title-bar geometry with the effective zoom', () => {
    expect(titleBarGeometry(1)).toEqual({ height: 36, trafficLightY: 11 });
    expect(titleBarGeometry(1.5)).toEqual({ height: 54, trafficLightY: 17 });
    expect(titleBarGeometry(2)).toEqual({ height: 72, trafficLightY: 22 });
  });

  it('waits for renderer load before applying saved page zoom', () => {
    let factor = 1;
    const contents = {
      setZoomMode: vi.fn(),
      setZoomFactor: vi.fn((next: number) => {
        factor = next;
      }),
      getZoomFactor: () => factor,
      on: vi.fn(),
      off: vi.fn(),
    };
    const window = {
      webContents: contents,
      setTitleBarOverlay: vi.fn(),
      setWindowButtonPosition: vi.fn(),
    };

    const zoom = createZoomController(window as never, 3);
    expect(contents.setZoomFactor).not.toHaveBeenCalled();
    if (process.platform === 'darwin') {
      expect(window.setWindowButtonPosition).toHaveBeenLastCalledWith({
        x: 14,
        y: 33,
      });
    } else {
      expect(window.setTitleBarOverlay).toHaveBeenLastCalledWith(
        expect.objectContaining({ height: 108 }),
      );
    }

    // main.ts invokes this after loadURL resolves, not while Chromium is navigating.
    zoom.activate();

    expect(contents.setZoomFactor).toHaveBeenCalledWith(3);
    expect(factor).toBe(3);
  });

  it('owns isolated page zoom, native chrome sync and wheel requests', () => {
    let factor = 1;
    let wheel:
      | ((event: { preventDefault(): void }, direction: 'in' | 'out') => void)
      | undefined;
    const contents = {
      setZoomMode: vi.fn(),
      setZoomFactor: vi.fn((next: number) => {
        factor = next;
      }),
      getZoomFactor: () => factor,
      on: vi.fn((event: string, listener: typeof wheel) => {
        if (event === 'zoom-changed') wheel = listener;
      }),
      off: vi.fn(),
      send: vi.fn(),
    };
    const window = {
      webContents: contents,
      setTitleBarOverlay: vi.fn(),
      setWindowButtonPosition: vi.fn(),
    };
    const changed = vi.fn();
    const zoom = createZoomController(window as never, 1.25, changed);

    expect(contents.setZoomMode).toHaveBeenCalledWith('isolated');
    expect(contents.setZoomFactor).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();

    zoom.activate();
    expect(contents.setZoomFactor).toHaveBeenLastCalledWith(1.25);

    zoom.set(1.47);
    expect(factor).toBe(1.5);
    expect(changed).toHaveBeenLastCalledWith(1.5);

    const preventDefault = vi.fn();
    wheel?.({ preventDefault }, 'in');
    expect(preventDefault).toHaveBeenCalled();
    expect(factor).toBe(1.75);
  });
});
