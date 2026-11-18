// A deliberately small Markdown reader for release notes: headings, bullets, paragraphs, bold and
// code. Links keep their text only. The result is plain data rendered as React text, never HTML.

export interface Inline {
  kind: 'text' | 'bold' | 'code';
  text: string;
}

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'bullet'; inlines: Inline[] }
  | { kind: 'paragraph'; inlines: Inline[] };

export function parseInlines(text: string): Inline[] {
  const out: Inline[] = [];
  // Order matters: a code span first so ** inside it stays literal, then bold, then links.
  const token = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\([^)\s]*\)/g;
  let last = 0;
  for (const m of text.matchAll(token)) {
    if (m.index > last)
      out.push({ kind: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'bold', text: m[2] });
    else out.push({ kind: 'text', text: m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

export function parseMarkdownLite(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({
        kind: 'paragraph',
        inlines: parseInlines(paragraph.join(' ')),
      });
    paragraph = [];
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: Math.min(heading[1].length, 3) as 1 | 2 | 3,
        inlines: parseInlines(heading[2]),
      });
    } else if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', inlines: parseInlines(bullet[1]) });
    } else if (
      /^\s/.test(raw) &&
      blocks.at(-1)?.kind === 'bullet' &&
      !paragraph.length
    ) {
      // An indented continuation of the previous bullet.
      const prev = blocks.at(-1) as Extract<Block, { kind: 'bullet' }>;
      prev.inlines.push({ kind: 'text', text: ' ' }, ...parseInlines(line));
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
