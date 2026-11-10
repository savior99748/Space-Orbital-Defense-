# Ringwarden: Orbital Defense

A space tower defense game set across our Solar System. Hostile drones, comets, asteroids, shield cruisers and motherships spiral in toward the planet you're defending. You build satellites on **rotating orbit rings** around the planet and its moons, and because the rings turn, your defenses sweep around over time. Survive **30 waves** and destroy the Dreadnought, then keep going in Freeplay.

**Play:** https://savior99748.github.io/Space-Orbital-Defense-/ · **itch.io:** https://savior99748.itch.io/orbital-defense

It's plain HTML, CSS and JavaScript: open `index.html` to play, no install needed. It's also an installable web app that works offline. It works on desktop and phones, and all sound and music are generated in the browser.

## Maps

Pick a world on the main menu. Each planet has its real moons; every moon orbits with **its own turret ring** and pulls passing invaders toward it with gravity.

| Map | Moons | Feature |
| --- | --- | --- |
| Mercury | none | Three full rings: the best place to learn |
| Venus | none | Retrograde: all rings turn the same way |
| Earth | Moon | A moon ring and gravity well that lures invaders |
| Mars | Phobos, Deimos | Phobos whips around between the rings |
| Jupiter | Io, Europa, Ganymede, Callisto | Giant planet, four strong-gravity moons |
| Saturn | Titan, Enceladus | Icy rings slow invaders by 35% |
| Uranus | Titania, Oberon, Miranda | Rings spin much faster |
| Neptune | Triton | Winds speed invaders up 12%; Triton orbits backwards |
| **Solar System** | all 8 planets | Final map: defend the Sun. Every planet orbits at its own speed with its own turret ring |

After each game, a **stats screen** shows your totals (destroyed, leaked, credits earned and spent, time) and a damage and kills report for every satellite, with an MVP. You can also open it from the pause menu.

## Difficulty

Like the tracks in Bloons, every map has its own difficulty: pick a map and you've picked how hard it is.

| Tier | Maps | Planet HP | Start credits | Enemies |
| --- | --- | --- | --- | --- |
| Beginner | Mercury, Venus, Earth | 50 | 300 | a bit slower |
| Intermediate | Mars, Jupiter, Saturn | 25 | 275 | normal |
| Hard | Uranus, Neptune | 15 | 260 | tougher, faster |
| Expert | Solar System (the Sun) | 15 | 260 | Hard settings on the toughest map |

## Satellites and upgrades

Like Bloons, you start with the Laser Sat and the others unlock as you clear waves (shown as "?" until then); the Railgun, the strongest, comes last. Every satellite has 3 shared tiers. At tier 3 you **choose one of two specializations**, and each specialization has 2 more tiers. The satellite's look changes with every tier.

| Satellite | Unlocks | Cost | Path A | Path B |
| --- | --- | --- | --- | --- |
| Laser Sat | start | 50 | **Prism Array** → Spectrum Cannon: beam splits to extra targets | **Solar Lance** → Sunspear: continuous beam that ramps up damage |
| Missile Pod | wave 3 | 90 | **Cluster Swarm** → Hive Barrage: missile salvos that burst into bomblets | **Nova Warhead** → Supernova: one huge blast that sets enemies burning |
| Missile Silo (ground) | wave 4 | 120 | **Barrage** → Sky Wall: interceptor salvos | **Nuke Silo** → Doomsday Silo: one enormous interceptor |
| Flak Array | wave 5 | 100 | **Hailstorm** → Steel Rain: bursts hit up to 12 targets | **Shredder** → Hull Breaker: armor-piercing rounds |
| Tractor Beam | wave 7 | 110 | **Singularity** → Event Horizon: pushes enemies back out | **Cryo Field** → Absolute Zero: freezes enemies and makes them take more damage |
| EMP Sat | wave 9 | 140 | **Shockwave** → Pulsar: big stunning pulses | **Ion Storm** → Tesla Crown: chain lightning |
| Mine Layer | wave 11 | 150 | **Minefield** → Kill Zone: up to 16 mines | **Nuke Mines** → Star Breaker: few mines, enormous blasts |
| Mining Sat | wave 12 | 160 | **Deep Core Rig** → Stellar Forge: big income | **Command Relay** → Fleet Uplink: boosts nearby fire rate (stacks) |
| Focus Array | wave 14 | 180 | **Prism Lens** → Star Lens: up to +50% damage to nearby satellites | **Weak-Point Scanner** → Deep Scan: invaders in range take +30% damage |
| Drone Carrier | wave 16 | 220 | **Strike Wing** → Armada: swarm of fighters | **Bomber Wing** → Siege Wing: splash-bombing bombers |
| Railgun | wave 18 | 300 | **Mass Driver** → Planet Cracker: boss and shield killer | **Coil Repeater** → Gauss Storm: rapid piercing shots |

The **Missile Silo** is built on ground pads (3 on the planet, 1 on each moon) instead of an orbit ring, and only fires at invaders that get inside low orbit (LEO) around its planet or moon: a last line of defense. Keys: **1-9** satellites in order, **R** Railgun, **G** Missile Silo.

You can set each attacking satellite to target **First / Last / Strong / Close**. Selling returns 70% of what you spent.

## Enemies

