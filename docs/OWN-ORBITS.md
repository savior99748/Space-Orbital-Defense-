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
  converge; HEO meets them further out but its orbits turn slower. Each zone has a limited number of orbits per body
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
