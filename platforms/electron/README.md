# Desktop build (Steam, Windows, macOS, Linux)

Electron wrapper around the web game. See [../../PUBLISHING.md](../../PUBLISHING.md#steam--desktop-electron).

```bash
npm install
npm start          # play
npm run dist:win   # build a Windows installer into release/
```

`main.js` serves the game from `app://game/` (so the 3D view's modules load), opens the game window and connects to Steam (via `steamworks.js`) when `steam_appid.txt` exists. `preload.js` exposes `window.odNative`, which `js/platform.js` uses for achievements.
