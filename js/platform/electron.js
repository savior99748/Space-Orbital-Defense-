// Desktop / Steam adapter (Electron). Shipped only in the desktop build.
// The Steam edition is a paid game: no ads, and the rewarded bonuses are claimed for free (P.premium).
// Saves live in a file in the user's app-data folder (synced by Steam Cloud) instead of browser storage.
(function (OD) {
  "use strict";
  const P = OD.platform, { native, local } = OD.platformKit;
  if (P.name !== "electron") return;
  P.achievement = id => { if (native && native.achievement) native.achievement(id); };
  P.premium = { owned: () => true };

  if (native && native.save) {
    let data = {};
    try { data = native.save.load() || {}; } catch { data = {}; }
    // First run of the file-based saves: bring over progress kept in browser storage by an earlier build.
    if (!Object.keys(data).length) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith("od_")) { data[k] = localStorage.getItem(k); native.save.set(k, data[k]); }
        }
      } catch { /* storage unavailable */ }
    }
    P.save = {
      get: k => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
      set: (k, v) => { data[k] = String(v); native.save.set(k, String(v)); },
      remove: k => { delete data[k]; native.save.remove(k); },
    };
  }
  if (native && native.display) P.display = native.display; // { get(), setFullscreen(on), onChange(fn) }
  if (native && native.quit) P.quit = () => native.quit();
})(window.OD);
