// Maps: every planet in the Solar System, plus the whole Solar System as a final map.
// A map has a central body (planet or Sun) with its own turret rings, and orbiting bodies (moons,
// or planets on the Solar System map). Each orbiting body carries its own small turret ring and
// pulls passing invaders toward it with gravity.
//
// Units: world units. `view` is how much of the board must fit on screen (bigger = zoomed out).
// Speeds are radians per second. Sizes and distances are stylized, not to scale.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const PI = Math.PI;

  OD.MAPS = {
    mercury: {
      tier: "beginner", name: "Mercury", sub: "The Iron Planet", stars: 1, view: 700, hp: 0.9,
      desc: "Small and moonless, with three full rings. The best place to learn.",
      feature: "Scorching sunlight: no moons, but plenty of ring slots.",
      body: { style: "mercury", r: 30 },
      rings: [{ r: 110, slots: 8, speed: 0.11 }, { r: 185, slots: 12, speed: -0.08 }, { r: 265, slots: 16, speed: 0.05 }],
      moons: [],
      bg: "#3a2410",
    },
    venus: {
      tier: "beginner", name: "Venus", sub: "The Backwards World", stars: 1, view: 700, hp: 0.95,
      desc: "Venus spins backwards, and so do its rings: all three turn the same way.",
      feature: "Retrograde: every ring rotates in the same direction, so your defenses sweep together.",
      body: { style: "venus", r: 44 },
      rings: [{ r: 120, slots: 8, speed: -0.1 }, { r: 200, slots: 12, speed: -0.065 }, { r: 280, slots: 14, speed: -0.04 }],
      moons: [],
      bg: "#3a3010",
    },
    earth: {
      tier: "beginner", name: "Earth", sub: "Home", stars: 2, view: 720, hp: 1,
      desc: "Defend home. The Moon orbits with its own turret ring, and its gravity pulls invaders in.",
      feature: "The Moon: a 6-slot ring that travels around Earth, and a gravity well that lures enemies.",
      body: { style: "earth", r: 46 },
      rings: [{ r: 120, slots: 8, speed: 0.1 }, { r: 200, slots: 12, speed: -0.07 }],
      moons: [
        { name: "Moon", style: "luna", r: 18, orbit: 292, speed: 0.06, phase: 0.5, gravity: 0.55, ring: { r: 44, slots: 6, speed: 0.35 } },
      ],
      bg: "#0e2246",
    },
    mars: {
      tier: "intermediate", name: "Mars", sub: "The Red Planet", stars: 2, view: 720, hp: 1,
      desc: "Two tiny moons: Phobos whips around close to Mars, while Deimos drifts slowly further out.",
      feature: "Phobos orbits fast between the rings, dragging enemies with it.",
      body: { style: "mars", r: 36 },
      rings: [{ r: 100, slots: 8, speed: 0.1 }, { r: 200, slots: 12, speed: -0.07 }],
      moons: [
        { name: "Phobos", style: "phobos", r: 9, orbit: 150, speed: 0.32, phase: 0, gravity: 0.35, ring: { r: 24, slots: 3, speed: 0.6 } },
        { name: "Deimos", style: "deimos", r: 8, orbit: 285, speed: 0.07, phase: 2.2, gravity: 0.3, ring: { r: 26, slots: 4, speed: -0.4 } },
      ],
      bg: "#3a1408",
    },
    jupiter: {
      tier: "intermediate", name: "Jupiter", sub: "King of Planets", stars: 3, view: 830, hp: 1.05,
      desc: "A giant planet with four big moons. Invaders reach it fast, but the moons give you lots of room.",
      feature: "Galilean moons: Io, Europa, Ganymede and Callisto each have a ring and strong gravity.",
      body: { style: "jupiter", r: 70 },
      rings: [{ r: 125, slots: 10, speed: 0.08 }, { r: 188, slots: 14, speed: -0.05 }],
      moons: [
        { name: "Io", style: "io", r: 12, orbit: 240, speed: 0.13, phase: 0, gravity: 0.45, ring: { r: 28, slots: 4, speed: 0.5 } },
        { name: "Europa", style: "europa", r: 11, orbit: 297, speed: 0.09, phase: 2.1, gravity: 0.4, ring: { r: 27, slots: 4, speed: -0.45 } },
        { name: "Ganymede", style: "ganymede", r: 15, orbit: 355, speed: 0.06, phase: 4.0, gravity: 0.55, ring: { r: 28, slots: 5, speed: 0.4 } },
        { name: "Callisto", style: "callisto", r: 14, orbit: 355, speed: 0.06, phase: 4.0 + PI, gravity: 0.5, ring: { r: 28, slots: 5, speed: -0.35 } },
      ],
      bg: "#2e1e10",
    },
    saturn: {
      tier: "intermediate", name: "Saturn", sub: "Lord of the Rings", stars: 3, view: 800, hp: 1.05,
      desc: "Saturn's icy rings slow everything that crosses them. Titan is huge, with a big turret ring.",
      feature: "Ice rings: invaders crossing Saturn's rings move 35% slower.",
      body: { style: "saturn", r: 60, belt: { inner: 80, outer: 122, slow: 0.65 } },
      rings: [{ r: 158, slots: 12, speed: 0.07 }, { r: 222, slots: 14, speed: -0.05 }],
      moons: [
        { name: "Titan", style: "titan", r: 20, orbit: 300, speed: 0.05, phase: 1.0, gravity: 0.6, ring: { r: 46, slots: 6, speed: 0.3 } },
        { name: "Enceladus", style: "enceladus", r: 9, orbit: 300, speed: 0.05, phase: 1.0 + PI, gravity: 0.3, ring: { r: 26, slots: 4, speed: -0.5 } },
      ],
      bg: "#2e2814",
    },
    uranus: {
      tier: "hard", name: "Uranus", sub: "The Sideways Giant", stars: 4, view: 780, hp: 1.1,
      desc: "An ice giant knocked on its side. Its rings spin fast, and its moons share two orbits.",
      feature: "Fast spin: Uranus's rings rotate much faster than any other planet's.",
      body: { style: "uranus", r: 52 },
      rings: [{ r: 120, slots: 8, speed: 0.16 }, { r: 200, slots: 12, speed: -0.12 }],
      moons: [
        { name: "Titania", style: "titania", r: 12, orbit: 285, speed: 0.08, phase: 0.3, gravity: 0.4, ring: { r: 28, slots: 4, speed: 0.5 } },
        { name: "Oberon", style: "oberon", r: 12, orbit: 285, speed: 0.08, phase: 0.3 + PI, gravity: 0.4, ring: { r: 28, slots: 4, speed: -0.5 } },
        { name: "Miranda", style: "miranda", r: 8, orbit: 345, speed: 0.05, phase: 2.0, gravity: 0.25, ring: { r: 24, slots: 3, speed: 0.6 } },
      ],
      bg: "#0e2a30",
    },
    neptune: {
      tier: "hard", name: "Neptune", sub: "The Windy World", stars: 4, view: 780, hp: 1.1, enemySpeed: 1.12,
      desc: "Supersonic winds push invaders 12% faster. Triton orbits backwards with heavy gravity.",
      feature: "Winds: enemies move 12% faster. Triton orbits in reverse.",
      body: { style: "neptune", r: 50 },
      rings: [{ r: 118, slots: 8, speed: 0.09 }, { r: 198, slots: 12, speed: -0.07 }],
      moons: [
        { name: "Triton", style: "triton", r: 17, orbit: 300, speed: -0.07, phase: 0.8, gravity: 0.65, ring: { r: 40, slots: 6, speed: 0.4 } },
      ],
      bg: "#0a1640",
    },
    sol: {
      tier: "expert", name: "Solar System", sub: "The Final Stand", stars: 5, view: 830, hp: 0.95, final: true, lifeName: "Sun", planetHp: 15, satScale: 0.4, // every planet has its own HP; small satellites next to big planets
      desc: "Invaders are coming for the Sun itself. All eight planets orbit at their own speeds, each with its own turret ring.",
      feature: "Every planet's gravity bends invader paths. Your satellites ride along with their planets.",
      body: { style: "sun", r: 40 },
      rings: [],
      moons: [
        { name: "Mercury", style: "mercury", r: 7.5, gravR: 60.5, orbit: 70, speed: 0.2, phase: 0.0, gravity: 0.25, ring: { r: 17, slots: 4, speed: 0.6 } },
        { name: "Venus", style: "venus", r: 12, gravR: 74, orbit: 106, speed: 0.15, phase: 2.5, gravity: 0.35, ring: { r: 21, slots: 5, speed: -0.5 } },
        { name: "Earth", style: "earth", r: 12, gravR: 74, orbit: 146, speed: 0.115, phase: 4.4, gravity: 0.35, ring: { r: 21, slots: 5, speed: 0.5 } },
        { name: "Mars", style: "mars", r: 9, gravR: 65, orbit: 184, speed: 0.09, phase: 1.2, gravity: 0.3, ring: { r: 19, slots: 4, speed: 0.55 } },
        { name: "Jupiter", style: "jupiter", r: 22.5, gravR: 105.5, orbit: 236, speed: 0.05, phase: 3.3, gravity: 0.6, ring: { r: 29, slots: 7, speed: 0.35 } },
        { name: "Saturn", style: "saturn", r: 19.5, gravR: 96.5, orbit: 290, speed: 0.036, phase: 5.4, gravity: 0.55, ring: { r: 27, slots: 7, speed: -0.3 } },
        { name: "Uranus", style: "uranus", r: 15, gravR: 83, orbit: 336, speed: 0.025, phase: 0.8, gravity: 0.45, ring: { r: 23, slots: 6, speed: 0.45 } },
        { name: "Neptune", style: "neptune", r: 15, gravR: 83, orbit: 378, speed: 0.018, phase: 2.9, gravity: 0.45, ring: { r: 23, slots: 6, speed: -0.4 } },
      ],
      bg: "#2a1406",
    },
  };

  // Like Bloons tracks, each map has its own difficulty: pick a map, and you've picked how hard it is.
  // `diff` is the difficulty settings it plays with (js/data.js); records and leaderboards are kept per map + diff.
  OD.TIERS = {
    beginner:     { name: "Beginner",     color: "#7dff9a", diff: "easy" },
    intermediate: { name: "Intermediate", color: "#ffd166", diff: "medium" },
    hard:         { name: "Hard",         color: "#ff8a5c", diff: "hard" },
    expert:       { name: "Expert",       color: "#ff4d7a", diff: "hard" },
  };
  OD.MAP_ORDER = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune", "sol"];
})(window.OD);
