# Publisher shortlist

Researched November 2026. Submission programs change often, so open each official page before sending anything. Where a detail comes from an older article, it says so.

**Golden rule:** a real publisher pays you. Never pay a "publisher" to publish your game. Have a game-industry lawyer review any contract before signing (about $2k–5k).

## Recommended order

1. **CrazyGames** (web): build ready now, free, open submissions. It gets real players and real numbers.
2. **Kwalee Hitseeker** and **CrazyLabs** (mobile): both accept short gameplay videos, so the pitch-kit clips are enough to start.
3. **Azur Games** (mobile): email submission, and they say they look beyond early metrics.
4. **Voodoo / Homa / SayGames** (mobile): data-driven; best once you have an Android build and retention numbers.
5. **Poki** (web): curated and exclusive on the web. Apply once CrazyGames numbers look good, or choose one of the two.
6. **PC / Steam publisher**: only after a deeper version and a Steam page with wishlists.

## Web game portals

| Publisher | How to submit | What they want | Deal (as reported) |
|---|---|---|---|
| **CrazyGames** | Developer portal upload (`dist/orbital-defense-crazygames.zip`) | Their SDK (already built in), passes QA review ([docs](https://docs.crazygames.com/requirements/intro/)) | Ad revenue share via SDK; exact split not published ([guide](https://app.cinevva.com/guides/publish-game-crazygames)) |
| **Poki** | [Poki for Developers](https://sdk.poki.com/) (playtesting tools in closed beta) | Must meet [requirements](https://sdk.poki.com/requirements) and add the Poki SDK; works for 85%+ of players per platform ([deals](https://sdk.poki.com/deals)) | **Web exclusivity**, 5 years by default; Steam and app stores stay yours ([deals](https://sdk.poki.com/deals)) |
| GameDistribution | Developer portal, zipped HTML5 + their SDK ([Defold guide](https://defold.com/2021/03/14/Releasing-html5-games-on-Game-Distribution/)) | Pause and mute during ads | Rate not published; forum reports of low or missing payouts ([forum](https://html5gamedevs.com/topic/32413-gamedistributioncom-offers-revenue-share)). **Lowest priority.** |

## Mobile publishers

These mostly publish casual and "hybrid-casual" games. They pay for a short ad test, measure cost per install and how many players come back, and scale the winners. Most expect their own SDK in the game. Our Capacitor app can host native SDKs, but some prefer Unity projects.

| Publisher | How to submit | Notes |
|---|---|---|
| **Kwalee** | **Hitseeker** publishing portal, linked from [kwalee.com/casual-games](https://www.kwalee.com/casual-games) | A few **15-second gameplay videos** or a simple prototype is enough to start ([blog](https://kwalee.com/blog/industry/best-mobile-publisher-2022), undated). Also publishes PC and console. |
| **CrazyLabs** | Concept **video** via their site, [crazylabs.com/developers](https://crazylabs.com/developers/) | Approved concepts get feedback and their CLIK testing dashboard, then a dedicated team if the results are strong. "Publishing For All" program ([PocketGamer.biz](https://www.pocketgamer.biz/publishing-for-all-hypercasual-games-wanted)). |
| **Azur Games** | Email a short game description and the build (APK) to **publishing@azurgames.com** ([PocketGamer.biz interview](https://www.pocketgamer.biz/interview/73255/azur-games-building-a-strong-relationship-between-a-developer-and-itspublisher/), 2020-era; confirm it's still current) | They say they'll consider strong games even with weak early numbers, and don't lock studios into exclusivity. |
| **Voodoo** | Publishing platform and competitions ([guide](https://voodoo.io/news/a-snackable-guide-to-partnering-with-voodoo)) | Runs about a 4-day paid test of the prototype ([Unity forum](https://discussions.unity.com/t/any-real-experience-or-feedback-on-voodoo-publishing-platform/858083)). Frequent game jams and competitions (a Hanoi jam ran in March 2026). |
| **Homa** | Submit a prototype; Homa Lab provides testing and market data ([TechCrunch](https://techcrunch.com/2021/02/09/hyper-casual-game-publisher-homa-games-raises-15-million/)) | Expects Unity prototypes and their SDK ("Homa Belly"). Revenue split agreed per game. |
| **SayGames** | Contact the publishing team via [say.games](https://say.games/news/sayhero/) (older address: publishing@saygames.by) | A 2021 report described a 30/70 split in SayGames' favor with a launch bonus ([dev.by](https://devby.io/news/saygames-programma-podderzhki)). Check current terms. |

**What they'll ask for:** 15–30 second gameplay videos, an Android build, and the share of players who come back on day 1 and day 7. The pitch kit and the stats tracking in this repo provide all three.

## PC / Steam publishers (later)

Publishers say to approach them about **a year before launch**, pick ones that already publish your genre, and have a press kit ready ([GameDev.tv interview with Hooded Horse](https://blog.gamedev.tv/how-to-get-your-game-published-with-guest-tim-from-hooded-horse/amp/)). Many deals come from personal introductions at events rather than cold emails ([GDC talk](https://gdcvault.com/play/1034246/25-Games-Signed-Without-a)).

| Publisher | Fit | Notes |
|---|---|---|
| **Hooded Horse** | Strategy (bigger games) | Reportedly at least $100k marketing per game and developers keep 65% after release ([Wikipedia](https://en.wikipedia.org/wiki/Hooded_Horse)). A stretch goal. |
| **Mystic Forge** | New indie publisher with a tower-defense crossover title | Publishing *Australia Did It* ([GamesMarket](https://www.gamesmarket.global/australia-did-it-new-indie-publisher-mystic-forge-releases-rami-ismails-next-genre-crossover-5f4d41e93564c92d83f6de031c8637b7/)). |
| **Game Source Entertainment** | Publishing an action tower defense game | *Castle of Alchemists*, featured in the March 2026 Steam Tower Defense Fest ([listing](https://asia.gamesource-ent.com/en-HK/news/detail/1261)). |

Steam also runs genre events such as the **Tower Defense Fest**. A Steam page and demo can join these without a publisher.

## Deal checklist

| Term | Typical | Ask for |
|---|---|---|
| Revenue split | About 60% developer / 40% publisher ([PC Gamer](https://www.pcgamer.com/uk/indie-publishing-contracts)) | Some share for you while they recoup their costs |
| Recoupment | Publisher costs paid back first | Clear list of which costs count; audit rights |
| IP ownership | **You keep it** ([Game Developer](https://www.gamedeveloper.com/business/what-makes-for-a-good-game-publishing-contract-2)) | A license, not an assignment |
| Sequels | Right of first refusal | Direct sequels only, short window ([Promise Legal](https://blog.promise.legal/game-publisher-agreements-indie-studios/)) |
| Term | Fixed number of years | Rights return to you if the game is shelved |
| Advance | Paid on milestones | Realistic milestones |
