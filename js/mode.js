// Chooses the view before the game starts: 3D (default) or Classic 2D (the v2 look and maps).
// The choice is saved per device; the main menu has a switch. Devices without WebGL get Classic 2D.
//   ?view=2d / ?view=3d   force a view (testing)
//   ?headless=1           run 3D maps without drawing anything (automated balance tests)
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const params = new URLSearchParams(location.search);
  let saved = null;
  try { saved = localStorage.getItem("od_view"); } catch { /* storage blocked */ }
  let view = params.get("view") || saved || "3d";
  const webgl = (() => {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
    catch { return false; }
  })();
  OD.webgl = webgl;
  if (view === "3d" && !webgl) view = "2d";
  OD.view = view;
  OD.is3D = view === "3d";
  OD.headless = params.get("headless") === "1";
  // ?exp=orbits: EXPERIMENT "Own Orbits" (each satellite on its own orbit, fuel, LEO → MEO → HEO). Off unless the
  // link asks for it; 3D only. Uses its own saves and records, and sends no stats, achievements or leaderboard scores.
  OD.EXP = OD.is3D && params.get("exp") === "orbits" ? "orbits" : null;
  if (OD.is3D) {
    window.OD_NO2D = true;            // the 3D view does the drawing
    OD.apply3DMaps();                 // bigger planets, tilted orbits
    document.documentElement.classList.add("mode-3d");
  }
  // Switch view (saved), then reload so the right maps and renderer start fresh.
  OD.setView = function (v) {
    try { localStorage.setItem("od_view", v); } catch { /* ignore */ }
    const url = new URL(location.href); url.searchParams.delete("view");
    location.replace(url.toString());
  };
})(window.OD);
