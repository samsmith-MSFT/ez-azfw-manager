import type { ReactNode, Ref } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Logo } from './Logo';
import { UpdateButton } from './UpdateButton';
import { useTier } from '../tier';

const isMac = navigator.userAgent.includes('Mac OS');
// Width of the Windows/Linux min/max/close overlay, used if the browser doesn't report it.
const CONTROLS_FALLBACK =
  !isMac && navigator.userAgent.includes('Electron') ? '138px' : '0px';

/**
 * Custom window title bar. The whole bar drags the window; the native window controls are
 * drawn by the OS (titleBarOverlay) on the right, or as traffic lights on macOS.
 */
export function TitleBar({
  bladeOpen,
  onToggleBlade,
  toggleRef,
  actions,
}: {
  bladeOpen?: boolean;
  onToggleBlade?: () => void;
  toggleRef?: Ref<HTMLButtonElement>;
  /** Right-aligned controls (e.g. the activity bell), kept clear of the window controls. The update button always comes first. */
  actions?: ReactNode;
}) {
  const tier = useTier();
  const compact = tier === 'compact';
  return (
    <header className="drag flex h-9 shrink-0 items-center border-b border-line bg-ink-950">
      {/* Keep the title first in the DOM because Electron derives drag regions from box order. */}
      <div
        className={`pointer-events-none flex min-w-0 flex-1 items-center gap-2 px-2 ${isMac && !onToggleBlade ? 'ml-[76px]' : ''}`}
      >
        <Logo size={16} />
        {!compact && (
          <span className="min-w-0 truncate text-sm font-semibold text-fg">
            EZ AzFW Manager
          </span>
        )}
      </div>
      {onToggleBlade && (
        <button
          ref={toggleRef}
          type="button"
          onClick={onToggleBlade}
          aria-label={bladeOpen ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={bladeOpen}
          title={bladeOpen ? 'Collapse navigation' : 'Expand navigation'}
          className={`no-drag order-first flex h-9 w-[52px] shrink-0 items-center justify-center text-fg-muted hover:bg-ink-800 hover:text-fg ${isMac ? 'ml-[76px]' : ''}`}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      <div
        className="relative flex shrink-0 items-center"
        // Space taken by the OS window controls on the right (0 on macOS and in a browser).
        style={{
          marginRight: `max(${CONTROLS_FALLBACK}, calc(100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)))`,
        }}
      >
        <UpdateButton compact={compact} />
        {actions}
      </div>
    </header>
  );
}
