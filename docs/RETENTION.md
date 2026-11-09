# First 10 minutes: onboarding and retention

What changed to get new players into combat faster, and what we can (and can't) measure.

## The first 10 minutes

| | Before | After |
| --- | --- | --- |
| Tutorial | 12 steps: welcome screen, pick Laser, place it, place a **second** Laser, press **Launch Wave**, wait, bonus, tap satellite, tap upgrade, then 4 info screens (specializations, Moon, camera/Overdrive, "you're ready") | 5 steps: welcome + pick Laser, place it, **Wave 1 launches by itself after a 2.5 s countdown**, clear it, first victory (+100) + first upgrade. Done. |
| First combat | ~40-60 s and 6+ taps | ~10-15 s and 2 taps |
| Specializations, Moon gravity, Overdrive, camera | Explained up front in the tutorial | One-time 💡 tips when they matter: specializations when a satellite reaches tier 2; the moon at wave 2; Overdrive at wave 3; camera at wave 4 |
| Between waves | Plain "Launch Wave" button | Button pulses while it's waiting (waves 1-4); never auto-launches unless Auto is on |
| Wave cleared | Toast "Wave N cleared! +X" | Credits counter pops, "+X" floats over the planet. Wave 1: "🎉 First wave cleared!" + upgrade nudge. Waves 3 and 5: "⭐ … Next goal: …" with a gold ring pulse |
| Objective | None | 🎯 chip in the wave bar: "Build a satellite" → "Upgrade a satellite (tap it)" → "Reach wave 3 / 5 / 10 (Mothership) / … 30 (Dreadnought)" |
| Saving | Silent | One-time tip after the first cleared wave: progress saves after every wave |
| Menu | Continue button | Larger, glowing Continue button showing "wave N saved" |

Unchanged: wave composition and difficulty, satellite stats, costs, rewards, maps, Endless, achievements, saves,
2D/3D, CrazyGames SDK calls (loading / gameplay start/stop), and ads (Basic build still has none).

## Measurement

### CrazyGames (official numbers)
The developer portal reports plays, players, impressions, CTR, gameplay conversion (1+ min), average playtime,
the 10+ min funnel, returning users, D1/D7 retention and rating. These come from CrazyGames' own tracking (the
SDK's loading/gameplay events and their page analytics). **These are the numbers that count for Basic → Full
Launch.** Compare them for the 7 days before and after uploading this build.

### Our own events (`js/analytics.js`, GoatCounter)
Privacy-friendly event counts, no cookies, no personal data, opt-out on the menu, Do Not Track respected.

| Question | Event | Where it's counted |
| --- | --- | --- |
| Tutorial start | `tutorial/start` | existing |
| Tutorial completion | `tutorial/done` | existing |
| Tutorial skip (and at which step) | `tutorial/skip-at-step-N` | existing |
| Step reached | `tutorial/step-N` | existing |
| First satellite placed | `first/build` | **new**, once per device |
| First wave started | `first/wave-start` | **new**, once per device |
| First wave completed | `first/wave-clear` | **new**, once per device |
| First upgrade bought | `first/upgrade` | **new**, once per device |
| Wave 3 / 5 reached | `first/wave-3`, `first/wave-5` (and the existing per-map `wave/<map>/3`, `/5`) | **new** + existing |
| Session duration | `session-length/under-1m`, `1-3m`, `3-10m`, `10-20m`, `20m-plus` | **new**, sent when the page closes: best effort, browsers can drop requests during unload |
| Early exits | `session-length/under-1m`, plus existing `quit/<map>/w<bucket>` (left to menu mid-game) | new + existing |
| New player / D1 return | `new-player`, `return/d1` (d3, d7, d30) | existing |

**Important:** these events are **switched off on CrazyGames** (`statsOnPortals: false` in `js/config.js`), as
declared in the CrazyGames submission ("the game's own analytics are switched off"). They are only collected on
the GitHub Pages / itch / app builds. Turning them on inside CrazyGames would need their approval first, so the
funnel above can currently be measured only from players on the web version. They are our own counts, not
CrazyGames' conversion or retention metrics, and the two should not be compared as if they were the same.
