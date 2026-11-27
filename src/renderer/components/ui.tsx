import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Keeps a data view readable on large displays without centring it away from the navigation.
 * The wider logs variant leaves room for the docked details panel and the useful live-grid columns.
 */
export function PageFrame({
  as: Component = 'div',
  children,
  className = '',
  variant = 'standard',
}: {
  as?: 'div' | 'section';
  children: ReactNode;
  className?: string;
  variant?: 'standard' | 'logs';
}) {
  return (
    <Component
      data-page-frame={variant}
      className={`flex h-full min-h-0 w-full min-w-0 flex-col overflow-y-auto ${variant === 'logs' ? 'max-w-[140rem]' : 'max-w-[120rem]'} ${className}`}
    >
      {children}
    </Component>
  );
}

/** Responsive <col> widths: minimum at normal sizes, balanced allocation in the ultrawide frame. */
export function TableColumns({
  widths,
  ultrawideWidths = widths,
}: {
  widths: readonly number[];
  ultrawideWidths?: readonly number[];
}) {
  return (
    <colgroup>
      {widths.map((width, index) => (
        <col
          key={index}
          className="w-[var(--column-width)] ultra:w-[var(--ultrawide-column-width)]"
          style={
            {
              '--column-width': `${width}rem`,
              '--ultrawide-column-width': `${ultrawideWidths[index] ?? width}rem`,
            } as CSSProperties
          }
        />
      ))}
    </colgroup>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-3 border-b border-line px-4 pb-4 pt-5 narrow:px-6">
      <div className="min-w-0 flex-[1_1_16rem]">
        <div className="min-w-0 [overflow-wrap:anywhere]">{title}</div>
        {subtitle && (
          <div className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">
            {subtitle}
          </div>
        )}
      </div>
      {actions && (
        <div className="flex max-w-full flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </header>
  );
}

export function Spinner({
  label,
  size = 16,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-fg-muted">
      <Loader2 size={size} className="animate-spin text-azure" />
      {label}
    </span>
  );
}

const TONES = {
  neutral: 'border-line text-fg-muted',
  blue: 'border-azure/50 text-azure',
  green: 'border-allow/50 text-allow',
  // Amber is reserved for uncommitted changes.
  candidate: 'border-candidate/60 text-candidate',
  red: 'border-deny/50 text-deny',
  violet: 'border-dnat/50 text-dnat',
};

/** A small outlined tag; color carries meaning, never decoration. */
export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: keyof typeof TONES;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/** Text that truncates with an ellipsis and shows the full value on hover. */
export function Truncate({
  children,
  className = '',
}: {
  children: string;
  className?: string;
}) {
  return (
    <span className={`block truncate ${className}`} title={children}>
      {children}
    </span>
  );
}

/** IP Group references are full resource IDs; show just the name. */
function shortenId(v: string): string {
  return v.startsWith('/subscriptions/') ? (v.split('/').at(-1) ?? v) : v;
}

/** Network values stacked one per line; overflow collapses to "+N more" with the rest in a tooltip. */
export function ValueList({
  values,
  max = 3,
  empty = 'Any',
}: {
  values?: string[];
  max?: number;
  empty?: string;
}) {
  if (!values?.length) return <span className="text-fg-faint">{empty}</span>;
  const shown = values.slice(0, max);
  const rest = values.slice(max);
  return (
    <span className="flex min-w-0 flex-col">
      {shown.map((v) => (
        <span key={v} className="netval truncate" title={v}>
          {shortenId(v)}
        </span>
      ))}
      {rest.length > 0 && (
        <span
          className="text-xs text-fg-faint"
          title={rest.map(shortenId).join('\n')}
        >
          +{rest.length} more
        </span>
      )}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex max-w-lg gap-4 px-8 py-12">
      <div className="mt-0.5 text-fg-faint">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold text-fg">{title}</h3>
        {children && (
          <div className="mt-1 text-sm text-fg-muted">{children}</div>
        )}
      </div>
    </div>
  );
}

/** Status light for provisioning state. */
export function StatusDot({ state }: { state?: string }) {
  const tone =
    state === 'Succeeded'
      ? 'bg-allow'
      : state === 'Failed'
        ? 'bg-deny'
        : 'bg-fg-faint';
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`}
      title={`Provisioning state: ${state ?? 'unknown'}`}
      aria-label={`Provisioning state: ${state ?? 'unknown'}`}
    />
  );
}

/** A full-width message panel: what happened, in plain words, plus the next step. */
export function Notice({
  tone,
  title,
  children,
  action,
}: {
  tone: 'error' | 'info';
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`border-l-2 p-4 text-sm ${tone === 'error' ? 'border-deny bg-deny/10' : 'border-azure bg-azure/[0.08]'}`}
    >
      <p className="font-semibold text-fg">{title}</p>
      {children && (
        <div className="mt-1 whitespace-pre-line break-words text-fg-muted">
          {children}
        </div>
      )}
      {action && <div className="mt-3 flex gap-2">{action}</div>}
    </div>
  );
}
