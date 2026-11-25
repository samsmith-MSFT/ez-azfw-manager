import type { LayoutTier } from './tier';

export const LOG_DETAIL_PANEL_WIDTH = 20 * 16;
export const MIN_DOCKED_LOG_GRID_WIDTH = 560;

/** A details drawer may dock only when the remaining grid keeps every readable column. */
export function canDockLogDetails(
  tier: LayoutTier,
  availableWidth: number,
): boolean {
  return (
    tier !== 'compact' &&
    tier !== 'narrow' &&
    availableWidth >= LOG_DETAIL_PANEL_WIDTH + MIN_DOCKED_LOG_GRID_WIDTH
  );
}
