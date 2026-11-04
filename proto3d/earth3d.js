// 3D preview: Earth with a bigger planet and Low / Medium / High Earth Orbit rings.
window.OD.MAPS.earth = Object.assign({}, window.OD.MAPS.earth, {
  view: 830,
  desc: "Defend home from Low, Medium and High Earth Orbit. The Moon orbits further out with its own turret ring.",
  feature: "Three orbits (LEO, MEO, HEO) plus the Moon, whose gravity pulls invaders in.",
  body: { style: "earth", r: 72 },
  rings: [
    { r: 118, slots: 8, speed: 0.1, name: "LEO" },
    { r: 182, slots: 12, speed: -0.07, name: "MEO" },
    { r: 246, slots: 14, speed: 0.045, name: "HEO" },
  ],
  moons: [
    { name: "Moon", style: "luna", r: 22, orbit: 335, speed: 0.05, phase: 0.5, gravity: 0.55, ring: { r: 46, slots: 6, speed: 0.35 } },
  ],
});
