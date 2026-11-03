# Changelog

Each release records the exact git commit it was built from. `git checkout <commit>` restores exactly what players got, and `npm run build` rebuilds its upload files. Releases can also be marked on GitHub (Releases → Draft a new release → tag `v1.0.0` → target that commit).

## v2.0.0 (in development)
Planned: endless mode with leaderboards, and reasons to come back daily.
- Added itch.io page link to the press kit, pitch and README.

## v1.0.0 (Nov 3, 2026): first public release
Published on itch.io: https://savior99748.itch.io/orbital-defense (also on GitHub Pages).
**Commit: `6673c56fcdb61ef17ef1e351c5c41a22b971307b`** (`main` after PR #7). The in-game label for this build reads "v0.6.0".

- 9 maps: all 8 planets with their real moons (moons carry turret rings and pull invaders with gravity), plus the Solar System finale
- 7 satellites, each with 3 shared tiers and 2 specializations (49 designs)
- Enemies: drones, comets, swarmers, splitting asteroids, shield cruisers, Mothership and Dreadnought bosses
- Easy / Medium / Hard, 30-wave campaign, Freeplay after winning
- Guided tutorial (skippable), zoom and pan up to 3×, stats screen, 10 achievements, auto-save and Continue
- Sound effects and music, installable phone app (works offline)
- Anonymous player stats (GoatCounter), privacy policy
- Builds for itch.io, CrazyGames, desktop/Steam (Electron) and iOS/Android (Capacitor)
