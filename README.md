# Orbital Defense

A space-themed tower defense game. Hostile drones, comets, asteroids and motherships spiral in toward your homeworld. You build satellites on three **rotating orbit rings**, and because the rings turn, your defenses sweep around the planet over time.

The whole game is one file, `index.html`, with no build step and no dependencies.

## Play locally

Open `index.html` in any browser.

## Controls

| Action | Input |
| --- | --- |
| Pick a satellite | Click it in the bottom bar, or press `1`–`4` |
| Build | Click a glowing slot on a ring |
| Upgrade / sell | Click a placed satellite |
| Next wave | `Space` or **Launch Wave** |
| Speed 1×/2×/3× | `F` |
| Pause | `P` |
| Cancel selection | `Esc` |

## Satellites

- **Laser Sat** (50): fast beam, single target
- **Missile Pod** (90): homing rockets with splash damage
- **Tractor Beam** (70): slows and drains everything nearby
- **Railgun** (150): huge damage, long reload, long range

Each satellite upgrades twice. Selling returns 70% of what you spent.

## Enemies

Drones are the basic enemy. From wave 3 you'll also see fast comets, and from wave 5 tanky asteroids that cost 2 planet HP if they get through. Every 10th wave brings a **mothership** boss. The waves never end, so see how far you can get. Your best wave and score are saved in the browser.

## Deploy (free)

- **GitHub Pages:** repo Settings → Pages → Source: *Deploy from a branch* → `main` / root. The game will be at `https://<username>.github.io/Space-Orbital-Defense-/`.
- **itch.io:** zip `index.html`, create a new project, set it to *HTML*, upload the zip and tick *This file will be played in the browser*.
