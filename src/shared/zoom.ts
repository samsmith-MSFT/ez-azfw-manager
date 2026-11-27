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
