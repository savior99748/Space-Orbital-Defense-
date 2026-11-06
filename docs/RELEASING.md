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
| `platform.test.cjs` | Web/itch/PWA, simulated ads, saves, manifest |
| `view3d.test.cjs` | 3D view, Classic 2D switch, per-view records, all maps |
| `maps-modes.test.cjs` | Every map in 3D and 2D, Endless save/load, pause, game over and retry |
| `satellites.test.cjs` | All 7 satellites on both paths at every tier, turret aim, animation, kills |
| `tutorial.test.cjs`, `endless.test.cjs`, `stats.test.cjs`, `icons-overclock.test.cjs`, `menu.test.cjs`, `shake.test.cjs`, `rotate.test.cjs` | Tutorial, Endless + leaderboards, analytics, 3D icons + Overclock, cinematic menu, shake setting, phone rotation |

**Rule:** every change to `js/platform.js`, ads, saves or the build scripts must pass the `crazygames` tests
before it is merged. Save keys (`od_run`, `od_rec`, `od_lb…`, `od_tut_done`, `od_view`, `od_audio`, `od_shake`) are
frozen: renaming one wipes players' progress.

## Continuous integration

- `.github/workflows/test.yml` runs `npm test` on every pull request and every push to `main`.
  To make it required: GitHub → Settings → Branches → add a rule for `main` → "Require status checks to pass" →
  select **Tests**.
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
