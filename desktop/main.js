// Beacon Bible — desktop (Electron) wrapper.
//
// The desktop app is a native window around the live web app (beacon-bible.vercel.app). Because it
// loads the deployed site, it auto-updates whenever we deploy to Vercel — no desktop rebuild needed
// for JS/content changes. Reading + AI work with no sign-in; auth/premium ride the same Supabase
// backend as web and iOS, so the same account unlocks Premium everywhere.

const { app, BrowserWindow, shell } = require('electron');

const APP_URL = 'https://beacon-bible.vercel.app';
const APP_ORIGIN = new URL(APP_URL).origin;

/** A normal Chrome user-agent (strip the Electron/app tokens) so external auth pages don't flag an embedded browser. */
function browserUserAgent(win) {
  return win.webContents
    .getUserAgent()
    .replace(/\sElectron\/[\d.]+/, '')
    .replace(/\sBeacon Bible\/[\d.]+/, '');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 380,
    minHeight: 600,
    title: 'Beacon Bible',
    backgroundColor: '#FAF9F5',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(APP_URL, { userAgent: browserUserAgent(win) });

  // Open links/popups that leave our origin (e.g. OAuth, external sites) in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (new URL(url).origin !== APP_ORIGIN) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create a window when the dock icon is clicked and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS (standard platform behavior).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
