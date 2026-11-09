// Platform layer: everything that differs between the web, game portals, desktop (Steam) and
// mobile app builds lives here, so the game code never needs to know where it is running.
//
//   OD.platform.name            "web" | "crazygames" | "electron" | "capacitor"
//   OD.platform.init()          Promise: load SDKs, cloud saves
//   OD.platform.save            get(key) / set(key, value) / remove(key)  (sync, JSON-safe strings)
//   OD.platform.ads             rewardedAvailable(), rewarded() -> Promise<bool>, midgame() -> Promise
//   OD.platform.gameplayStart() / gameplayStop() / loadingDone() / happy()
//   OD.platform.achievement(id) unlock a platform achievement (Steam via the desktop wrapper)
//   OD.platform.premium         owned() → bool: ad-free entitlement (Steam: the game is paid; mobile: $2.99 upgrade)
//   OD.platform.onAdStart / onAdEnd   set by the game to pause + mute around ads
//
// This file holds the shared defaults (the plain web build). Each other platform has an adapter in
// js/platform/<name>.js that overrides what it needs; the build script ships only the matching adapter,
// so e.g. the CrazyGames SDK never ends up in a desktop or mobile build. Gameplay never calls ads directly:
// it goes through js/monetization.js.
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
  P.achievement = () => {};
  P.premium = { owned: () => false }; // no ad-free entitlement unless an adapter grants one
  P.titleFirst = false; // true = a brand-new player sees the menu first instead of going straight into the tutorial
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
  const loadScript = src => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
  // Shared helpers for the adapters in js/platform/
  OD.platformKit = { local, adStarted, adEnded, loadScript, native };

  // ---------- installable web app (PWA): offline support on the plain web build ----------
  if (name === "web" && !window.OD_NO_SW && "serviceWorker" in navigator && /^https?:$/.test(location.protocol) && window.top === window.self) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})(window.OD);
