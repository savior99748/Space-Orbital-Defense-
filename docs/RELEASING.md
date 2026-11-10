# Testing and releasing

## Tests

```bash
npm install                       # once: installs Playwright
npx playwright install chromium   # once: the browser the tests drive
npm test                          # everything (about 30-60 min on a slow machine)
npm test -- crazygames            # only tests whose file name contains "crazygames"
```

`tests/run.mjs` builds the targets the tests need, serves them on local ports, runs every `tests/*.test.cjs` in
its own browser, and prints one line per file. Screenshots land in `tests/.out/` (not committed).

| Test file | Covers |
| --- | --- |
| `crazygames.test.cjs` | CrazyGames build with a stand-in SDK: init, loading/gameplay events, saves, no outside requests, analytics off |
| `crazygames-basic.test.cjs` | Basic Launch build: no ad button, no revive ad, no ad ever requested |
| `crazygames-flat.test.cjs` | The one-folder upload build loads the 3D view |
| `crazygames-sdk-timeout.test.cjs` | Game still starts if the SDK never answers |
| `crazygames-first-start.test.cjs` | Gameplay Start is sent for a brand-new player (tutorial and skip) |
| `monetization.test.cjs` | Money system: no bonus on web, rewarded ad pays once (double tap too), premium claims free with the same limits, free revive once per run, Steam build ad-free |
| `steam.test.cjs` | Steam edition in real Electron: saves in `saves.json`, fullscreen/windowed, Quit, settings remembered, free bonuses, no CrazyGames code (needs `npm ci --prefix platforms/electron`; skipped otherwise) |
| `platform.test.cjs` | Web/itch/PWA, simulated ads, saves, manifest |
| `view3d.test.cjs` | 3D view, Classic 2D switch, per-view records, all maps |
| `maps-modes.test.cjs` | Every map in 3D and 2D, Endless save/load, pause, game over and retry |
| `satellites.test.cjs` | All 7 satellites on both paths at every tier, turret aim, animation, kills |
| `newsats.test.cjs` | Flak, Mine Layer, Focus Array, Missile Silo: ground-pad rules, LEO-only targeting (3D and 2D) |
| `progression.test.cjs` | Fleet Link stacking (+35% each, cap +140%, real fire rate, removal), Ascension tiers, the five Endless invaders, late-game scaling |
| `tutorial.test.cjs`, `endless.test.cjs`, `stats.test.cjs`, `icons-overclock.test.cjs`, `menu.test.cjs`, `shake.test.cjs`, `rotate.test.cjs` | Tutorial, Endless + leaderboards, analytics, 3D icons + Overclock, cinematic menu, shake + graphics settings, phone rotation |

**Rule:** every change to `js/platform.js`, ads, saves or the build scripts must pass the `crazygames` tests
before it is merged. Save keys (`od_run`, `od_rec`, `od_lb…`, `od_tut_done`, `od_view`, `od_audio`, `od_shake`) are
frozen: renaming one wipes players' progress.

## Continuous integration

- `.github/workflows/test.yml` runs `npm test` on every pull request and every push to `main`.
  To make it required: GitHub → Settings → Branches → add a rule for `main` → "Require status checks to pass" →
  select **Tests**.
- `.github/workflows/desktop.yml` builds the Windows installer on a Windows machine: run it from Actions →
  Desktop build → Run workflow, or tag `steam-v…`.
- `.github/workflows/release.yml` runs when a release tag is pushed: tests, then builds the web, itch and
  CrazyGames zips (regular, Basic, and flat versions) and attaches them to the GitHub release.

## Branches and releases

- `main` is always releasable and is what GitHub Pages serves. Work happens on short feature branches and
  merges by pull request.
- Each platform releases on its own schedule with its own tag: `crazygames-v3.1.0`, `web-v3.1.0`,
  `steam-v1.0.0`, `android-v1.0.0`, `ios-v1.0.0`. Create one on GitHub: Releases → Draft a new release →
  "Choose a tag" → type the new tag → target `main`.
- **Rollback:** download the previous tag's files from its GitHub release and upload them again to the portal
  (CrazyGames, itch). For GitHub Pages, revert the bad commit on `main`.
- Record what went where in `CHANGELOG.md`.
