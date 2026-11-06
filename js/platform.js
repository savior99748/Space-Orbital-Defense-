// Platform layer: everything that differs between the web, game portals, desktop (Steam) and
// mobile app builds lives here, so the game code never needs to know where it is running.
//
//   OD.platform.name            "web" | "crazygames" | "electron" | "capacitor"
//   OD.platform.init()          Promise: load SDKs, cloud saves
//   OD.platform.save            get(key) / set(key, value) / remove(key)  (sync, JSON-safe strings)
//   OD.platform.ads             rewardedAvailable(), rewarded() -> Promise<bool>, midgame() -> Promise
//   OD.platform.gameplayStart() / gameplayStop() / loadingDone() / happy()
//   OD.platform.achievement(id) unlock a platform achievement (Steam via the desktop wrapper)
//   OD.platform.onAdStart / onAdEnd   set by the game to pause + mute around ads
//
// The build script (tools/build.mjs) sets window.OD_PLATFORM for each target. You can also try a
// platform locally with ?platform=crazygames, and simulate ads on the web build with ?adtest=1.
window.OD = window.OD || {};
(function (OD) {
  "use strict";

  const params = new URLSearchParams(location.search);
  const native = window.odNative; // provided by the Electron preload script
  const isCapacitor = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const name = window.OD_PLATFORM || params.get("platform") || (native ? native.platform : isCapacitor ? "capacitor" : "web");

  const P = (OD.platform = { name, version: window.OD_VERSION || "dev", onAdStart: null, onAdEnd: null });

  // ---------- storage ----------
  const local = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } },
    remove(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };
  P.save = local;

  // ---------- defaults (plain web) ----------
  const adTest = params.get("adtest") === "1";
  P.ads = {
    rewardedAvailable: () => adTest,
    rewarded: () => (adTest ? fakeAd(true) : Promise.resolve(false)),
    midgame: () => (adTest ? fakeAd(false) : Promise.resolve()),
  };
  P.gameplayStart = () => {};
  P.gameplayStop = () => {};
  P.loadingDone = () => {};
  P.happy = () => {};
  P.achievement = id => { if (native && native.achievement) native.achievement(id); };
  P.init = () => Promise.resolve();

  // Simulated ad for testing the ad flow without a real ad network (?adtest=1).
  function fakeAd(rewarded) {
    return new Promise(resolve => {
      adStarted();
      const el = document.createElement("div");
      el.className = "fake-ad";
      el.innerHTML = `<div><b>Test ad</b><span>${rewarded ? "Rewarded" : "Midgame"} · closes in 2s</span></div>`;
      document.body.appendChild(el);
      setTimeout(() => { el.remove(); adEnded(); resolve(rewarded ? true : undefined); }, 2000);
    });
  }

  function adStarted() { if (P.onAdStart) P.onAdStart(); }
  function adEnded() { if (P.onAdEnd) P.onAdEnd(); }

  // ---------- CrazyGames (HTML5 SDK v3) ----------
  if (name === "crazygames") {
    let sdk = null;
    const loadScript = src => new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
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
    P.ads = {
      rewardedAvailable: () => !!(sdk && sdk.ad),
      rewarded: () => requestAd("rewarded"),
      midgame: () => requestAd("midgame").then(() => undefined),
    };
  }

  // ---------- Capacitor (iOS / Android) ----------
  // localStorage persists inside the native app. Ads and in-app purchases are added later with
  // native plugins (e.g. AdMob); wire them into P.ads here when that happens.
  if (name === "capacitor") {
    P.init = async () => {
      try {
        const sb = window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
        if (sb && sb.hide) await sb.hide();
      } catch { /* optional plugin */ }
    };
  }

  // ---------- installable web app (PWA): offline support on the plain web build ----------
  if (name === "web" && !window.OD_NO_SW && "serviceWorker" in navigator && /^https?:$/.test(location.protocol) && window.top === window.self) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})(window.OD);
