import { describe, expect, it } from 'vitest';
import { parseInlines, parseMarkdownLite } from './markdownLite';

describe('parseInlines', () => {
  it('splits bold, code and link text', () => {
    expect(
      parseInlines('A **bold** `code` and [a link](https://example.com) end'),
    ).toEqual([
      { kind: 'text', text: 'A ' },
      { kind: 'bold', text: 'bold' },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ' and ' },
      { kind: 'text', text: 'a link' },
      { kind: 'text', text: ' end' },
    ]);
  });

  it('leaves markup inside code alone and never produces HTML', () => {
    expect(parseInlines('`**x**` <img src=x onerror=alert(1)>')).toEqual([
      { kind: 'code', text: '**x**' },
      { kind: 'text', text: ' <img src=x onerror=alert(1)>' },
    ]);
  });
});

describe('parseMarkdownLite', () => {
  it('reads headings, bullets and paragraphs', () => {
    const blocks = parseMarkdownLite(
      '### Fixed\n\n- First\n- Second\n  continued\n\nA paragraph\nover two lines.\n',
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'bullet',
      'bullet',
      'paragraph',
    ]);
    expect(blocks[2]).toMatchObject({
      inlines: [
        { kind: 'text', text: 'Second' },
        { kind: 'text', text: ' ' },
        { kind: 'text', text: 'continued' },
      ],
    });
    expect(blocks[3]).toMatchObject({
      inlines: [{ kind: 'text', text: 'A paragraph over two lines.' }],
    });
  });

  it('returns nothing for empty notes', () => {
    expect(parseMarkdownLite('  \n\n')).toEqual([]);
  });
});
