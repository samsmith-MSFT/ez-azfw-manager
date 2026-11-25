const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);

function usage() {
  console.log(`Electron layout regression runner

Usage:
  npm run check:layout [-- --view VIEW] [--size 1100x680] [--zoom 200]

Options:
  --assert             Exit nonzero when guard-rail findings are present
  --report, --baseline Capture and report findings without failing (default)
  --view ID            Run one named view; use --list-views for IDs
  --size WIDTHxHEIGHT  Run sizes from the plan matching this content size
  --zoom PERCENT       Run zooms from the plan matching this value (200 or 2)
  --skip-screenshots   Do not save PNG files
  --list-views         Print available view IDs
  --help               Show this help

Linux without a graphical session:
  xvfb-run -a npm run check:layout
`);
}

if (args.includes('--help')) {
  usage();
  process.exit(0);
}

if (
  process.platform === 'linux' &&
  !process.env.DISPLAY &&
  !process.env.WAYLAND_DISPLAY
) {
  console.error(
    '[layout] No Linux display was found. Run from a graphical X11/Wayland session or use `xvfb-run -a npm run check:layout` (no second monitor is required).',
  );
  process.exit(1);
}

const outputDir = path.join(ROOT, 'out', 'layout-check');
fs.mkdirSync(outputDir, { recursive: true });

const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const build = spawnSync(
  process.execPath,
  [
    vite,
    'build',
    '--config',
    'vite.renderer.config.mts',
    '--base',
    './',
    '--outDir',
    'out/layout-check/renderer',
    '--emptyOutDir',
  ],
  {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  },
);
if (build.error) {
  console.error(
    `[layout] Could not build the renderer: ${build.error.message}`,
  );
  process.exit(1);
}
if (build.status !== 0) process.exit(build.status ?? 1);

const electron = require('electron');
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const displayFlags =
  process.platform === 'linux' &&
  !process.env.DISPLAY &&
  process.env.WAYLAND_DISPLAY
    ? ['--ozone-platform=wayland']
    : [];
const runner = spawnSync(
  electron,
  [...displayFlags, path.join(__dirname, 'main.cjs'), ...args],
  { cwd: ROOT, env, stdio: 'inherit' },
);
if (runner.error) {
  console.error(`[layout] Could not launch Electron: ${runner.error.message}`);
  process.exit(1);
}
process.exit(runner.status ?? 1);
