// Anonymous player stats: answers "do players come back?" and "where do they quit?".
//
// Privacy: no cookies, no names, no device IDs, no personal data. Only event names like
// "wave/earth/10" are counted. Players can switch it off in the menu, and Do Not Track is respected.
// Events go to GoatCounter (see js/config.js). With no site code configured, nothing is sent.
//
// Retention works without tracking anyone: the game remembers the date of the first visit on the
// device and sends "return/d1" (or d3, d7, d30) once when the player comes back on that day.
// D1 retention ≈ return/d1 ÷ new-player.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const cfg = OD.CONFIG || {};
  const P = OD.platform;
  const store = { get: k => P.save.get(k), set: (k, v) => P.save.set(k, v) };
  const debug = new URLSearchParams(location.search).get("debugstats") === "1";
  const dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1";
  const portal = P.name === "crazygames";

  const A = (OD.analytics = {
    configured: !!cfg.goatcounter && (!portal || cfg.statsOnPortals),
    get enabled() { return this.configured && !dnt && store.get("od_stats_off") !== "1"; },
    setEnabled(on) { store.set("od_stats_off", on ? "0" : "1"); },
  });

  let queue = [], loaded = false, loading = false, blocked = false;
  function load() {
    if (loading || !A.enabled) return;
    loading = true;
    window.goatcounter = { no_onload: true };
    const s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${cfg.goatcounter}.goatcounter.com/count`;
    s.dataset.goatcounterSettings = JSON.stringify({ no_onload: true });
    s.onload = () => { loaded = true; flush(); };
    s.onerror = () => { blocked = true; queue = []; }; // ad blocker or offline: stop quietly
    document.head.appendChild(s);
  }
  function flush() {
    if (!loaded || !window.goatcounter || !window.goatcounter.count) return;
    for (const path of queue) { try { window.goatcounter.count({ path, title: path, event: true }); } catch { /* ignore */ } }
    queue = [];
  }

  // Count one event. Names are short paths, e.g. "game-start/earth/medium".
  A.track = function (path) {
    if (debug) console.log("[stats]", path);
    if (!A.enabled || blocked) return;
    if (queue.length < 200) queue.push(path);
    load();
    flush();
  };

  // Count an event only once per device, ever.
  A.once = function (path) {
    const k = "od_once_" + path;
    if (store.get(k)) return;
    store.set(k, "1");
    A.track(path);
  };

  // Called once the platform has loaded (saves may come from the cloud).
  A.sessionStart = function () {
    const today = Math.floor(Date.now() / 86400000);
    let first = Number(store.get("od_first_day"));
    if (!first) { first = today; store.set("od_first_day", String(today)); A.track("new-player"); }
    const day = today - first;
    for (const d of [1, 3, 7, 30]) if (day === d) A.once(`return/d${d}`);
    A.track(`session/${P.name}`);
  };

  const bucket = w => (w >= 100 ? "100+" : w >= 75 ? "75-99" : w >= 50 ? "50-74" : w >= 40 ? "40-49" : w >= 30 ? "30-39" :
    w >= 20 ? "20-29" : w >= 10 ? "10-19" : w >= 5 ? "5-9" : "1-4");
  A.bucket = bucket;
})(window.OD);
