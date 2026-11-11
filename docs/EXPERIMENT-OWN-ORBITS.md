# Experiment: Own Orbits

A trial of more realistic orbital mechanics. **Off by default.** It only runs when the link ends in `?exp=orbits`
(3D view only), e.g. `index.html?exp=orbits`. Normal players, the CrazyGames builds (Versions A/B/C) and the desktop
edition never see it.

## Rules
- **Launch:** pick a satellite, then tap the gold marker above a planet or moon (or the planet itself). It flies up
  onto **its own orbit in LEO**. Every satellite gets a different orbit: orbits around the same body each have their own
  radius, so they never cross and satellites can't collide. Tilt, direction of the tilt and starting position are random.
- **Bands:** each body has LEO, MEO and HEO bands (cyan / green / purple lines) with a limited number of orbits in each.
  When LEO is full you have to raise satellites higher (or launch from a moon).
- **Raising orbit is part of upgrading:** choosing a specialization needs **MEO**; tier 5 needs **HEO**.
  Raising costs 75% (MEO) / 150% (HEO) of the satellite's price and gives +10% / +20% range. Higher orbits turn slower.
- **Fuel:** every satellite launches with fuel for **20 waves** (−1 per wave cleared). At 0 it burns up re-entering the
  atmosphere. Satellites with 3 waves or less blink red. Selling is worth less as fuel runs low.
- **Overdrive** burns **2 extra fuel** from every satellite.
- Missile Silos are on the ground: no fuel, no orbits.

## Kept apart
Its own saved run (`od_run3d_exp`) and records. It sends no stats, unlocks no achievements and posts no leaderboard scores.

## Code
Flag `OD.EXP` in `js/mode.js`; rules in `js/game.js` (search "Own Orbits"); visuals in `js/view3d.js`; test
`tests/exp-orbits.test.cjs`. Turning it off for good = deleting those blocks.
