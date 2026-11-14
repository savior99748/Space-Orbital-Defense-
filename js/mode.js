// Chooses the view before the game starts: 3D (default) or Classic 2D (the v2 look and maps).
// The choice is saved per device; the main menu has a switch. Devices without WebGL get Classic 2D.
//   ?view=2d / ?view=3d   force a view (testing)
//   ?headless=1           run 3D maps without drawing anything (automated balance tests)
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const params = new URLSearchParams(location.search);
  let saved = null;
  // "od_view_c": the view choice since Version C (2D default). Choices saved before it (od_view, when 3D was the
  // default) are ignored once, so everyone starts in 2D; picking 3D again is remembered from then on.
  const VIEW_KEY = "od_view_c";
  try { saved = localStorage.getItem(VIEW_KEY); } catch { /* storage blocked */ }
  let view = params.get("view") || saved || "2d"; // everyone starts in 2D (Version C); 3D is one tap away in the menu
  const webgl = (() => {
    try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
    catch { return false; }
  })();
  OD.webgl = webgl;
  if (view === "3d" && !webgl) view = "2d";
  OD.view = view;
  OD.is3D = view === "3d";
  OD.headless = params.get("headless") === "1";
  // Own Orbits (2D and 3D): every satellite launches onto its own orbit (LEO / MEO / HEO) and carries fuel.
  // ?orbits=classic (or localStorage od_orbits = "classic") brings the old shared ring slots back: used by the
  // automated tests of the slot-based mechanics.
  let orbits = params.get("orbits");
  if (!orbits) try { orbits = localStorage.getItem("od_orbits"); } catch { /* storage blocked */ }
  OD.EXP = orbits !== "classic" ? "orbits" : null;
  // Classic 2D: planets drawn 1.5× bigger (they looked small on large screens); Saturn's belt grows with it.
  // The Solar System map already has big planets. Orbits keep their sizes (Own Orbits pushes lanes clear of the surface).
  if (!OD.is3D) for (const m of Object.values(OD.MAPS)) {
    if (m.final || m.body.r2d) continue;
    m.body = Object.assign({}, m.body, { r: Math.round(m.body.r * 1.5), r2d: true });
    if (m.body.belt) m.body.belt = { ...m.body.belt, inner: Math.round(m.body.belt.inner * 1.5), outer: Math.round(m.body.belt.outer * 1.5) };
  }
  if (OD.is3D) {
    window.OD_NO2D = true;            // the 3D view does the drawing
    OD.apply3DMaps();                 // bigger planets, tilted orbits
    document.documentElement.classList.add("mode-3d");
  }
  // Switch view (saved), then reload so the right maps and renderer start fresh.
  OD.setView = function (v) {
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ }
    const url = new URL(location.href); url.searchParams.delete("view");
    location.replace(url.toString());
  };
})(window.OD);
