import type { BrowserWindow, Event } from 'electron';
import {
  normaliseZoom,
  stepZoom,
  ZOOM_STEPS,
  type ZoomDirection,
} from '../shared/zoom';

export { normaliseZoom, stepZoom, ZOOM_STEPS, type ZoomDirection };

export function titleBarGeometry(factor: number): {
  height: number;
  trafficLightY: number;
} {
  const normalised = normaliseZoom(factor);
  return {
    height: Math.round(36 * normalised),
    trafficLightY: Math.round(11 * normalised),
  };
}

export interface ZoomController {
  get(): number;
  /** Applies the saved factor after the first renderer load has completed. */
  activate(): number;
  set(factor: number): number;
  zoomIn(): number;
  zoomOut(): number;
  reset(): number;
  dispose(): void;
}

/**
 * The only place that applies page zoom. Isolated mode keeps zoom local to this window while
 * retaining actual page scaling and the Ctrl/Cmd+wheel event. Manual mode does not scale the page.
 */
export function createZoomController(
  window: BrowserWindow,
  initialFactor: number,
  onChanged: (factor: number) => void = () => {},
): ZoomController {
  let factor = normaliseZoom(initialFactor);
  const contents = window.webContents;
  contents.setZoomMode('isolated');

  const syncNativeChrome = () => {
    const geometry = titleBarGeometry(factor);
    if (process.platform === 'darwin') {
      window.setWindowButtonPosition({ x: 14, y: geometry.trafficLightY });
    } else {
      window.setTitleBarOverlay({
        color: '#0B1524',
        symbolColor: '#93A4BD',
        height: geometry.height,
      });
    }
  };

  const apply = (requested: number, notify: boolean): number => {
    factor = normaliseZoom(requested);
    contents.setZoomFactor(factor);
    syncNativeChrome();
    if (notify) onChanged(factor);
    return factor;
  };

  const onWheel = (event: Event, direction: ZoomDirection) => {
    event.preventDefault();
    apply(stepZoom(factor, direction), true);
  };
  contents.on('zoom-changed', onWheel);
  // Chromium discards pre-navigation zoom in Electron. Keep native chrome aligned now, but do not
  // touch the page until main.ts resolves loadURL and calls activate().
  syncNativeChrome();

  return {
    get: () => factor,
    activate: () => apply(factor, false),
    set: (next) => apply(next, true),
    zoomIn: () => apply(stepZoom(factor, 'in'), true),
    zoomOut: () => apply(stepZoom(factor, 'out'), true),
    reset: () => apply(1, true),
    dispose: () => contents.off('zoom-changed', onWheel),
  };
}
