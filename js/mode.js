// Chooses the view before the game starts. The game ships as 2D; the 3D view stays in the code, opened only with
// ?view=3d (it needs WebGL). There is no switch in the menu.
//   ?view=2d / ?view=3d   force a view (testing)
//   ?headless=1           run 3D maps without drawing anything (automated balance tests)
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const params = new URLSearchParams(location.search);
  // 2D is the game (the menu has no 2D / 3D switch any more). The 3D view is kept in the code for later, and only
  // opens with ?view=3d (development and the automated tests); an old saved "3d" choice is ignored.
  let view = params.get("view") === "3d" ? "3d" : "2d";
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
  // Reload in another view (development: ?view=3d), so the right maps and renderer start fresh. 2D drops the parameter.
  OD.setView = function (v) {
    const url = new URL(location.href);
    if (v === "3d") url.searchParams.set("view", "3d"); else url.searchParams.delete("view");
    location.replace(url.toString());
  };
})(window.OD);
