// Desktop wrapper (Steam edition): opens the game in its own window, keeps saves in a file that Steam Cloud
// can sync, remembers the window / fullscreen setting, and connects to Steam when available.
const { app, BrowserWindow, ipcMain, Menu, protocol, net } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// Serve the game from app://game/ instead of file:// so the 3D view (ES modules) can load.
protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
function serveApp() {
  const root = path.join(__dirname, "app");
  protocol.handle("app", req => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(root, decodeURIComponent(pathname)));
    if (!file.startsWith(root)) return new Response("Not found", { status: 404 }); // stay inside the game folder
    return net.fetch(pathToFileURL(file).toString());
  });
}

// Tests run against a throw-away folder instead of the real save location.
if (process.env.OD_USER_DATA) app.setPath("userData", process.env.OD_USER_DATA);

// ---- saves: one JSON file in the user's app-data folder ----
// Steam Auto-Cloud can sync this file (configured in Steamworks: Cloud → Root "WinAppDataRoaming",
// subdirectory = the folder name below, pattern "saves.json") [verify the exact Steamworks fields].
// Written atomically (temp file + rename), so a crash mid-write can't corrupt progress.
const dataDir = () => app.getPath("userData");
const savesFile = () => path.join(dataDir(), "saves.json");
const settingsFile = () => path.join(dataDir(), "settings.json");
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
let saves = null, saveTimer = null;
const loadSaves = () => (saves = saves || readJson(savesFile(), {}));
function queueSaveWrite() { // batch quick successive writes; flushed on quit too
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSaves, 300);
}
function flushSaves() { clearTimeout(saveTimer); saveTimer = null; if (saves) writeJson(savesFile(), saves); }
ipcMain.on("save-load", e => { e.returnValue = loadSaves(); });
ipcMain.on("save-set", (_e, k, v) => { loadSaves()[String(k)] = String(v); queueSaveWrite(); });
ipcMain.on("save-remove", (_e, k) => { delete loadSaves()[String(k)]; queueSaveWrite(); });

// ---- window settings (fullscreen, size) ----
const settings = () => readJson(settingsFile(), { fullscreen: true, width: 1280, height: 800 });
function rememberWindow(win) {
  const s = settings();
  s.fullscreen = win.isFullScreen();
  if (!s.fullscreen && !win.isMaximized()) { const [w, h] = win.getSize(); s.width = w; s.height = h; }
  s.maximized = win.isMaximized();
  writeJson(settingsFile(), s);
}

// ---- Steam (optional) ----
// Set your Steam App ID in steam_appid.txt next to this file (or STEAM_APP_ID env var) once Valve
// gives you one. Until then the game runs normally without Steam.
let steam = null;
function initSteam() {
  let appId = Number(process.env.STEAM_APP_ID || 0);
  const idFile = path.join(__dirname, "steam_appid.txt");
  if (!appId && fs.existsSync(idFile)) appId = Number(fs.readFileSync(idFile, "utf8").trim());
  if (!appId) return;
  try {
    steam = require("steamworks.js").init(appId);
    console.log("Steam connected, app", appId);
  } catch (err) {
    console.warn("Steam not available:", err.message);
  }
}

let mainWin = null;
function createWindow() {
  const s = settings();
  const win = (mainWin = new BrowserWindow({
    width: s.width || 1280,
    height: s.height || 800,
    minWidth: 800,
    minHeight: 560,
    fullscreen: process.env.OD_WINDOWED ? false : !!s.fullscreen, // games start fullscreen; players can switch
    backgroundColor: "#05060f",
    title: "Ringwarden: Orbital Defense",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  }));
  if (s.maximized && !s.fullscreen) win.maximize();
  win.loadURL("app://game/index.html");
  // F11 or Alt+Enter = toggle fullscreen
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11" || (input.key === "Enter" && input.alt)) { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
  });
  const tell = () => { if (!win.isDestroyed()) win.webContents.send("display-changed", { fullscreen: win.isFullScreen() }); };
  win.on("enter-full-screen", tell); win.on("leave-full-screen", tell);
  win.on("close", () => { try { rememberWindow(win); } catch { /* ignore */ } flushSaves(); });
}
ipcMain.on("display-get", e => { e.returnValue = { fullscreen: !!(mainWin && mainWin.isFullScreen()) }; });
ipcMain.on("display-fullscreen", (_e, on) => { if (mainWin) mainWin.setFullScreen(!!on); });

// Achievement IDs in Steamworks must match the game's ids, upper-cased (e.g. FIRST_WIN).
ipcMain.on("achievement", (_event, id) => {
  if (steam) { try { steam.achievement.activate(String(id).toUpperCase()); } catch (err) { console.warn(err.message); } }
});
ipcMain.on("quit", () => { flushSaves(); app.quit(); });

Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  serveApp();
  initSteam();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { flushSaves(); app.quit(); });
app.on("before-quit", flushSaves);

// Lets the Steam overlay (Shift+Tab) draw over the game.
try { require("steamworks.js").electronEnableSteamOverlay(); } catch { /* steamworks.js not installed */ }
