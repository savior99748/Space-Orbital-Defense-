// 3D preview: Earth with a bigger planet and Low / Medium / High Earth Orbit rings.
window.OD.MAPS.earth = Object.assign({}, window.OD.MAPS.earth, {
  view: 830,
  desc: "Defend home from Low, Medium and High Earth Orbit. The Moon orbits further out with its own turret ring.",
  feature: "Three orbits (LEO, MEO, HEO) plus the Moon, whose gravity pulls invaders in.",
  threeD: true, // tilted orbits + invaders from every height
  rangeMul: 1.2,  // satellites reach 20% further in 3D
  hp: 0.88,      // and invaders are a little weaker, since they are harder to cover
  body: { style: "earth", r: 72 },
  rings: [
    // incl = tilt of the orbit (radians), node = direction of the tilt axis
    { r: 118, slots: 8, speed: 0.1, name: "LEO", incl: 0.17, node: 0.0 },
    { r: 182, slots: 12, speed: -0.07, name: "MEO", incl: 0.52, node: 2.1 },
    { r: 246, slots: 14, speed: 0.045, name: "HEO", incl: 0.87, node: 4.2 },
  ],
  moons: [
    { name: "Moon", style: "luna", r: 22, orbit: 335, speed: 0.05, phase: 0.5, gravity: 0.55, ring: { r: 46, slots: 6, speed: 0.35, incl: 0.7, node: 1.0 } },
  ],
});
