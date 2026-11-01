# Orbital Defense

A space tower defense game. Hostile drones, comets, asteroids, shield cruisers and motherships spiral in toward your homeworld. You build satellites on three **rotating orbit rings**, and because the rings turn, your defenses sweep around the planet over time. Survive **30 waves** and destroy the Dreadnought, then keep going in Freeplay.

**Play:** https://savior99748.github.io/Space-Orbital-Defense-/

It's plain HTML, CSS and JavaScript, with no build step and no dependencies. It works on desktop and phones, and all sound and music are generated in the browser.

## Difficulty

| | Planet HP | Start credits | Enemies |
| --- | --- | --- | --- |
| Easy | 50 | 450 | weaker, slower |
| Medium | 25 | 325 | normal |
| Hard | 10 | 300 | tougher, faster |

## Satellites and upgrades

Every satellite has 3 shared tiers. At tier 3 you **choose one of two specializations**, and each specialization has 2 more tiers. The satellite's look changes with every tier.

| Satellite | Cost | Path A | Path B |
| --- | --- | --- | --- |
| Laser Sat | 50 | **Prism Array** → Spectrum Cannon: beam splits to extra targets | **Solar Lance** → Sunspear: continuous beam that ramps up damage |
| Missile Pod | 90 | **Cluster Swarm** → Hive Barrage: missile salvos that burst into bomblets | **Nova Warhead** → Supernova: one huge blast that sets enemies burning |
| Tractor Beam | 70 | **Singularity** → Event Horizon: pushes enemies back out | **Cryo Field** → Absolute Zero: freezes enemies and makes them take more damage |
| Railgun | 150 | **Mass Driver** → Planet Cracker: boss and shield killer | **Coil Repeater** → Gauss Storm: rapid piercing shots |
| EMP Sat | 110 | **Shockwave** → Pulsar: big stunning pulses | **Ion Storm** → Tesla Crown: chain lightning |
| Mining Sat | 120 | **Deep Core Rig** → Stellar Forge: big income | **Command Relay** → Fleet Uplink: boosts nearby satellites |
| Drone Carrier | 160 | **Strike Wing** → Armada: swarm of fighters | **Bomber Wing** → Siege Wing: splash-bombing bombers |

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
| Speed 1× / 2× / 3× | speed button | `F` |
| Pause / settings | ❚❚ | `P` / `Esc` |

## Files

- `index.html`: page layout and styles
- `js/data.js`: difficulties, satellite stats and upgrade paths, enemies, waves (tweak balance here)
- `js/draw.js`: art for every satellite tier, fighters and enemies
- `js/audio.js`: synthesized sound effects and music
- `js/game.js`: game logic, rendering, UI and input

## Deploy

GitHub Pages: repo Settings → Pages → *Deploy from a branch* → `main` / root.
