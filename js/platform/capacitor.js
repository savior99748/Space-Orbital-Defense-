// iOS / Android adapter (Capacitor). Shipped only in the mobile builds.
// Phase 3 adds AdMob rewarded ads (P.ads), the $2.99 ad-free purchase (P.premium) and app lifecycle here.
(function (OD) {
  "use strict";
  const P = OD.platform, name = P.name;
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

})(window.OD);
