# Ringwarden: Orbital Defense: desktop / Steam edition

Electron wrapper around the web game. See [../../PUBLISHING.md](../../PUBLISHING.md#steam--desktop-electron).

```bash
npm install
npm start          # play
npm run dist:win   # build a Windows installer into release/
```

`main.js` serves the game from `app://game/` (so the 3D view's modules load), opens the game window (fullscreen by
default, remembered), keeps saves in `saves.json` in the app-data folder (for Steam Cloud), and connects to Steam
(via `steamworks.js`) when `steam_appid.txt` exists. `preload.js` exposes `window.odNative` (achievements, saves,
display, quit), used by `js/platform/electron.js`. Tested by `tests/steam.test.cjs` in real Electron.
For tests, `OD_USER_DATA` points saves at a throw-away folder and `OD_WINDOWED=1` starts in a window.
