// EZ AzFW Manager — main process entry point.
// Must be first: pins the data folder before other modules read it.
import './main/userData';
import { app, BrowserWindow, dialog, Menu, screen, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerIpc } from './main/ipc';
import { candidate } from './main/candidate';
import {
  defaultWindowBounds,
  minimumWindowSize,
  parseWindowState,
  restoreWindowBounds,
  type PersistedWindowState,
} from './main/windowState';
import { createZoomController, type ZoomController } from './main/zoom';
import { IPC } from './shared/ipc';
import {
  APP_ORIGIN,
  isAppUrl,
  registerAppScheme,
  serveAppFiles,
} from './main/appProtocol';

let mainWindow: BrowserWindow | undefined;
let zoom: ZoomController | undefined;
let windowStateTimer: NodeJS.Timeout | undefined;

const TITLE_BAR_HEIGHT = 36;
const WINDOW_STATE_SAVE_MS = 250;

function windowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState(): PersistedWindowState | undefined {
  let text: string;
  try {
    text = fs.readFileSync(windowStatePath(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT')
      console.error("[window] Couldn't read saved window state:", err);
    return undefined;
  }
  try {
    const state = parseWindowState(JSON.parse(text));
    if (!state) console.error('[window] Ignoring invalid saved window state.');
    return state;
  } catch (err) {
    console.error("[window] Couldn't parse saved window state:", err);
    return undefined;
  }
}

function initialWindowState(): {
  bounds: ReturnType<typeof defaultWindowBounds>;
  minimum: { width: number; height: number };
  maximized: boolean;
  zoomFactor: number;
} {
  const saved = readWindowState();
  const workAreas = screen.getAllDisplays().map((display) => display.workArea);
  const cursorWorkArea = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  ).workArea;
  const restored = saved
    ? restoreWindowBounds(saved.bounds, workAreas)
    : undefined;
  const bounds = restored ?? defaultWindowBounds(cursorWorkArea);
  const workArea = restored
    ? screen.getDisplayMatching(restored).workArea
    : cursorWorkArea;
  return {
    bounds,
    minimum: minimumWindowSize(workArea),
    maximized: !!restored && !!saved?.maximized,
    zoomFactor: saved?.zoomFactor ?? 1,
  };
}

function writeWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !zoom) return;
  const state: PersistedWindowState = {
    version: 1,
    bounds: mainWindow.getNormalBounds(),
    maximized: mainWindow.isMaximized(),
    zoomFactor: zoom.get(),
  };
  const target = windowStatePath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error("[window] Couldn't save window state:", err);
  }
}

function scheduleWindowStateWrite(): void {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = setTimeout(() => {
    windowStateTimer = undefined;
    writeWindowState();
  }, WINDOW_STATE_SAVE_MS);
}

function flushWindowState(): void {
  if (windowStateTimer) clearTimeout(windowStateTimer);
  windowStateTimer = undefined;
  writeWindowState();
}

function syncMinimumWindowSize(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getDisplayMatching(mainWindow.getBounds()).workArea;
  const minimum = minimumWindowSize(display);
  mainWindow.setMinimumSize(minimum.width, minimum.height);
}

// Packaged builds ship the icons as extra resources; in development they live in the repo.
function appIconPath(): string {
  const file = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(app.getAppPath(), 'assets', 'icons', file);
}

function setApplicationMenu(): void {
  const zoomIn = () => zoom?.zoomIn();
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [
          {
            label: 'Actual Size',
            accelerator: 'CommandOrControl+0',
            click: () => zoom?.reset(),
          },
          {
            label: 'Zoom In',
            accelerator: 'CommandOrControl+Plus',
            click: zoomIn,
          },
          {
            label: 'Zoom In',
            accelerator: 'CommandOrControl+=',
            visible: false,
            acceleratorWorksWhenHidden: true,
            click: zoomIn,
          },
          {
            label: 'Zoom Out',
            accelerator: 'CommandOrControl+-',
            click: () => zoom?.zoomOut(),
          },
          { type: 'separator' },
          {
            label: 'Toggle Full Screen',
            accelerator:
              process.platform === 'darwin' ? 'Control+Command+F' : 'F11',
            click: () => {
              if (mainWindow)
                mainWindow.setFullScreen(!mainWindow.isFullScreen());
            },
          },
        ],
      },
      ...(process.platform === 'darwin'
        ? [{ role: 'windowMenu' as const }]
        : []),
    ]),
  );
}

