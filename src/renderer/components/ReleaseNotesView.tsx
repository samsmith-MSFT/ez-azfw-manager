import type { Inline } from '../../shared/markdownLite';
import { parseMarkdownLite } from '../../shared/markdownLite';

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((item, i) =>
        item.kind === 'bold' ? (
          <strong key={i} className="font-semibold text-fg">
            {item.text}
          </strong>
        ) : item.kind === 'code' ? (
          <code key={i} className="bg-ink-800 px-1 text-[0.85em] text-fg">
            {item.text}
          </code>
        ) : (
          <span key={i}>{item.text}</span>
        ),
      )}
    </>
  );
}

/** Release notes written in Markdown, shown as plain styled text (no HTML, no links). */
export function ReleaseNotesView({ notes }: { notes: string }) {
  const blocks = parseMarkdownLite(notes);
  if (!blocks.length)
    return (
      <p className="text-sm text-fg-faint">
        No notes were published for this release.
      </p>
    );
  return (
    <div className="space-y-1.5 text-sm text-fg-muted">
      {blocks.map((b, i) =>
        b.kind === 'heading' ? (
          <h4
            key={i}
            className="pt-2 text-xs font-semibold uppercase tracking-wide text-fg"
          >
            <Inlines items={b.inlines} />
          </h4>
        ) : b.kind === 'bullet' ? (
          <p key={i} className="flex gap-2 break-words">
            <span aria-hidden className="text-fg-faint">
              •
            </span>
            <span className="min-w-0">
              <Inlines items={b.inlines} />
            </span>
          </p>
        ) : (
          <p key={i} className="break-words">
            <Inlines items={b.inlines} />
          </p>
        ),
      )}
    </div>
  );
}
