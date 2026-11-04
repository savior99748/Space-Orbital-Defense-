// 3D map layouts (v3). Applied over js/maps.js when the 3D view is on; Classic 2D keeps maps.js as is.
// Planets are bigger, satellites orbit on tilted rings (incl = tilt in radians, node = direction of the
// tilt axis), moon rings tilt too, and invaders attack from every height (threeD).
// rangeMul: satellites cover a volume in 3D, so they reach a bit further. hp: enemy health multiplier.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const PI = Math.PI;
  const D3 = { threeD: true, rangeMul: 1.2 };

  OD.MAPS3D = {
    mercury: { ...D3, hp: 0.95, body: { style: "mercury", r: 46 },
      rings: [
        { r: 112, slots: 8, speed: 0.11, incl: 0.15, node: 0.3, name: "LOW" },
        { r: 185, slots: 12, speed: -0.08, incl: 0.45, node: 2.4, name: "MID" },
        { r: 262, slots: 16, speed: 0.05, incl: 0.8, node: 4.4, name: "HIGH" },
      ] },
    venus: { ...D3, hp: 0.93, body: { style: "venus", r: 62 },
      rings: [
        { r: 122, slots: 8, speed: -0.1, incl: 0.2, node: 1.0, name: "LOW" },
        { r: 198, slots: 12, speed: -0.065, incl: 0.5, node: 3.1, name: "MID" },
        { r: 274, slots: 14, speed: -0.04, incl: 0.75, node: 5.2, name: "HIGH" },
      ] },
    earth: { ...D3, hp: 0.96, view: 830, body: { style: "earth", r: 72 },
      desc: "Defend home from Low, Medium and High Earth Orbit. The Moon orbits further out with its own turret ring.",
      feature: "Three tilted orbits (LEO, MEO, HEO) plus the Moon, whose gravity pulls invaders in.",
      rings: [
        { r: 118, slots: 8, speed: 0.1, incl: 0.17, node: 0.0, name: "LEO" },
        { r: 182, slots: 12, speed: -0.07, incl: 0.52, node: 2.1, name: "MEO" },
        { r: 246, slots: 14, speed: 0.045, incl: 0.87, node: 4.2, name: "HEO" },
      ],
      moons: [{ name: "Moon", style: "luna", r: 22, orbit: 335, speed: 0.05, phase: 0.5, gravity: 0.55, ring: { r: 46, slots: 6, speed: 0.35, incl: 0.7, node: 1.0 } }] },
    mars: { ...D3, hp: 1.02, body: { style: "mars", r: 54 },
      rings: [
        { r: 108, slots: 8, speed: 0.1, incl: 0.25, node: 0.8, name: "LOW" },
        { r: 210, slots: 12, speed: -0.07, incl: 0.6, node: 3.6, name: "HIGH" },
      ],
      moons: [
        { name: "Phobos", style: "phobos", r: 11, orbit: 160, speed: 0.3, phase: 0, gravity: 0.35, ring: { r: 24, slots: 3, speed: 0.6, incl: 0.5, node: 0 } },
        { name: "Deimos", style: "deimos", r: 10, orbit: 292, speed: 0.07, phase: 2.2, gravity: 0.3, ring: { r: 27, slots: 4, speed: -0.4, incl: 0.8, node: 2 } },
      ] },
    jupiter: { ...D3, hp: 0.92, body: { style: "jupiter", r: 100 },
      rings: [
        { r: 150, slots: 10, speed: 0.08, incl: 0.15, node: 0.5, name: "LOW" },
        { r: 205, slots: 14, speed: -0.05, incl: 0.45, node: 3.3, name: "HIGH" },
      ],
      moons: [
        { name: "Io", style: "io", r: 14, orbit: 262, speed: 0.12, phase: 0, gravity: 0.45, ring: { r: 28, slots: 4, speed: 0.5, incl: 0.5, node: 0.4 } },
        { name: "Europa", style: "europa", r: 13, orbit: 323, speed: 0.085, phase: 2.1, gravity: 0.4, ring: { r: 27, slots: 4, speed: -0.45, incl: 0.9, node: 1.7 } },
        { name: "Ganymede", style: "ganymede", r: 17, orbit: 382, speed: 0.055, phase: 4.0, gravity: 0.55, ring: { r: 28, slots: 5, speed: 0.4, incl: 0.4, node: 3 } },
        { name: "Callisto", style: "callisto", r: 16, orbit: 382, speed: 0.055, phase: 4.0 + PI, gravity: 0.5, ring: { r: 28, slots: 5, speed: -0.35, incl: 1.0, node: 4.5 } },
      ] },
    saturn: { ...D3, hp: 0.9, body: { style: "saturn", r: 78, belt: { inner: 100, outer: 142, slow: 0.65 } },
      rings: [
        { r: 172, slots: 12, speed: 0.07, incl: 0.35, node: 1.2, name: "LOW" },
        { r: 234, slots: 14, speed: -0.05, incl: 0.7, node: 4.0, name: "HIGH" },
      ],
      moons: [
        { name: "Titan", style: "titan", r: 24, orbit: 316, speed: 0.045, phase: 1.0, gravity: 0.6, ring: { r: 46, slots: 6, speed: 0.3, incl: 0.5, node: 0.5 } },
        { name: "Enceladus", style: "enceladus", r: 11, orbit: 316, speed: 0.045, phase: 1.0 + PI, gravity: 0.3, ring: { r: 26, slots: 4, speed: -0.5, incl: 0.9, node: 2.5 } },
      ] },
    uranus: { ...D3, hp: 0.96, body: { style: "uranus", r: 66 },
      feature: "The sideways giant: fast-spinning rings, the outer one tilted almost on its side.",
      rings: [
        { r: 128, slots: 8, speed: 0.16, incl: 0.3, node: 0.2, name: "LOW" },
        { r: 208, slots: 12, speed: -0.12, incl: 1.25, node: 2.0, name: "POLAR" },
      ],
      moons: [
        { name: "Titania", style: "titania", r: 14, orbit: 292, speed: 0.075, phase: 0.3, gravity: 0.4, ring: { r: 28, slots: 4, speed: 0.5, incl: 0.6, node: 1 } },
        { name: "Oberon", style: "oberon", r: 14, orbit: 292, speed: 0.075, phase: 0.3 + PI, gravity: 0.4, ring: { r: 28, slots: 4, speed: -0.5, incl: 1.0, node: 3 } },
        { name: "Miranda", style: "miranda", r: 10, orbit: 356, speed: 0.045, phase: 2.0, gravity: 0.25, ring: { r: 24, slots: 3, speed: 0.6, incl: 0.4, node: 5 } },
      ] },
    neptune: { ...D3, hp: 0.96, body: { style: "neptune", r: 64 },
      rings: [
        { r: 126, slots: 8, speed: 0.09, incl: 0.2, node: 2.6, name: "LOW" },
        { r: 206, slots: 12, speed: -0.07, incl: 0.55, node: 0.6, name: "HIGH" },
      ],
      moons: [{ name: "Triton", style: "triton", r: 20, orbit: 310, speed: -0.065, phase: 0.8, gravity: 0.65, ring: { r: 40, slots: 6, speed: 0.4, incl: 0.9, node: 3.5 } }] },
    sol: { ...D3, hp: 1.15, view: 940, body: { style: "sun", r: 46 },
      desc: "Invaders are coming for the Sun itself. All eight planets orbit at their own speeds, each with a tilted turret ring.",
      moons: [
        { name: "Mercury", style: "mercury", r: 7, orbit: 80, speed: 0.2, phase: 0.0, gravity: 0.25, ring: { r: 18, slots: 4, speed: 0.6, incl: 0.5, node: 0 } },
        { name: "Venus", style: "venus", r: 10, orbit: 122, speed: 0.15, phase: 2.5, gravity: 0.35, ring: { r: 22, slots: 5, speed: -0.5, incl: 0.3, node: 1 } },
        { name: "Earth", style: "earth", r: 11, orbit: 168, speed: 0.115, phase: 4.4, gravity: 0.35, ring: { r: 22, slots: 5, speed: 0.5, incl: 0.6, node: 2 } },
        { name: "Mars", style: "mars", r: 8, orbit: 212, speed: 0.09, phase: 1.2, gravity: 0.3, ring: { r: 20, slots: 4, speed: 0.55, incl: 0.4, node: 3 } },
        { name: "Jupiter", style: "jupiter", r: 20, orbit: 266, speed: 0.05, phase: 3.3, gravity: 0.6, ring: { r: 31, slots: 7, speed: 0.35, incl: 0.5, node: 4 } },
        { name: "Saturn", style: "saturn", r: 17, orbit: 328, speed: 0.036, phase: 5.4, gravity: 0.55, ring: { r: 30, slots: 7, speed: -0.3, incl: 0.8, node: 5 } },
        { name: "Uranus", style: "uranus", r: 13, orbit: 384, speed: 0.025, phase: 0.8, gravity: 0.45, ring: { r: 25, slots: 6, speed: 0.45, incl: 1.2, node: 0.5 } },
        { name: "Neptune", style: "neptune", r: 13, orbit: 436, speed: 0.018, phase: 2.9, gravity: 0.45, ring: { r: 25, slots: 6, speed: -0.4, incl: 0.6, node: 1.5 } },
      ] },
  };

  // Merge the 3D layouts into OD.MAPS (in place, so code holding OD.MAPS sees them).
  OD.apply3DMaps = function () {
    for (const [k, v] of Object.entries(OD.MAPS3D)) OD.MAPS[k] = Object.assign({}, OD.MAPS[k], v);
  };
})(window.OD);