function createWindow(): void {
  const initial = initialWindowState();
  mainWindow = new BrowserWindow({
    icon: appIconPath(),
    x: initial.bounds.x,
    y: initial.bounds.y,
    width: initial.bounds.width,
    height: initial.bounds.height,
    minWidth: initial.minimum.width,
    minHeight: initial.minimum.height,
    show: false,
    backgroundColor: '#0F1B2D',
    title: 'EZ AzFW Manager',
    // Custom title bar: the renderer draws the bar; the OS keeps the native window controls.
    titleBarStyle: 'hidden',
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : {
            color: '#0B1524',
            symbolColor: '#93A4BD',
            height: TITLE_BAR_HEIGHT,
          },
    trafficLightPosition: { x: 14, y: 11 },
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Developer tools only in development builds.
      devTools: !app.isPackaged,
    },
  });

  zoom = createZoomController(mainWindow, initial.zoomFactor, (factor) => {
    scheduleWindowStateWrite();
    if (mainWindow && !mainWindow.webContents.isDestroyed())
      mainWindow.webContents.send(IPC.zoomChanged, factor);
  });
  if (initial.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.on('resize', scheduleWindowStateWrite);
  mainWindow.on('moved', () => {
    syncMinimumWindowSize();
    scheduleWindowStateWrite();
  });
  mainWindow.on('maximize', scheduleWindowStateWrite);
  mainWindow.on('unmaximize', scheduleWindowStateWrite);

  // The renderer never navigates or opens windows; block anything that tries.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  mainWindow.on('close', (event) => {
    if (!candidate.unsaved || !mainWindow) return;
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['Save', "Don't save", 'Cancel'],
      defaultId: 0,
      cancelId: 2,
      title: 'Unsaved changes',
      message: 'You have unsaved candidate changes.',
      detail:
        'Save them to keep them for a later commit. Nothing has been sent to Azure.',
    });
    if (choice === 2) {
      event.preventDefault();
    } else if (choice === 0) {
      try {
        candidate.save();
      } catch (err) {
        event.preventDefault();
        dialog.showErrorBox(
          "Couldn't save your changes",
          `${(err as Error).message}\n\nThe window stays open so nothing is lost.`,
        );
      }
    }
  });
  mainWindow.on('close', flushWindowState);
  mainWindow.on('closed', () => {
    zoom?.dispose();
    zoom = undefined;
    mainWindow = undefined;
  });

  const url = MAIN_WINDOW_VITE_DEV_SERVER_URL || `${APP_ORIGIN}/index.html`;
  mainWindow.loadURL(url).catch((err: Error) => {
    console.error(`[window] Couldn't load ${url}:`, err.message);
  });
  // Opt in with EZAZFW_DEVTOOLS=1. The application menu intentionally has no developer-tools role.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL && process.env.EZAZFW_DEVTOOLS)
    mainWindow.webContents.openDevTools({ mode: 'detach' });
}

function onReady(): void {
  // Must match the installer's appId so the taskbar groups and pins the app with its shortcuts.
  if (process.platform === 'win32')
    app.setAppUserModelId('com.samsmithmsft.ezazfwruleman');
  // In development macOS shows the Electron dock icon unless told otherwise.
  if (process.platform === 'darwin' && !app.isPackaged)
    app.dock?.setIcon(appIconPath());
  // The app needs no browser permissions (camera, notifications, etc.), except writing text to
  // the clipboard for its "Copy" actions — and only from the app's own pages.
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback, details) =>
      callback(
        permission === 'clipboard-sanitized-write' &&
          isAppUrl(details.requestingUrl),
      ),
  );
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL)
    serveAppFiles(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`));
  // Both development and packaged builds use this minimal menu: editing and zoom only. Reload and
  // developer-tools roles stay out, while opt-in EZAZFW_DEVTOOLS startup remains available.
  setApplicationMenu();
  registerIpc(() => mainWindow?.webContents, {
    get: () => zoom?.get() ?? 1,
    set: (factor) => {
      if (!zoom) throw new Error('The main window is not ready.');
      return zoom.set(factor);
    },
  });
  createWindow();

  // On macOS the app stays running without windows; clicking the dock icon opens one again.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

function start(): void {
  // The packaged UI is served from app://bundle; the scheme must be registered before ready.
  registerAppScheme();

  // A second launch focuses this window instead of starting another copy.
  app.on('second-instance', () => {
    if (!mainWindow) {
      if (app.isReady()) createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // Quit when all windows are closed, except on macOS.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app
    .whenReady()
    .then(onReady)
    .catch((err: Error) => {
      dialog.showErrorBox("EZ AzFW Manager couldn't start", err.message);
      app.quit();
    });
}

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running and owns the data folder (drafts, history, sign-in).
  app.quit();
} else {
  start();
}
