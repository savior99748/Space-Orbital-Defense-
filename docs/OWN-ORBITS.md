# Own Orbits

How the game plays in 2D (the default view since Version C) and 3D. It started as an experiment behind `?exp=orbits`.
In 2D the orbits are flat and spaced wider (the 2D satellite art is bigger). `?orbits=classic` (or localStorage `od_orbits` = `classic`) brings the old
slot rules back in 3D; the older automated tests use it.

## Rules
- **Launch:** pick a satellite and a launch panel opens: choose the zone (**LEO / MEO / HEO**), the body to launch from
  (planet or a moon; tapping a planet or moon also picks it), then press **🚀 LAUNCH**. The satellite flies up onto
  **its own orbit** in that zone. Orbits around the same body each have their own radius, so they never cross and
  satellites can't collide. Tilt, direction of the tilt and starting position are random.
- **Zones are a strategic choice** (like Target: First / Last / Strong): LEO guards close to the planet, where invaders
  converge. HEO is a **Highly Elliptical Orbit**: it swings far out and slowly, then dives fast and close past the planet (Kepler's equal areas). Moons have just one orbit zone, with no LEO / MEO / HEO choice. Each zone has a limited number of orbits per body
  (Earth: 6, Moon: 2). A satellite's **Orbit** button moves it to another zone for 1 fuel per zone.
- **Fuel:** satellites launch with fuel for **20 waves** (MEO 19, HEO 18: getting higher takes fuel). −1 per wave cleared;
  at 0 it burns up re-entering the atmosphere. 3 waves or less: it blinks red. Selling is worth less as fuel runs low.
- **Refuel** (tap the satellite → ⛽ Refuel): back to 20 waves. Expensive on purpose: a full tank costs half of
  everything spent on the satellite (at least its price), charged for the fuel missing. It doesn't add to the sell value.
- **Orbits: On / Off** (top bar, key L) shows or hides the orbit lines.
- **Overdrive** burns **2 extra fuel** from every satellite.
- **Invaders are 20% slower** than in the normal game.
- Missile Silos are on the ground: no fuel, no orbits. Upgrades work as normal.

## Saves
Own Orbits runs save under `od_run3d_exp`, so a run saved with the old slot rules isn't loaded into it. Records,
achievements, leaderboards and stats work as normal.

## Code
Flag `OD.EXP` in `js/mode.js` (on in 3D unless `orbits=classic`); rules in `js/game.js` (search "Own Orbits"); visuals in `js/view3d.js`; test
`tests/exp-orbits.test.cjs`.

## Take Command

Tap a shooting satellite (Laser, Missile Pod, Railgun, Flak, Missile Silo), then **🎯 Command** (key **C**). Click or
tap an invader to **lock on** (hovering previews the target; one out of reach shows "OUT OF RANGE" and is fired on once
it comes close). Without a lock it shoots the invader nearest your pointer. While commanded it gets **+50% damage, +25%
fire rate and 1.6× range**, with gold shots and gold damage numbers. One satellite at a time. **C**, **Esc**, the **Release** button or tapping the satellite itself lets go.
The tutorial teaches it during Wave 1. Support satellites (Tractor, EMP, Mining, Mine Layer, Focus, Carrier) can't be
commanded.

## 2D only

The game ships as 2D. The menu no longer has a 2D / 3D switch; the 3D view stays in the code for later and opens only
with `?view=3d` (development and the automated tests).

## Research Lab (permanent upgrades)

Every run earns **⚙ Salvage** when it ends, win or lose: 3 per wave cleared, 12 per boss, 40 for a win, ×1 / 1.25 / 1.5 /
1.8 on Beginner / Intermediate / Hard / Expert planets. A revived run or freeplay after a win only pays for the new waves.
Spend it in **🔬 Research Lab** (main menu, or the link on the game-over / victory screen). Research is permanent and
applies to every planet and mode. Costs rise ×1.55 per level.

| Research | Per level | Max |
| --- | --- | --- |
| Weapons Research | +3% satellite damage | 10 |
| Seed Funding | +6% starting credits | 10 |
| Planetary Shields | +5% planet HP (★ thresholds scale with it) | 10 |
| Bounty Protocol | +4% credits per kill (score unchanged) | 10 |
| Fuel Efficiency | −6% refuel cost | 5 |
| Overdrive Capacitors | +0.5 s Overdrive | 6 |
| Command Uplink | +5% damage while commanded | 6 |
| Salvage Scanners | +5% Salvage | 10 |

Saved in `od_research` and `od_salvage` (Steam Cloud on desktop through the save layer).

## One mode (no Campaign / Challenges / Endless split)

Every game is the same mission: **beat wave 30** (the Dreadnought) to save the planet, earn ★ (win · half HP · 90% HP)
and unlock the next planet; then **Keep going ∞** for milestones at waves 40, 50, 75, 100 and the planet's
leaderboard. Every run counts for the planet's record and leaderboard.

**Bonus challenges** pop up during the game at waves 6, 12, 18 and 24, four per planet (the same ids as the old
challenge mode, so stars earned there still count). Completing one: +1 ★ the first time, credits and 15 Salvage.

| Challenge | Goal |
| --- | --- |
| 💎 Flawless | Clear the wave without losing HP |
| 🪙 Hold Steady | Clear the wave without spending credits |
| ⚡ Steady Hands | Clear 3 waves in a row without Overdrive |
| 🔦 Laser Light | Destroy 20 invaders with Laser Sats in the wave |
| 🎯 Commander | Destroy 12 invaders with a commanded satellite in the wave |
| 🛰 Low Orbit | Clear the wave with at least 4 satellites in LEO |

The Daily Challenge stays as it was (a rule for a whole 20-wave game).

**End-of-run report:** what finished the planet off, which invader did the most damage, a counter tip, and the
challenges completed in the run. **Boss bar:** a name banner and a layered health bar (Mothership ×2,
Dreadnought ×4, Void Titan ×6) while a boss is alive.

