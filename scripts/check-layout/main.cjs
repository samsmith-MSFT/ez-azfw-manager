const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, session } = require('electron');
const { analyzeLayout } = require('./analysis.cjs');
const { VIEWPORT_MATRIX, rowKey } = require('./matrix.cjs');
const { SCENARIOS, prepareScenario } = require('./scenarios.cjs');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT_DIR = path.join(ROOT, 'out', 'layout-check');
const RENDERER_DIR = path.join(OUTPUT_DIR, 'renderer');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');
const RESULT_PATH = path.join(OUTPUT_DIR, 'results.json');

function valueAfter(name, args) {
  const index = args.findIndex(
    (arg) => arg === name || arg.startsWith(`${name}=`),
  );
  if (index < 0) return undefined;
  if (args[index].includes('=')) return args[index].slice(name.length + 1);
  return args[index + 1];
}

function zoomNumber(value) {
  if (value === undefined) return undefined;
  const clean = value.trim().replace(/%$/, '');
  const number = Number(clean);
  if (!Number.isFinite(number)) throw new Error(`Invalid zoom value: ${value}`);
  return number <= 4 ? Math.round(number * 100) : Math.round(number);
}

function parseOptions(args) {
  const view = valueAfter('--view', args);
  const size = valueAfter('--size', args);
  const zoom = zoomNumber(valueAfter('--zoom', args));
  if (view && !SCENARIOS.some((scenario) => scenario.id === view)) {
    throw new Error(`Unknown view "${view}". Use --list-views to see choices.`);
  }
  const sizeMatch = size?.match(/^(\d+)x(\d+)$/i);
  if (size && !sizeMatch)
    throw new Error(
      `Invalid --size "${size}"; expected WIDTHxHEIGHT, for example 1100x680.`,
    );
  return {
    assert: args.includes('--assert'),
    report: args.includes('--report') || args.includes('--baseline'),
    screenshots: !args.includes('--skip-screenshots'),
    view,
    size: sizeMatch
      ? { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
      : undefined,
    zoom,
  };
}

function chooseRows(options) {
  let rows = VIEWPORT_MATRIX;
  if (options.size) {
    rows = rows.filter(
      (row) =>
        row.width === options.size.width && row.height === options.size.height,
    );
  }
  if (options.zoom !== undefined)
    rows = rows.filter((row) => row.zoom === options.zoom);
  if (!rows.length) {
    throw new Error(
      `No matrix row matches ${options.size ? `${options.size.width}x${options.size.height}` : 'any size'}${options.zoom ? ` at ${options.zoom}%` : ''}.`,
    );
  }
  return rows;
}

async function settleViewport(webContents, expected) {
  const cssWidth = expected.width / (expected.zoom / 100);
  const cssHeight = expected.height / (expected.zoom / 100);
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const actual = await webContents.executeJavaScript(`({
      width: globalThis.innerWidth,
      height: globalThis.innerHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
    })`);
    if (
      Math.abs(actual.width - cssWidth) <= 2 &&
      Math.abs(actual.height - cssHeight) <= 2
    ) {
      await webContents.executeJavaScript(
        `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      );
      return actual;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Electron viewport did not settle for ${rowKey(expected)}.`);
}

function findingCounts(findings) {
  const fixedProblems = findings.fixedDataCells.filter(
    (cell) =>
      cell.belowMinimum ||
      ((cell.name === 'Time' || cell.name === 'Port') && cell.truncated),
  ).length;
  return {
    overlaps: findings.overlaps.count,
    clippings: findings.clippings.count,
    pageOverflow:
      Number(findings.overflow.document.horizontal) +
      Number(findings.overflow.document.vertical),
    overflowElements:
      findings.overflow.horizontal.count + findings.overflow.vertical.count,
    fixedCells: fixedProblems,
    largeDisplayGaps: findings.largeDisplay.gaps.count,
    smallText: findings.smallText.count,
    smallTargets: findings.smallTargets.count,
    contrast: findings.contrast.count,
    truncations: findings.truncations.count,
    expectedHorizontal: findings.overflow.expectedHorizontal.count,
    expectedVertical: findings.overflow.expectedVertical.count,
  };
}

function assertionCount(counts, zoomMismatch) {
  return (
    counts.overlaps +
    counts.clippings +
    counts.pageOverflow +
    counts.overflowElements +
    counts.fixedCells +
    counts.largeDisplayGaps +
    counts.smallText +
    counts.smallTargets +
    counts.contrast +
    Number(zoomMismatch)
  );
}

function aggregateScenario(results) {
  const totals = {};
  for (const result of results) {
    for (const [name, value] of Object.entries(result.counts))
      totals[name] = (totals[name] ?? 0) + value;
  }
  return totals;
}

function printScenario(scenario, results) {
  const totals = aggregateScenario(results);
  console.log(
    `[layout] ${scenario.id.padEnd(20)} ${String(results.length).padStart(2)} runs | overlap ${totals.overlaps ?? 0}, clip ${totals.clippings ?? 0}/${totals.truncations ?? 0}, overflow ${totals.pageOverflow ?? 0}+${totals.overflowElements ?? 0}, fixed ${totals.fixedCells ?? 0}, large gaps ${totals.largeDisplayGaps ?? 0}, text ${totals.smallText ?? 0}, targets ${totals.smallTargets ?? 0}, contrast ${totals.contrast ?? 0}`,
  );
}

async function run() {
  const args = process.argv.slice(2);
  if (args.includes('--list-views')) {
    console.log(SCENARIOS.map((scenario) => scenario.id).join('\n'));
    return { exitCode: 0 };
  }
  const options = parseOptions(args);
  const rows = chooseRows(options);
  const scenarios = options.view
    ? SCENARIOS.filter((scenario) => scenario.id === options.view)
    : SCENARIOS;

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  for (const entry of fs.readdirSync(SCREENSHOT_DIR))
    fs.rmSync(path.join(SCREENSHOT_DIR, entry), {
      recursive: true,
      force: true,
    });

  await app.whenReady();
  session.defaultSession.setPermissionRequestHandler(
    (_details, permission, callback) => {
      callback(permission === 'clipboard-sanitized-write');
    },
  );
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (_details, callback) => callback({ cancel: true }),
  );

  const first = rows[0];
  const mainWindow = new BrowserWindow({
    width: first.width,
    height: first.height,
    useContentSize: true,
    show: false,
    backgroundColor: '#0F1B2D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: false,
      backgroundThrottling: false,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });

  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    mode: options.assert ? 'assert' : 'report',
    electron: process.versions.electron,
    chromium: process.versions.chrome,
    security: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      useContentSize: true,
    },
    matrix: rows,
    scenarios,
    results: [],
  };

  try {
    for (const scenario of scenarios) {
      const scenarioRows = rows.filter(
        (row) =>
          scenario.maxCssWidth === undefined ||
          row.width / (row.zoom / 100) <= scenario.maxCssWidth,
      );
      if (!scenarioRows.length) continue;
      mainWindow.setContentSize(scenarioRows[0].width, scenarioRows[0].height);
      mainWindow.webContents.setZoomFactor(scenarioRows[0].zoom / 100);
      await prepareScenario(
        mainWindow.webContents,
        RENDERER_DIR,
        scenario,
        scenarioRows[0],
      );
      const scenarioResults = [];
      for (const row of scenarioRows) {
        mainWindow.setContentSize(row.width, row.height);
        mainWindow.webContents.setZoomFactor(row.zoom / 100);
        const cssViewport = await settleViewport(mainWindow.webContents, row);
        const actualContentSize = mainWindow.getContentSize();
        const expectedWidth = row.width / (row.zoom / 100);
        const expectedHeight = row.height / (row.zoom / 100);
        const zoomMismatch =
          Math.abs(mainWindow.webContents.getZoomFactor() - row.zoom / 100) >
            0.005 ||
          Math.abs(cssViewport.width - expectedWidth) > 2 ||
          Math.abs(cssViewport.height - expectedHeight) > 2 ||
          Math.abs(actualContentSize[0] - row.width) > 1 ||
          Math.abs(actualContentSize[1] - row.height) > 1;
        const findings = await mainWindow.webContents.executeJavaScript(
          `(${analyzeLayout.toString()})()`,
        );
        const counts = findingCounts(findings);
        const screenshotName = `${scenario.id}__${String(row.width).padStart(4, '0')}x${String(row.height).padStart(4, '0')}__${row.zoom}.png`;
        let screenshot;
        if (options.screenshots) {
          const image = await mainWindow.webContents.capturePage();
          screenshot = path.relative(
            OUTPUT_DIR,
            path.join(SCREENSHOT_DIR, screenshotName),
          );
          fs.writeFileSync(
            path.join(SCREENSHOT_DIR, screenshotName),
            image.toPNG(),
          );
        }
        scenarioResults.push({
          scenario: scenario.id,
          requested: row,
          measured: {
            contentSize: actualContentSize,
            zoomFactor: mainWindow.webContents.getZoomFactor(),
            cssViewport,
          },
          screenshot,
          zoomMismatch,
          counts,
          assertionCount: assertionCount(counts, zoomMismatch),
          findings,
        });
      }
      report.results.push(...scenarioResults);
      printScenario(scenario, scenarioResults);
      fs.writeFileSync(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    }
  } finally {
    mainWindow.destroy();
  }

  const regressions = report.results.reduce(
    (total, result) => total + result.assertionCount,
    0,
  );
  fs.writeFileSync(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `[layout] ${report.results.length} scenarios captured in ${RESULT_PATH}${options.assert ? `; ${regressions} assertion findings` : '; report mode (findings do not fail the command)'}`,
  );
  return { exitCode: options.assert && regressions > 0 ? 1 : 0 };
}

app.setPath('userData', path.join(OUTPUT_DIR, 'electron-user-data'));
app
  .whenReady()
  .then(run)
  .then(({ exitCode }) => app.exit(exitCode))
  .catch((error) => {
    console.error(`[layout] ${error.stack ?? error.message}`);
    app.exit(2);
  });
