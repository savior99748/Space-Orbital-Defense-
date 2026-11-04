// Endless-mode leaderboards.
// Today: a top-10 list per map + difficulty, saved on this device (or in portal cloud saves).
// Later: a worldwide board can be added behind the same functions (submit / top), so the game
// code won't need to change.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const P = OD.platform;
  const store = { get: k => P.save.get(k), set: (k, v) => P.save.set(k, v) };
  const MAX = 10;
  // 3D and Classic 2D keep separate boards (they play differently)
  const key = (map, diff) => `od_lb${OD.is3D ? "3d" : ""}_${map}_${diff}`;

  const L = (OD.leaderboard = {});

  // Player nickname (letters, numbers, spaces, - _ . only; max 16 characters).
  const clean = s => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").replace(/\s+/g, " ").trim().slice(0, 16);
  L.nickname = () => store.get("od_nick") || "";
  L.setNickname = function (name) {
    const n = clean(name);
    store.set("od_nick", n);
    // Runs saved before a name was chosen were made on this device, so give them the new name.
    for (const map of OD.MAP_ORDER) for (const diff of Object.keys(OD.DIFFICULTY)) {
      const list = L.top(map, diff);
      if (list.some(e => !e.name)) { list.forEach(e => { if (!e.name) e.name = n; }); store.set(key(map, diff), JSON.stringify(list)); }
    }
    return n;
  };

  L.top = function (map, diff) {
    try { const v = JSON.parse(store.get(key(map, diff)) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
  };

  // Record a finished Endless run. Returns { rank (1-10 or null), entries, entry }.
  // `replaceId` replaces an earlier entry from the same run (e.g. after an ad revive).
  L.submit = function (map, diff, { wave, score }, replaceId) {
    const list = L.top(map, diff).filter(e => e.id !== replaceId);
    const entry = { id: Date.now() + Math.random(), name: L.nickname(), wave, score, date: new Date().toISOString().slice(0, 10) };
    list.push(entry);
    list.sort((a, b) => b.wave - a.wave || b.score - a.score);
    const kept = list.slice(0, MAX);
    store.set(key(map, diff), JSON.stringify(kept));
    const i = kept.indexOf(entry);
    return { rank: i >= 0 ? i + 1 : null, entries: kept, entry };
  };

  // Best Endless wave on a map (any difficulty), and overall.
  L.bestMap = map => Math.max(0, ...Object.keys(OD.DIFFICULTY).map(d => (L.top(map, d)[0] || {}).wave || 0));
  L.bestAll = () => Math.max(0, ...OD.MAP_ORDER.map(L.bestMap));
})(window.OD);
