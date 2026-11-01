# Publishing Orbital Defense

One codebase, many platforms. The game code (`index.html` + `js/`) is the same everywhere. Only
`js/platform.js` changes behavior per platform: saves, ads, achievements, and gameplay events.

```
                  ┌─ web         dist/web/                         GitHub Pages, installable web app (works offline)
                  ├─ itch        dist/orbital-defense-itch.zip      itch.io, Newgrounds
  index.html + js ┼─ crazygames  dist/orbital-defense-crazygames.zip  CrazyGames (ads + cloud saves via SDK v3)
                  ├─ electron    platforms/electron/                Steam, Windows, macOS, Linux
                  └─ mobile      platforms/mobile/                  Google Play, Apple App Store
```

## Build

Requires [Node.js](https://nodejs.org) 18 or newer. No other dependencies.

```bash
npm run build            # every target
npm run build:portals    # just the itch + CrazyGames zips
```

Bump `version` in `package.json` before each release; it is shown on the main menu.

## Test locally

| What | How |
| --- | --- |
| Normal web game | open `index.html` |
| Simulated ads (rewarded credits, revive, between-game ads) | open `index.html?adtest=1` |
| Pretend to be another platform | `index.html?platform=crazygames` |

## Web portals

### itch.io
1. `npm run build:portals`
2. Create a project, set **Kind of project: HTML**, upload `dist/orbital-defense-itch.zip`, tick **This file will be played in the browser**.
3. Viewport: 1280 × 800, enable **Fullscreen button** and **Mobile friendly**.

### CrazyGames
1. `npm run build:portals`
2. Upload `dist/orbital-defense-crazygames.zip` in the CrazyGames developer portal.
3. The build already loads their SDK v3 and uses it for: rewarded ads (+credits between waves, one revive after losing), midgame ads (only when leaving an end-of-game screen), `gameplayStart`/`gameplayStop`, `loadingStop`, `happytime` on a win, and cloud saves through the `data` module.
4. Use their QA preview to check the ads. Audio is muted and the game paused while an ad plays.

### Poki and others
Add another adapter in `js/platform.js` (copy the CrazyGames block) and a target in `tools/build.mjs`.

## Steam / desktop (Electron)

```bash
cd platforms/electron
npm install
npm start          # play the desktop build
npm run dist:win   # Windows installer → release/   (dist:mac on a Mac, dist:linux for AppImage)
```

Steam setup:
1. Pay the Steam Direct fee in Steamworks and get your **App ID**.
2. Put the App ID in `platforms/electron/steam_appid.txt`. The app connects to Steam through `steamworks.js` and shows the overlay.
3. In Steamworks, create achievements with these API names. They are the game's ids in capitals:
   `FIRST_WAVE`, `FIRST_BOSS`, `TIER5`, `ARMADA`, `TYCOON`, `FIRST_WIN`, `PERFECT`, `WIN_HARD`, `GRAND_TOUR`, `WIN_SOL`.
4. Upload the `release/` builds with Valve's SteamPipe tools.

macOS builds must be made (and signed) on a Mac. Windows builds can be made on Windows, or on Linux with Wine.

## Mobile (Capacitor)

```bash
cd platforms/mobile
npm install
npx cap add android      # once; creates the native Android project (commit it)
npx cap add ios          # once, on a Mac with Xcode
npm run icons            # app icons + splash screens from resources/icon.png
npm run android          # build web files, sync, open Android Studio
npm run ios              # same for Xcode
```

- **Google Play:** one-time $25 developer account. Build a signed App Bundle (`.aab`) in Android Studio and upload it in the Play Console.
- **Apple App Store:** $99/year Apple Developer Program. Needs a Mac with Xcode (or a cloud Mac build service). Archive in Xcode and upload to App Store Connect.
- Both stores require a **privacy policy URL** and age rating questionnaire.
- Ads and in-app purchases on mobile need native plugins (for example AdMob and a billing plugin). Wire them into the `capacitor` block in `js/platform.js` with the same `ads.rewarded()` / `ads.midgame()` interface, and the game code doesn't change.

## App icon

`assets/icons/` is generated from the game's own art: `npm run icons` (needs Playwright). `icon-1024.png` is used for store listings and the desktop and mobile app icons.
