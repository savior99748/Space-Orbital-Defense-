# Changelog

Each release records the exact git commit it was built from. `git checkout <commit>` restores exactly what players got, and `npm run build` rebuilds its upload files. Releases can also be marked on GitHub (Releases → Draft a new release → tag `v1.0.0` → target that commit).

## v3.0.0 (in development): full 3D
- **3D is the main game.** Three.js renderer (bundled in `vendor/three/`, MIT): lit planets with generated surfaces, Earth clouds and atmosphere, Saturn's rings, the Sun's glow; drag to rotate, pinch / wheel / + − to zoom.
- **All 9 maps rebuilt for 3D** (`js/maps3d.js`): bigger planets, smaller satellite models on **tilted orbits** (Earth: LEO / MEO / HEO; others LOW / MID / HIGH, Uranus a near-polar orbit), tilted moon rings, and the Solar System with each planet's ring tilted.
- **3D gameplay**: invaders attack from every height and spiral in through 3D space; ranges are spheres; barrels, missiles, railguns, lightning, explosions and fighters all work in 3D. Satellites get +20% range in 3D; each map's invader health is retuned with the skilled-player bot (Solar System is the toughest).
- **Classic 2D option** on the main menu (🌐 3D / ▦ Classic 2D): the v2 look, maps and balance, unchanged. Devices without WebGL, or a game opened from a local file, use Classic 2D automatically. Each view keeps its own records, leaderboards and saved game.
- Tutorial works in 3D (arrow follows 3D slots; rotate/zoom tip).
- Desktop app serves the game from `app://game/` so 3D loads there too.
- `/proto3d/` now redirects to the main game.
- **New satellite models** (`js/sat3d.js`): Lancer, Hornet, Gravity Well, Spear, Tesla, Prospector and Hangar, each with a new look at every tier and specialization, with animated parts. The build bar and upgrade panel show 3D renders of them. Preview them all at `/hangar/`.
- **New invader models** (`js/aliens3d.js`): Stinger drones, Mite swarmers, comets with tails, crystal-infested asteroids, Warden cruisers with hexagon shields, a saucer Mothership and a spined Dreadnought.
- **⚡ Overclock** (Endless and Freeplay): fully upgraded satellites can be overclocked without limit, +25% damage (or Mining income) per level at a rising price, so late Endless runs always have something to build. Golden sparks orbit overclocked satellites.

## v2.0.0 (in development)
- **∞ Endless mode**: pick Campaign or Endless on the menu. Waves never stop and the Dreadnought returns at waves 50, 70, 90…
- **Endless milestones** at waves 40, 50, 75, 100 (then every 25): bonus credits and score, with milestone badges on the menu and a next-milestone chip during play
- **Leaderboards**: top-10 Endless runs per map and difficulty on each device, with your name, wave, score and date; a leaderboard screen on the menu; best Endless wave shown on each map card. Built so a worldwide board can be added next.
- 2 new achievements: Deep Space (Endless wave 50) and Centurion (Endless wave 100)
- **Difficulty rebalance** (tested with a skilled-player bot): the wave-10 Mothership no longer ends Hard runs instantly (leak damage 15 → 6); enemy health now climbs more steeply after wave 8 and again after wave 18, and invaders speed up ~1.2% per wave after wave 10 (max +25%). Hard now has 15 HP and the steepest late curve. Result: Easy stays beginner-friendly, Medium costs HP late, Hard is won by a skilled bot about 3 in 5 times, often with only a few HP left.
- Added itch.io page link to the press kit, pitch and README.
- **3D preview** (`/proto3d/`, separate from the main game): Three.js view of the same gameplay. Lit 3D planets with generated textures, clouds and atmosphere; Earth bigger with LEO / MEO / HEO rings; 70%-size satellite models that change with tier and path; drag to rotate, pinch to zoom, tap to build. Three.js 0.186.1 is bundled in `vendor/three/` (MIT).
- **Full 3D gameplay in the preview**: the engine now works in 3D (heights, 3D distances and ranges, 3D enemy flight, homing missiles, railgun lines, explosions, fighters). On 2D maps every height stays 0, so the main game plays exactly as before. The preview's Earth uses tilted orbits (LEO 10°, MEO 30°, HEO 50°, Moon ring 40°) and invaders that attack from any height; satellites get +20% range there (they cover a volume) and invaders 12% less health.

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
