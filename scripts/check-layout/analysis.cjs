function analyzeLayout() {
  const document = globalThis.document;
  const win = globalThis;
  const dialogs = [...document.querySelectorAll('[role="dialog"]')];
  const dialog = dialogs.at(-1);
  const scope = dialog ?? document.body;

  const rounded = (value) => Math.round(value * 100) / 100;
  const compact = (text) => text.replace(/\s+/g, ' ').trim().slice(0, 180);
  const selectorOf = (element) => {
    if (!(element instanceof win.HTMLElement)) return '';
    if (element.id) return `#${globalThis.CSS.escape(element.id)}`;
    const classes = [...element.classList]
      .filter((name) => !name.includes('/') && !name.startsWith('animate-'))
      .slice(0, 3)
      .join('.');
    return `${element.tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
  };
  const styleOf = (element) => globalThis.getComputedStyle(element);
  const visible = (element) => {
    if (!(element instanceof win.HTMLElement)) return false;
    if (element.closest('[aria-hidden="true"]')) return false;
    const style = styleOf(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      Number(style.opacity) === 0
    )
      return false;
    return element.getClientRects().length > 0;
  };
  const inScope = (element) => !scope || scope.contains(element);
  const rangeOf = (node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()]
      .filter((rect) => rect.width > 0.1 && rect.height > 0.1)
      .map((rect) => ({
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }));
  };
  const union = (rects) => {
    if (!rects.length) return null;
    return {
      left: Math.min(...rects.map((rect) => rect.left)),
      right: Math.max(...rects.map((rect) => rect.right)),
      top: Math.min(...rects.map((rect) => rect.top)),
      bottom: Math.max(...rects.map((rect) => rect.bottom)),
      width: 0,
      height: 0,
    };
  };
  const hasOverflow = (value) =>
    value === 'hidden' ||
    value === 'clip' ||
    value === 'auto' ||
    value === 'scroll';
  const clippingAncestor = (element) => {
    let current = element;
    while (current && current !== scope) {
      const style = styleOf(current);
      if (hasOverflow(style.overflowX) || hasOverflow(style.overflowY)) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };
  const ellipsized = (element) => {
    let current = element;
    while (current && current !== scope) {
      const style = styleOf(current);
      if (
        style.textOverflow === 'ellipsis' ||
        current.classList.contains('truncate')
      )
        return true;
      current = current.parentElement;
    }
    return false;
  };
  const clippedBy = (element) => {
    let current = element;
    while (current && current !== scope) {
      const style = styleOf(current);
      if (style.overflowX === 'hidden' || style.overflowX === 'clip')
        return { element: current, axis: 'x' };
      if (style.overflowY === 'hidden' || style.overflowY === 'clip')
        return { element: current, axis: 'y' };
      current = current.parentElement;
    }
    return null;
  };
  const rectOutside = (inner, outer, tolerance = 1) =>
    inner.left < outer.left - tolerance ||
    inner.right > outer.right + tolerance ||
    inner.top < outer.top - tolerance ||
    inner.bottom > outer.bottom + tolerance;
  const resultList = (items, limit = 50) => ({
    count: items.length,
    items: items.slice(0, limit),
  });
  const unique = (items, keyOf) => {
    const seen = new Set();
    return items.filter((item) => {
      const key = keyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const walker = document.createTreeWalker(scope, win.NodeFilter.SHOW_TEXT);
  const textRuns = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = compact(node.nodeValue ?? '');
    const element = node.parentElement;
    if (!text || !element || !inScope(element) || !visible(element)) continue;
    if (element.closest('script, style, noscript, svg')) continue;
    const rects = rangeOf(node);
    if (!rects.length) continue;
    const bounds = union(rects);
    const style = styleOf(element);
    const viewRects = rects.flatMap((rect) => {
      let left = Math.max(rect.left, 0);
      let right = Math.min(rect.right, win.innerWidth);
      let top = Math.max(rect.top, 0);
      let bottom = Math.min(rect.bottom, win.innerHeight);
      let ancestor = element;
      while (ancestor && ancestor !== scope.parentElement) {
        const overflow = styleOf(ancestor);
        if (
          hasOverflow(overflow.overflowX) ||
          hasOverflow(overflow.overflowY)
        ) {
          const clip = ancestor.getBoundingClientRect();
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
          top = Math.max(top, clip.top);
          bottom = Math.min(bottom, clip.bottom);
        }
        if (ancestor === scope) break;
        ancestor = ancestor.parentElement;
      }
      return right - left > 0.1 && bottom - top > 0.1
        ? [
            {
              left,
              right,
              top,
              bottom,
              width: right - left,
              height: bottom - top,
            },
          ]
        : [];
    });
    textRuns.push({
      element,
      text,
      rects,
      viewRects,
      bounds,
      style,
      fontSize: Number.parseFloat(style.fontSize),
      ellipsis: ellipsized(element),
      clipped: clippedBy(element),
      selector: selectorOf(element),
    });
  }

  const clippings = [];
  const truncations = [];
  const truncatedElements = new Set();
  for (const run of textRuns) {
    const own = run.element.getBoundingClientRect();
    const ownStyle = run.style;
    const ownScroll =
      run.element.scrollWidth > run.element.clientWidth + 1 ||
      run.element.scrollHeight > run.element.clientHeight + 1;
    const ancestor = run.clipped;
    const ancestorRect = ancestor?.element.getBoundingClientRect();
    const outsideOwn = rectOutside(run.bounds, own);
    const outsideAncestor =
      !!ancestorRect && rectOutside(run.bounds, ancestorRect);
    const actuallyClipped = ownScroll || outsideOwn || outsideAncestor;
    const isTruncation =
      (run.ellipsis && actuallyClipped) ||
      (!!ancestor && actuallyClipped) ||
      (ownScroll &&
        ['hidden', 'clip', 'auto', 'scroll'].includes(ownStyle.overflowX)) ||
      (ownScroll && ['hidden', 'clip'].includes(ownStyle.overflowY));
    if (isTruncation) {
      truncatedElements.add(run.element);
      truncations.push({
        selector: run.selector,
        text: run.text,
        reason: run.ellipsis
          ? 'ellipsis'
          : ancestor
            ? `${ancestor.axis}-overflow-${styleOf(ancestor.element)[`overflow${ancestor.axis.toUpperCase()}`]}`
            : 'overflow-hidden',
        width: rounded(own.width),
        height: rounded(own.height),
        scrollWidth: run.element.scrollWidth,
        scrollHeight: run.element.scrollHeight,
      });
    } else if (outsideOwn) {
      clippings.push({
        selector: run.selector,
        text: run.text,
        reason: 'text-outside-element-box',
        width: rounded(own.width),
        height: rounded(own.height),
      });
    }
  }

  const overlaps = [];
  const overlapRuns = textRuns.filter(
    (run) => !truncatedElements.has(run.element) && run.viewRects.length,
  );
  for (let i = 0; i < overlapRuns.length; i += 1) {
    const first = overlapRuns[i];
    for (let j = i + 1; j < overlapRuns.length; j += 1) {
      const second = overlapRuns[j];
      if (first.element === second.element) continue;
      if (
        first.element.contains(second.element) ||
        second.element.contains(first.element)
      )
        continue;
      let best = 0;
      for (const a of first.viewRects) {
        for (const b of second.viewRects) {
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (width > 0.75 && height > 0.75) {
            const area = width * height;
            const smaller = Math.min(a.width * a.height, b.width * b.height);
            best = Math.max(best, smaller ? area / smaller : 0);
          }
        }
      }
      if (best >= 0.08) {
        overlaps.push({
          first: { selector: first.selector, text: first.text },
          second: { selector: second.selector, text: second.text },
          overlapRatio: rounded(best),
        });
      }
    }
  }

  const documentOverflow = {
    horizontal: document.documentElement.scrollWidth > win.innerWidth + 1,
    vertical: document.documentElement.scrollHeight > win.innerHeight + 1,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight,
  };
  const horizontalOverflow = [];
  const verticalOverflow = [];
  const overflowElements = [...scope.querySelectorAll('*')].filter(visible);
  for (const element of overflowElements) {
    const style = styleOf(element);
    const horizontal = element.scrollWidth > element.clientWidth + 2;
    const vertical = element.scrollHeight > element.clientHeight + 2;
    const xScroll = style.overflowX === 'auto' || style.overflowX === 'scroll';
    const yScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
    if (horizontal) {
      if (style.overflowX === 'hidden' || style.overflowX === 'clip') continue;
      const scrollAncestor = element.parentElement
        ? clippingAncestor(element.parentElement)
        : null;
      if (scrollAncestor && !element.matches('table')) continue;
      horizontalOverflow.push({
        selector: selectorOf(element),
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        expectedScroll: xScroll,
      });
    }
    if (vertical) {
      if (style.overflowY === 'hidden' || style.overflowY === 'clip') continue;
      const scrollAncestor = element.parentElement
        ? clippingAncestor(element.parentElement)
        : null;
      if (scrollAncestor) continue;
      verticalOverflow.push({
        selector: selectorOf(element),
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        expectedScroll: yScroll,
      });
    }
  }

  const fixedDataCells = [];
  const logGrid = scope.querySelector(
    '[role="grid"][aria-label="Firewall log rows"]',
  );
  if (logGrid) {
    const header = logGrid.querySelector('[role="row"]');
    const labels = [
      ...(header?.querySelectorAll('[role="columnheader"]') ?? []),
    ].map((cell) => compact(cell.textContent ?? ''));
    const minimums = {
      Time: 96,
      Category: 104,
      Proto: 64,
      Source: 176,
      Destination: 176,
      Port: 64,
      Action: 88,
      'Rule info': 160,
    };
    const rows = [
      ...logGrid.querySelectorAll('[role="row"][data-row-id]'),
    ].slice(0, 5);
    for (const row of rows) {
      [...row.querySelectorAll('[role="gridcell"]')].forEach((cell, index) => {
        const name = labels[index] ?? `Column ${index + 1}`;
        if (!(name in minimums)) return;
        const rect = cell.getBoundingClientRect();
        if (rect.width <= 0.5 || !cell.getClientRects().length) return;
        const textWidth = cell.scrollWidth;
        const minimumWidth = minimums[name];
        fixedDataCells.push({
          name,
          selector: selectorOf(cell),
          text: compact(cell.textContent ?? ''),
          width: rounded(rect.width),
          scrollWidth: textWidth,
          minimumWidth,
          belowMinimum: !!minimumWidth && rect.width + 0.5 < minimumWidth,
          truncated: textWidth > Math.ceil(rect.width),
        });
      });
    }
  }

  const largeDisplayMaximumGap = 400;
  const largeDisplayMeasurements = [];
  const largeDisplayChecked = win.innerWidth >= 1920;
  if (largeDisplayChecked) {
    // Table identity columns are a conservative proxy for the gap from a Name to its
    // neighbouring data. The ultrawide allocation caps them at 24rem (384px).
    for (const table of scope.querySelectorAll('table')) {
      const headers = [...table.querySelectorAll('thead th')];
      const nameIndex = headers.findIndex(
        (header) => compact(header.textContent ?? '') === 'Name',
      );
      if (nameIndex < 0) continue;
      const header = headers[nameIndex];
      const region = table.closest('[role="region"][aria-label]');
      const label = region?.getAttribute('aria-label') ?? selectorOf(table);
      if (
        !['Firewalls table', 'Policies table', 'Policy rules table'].includes(
          label,
        )
      )
        continue;
      const gap = header.getBoundingClientRect().width;
      largeDisplayMeasurements.push({
        kind: 'identity-column',
        label: `${label}: Name`,
        selector: selectorOf(header),
        gap: rounded(gap),
        maximum: largeDisplayMaximumGap,
      });
    }

    // Logs do not have a Name column. Measure the actual white space from the end
    // of Source/Destination text to the next column; this catches the thousands of
    // empty pixels that a flexible grid otherwise introduces on a 32:9 panel.
    if (logGrid) {
      const header = logGrid.querySelector('[role="row"]');
      const labels = [
        ...(header?.querySelectorAll('[role="columnheader"]') ?? []),
      ].map((cell) => compact(cell.textContent ?? ''));
      const rows = [...logGrid.querySelectorAll('[data-row-id]')].slice(0, 5);
      for (const [rowIndex, row] of rows.entries()) {
        const cells = [...row.querySelectorAll('[role="gridcell"]')];
        for (const sourceName of ['Source', 'Destination']) {
          const sourceIndex = labels.indexOf(sourceName);
          const source = cells[sourceIndex];
          const next = cells[sourceIndex + 1];
          if (!source || !next) continue;
          const runs = textRuns.filter(
            (run) => source === run.element || source.contains(run.element),
          );
          const right = Math.max(
            ...runs.flatMap((run) => run.rects.map((rect) => rect.right)),
          );
          if (!Number.isFinite(right)) continue;
          const sourceRect = source.getBoundingClientRect();
          const nextRect = next.getBoundingClientRect();
          const visibleTextRight = Math.min(right, sourceRect.right);
          const gap = Math.max(0, nextRect.left - visibleTextRight);
          largeDisplayMeasurements.push({
            kind: 'text-to-next-column',
            label: `Firewall logs row ${rowIndex + 1}: ${sourceName} to ${labels[sourceIndex + 1]}`,
            selector: selectorOf(source),
            gap: rounded(gap),
            maximum: largeDisplayMaximumGap,
          });
        }
      }
    }
  }
  const largeDisplayGaps = largeDisplayMeasurements.filter(
    (item) => item.gap > item.maximum,
  );

  const smallText = [];
  for (const run of textRuns) {
    if (run.fontSize + 0.01 < 12) {
      smallText.push({
        selector: run.selector,
        text: run.text,
        fontSize: rounded(run.fontSize),
      });
    }
  }

  const smallTargets = [];
  const exemptInlineTargets = [];
  const interactive = scope.querySelectorAll(
    'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
  );
  for (const element of interactive) {
    if (!visible(element) || element.disabled) continue;
    const target =
      element instanceof win.HTMLInputElement &&
      ['checkbox', 'radio'].includes(element.type) &&
      element.closest('label')
        ? element.closest('label')
        : element;
    const rect = target.getBoundingClientRect();
    const item = {
      selector: selectorOf(element),
      label: compact(
        element.getAttribute('aria-label') ??
          element.textContent ??
          element.value ??
          '',
      ),
      width: rounded(rect.width),
      height: rounded(rect.height),
    };
    const inlineExemption =
      element.tagName === 'A' && styleOf(element).display === 'inline';
    if (rect.width + 0.01 < 24 || rect.height + 0.01 < 24) {
      if (inlineExemption) exemptInlineTargets.push(item);
      else smallTargets.push(item);
    }
  }

  const parseColor = (value) => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) return [0, 0, 0, 0];
    const values = match[1]
      .split(',')
      .map((part) => Number.parseFloat(part.trim()));
    return [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0, values[3] ?? 1];
  };
  const blend = (top, bottom) => {
    const alpha = top[3] + bottom[3] * (1 - top[3]);
    if (alpha === 0) return [0, 0, 0, 0];
    return [
      (top[0] * top[3] + bottom[0] * bottom[3] * (1 - top[3])) / alpha,
      (top[1] * top[3] + bottom[1] * bottom[3] * (1 - top[3])) / alpha,
      (top[2] * top[3] + bottom[2] * bottom[3] * (1 - top[3])) / alpha,
      alpha,
    ];
  };
  const luminance = (color) => {
    const channel = (value) => {
      const v = value / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return (
      0.2126 * channel(color[0]) +
      0.7152 * channel(color[1]) +
      0.0722 * channel(color[2])
    );
  };
  const backgroundOf = (element) => {
    const layers = [];
    let current = element;
    while (current) {
      const color = parseColor(styleOf(current).backgroundColor);
      if (color[3] > 0) layers.push(color);
      current = current.parentElement;
    }
    let output = [15, 27, 45, 1];
    for (const layer of layers.reverse()) output = blend(layer, output);
    return output;
  };
  const contrast = [];
  for (const run of textRuns) {
    const foreground = parseColor(run.style.color);
    const background = backgroundOf(run.element);
    const effectiveForeground = blend(foreground, background);
    const light = Math.max(
      luminance(effectiveForeground),
      luminance(background),
    );
    const dark = Math.min(
      luminance(effectiveForeground),
      luminance(background),
    );
    const ratio = (light + 0.05) / (dark + 0.05);
    const large =
      run.fontSize >= 24 ||
      (run.fontSize >= 18.66 &&
        Number.parseInt(run.style.fontWeight, 10) >= 700);
    const required = large ? 3 : 4.5;
    if (ratio + 0.01 < required) {
      contrast.push({
        selector: run.selector,
        text: run.text,
        fontSize: rounded(run.fontSize),
        foreground: run.style.color,
        background: `rgba(${rounded(background[0])}, ${rounded(background[1])}, ${rounded(background[2])}, ${rounded(background[3])})`,
        ratio: rounded(ratio),
        required,
      });
    }
  }

  const uniqueOverlaps = unique(
    overlaps,
    (item) =>
      `${item.first.selector}|${item.first.text}|${item.second.selector}|${item.second.text}`,
  );
  const uniqueClippings = unique(
    clippings,
    (item) => `${item.selector}|${item.text}|${item.reason}`,
  );
  const uniqueTruncations = unique(
    truncations,
    (item) => `${item.selector}|${item.text}|${item.reason}`,
  );
  const uniqueSmallText = unique(
    smallText,
    (item) => `${item.selector}|${item.text}|${item.fontSize}`,
  );
  const uniqueTargets = unique(
    smallTargets,
    (item) => `${item.selector}|${item.label}|${item.width}|${item.height}`,
  );
  const uniqueExemptTargets = unique(
    exemptInlineTargets,
    (item) => `${item.selector}|${item.label}`,
  );
  const uniqueContrast = unique(
    contrast,
    (item) =>
      `${item.selector}|${item.text}|${item.foreground}|${item.background}`,
  );

  return {
    scope: dialog ? 'dialog' : 'page',
    textNodes: textRuns.length,
    overlaps: resultList(uniqueOverlaps),
    clippings: resultList(uniqueClippings),
    truncations: resultList(uniqueTruncations),
    overflow: {
      document: documentOverflow,
      horizontal: resultList(
        horizontalOverflow.filter((item) => !item.expectedScroll),
      ),
      expectedHorizontal: resultList(
        horizontalOverflow.filter((item) => item.expectedScroll),
      ),
      vertical: resultList(
        verticalOverflow.filter((item) => !item.expectedScroll),
      ),
      expectedVertical: resultList(
        verticalOverflow.filter((item) => item.expectedScroll),
      ),
    },
    fixedDataCells: unique(
      fixedDataCells,
      (item) => `${item.name}|${item.text}|${item.width}|${item.scrollWidth}`,
    ),
    largeDisplay: {
      checked: largeDisplayChecked,
      maximumGap: largeDisplayMaximumGap,
      measurements: largeDisplayMeasurements,
      gaps: resultList(largeDisplayGaps),
    },
    smallText: resultList(uniqueSmallText),
    smallTargets: resultList(uniqueTargets),
    exemptInlineTargets: resultList(uniqueExemptTargets),
    contrast: resultList(uniqueContrast),
  };
}

module.exports = { analyzeLayout };
