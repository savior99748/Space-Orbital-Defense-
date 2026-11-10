# Changelog

Each release records the exact git commit it was built from. `git checkout <commit>` restores exactly what players got, and `npm run build` rebuilds its upload files. Releases can also be marked on GitHub (Releases → Draft a new release → tag `v1.0.0` → target that commit).

## Unreleased
- **Ascension in every mode:** the 10k / 25k / 50k Ascension upgrades now also appear in the 30-wave campaign, as a
  long-term goal to save up for. Overclock stays Endless / Freeplay only.
- **Tougher start, slower unlocks, pricier late satellites:** starting credits 450 / 325 / 300 → 300 / 275 / 260
  (Beginner / Intermediate / Hard+Expert). Beginner invaders are tougher (health ×1.0 instead of ×0.8, steeper
  climb, kill rewards ×1.05 instead of ×1.15); Intermediate health ×1.06, Hard ×1.1. Satellites unlock later:
  Missile Pod after wave 3, Tractor 6, EMP 9, Mining 12, Carrier 15, Railgun 18. Build prices now climb along the
  unlock order (Laser 50, Missile 90, Tractor 110, EMP 140, Mining 160, Carrier 220, Railgun 300 = double) and
  those satellites hit harder to match at every tier (damage / income ×1.3 Tractor, ×1.2 EMP, ×1.25 Mining and
  Carrier, ×1.5 Railgun). Upgrade prices unchanged. Checked with a build/upgrade bot: Beginner maps end between a
  flawless Mercury and ~30/50 HP on Venus (Earth was a flawless 50/50 before); Mars is a coin flip for the bot at
  the wave-30 Dreadnought.
- **Satellites unlock as you play** (like Bloons): Laser at the start, then Missile Pod (after wave 2), Tractor
  Beam (4), EMP Sat (6), Mining Sat (8), Drone Carrier (10) and the Railgun last (12). Locked ones show as "?" with
  their wave; a toast and a glowing card announce each unlock. Build-bar order and number keys follow the new
  order (Railgun is now key 7). Satellites already built in a saved game keep working.
- **First 10 minutes** (see `docs/RETENTION.md`): 5-step tutorial (pick Laser, place it, Wave 1 launches by
  itself after a 2.5 s countdown, clear it, first upgrade); advanced explanations moved to one-time tips during
  play; pulsing Launch Wave button on waves 1-4; wave-clear celebration (credits pop, +X over the planet, wave 1 /
  3 / 5 messages with the next goal); 🎯 next-goal chip; "progress saved" tip; bigger Continue button. New
  once-per-device events (first build / wave / clear / upgrade / wave 3 / wave 5) and session-length buckets.
  No balance, wave, cost, save-format or SDK changes.
- **Bloom only on glowing things** (beams, engines, explosions, the Sun): sunlit planets, moons and shiny
  satellite hulls no longer sparkle or blow out to white.
- **Graphics default to High** (full detail and bloom, never stepped down). Players on slow devices can pick
  Low or Auto on the main menu.
- **Difficulty is part of the map** (like Bloons tracks): Beginner (Mercury, Venus, Earth), Intermediate (Mars,
  Jupiter, Saturn), Hard (Uranus, Neptune), Expert (Solar System). The Easy / Medium / Hard buttons are gone;
  each map card shows its tier. Records and leaderboards are kept per map + its tier's settings, so existing
  ones carry over; a game saved on another difficulty still resumes on it.
- **3D view starts zoomed in** on the planet and its orbits instead of the whole spawn area.
- **Faster first minute:** a brand-new player skips the menu and lands straight in the guided first game on
  Earth. Returning players (and anyone with a saved game) still see the menu. The Steam/desktop edition keeps
  its title screen (`P.titleFirst`). Aimed at CrazyGames' gameplay conversion (players still playing after 1 min).
- **Games start at 3× speed** (the speed button still cycles 3× → 1× → 2×).
- **Bloom** (`js/bloom3d.js`): beams, engines, explosions, the Sun and glowing satellite parts spill a soft halo of
  light. Small custom post-process (HDR buffer, dual-Kawase blur, ACES output), no extra library. Off on the Low
  graphics setting, and the first thing a slow device turns off.
