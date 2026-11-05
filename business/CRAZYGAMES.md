# CrazyGames submission sheet (v3.0.0)

Everything to paste into the CrazyGames developer portal (https://developer.crazygames.com).
Build the files with:

```bash
npm run build:portals               # → dist/orbital-defense-crazygames.zip
node tools/crazygames-media.mjs     # → dist/crazygames-media/ (3 covers + 2 videos)
TITLE="New Name" node tools/crazygames-media.mjs covers   # re-render the covers if the name changes
```

## Files to upload

| Field | File | Size |
| --- | --- | --- |
| Game files (HTML5 zip, `index.html` at the root) | `dist/orbital-defense-crazygames.zip` | ~0.8 MB zipped, 2.7 MB unpacked, 23 files |
| Landscape cover (16:9) | `dist/crazygames-media/cover-landscape-1920x1080.png` | 1920 × 1080 |
| Portrait cover (2:3) | `dist/crazygames-media/cover-portrait-800x1200.png` | 800 × 1200 |
| Square cover (1:1) | `dist/crazygames-media/cover-square-800x800.png` | 800 × 800 |
| Landscape preview video | `dist/crazygames-media/video-landscape-1920x1080.mp4` | 20 s, 1920 × 1080 |
| Portrait preview video | `dist/crazygames-media/video-portrait-1080x1620.mp4` | 20 s, 1080 × 1620 |

Their limits: initial download ≤ 50 MB (≤ 20 MB for the mobile homepage), total ≤ 250 MB, ≤ 1500 files;
covers show only the game's name as text; videos 15–20 s, ≤ 50 MB, no black intro, no black bars, no cursor.
This build is far below every limit (initial download about 2.7 MB).

## Technical answers

| Question | Answer |
| --- | --- |
| Engine | HTML5 / JavaScript (Three.js for 3D), no engine |
| SDK | CrazyGames HTML5 SDK v3 (loaded in `index.html`) |
| SDK features used | `loadingStart` / `loadingStop`, `gameplayStart` / `gameplayStop`, `happytime` on a win, rewarded ads (bonus credits between waves, one revive after losing), midgame ads (only when leaving an end-of-game screen), cloud saves through `data` |
| Orientation | Landscape and portrait both supported (layout adapts) |
| Mobile | Yes: touch controls (tap to build/upgrade, drag to rotate, pinch to zoom) |
| Saves progress | Yes: between waves, through the SDK `data` module (CrazyGames account) with a local fallback |
| External links / other ads / analytics | None. No other ad networks; the game's own analytics are switched off on CrazyGames |
| Audio | Generated in the browser; muted while an ad plays |
| Languages | English |
| In-game purchases | None |

## Listing text

**Title:** Orbital Defense
*(Change it here and in the covers if you pick a final name before publishing.)*

**Short description (one line):**
Defend Earth and the Solar System in 3D: build satellites on tilted orbits and stop the alien invasion.

**Description:**
Alien invaders are spiraling in from every direction, and only your orbital defenses stand between them and the planet.

Build satellites on rotating orbit rings around Earth, Mars, Jupiter, Saturn and the rest of the Solar System. Because the rings keep turning, your defenses sweep around the planet as the battle unfolds, and in 3D the orbits are tilted, so invaders attack from every height.

- 7 satellites, each with 5 upgrade tiers and 2 specializations: lasers, missile hives, railguns, tractor beams and black holes, EMP lightning, mining rigs and drone carriers
- 9 worlds with real moons whose gravity pulls invaders off course, ending with a final stand around the Sun
- Stinger drones, swarming Mites, infested asteroids, shielded Wardens, the Mothership and the Dreadnought
- 30-wave campaign on Easy, Medium and Hard, plus Endless mode with milestones, leaderboards and unlimited Overclock upgrades
- Overdrive ability, target modes, a quick tutorial, and a Classic 2D view if you prefer the original look

**Controls:**
- Build: pick a satellite at the bottom (or press 1–7), then tap a glowing orbit slot
- Upgrade / sell / targeting: tap a satellite
- Launch the next wave: Launch Wave button or Space (turn on Auto to keep going)
- Overdrive: ⚡ button or Q
- Rotate the view: drag · Zoom: mouse wheel, pinch or + / −
- Game speed: F · Pause: P or Esc

**Category:** Strategy (Tower Defense)

**Tags (pick the ones the portal offers):** tower defense, space, strategy, 3D, aliens, planets, upgrade, mouse, mobile, defense

## Before you press submit

1. Upload the zip and use **Preview** in the portal to play a few waves on desktop and on your phone.
2. Check that a rewarded ad (📺 button between waves) and the revive offer work in their QA tool.
3. Make sure the name in the title field matches the name on the covers.