- **Drone:** the basic attacker.
- **Comet:** fast.
- **Swarmer:** comes in big, fast groups.
- **Asteroid:** splits into rocks when destroyed.
- **Shield Cruiser:** its shield regenerates; railguns break shields twice as fast.
- **Mothership:** the boss on waves 10 and 20; launches drones.
- **Dreadnought:** the final boss on wave 30; heavy shields, launches cruisers.

## Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Pick satellite | bottom bar | `1`–`7` |
| Build | tap a glowing ring slot | |
| Upgrade / sell / target mode | tap a satellite | |
| Next wave | **Launch Wave** (or turn on **Auto**) | `Space` |
| Overdrive (rings spin 5× and fire rate +30% for 6s, 30s cooldown) | **⚡ Overdrive** | `Q` |
| Speed 3× (default) / 1× / 2× | speed button | `F` |
| Pause / settings | ❚❚ | `P` / `Esc` |
| Zoom in / out (up to 3×) | pinch, mouse wheel, or the **+ / −** buttons; drag to pan; tap **1×** to reset | `+` / `-` / `0` |

## 3D and Classic 2D

Since v3 the game is **3D**: bigger planets, tilted orbits (Earth has LEO, MEO and HEO), and invaders that attack from every height. Drag to rotate, pinch or use **+ / −** to zoom. Prefer the original look? Choose **▦ Classic 2D** on the main menu (the v2 maps and balance). Each view keeps its own records and leaderboards.

## Graphics settings

On Auto graphics the 3D view adjusts itself: if a device can't keep a smooth frame rate during a game, it lowers the render
resolution, then turns off bloom (the glow around bright things), then metal reflections, then the nebula backdrop.
**Graphics** on the main menu: High (the default: full detail, never steps down), Low (no bloom or reflections, lower resolution) or Auto (steps down by itself on a slow device). **📳 Shake** on the main menu sets
camera shake to On, Low or Off. Players who ask their system for reduced motion get a still menu scene and
Low shake by default. Preview every satellite and invader model at `/hangar/`.

## Endless mode & leaderboards

Choose **∞ Endless** on the main menu: waves never stop. Milestones at waves **40, 50, 75 and 100** (then every 25) pay bonus credits. Once a satellite is fully upgraded, **⚡ Overclock** it as many times as you like: +25% damage (or income for Mining Sats) per level, and each level costs more. Overclock is also available in Freeplay. Three **✦ Ascension** tiers (10k / 25k / 50k credits) multiply a maxed satellite's power, in every mode, campaign included. From wave 31 new invaders join: Juggernauts, Phase Wraiths, Brood Hives, Aegis Bastions and the Void Titan, and past wave 60 they get tougher every wave. Each map keeps a **top-10 leaderboard** of your best Endless runs (🏆 Leaderboards on the menu). A worldwide leaderboard is planned.

## Tutorial

A brand-new player goes straight into a short guided first game on Earth (no menu first; the desktop edition opens on its title screen instead): pick a Laser Sat, place it, and Wave 1 launches by itself; after the first victory the tutorial shows the first upgrade and gets out of the way. Moons, specializations, Overdrive and camera controls come up later as one-time tips. Skip it anytime, or replay it from the **🎓 Tutorial** button on the main menu.

## Saving, ads and achievements

- The game **saves automatically between waves**; use **Continue** on the main menu to pick up where you left off.
- **10 achievements** (see the menu). On Steam they unlock real Steam achievements.
- On ad-supported platforms (CrazyGames now, mobile later), you can watch an optional ad for bonus credits between waves, or for one revive after losing. A short ad may play when you leave an end-of-game screen. The GitHub Pages version has no ads.

## Press kit & business

- **Press kit** (trailer, clips, GIFs, screenshots, icon, facts): `presskit/`, live at https://savior99748.github.io/Space-Orbital-Defense-/presskit/
- **One-page pitch**: `presskit/pitch.html` (print to PDF) and `presskit/orbital-defense-pitch.pdf`
- **Publisher shortlist**: [business/PUBLISHERS.md](business/PUBLISHERS.md) · **Pitch email**: [business/PITCH-EMAIL.md](business/PITCH-EMAIL.md)
- **Player stats** setup and how to read them: [business/STATS.md](business/STATS.md)
- Regenerate media after game changes: `node tools/capture-media.mjs` (needs Playwright + ffmpeg)

## Publishing

The same code builds for the web, itch.io, CrazyGames, Steam/desktop and iOS/Android. See **[PUBLISHING.md](PUBLISHING.md)**.

```bash
npm run build   # → dist/ zips, platforms/electron/app, platforms/mobile/www
```

## Files

- `index.html`: page layout and styles
- `js/maps.js`: planets, moons and the Solar System map
- `js/bodies.js`: planet, moon and Sun art
- `js/data.js`: difficulties, satellite stats and upgrade paths, enemies, waves (tweak balance here)
- `js/draw.js`: art for every satellite tier, fighters and enemies
- `js/audio.js`: synthesized sound effects and music
- `js/platform.js`: per-platform saves, ads, achievements (web, CrazyGames, desktop, mobile)
- `js/game.js`: game logic, rendering, UI and input
- `tools/build.mjs`: builds every platform; `tools/make-icons.mjs`: renders the app icon
- `platforms/electron/`: desktop/Steam wrapper; `platforms/mobile/`: iOS/Android (Capacitor)

## Deploy

GitHub Pages: repo Settings → Pages → *Deploy from a branch* → `main` / root.
