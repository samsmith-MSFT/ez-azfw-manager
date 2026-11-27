import { normaliseZoom } from './zoom';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_SIZE = { width: 1440, height: 900 } as const;
export const MINIMUM_WINDOW_SIZE = { width: 900, height: 600 } as const;
const DEFAULT_WORK_AREA_SHARE = 0.95;
const MIN_VISIBLE_TITLE_WIDTH = 200;
const MIN_VISIBLE_WINDOW_HEIGHT = 100;
const TITLE_BAR_HEIGHT = 36;

export interface PersistedWindowState {
  version: 1;
  bounds: Rectangle;
  maximized: boolean;
  zoomFactor: number;
}

/** Centres the preferred default size in the supplied display work area. */
export function defaultWindowBounds(workArea: Rectangle): Rectangle {
  const scale = Math.min(
    1,
    (workArea.width * DEFAULT_WORK_AREA_SHARE) / DEFAULT_WINDOW_SIZE.width,
    (workArea.height * DEFAULT_WORK_AREA_SHARE) / DEFAULT_WINDOW_SIZE.height,
  );
  const width = Math.floor(DEFAULT_WINDOW_SIZE.width * scale);
  const height = Math.floor(DEFAULT_WINDOW_SIZE.height * scale);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

/** Electron's minimum bounds must never be larger than the active work area. */
export function minimumWindowSize(workArea: Rectangle): {
  width: number;
  height: number;
} {
  return {
    width: Math.min(MINIMUM_WINDOW_SIZE.width, workArea.width),
    height: Math.min(MINIMUM_WINDOW_SIZE.height, workArea.height),
  };
}

function intersection(a: Rectangle, b: Rectangle): Rectangle {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Restores saved normal bounds only when the title strip and useful content remain reachable on
 * a connected display. Oversized windows are fitted to the display they overlap.
 */
export function restoreWindowBounds(
  saved: Rectangle,
  workAreas: readonly Rectangle[],
): Rectangle | undefined {
  if (
    ![saved.x, saved.y, saved.width, saved.height].every(Number.isFinite) ||
    saved.width <= 0 ||
    saved.height <= 0
  )
    return undefined;

  const titleStrip = { ...saved, height: TITLE_BAR_HEIGHT };
  const candidates = workAreas.flatMap((workArea) => {
    const visible = intersection(saved, workArea);
    const titleVisible = intersection(titleStrip, workArea);
    if (
      titleVisible.width < MIN_VISIBLE_TITLE_WIDTH ||
      titleVisible.height <= 0 ||
      visible.width < MIN_VISIBLE_TITLE_WIDTH ||
      visible.height < MIN_VISIBLE_WINDOW_HEIGHT
    )
      return [];
    return [{ workArea, area: visible.width * visible.height }];
  });
  candidates.sort((a, b) => b.area - a.area);
  const display = candidates[0]?.workArea;
  if (!display) return undefined;

  const width = Math.min(saved.width, display.width);
  const height = Math.min(saved.height, display.height);
  return {
    x: Math.round(clamp(saved.x, display.x, display.x + display.width - width)),
    y: Math.round(
      clamp(saved.y, display.y, display.y + display.height - height),
    ),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Validates untrusted JSON before Electron uses it. */
export function parseWindowState(
  value: unknown,
): PersistedWindowState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const state = value as Partial<PersistedWindowState>;
  if (state.version !== 1 || !state.bounds || typeof state.bounds !== 'object')
    return undefined;
  const { x, y, width, height } = state.bounds;
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return undefined;
  return {
    version: 1,
    bounds: { x, y, width, height },
    maximized: state.maximized === true,
    zoomFactor: normaliseZoom(Number(state.zoomFactor)),
  };
}
