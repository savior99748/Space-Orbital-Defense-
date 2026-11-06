// CrazyGames adapter (HTML5 SDK v3): loading/gameplay events, rewarded + midgame ads, cloud saves.
// Shipped only in the crazygames and crazygames-basic builds. Basic Launch sets OD_NO_ADS (no ads allowed).
(function (OD) {
  "use strict";
  const P = OD.platform, name = P.name, { local, adStarted, adEnded, loadScript } = OD.platformKit;
  // ---------- CrazyGames (HTML5 SDK v3) ----------
  if (name === "crazygames") {
    let sdk = null;
    P.init = async () => {
      try {
        if (!(window.CrazyGames && window.CrazyGames.SDK)) await loadScript("https://sdk.crazygames.com/crazygames-sdk-v3.js");
        sdk = window.CrazyGames.SDK;
        // Never let a slow or silent SDK keep the game on a blank screen: start anyway after 6 s.
        // (Every SDK call below is wrapped, and saves fall back to the device, so a late SDK is harmless.)
        const ready = await Promise.race([sdk.init().then(() => true), new Promise(r => setTimeout(() => r(false), 6000))]);
        if (!ready) console.warn("CrazyGames SDK did not answer in 6 s; starting the game anyway");
        if (sdk.game && sdk.game.loadingStart) sdk.game.loadingStart();
        // Cloud-synced saves (fall back to localStorage if the data module is unavailable)
        if (sdk.data && sdk.data.getItem) {
          P.save = {
            get(k) { try { const v = sdk.data.getItem(k); return v == null ? local.get(k) : v; } catch { return local.get(k); } },
            set(k, v) { try { sdk.data.setItem(k, v); } catch { /* ignore */ } local.set(k, v); },
            remove(k) { try { sdk.data.removeItem(k); } catch { /* ignore */ } local.remove(k); },
          };
        }
      } catch (err) {
        console.warn("CrazyGames SDK unavailable, running without it", err);
        sdk = null;
      }
    };
    const call = (mod, fn) => { try { if (sdk && sdk[mod] && sdk[mod][fn]) sdk[mod][fn](); } catch { /* ignore */ } };
    P.loadingDone = () => call("game", "loadingStop");
    P.gameplayStart = () => call("game", "gameplayStart");
    P.gameplayStop = () => call("game", "gameplayStop");
    P.happy = () => call("game", "happytime");
    const requestAd = type => new Promise(resolve => {
      if (!sdk || !sdk.ad) return resolve(false);
      let started = false;
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => { started = true; adStarted(); },
          adFinished: () => { if (started) adEnded(); resolve(true); },
          adError: () => { if (started) adEnded(); resolve(false); },
        });
      } catch { resolve(false); }
    });
    P.ads = window.OD_NO_ADS ? { // Basic Launch build: no ads at all
      rewardedAvailable: () => false, rewarded: () => Promise.resolve(false), midgame: () => Promise.resolve(),
    } : {
      rewardedAvailable: () => !!(sdk && sdk.ad),
      rewarded: () => requestAd("rewarded"),
      midgame: () => requestAd("midgame").then(() => undefined),
    };
  }

})(window.OD);