- **Animations** (3D, visual only): new satellites launch from the planet's surface and climb to their slot with
  an engine trail; arrival and upgrades swell with a burst of light in the satellite's color; sold satellites
  vanish in a puff of sparks; invaders warp in through a purple rift. Reduced-motion settings skip them.
- **Fleet Link stacking:** every Command Relay / Fleet Uplink in range now adds its own fire-rate bonus
  (+20% / +35% each, additive), capped at +140% (four Fleet Uplinks). Range bonuses still don't stack. The
  combined bonus is recomputed every frame (build, upgrade, sell, rings carrying satellites in/out of range) and
  shown on the affected satellite's panel ("Fleet Link: +70% fire rate (2 links)"). It changes real fire rates.
- **Ascension** (Endless / Freeplay): three late-game tiers after tier 5 for 10k / 25k / 50k credits. Each: ×1.6
  damage (or income), +12% fire rate, +6% range, +1 fighter for carriers. Violet halos mark ascended satellites.
  Overclock is still available on top.
- **Five new Endless invaders:** Juggernaut (armored, wave 31+), Phase Wraith (cloaks, can't be targeted while
  phased out, 35+), Brood Hive (heals, hatches Mites, bursts into 8 on death, 40+), Aegis Bastion (huge shield
  that regenerates fast, 45+) and the Void Titan boss (waves 55, 70, 85, 100…). By wave 100-120 the big ships
  come every wave.
- **Endless difficulty:** past wave 60 invader health climbs an extra 3.5% per wave (compounding), and the
  swarms of small fry stop growing, so long runs end instead of idling on Auto for hours. Campaign waves 1-30
  are unchanged.

## v3.1.0 (visual overhaul, in review)
Visual only: gameplay, balance, orbital mechanics, saves, achievements, CrazyGames SDK events and Classic 2D
are unchanged. Built on branch `visual-overhaul`; the uploaded visual-upgrade ZIPs were compared file by file
and merged selectively (see below).
- **Name and interface:** Ringwarden: Orbital Defense. Command-console styling: translucent dark panels with
  cyan edges and corner brackets, gradient title, "Solar System Defense Command" header, hover/pressed/
  selected/disabled button states, a short panel entrance animation, reduced-motion support.
- **Satellites** (`js/sat3d.js`): gunmetal hulls with bevelled edges, steel barrels, gold thermal foil,
  framed solar arrays, blinking beacons, each type's glowing accent, rear thrusters with flickering flames
  and tier marks (1-4). Static parts merge into one mesh per material.
- **Invaders** (`js/aliens3d.js`): darker metallic hulls with reflections, glowing seams, engine exhaust,
  a softer hit flash.
- **Planets and lighting** (`js/view3d.js`): filmic (ACES) tone mapping, bump relief and glossy oceans,
  Fresnel atmospheres per world that brighten on the sunlit side, Earth's night-side city lights, banded
  and gapped Saturn rings, a churning Sun with a corona, a blue rim light, a nebula backdrop and a tinted
  starfield.
- **Combat effects:** glowing beams with white-hot cores and impact flashes, missile engines with fire-to-
  smoke trails, fireballs and shockwaves, sparks, muzzle flashes, railgun charge-up, shield-hit ripples,
  destruction debris. All glows share one draw call.
- **Camera shake setting** on the main menu (On / Low / Off).
- **Main menu:** the live 3D scene behind a translucent panel: satellites orbit the selected world and fire
  at approaching invaders while the camera circles; map cards show 3D planet portraits; the mission panel
  has a large rotating globe.
- **Performance:** automatic quality steps for slow devices (render resolution, then reflections, then the
  backdrop); dynamic buffers upload only what is used.
- From the ZIPs: the UI refresh stylesheet and the menu/selector styling (without its backdrop blur and
  drop-shadow filters, which cost frame rate), the thruster and tier-mark ideas (fitted per hull; the
  fixed-position side rails were dropped because they clipped), ACES tone mapping, the atmosphere / ring /
  beam-core / missile-trail ideas (implemented in the shared systems above).

## v3.0.0: full 3D (CrazyGames release)
First released to CrazyGames. The exact commit is recorded in the merge of the release pull request on GitHub.

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
