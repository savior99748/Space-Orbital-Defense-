# Player stats: setup and reading the numbers

The game can count **anonymous** gameplay events (no cookies, no personal data) using GoatCounter. Stats are **off until you add a site code**.

## Turn it on (about 5 minutes)

1. Create a free account at **https://www.goatcounter.com** (free for non-commercial use; check their current terms once the game earns money). Pick a code, e.g. `orbitaldefense` → `https://orbitaldefense.goatcounter.com`.
2. Open `js/config.js` and set `goatcounter: "orbitaldefense"` (your code).
3. Commit / merge. Players can switch stats off with **📊 Stats** on the main menu, and the game honors "Do Not Track". The privacy policy is at `privacy.html`.

On CrazyGames, stats are off by default (`statsOnPortals: false`) because CrazyGames gives you its own developer dashboard.

## What gets counted

| Event | Meaning |
| --- | --- |
| `new-player` | First time this device opens the game |
| `return/d1`, `return/d3`, `return/d7`, `return/d30` | Came back exactly 1 / 3 / 7 / 30 days after their first day (once each) |
| `session/<platform>` | Each time the game is opened (web, crazygames, electron, capacitor) |
| `tutorial/start`, `tutorial/step-N`, `tutorial/done`, `tutorial/skip-at-step-N` | Tutorial funnel: where people drop off or skip |
| `game-start/<map>/<difficulty>` | Which maps and difficulties are played |
| `wave/<map>/<N>` | Reached wave 1, 3, 5, 10, 15, 20, 25, 30 (then every 10) |
| `game-over/<map>/<difficulty>/w<range>` | Where players lose (waves 1-4, 5-9, 10-19, 20-29, 30+) |
| `win/<map>/<difficulty>` | Beat all 30 waves |
| `quit/<map>/w<range>` | Left to the menu mid-game (possible frustration or boredom) |
| `path/<satellite>/<specialization>` | Which tier-3 specialization players choose |
| `ad/credits`, `ad/revive` | Optional rewarded ads watched (portal and mobile builds) |

## Numbers publishers ask for

Use the same date range in the GoatCounter dashboard for all of these (e.g. the last 30 days):

- **D1 retention** ≈ `return/d1` ÷ `new-player`. Mobile publishers often look for ~35-40%+ on casual games.
- **D7 retention** ≈ `return/d7` ÷ `new-player`. Often ~10%+ is considered promising.
- **Tutorial completion** = `tutorial/done` ÷ `tutorial/start`.
- **Difficulty curve**: compare `wave/earth/5`, `/10`, `/20`, `/30` counts. A sharp drop shows where the game is too hard.
- **Favorite specializations**: compare `path/...` counts to spot under-used upgrades that need buffs.

The retention numbers are close approximations: a player who returns on day 1 is counted on the day they return, so use ranges of a few weeks for stable numbers. Retention benchmarks vary by genre and source. Treat them as rough guides.
