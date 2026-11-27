import { useSyncExternalStore } from 'react';

export type LayoutTier =
  | 'compact'
  | 'narrow'
  | 'regular'
  | 'wide'
  | 'ultrawide';

export function tierForWidth(width: number): LayoutTier {
  if (width < 720) return 'compact';
  if (width < 1024) return 'narrow';
  if (width < 1680) return 'regular';
  if (width < 2400) return 'wide';
  return 'ultrawide';
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
}

/** Current CSS-pixel width tier; zoom and display scaling therefore compose naturally. */
export function useTier(): LayoutTier {
  return useSyncExternalStore(
    subscribe,
    () => tierForWidth(window.innerWidth),
    () => 'regular',
  );
}
