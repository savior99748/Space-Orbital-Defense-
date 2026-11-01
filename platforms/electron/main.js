// Desktop wrapper: opens the game in its own window and connects to Steam when available.
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    backgroundColor: "#05060f",
    title: "Orbital Defense",
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));
  // F11 = fullscreen, Ctrl/Cmd+Q handled by the OS
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type === "keyDown" && input.key === "F11") { win.setFullScreen(!win.isFullScreen()); event.preventDefault(); }
  });
}

// Achievement IDs in Steamworks must match the game's ids, upper-cased (e.g. FIRST_WIN).
ipcMain.on("achievement", (_event, id) => {
  if (steam) { try { steam.achievement.activate(String(id).toUpperCase()); } catch (err) { console.warn(err.message); } }
});
ipcMain.on("quit", () => app.quit());

Menu.setApplicationMenu(null);
app.whenReady().then(() => {
  initSteam();
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => app.quit());

// Lets the Steam overlay (Shift+Tab) draw over the game.
try { require("steamworks.js").electronEnableSteamOverlay(); } catch { /* steamworks.js not installed */ }
