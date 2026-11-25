import type { BrowserWindow, Event } from 'electron';

export const ZOOM_STEPS = [
  0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3,
] as const;

export type ZoomDirection = 'in' | 'out';

export function normaliseZoom(factor: number): number {
  if (!Number.isFinite(factor)) return 1;
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - factor) < Math.abs(best - factor) ? step : best,
  );
}

/** Moves one supported step, snapping non-step persisted values to the nearest step first. */
export function stepZoom(factor: number, direction: ZoomDirection): number {
  const nearest = normaliseZoom(factor);
  const index = ZOOM_STEPS.indexOf(nearest as (typeof ZOOM_STEPS)[number]);
  const next = direction === 'in' ? index + 1 : index - 1;
  return ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, next))];
}

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
  set(factor: number): number;
  zoomIn(): number;
  zoomOut(): number;
  reset(): number;
  dispose(): void;
}

/**
 * The only place that applies page zoom. Manual mode prevents Chromium's per-origin default from
 * racing persisted application state while retaining the Ctrl/Cmd+wheel event.
 */
export function createZoomController(
  window: BrowserWindow,
  initialFactor: number,
  onChanged: (factor: number) => void = () => {},
): ZoomController {
  let factor = normaliseZoom(initialFactor);
  const contents = window.webContents;
  contents.setZoomMode('manual');

  const apply = (requested: number, notify: boolean): number => {
    factor = normaliseZoom(requested);
    contents.setZoomFactor(factor);
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
    if (notify) onChanged(factor);
    return factor;
  };

  const onWheel = (event: Event, direction: ZoomDirection) => {
    event.preventDefault();
    apply(stepZoom(factor, direction), true);
  };
  contents.on('zoom-changed', onWheel);
  apply(factor, false);

  return {
    get: () => factor,
    set: (next) => apply(next, true),
    zoomIn: () => apply(stepZoom(factor, 'in'), true),
    zoomOut: () => apply(stepZoom(factor, 'out'), true),
    reset: () => apply(1, true),
    dispose: () => contents.off('zoom-changed', onWheel),
  };
}
