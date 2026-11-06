// Monetization service: the ONLY monetization API gameplay calls. It decides, per platform, whether a bonus
// is earned by watching a rewarded ad, claimed for free (ad-free / premium players), or not offered at all.
//
//   M.offer(kind)               → { available, method: "ad" | "premium" | "none" }
//   M.claim(kind, once)         → Promise<boolean>  true = grant the reward now
//                                  `once` = { done(): bool, mark(): void } — the game's own record of the grant
//                                  (e.g. "bonus already taken this wave"). It is checked before and marked
//                                  before the promise resolves, so a double tap, a repeated SDK callback or a
//                                  resumed save can never pay twice. A claim made while one is running waits for it and returns false.
//   M.breakAd()                 → Promise  a natural-break ad where allowed; resolves at once otherwise
//   M.isPremium()               → bool     ad-free player (paid Steam game, or the mobile upgrade)
//
// kinds: "credits" (bonus between waves, once per wave), "revive" (once per run after losing).
// Premium players get exactly the same bonuses with the same limits, without the ad.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const P = OD.platform;
  const pending = {};

  const isPremium = () => { try { return !!(P.premium && P.premium.owned()); } catch { return false; } };

  function offer(kind) {
    if (isPremium()) return { available: true, method: "premium" };
    if (P.ads && P.ads.rewardedAvailable()) return { available: true, method: "ad" };
    return { available: false, method: "none" };
  }

  function claim(kind, once) {
    if (once && once.done()) return Promise.resolve(false);
    if (pending[kind]) return pending[kind].then(() => false); // a second tap waits for the first, and never pays
    const method = offer(kind).method;
    let p;
    if (method === "premium") p = Promise.resolve(true);
    else if (method === "ad") p = Promise.resolve(P.ads.rewarded()).catch(() => false);
    else p = Promise.resolve(false);
    pending[kind] = p.then(ok => {
      delete pending[kind];
      if (!ok || (once && once.done())) return false; // already granted (e.g. by another path) → no double pay
      if (once) once.mark();
      return true;
    });
    return pending[kind];
  }

  function breakAd() {
    if (isPremium() || !P.ads || !P.ads.midgame) return Promise.resolve();
    return Promise.resolve(P.ads.midgame()).catch(() => undefined);
  }

  OD.monetization = { offer, claim, breakAd, isPremium };
})(window.OD);
