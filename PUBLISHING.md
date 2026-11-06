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
5. Covers, preview videos and all listing text: see [business/CRAZYGAMES.md](business/CRAZYGAMES.md); `node tools/crazygames-media.mjs` renders the media from the real game.

### Poki and others
Add another adapter in `js/platform.js` (copy the CrazyGames block) and a target in `tools/build.mjs`.

## Steam / desktop (Electron)

**The Steam edition** is the paid version: no ads and no ad code (the build fails if any slips in), and the
rewarded bonuses are claimed for free with the same limits. It starts fullscreen. **🖥 Fullscreen / 🗗 Windowed** on
the menu, F11 or Alt+Enter switch modes, and the window size and mode are remembered. **⏻ Quit** is on the main
menu. **🎨 Graphics** (Auto / High / Low) is on every edition.

**Get a Windows installer without building anything:** GitHub → Actions → **Desktop build** → *Run workflow*.
When it finishes (~10 min), download **ringwarden-windows-installer** from the run's Artifacts and run
`Ringwarden-Setup-<version>.exe`. The installer is unsigned for now, so Windows SmartScreen will warn
("More info → Run anyway"); code signing is a later decision.

Or build on your own PC (needs Node.js):

```bash
cd platforms/electron
npm ci
npm start          # play the desktop edition
npm run dist:win   # Windows installer → release/Ringwarden-Setup-<version>.exe
```

**Saves and Steam Cloud.** Progress is kept in `saves.json` in the app-data folder
(Windows: `%APPDATA%\Ringwarden Orbital Defense\`), written safely (temp file + rename). Earlier progress kept in
browser storage is copied over on first launch. To sync it, turn on **Steam Auto-Cloud** in Steamworks:
root `WinAppDataRoaming`, subdirectory `Ringwarden Orbital Defense`, pattern `saves.json` **[verify the exact
Steamworks field names]**. No code change is needed for Auto-Cloud.

Steam setup:
1. Create a Steamworks partner account, pay the Steam Direct app fee **[verify current amount]** and get your
   **App ID**.
2. Put the App ID in `platforms/electron/steam_appid.txt`. The app connects to Steam through `steamworks.js` and
   shows the overlay (Shift+Tab). Test the overlay early: it is known to be fragile with Electron **[verify]**.
3. In Steamworks, create achievements with these API names (the game's ids in capitals):
   `FIRST_WAVE`, `FIRST_BOSS`, `TIER5`, `ARMADA`, `TYCOON`, `FIRST_WIN`, `PERFECT`, `WIN_HARD`, `GRAND_TOUR`, `WIN_SOL`, `ENDLESS_50`, `ENDLESS_100`.
4. Set up Auto-Cloud (above).
5. Put the store page up as **Coming Soon** early: Steam requires it to be visible for a minimum time before
   release **[verify]**, and wishlists collected meanwhile drive launch visibility.
6. Upload the build with Valve's SteamPipe tools, or tag `steam-v1.0.0` to get the installer attached to a GitHub
   release.

macOS builds must be made (and signed) on a Mac. Windows builds: GitHub Actions (above), your Windows PC, or Linux
with Wine.

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

`assets/icons/` holds the app icon made from the icon artwork (satellite firing at a warship): `icon-1024.png`, `icon-512.png` and
`icon-192.png` (the framed badge with transparent corners), `icon-180.png` (iPhone home screen, full square) and
`icon-maskable-512.png` (Android adaptive icon, badge inside the safe zone). `icon-1024.png` is also used for the
desktop and mobile app icons. Note: `npm run icons` renders the old programmatic icon and would overwrite these.
