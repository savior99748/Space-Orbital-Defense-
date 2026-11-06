// Exposes a tiny, safe bridge to the game (see js/platform/electron.js).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("odNative", {
  platform: "electron",
  achievement: id => ipcRenderer.send("achievement", id),
  quit: () => ipcRenderer.send("quit"),
  // saves live in a file Steam Cloud can sync; loaded once, then written through
  save: {
    load: () => ipcRenderer.sendSync("save-load"),
    set: (k, v) => ipcRenderer.send("save-set", k, v),
    remove: k => ipcRenderer.send("save-remove", k),
  },
  display: {
    get: () => ipcRenderer.sendSync("display-get"),
    setFullscreen: on => ipcRenderer.send("display-fullscreen", on),
    onChange: fn => ipcRenderer.on("display-changed", (_e, d) => fn(d)),
  },
});
