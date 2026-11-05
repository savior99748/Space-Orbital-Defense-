// 3D satellite models (v3.2, "military sci-fi"): seven distinct designs, each changing at every tier and
// specialization. Dark gunmetal hulls with bevelled edges, segmented solar arrays, gold foil, blinking
// beacons, and each satellite's own glowing accent color.
//   buildSatellite({ type, level, path }) → THREE.Group
//     - child "turret" is aimed by the game (its +X axis points at the target)
//     - group.userData.update(time, firing, dt) animates moving parts
//   setReflections(on) → switch the metal reflections on or off (used by the automatic quality steps)
// Local frame: +X points away from the body it orbits, +Y is "up" from the orbit, +Z runs along the orbit.
// Sizes: the main body is ~20 units across, like the 2D art.
//
// Performance: everything that does not move is merged into one mesh per material (per satellite part:
// body and turret), so a fully detailed satellite costs only a handful of draw calls. Parts that animate
// by moving are tagged with live() and kept separate. Merged geometry is cached per model.
import * as THREE from "../vendor/three/three.module.js";

const TAU = Math.PI * 2, H = Math.PI / 2;

// ---------- reflection environment for metal ----------
// A small painted sky (navy, a blue horizon band, a warm sun, a cyan rim). Set per material (not as
// scene.environment, which would also tint the planets); three.js prefilters it for each renderer.
const ENV = (() => {
  const c = document.createElement("canvas"); c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 128);
  sky.addColorStop(0, "#0b1426"); sky.addColorStop(0.45, "#1c3a66"); sky.addColorStop(0.55, "#0f2240"); sky.addColorStop(1, "#04070f");
  g.fillStyle = sky; g.fillRect(0, 0, 256, 128);
  const sun = g.createRadialGradient(60, 46, 0, 60, 46, 40); sun.addColorStop(0, "rgba(255,236,200,1)"); sun.addColorStop(0.2, "rgba(255,190,120,0.6)"); sun.addColorStop(1, "rgba(255,190,120,0)");
  g.fillStyle = sun; g.fillRect(0, 0, 256, 128);
  const rim = g.createRadialGradient(190, 70, 0, 190, 70, 60); rim.addColorStop(0, "rgba(90,200,255,0.9)"); rim.addColorStop(1, "rgba(90,200,255,0)");
  g.fillStyle = rim; g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
let reflections = true;

// ---------- materials ----------
const mats = new Map();
function M(color, { metal = 0.85, rough = 0.34, emissive = null, glow = 0, opacity = 1, side, flat = false, envI = 1 } = {}) {
  const key = [color, metal, rough, emissive, glow, opacity, side, flat, envI].join("|");
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough, emissive: emissive || 0x000000, emissiveIntensity: glow,
      transparent: opacity < 1, opacity, side: side || THREE.FrontSide, depthWrite: opacity >= 1, flatShading: flat,
      envMap: envI > 0 && reflections ? ENV : null, envMapIntensity: envI,
    }));
    mats.get(key).userData.env = envI > 0;
  }
  return mats.get(key);
}
const Glow = (color, g = 1) => M(color, { metal: 0, rough: 0.6, emissive: color, glow: Math.min(g, 1) * 0.9, envI: 0 });
const Accent = color => M(color, { metal: 0.3, rough: 0.35, emissive: color, glow: 0.75 });
// the house palette
const GUN = M("#5d6878", { metal: 0.88, rough: 0.3 });       // main hull
const GUN_D = M("#363e4a", { metal: 0.85, rough: 0.38 });     // darker plating
const STEEL = M("#a7b0bd", { metal: 0.95, rough: 0.22 });    // barrels, collars, struts
const DARK = M("#14181f", { metal: 0.6, rough: 0.55 });      // vents, tubes, mounts
const GOLD = M("#d9a441", { metal: 1, rough: 0.42 });        // thermal foil
const BEACON = Glow("#ff3048");                               // blinking nav lights (shared, blinked once per frame)

// ---------- geometry ----------
function bevelBox() { // unit box with softened edges: catches highlights like machined metal
  const s = 0.5, r = 0.07, shape = new THREE.Shape();
  shape.moveTo(-s + r, -s); shape.lineTo(s - r, -s); shape.quadraticCurveTo(s, -s, s, -s + r); shape.lineTo(s, s - r);
  shape.quadraticCurveTo(s, s, s - r, s); shape.lineTo(-s + r, s); shape.quadraticCurveTo(-s, s, -s, s - r); shape.lineTo(-s, -s + r); shape.quadraticCurveTo(-s, -s, -s + r, -s);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1 - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: 0, bevelSegments: 2, curveSegments: 3 });
  g.translate(0, 0, -(1 - 2 * r) / 2); g.computeVertexNormals(); return g;
}
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  bbox: bevelBox(),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  hex: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sph: new THREE.SphereGeometry(0.5, 24, 16),
  sphLo: new THREE.SphereGeometry(0.5, 10, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 20),
  tor: new THREE.TorusGeometry(1, 0.08, 10, 48),
  torThick: new THREE.TorusGeometry(1, 0.16, 12, 48),
  oct: new THREE.OctahedronGeometry(0.5),
  pyr: new THREE.ConeGeometry(0.5, 1, 4),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  dish: new THREE.LatheGeometry([...Array(12)].map((_, i) => new THREE.Vector2(0.02 + i * 0.045, (i * 0.045) ** 2 * 1.4)), 32),
};
G.dish.computeVertexNormals();

// Solar-cell texture: deep blue cells, silver bus bars, a faint sheen
const cellTex = (() => {
  const c = document.createElement("canvas"); c.width = 128; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#0b1430"; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
    gr.addColorStop(0, "#2a56c8"); gr.addColorStop(0.5, "#1b3c98"); gr.addColorStop(1, "#24479f");
    g.fillStyle = gr; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
    g.fillStyle = "rgba(190,210,255,0.25)"; g.fillRect(x * 32 + 2, y * 32 + 15, 28, 1); g.fillRect(x * 32 + 15, y * 32 + 2, 1, 28);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
function panelMat(tint) {
  const k = "panel|" + tint;
  if (!mats.has(k)) { mats.set(k, new THREE.MeshStandardMaterial({ map: cellTex, color: tint || 0xffffff, metalness: 0.2, roughness: 0.3, emissive: tint || 0x3b6dff, emissiveMap: cellTex, emissiveIntensity: tint ? 0.35 : 0.3, envMap: reflections ? ENV : null })); mats.get(k).userData.env = true; }
  return mats.get(k);
}

// ---------- building helpers ----------
function add(parent, geom, mat, s, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geom, mat);
  if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]); m.rotation.set(r[0], r[1], r[2]);
  parent.add(m); return m;
}
const live = o => { o.userData.live = true; return o; }; // moves at runtime: never merged
const alongX = (parent, geom, mat, radius, len, p = [0, 0, 0]) => add(parent, geom, mat, [radius * 2, len, radius * 2], p, [0, 0, -H]);
const alongZ = (parent, geom, mat, radius, len, p = [0, 0, 0]) => add(parent, geom, mat, [radius * 2, len, radius * 2], p, [H, 0, 0]);
// solar wing: a hinge yoke and 2-3 framed panel segments along ±Z (or ±Y when upright)
function wing(parent, len, width, z, tint, sweep = 0, upright = false) {
  const w = new THREE.Group(); w.position.set(0, 0, z); w.rotation.y = sweep; parent.add(w);
  if (upright) { w.position.set(0, z, 0); w.rotation.set(-Math.PI / 2, 0, sweep); }
  const dir = Math.sign(z) || 1;
  add(w, G.cyl8, STEEL, [0.9, 3, 0.9], [0, 0, dir * 1.5], [H, 0, 0]);
  add(w, G.bbox, GUN_D, [1.8, 1.8, 1.2], [0, 0, dir * 3]);
  const segs = len > 12 ? 3 : 2, seg = (len - (segs - 1) * 0.6) / segs;
  for (let i = 0; i < segs; i++) {
    const c = dir * (3.6 + seg / 2 + i * (seg + 0.6));
    add(w, G.box, DARK, [width + 0.6, 0.45, seg + 0.5], [0, -0.06, c]);      // frame
    add(w, G.box, panelMat(tint), [width, 0.5, seg], [0, 0.02, c]);           // cells
  }
  return w;
}
// antenna mast with a blinking beacon
function beacon(parent, x, y, z, h = 6) {
  add(parent, G.cyl8, STEEL, [0.45, h, 0.45], [x, y + h / 2, z]);
  add(parent, G.sphLo, BEACON, 1.3, [x, y + h + 0.4, z]);
}
const haloTex = new Map();
function halo(parent, color, size) {
  if (!haloTex.has(color)) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32), col = new THREE.Color(color);
    gr.addColorStop(0, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.55)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; haloTex.set(color, t);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex.get(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  s.scale.set(size, size, 1); parent.add(s); return s;
}
// jagged lightning line between two points (rebuilt every frame by its updater)
function arc(parent, color) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }));
  parent.add(line);
  line.userData.zap = (a, b, jitter) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < 8; i++) {
      const k = i / 7, j = i === 0 || i === 7 ? 0 : jitter;
      p[i * 3] = a.x + (b.x - a.x) * k + (Math.random() - 0.5) * j;
      p[i * 3 + 1] = a.y + (b.y - a.y) * k + (Math.random() - 0.5) * j;
      p[i * 3 + 2] = a.z + (b.z - a.z) * k + (Math.random() - 0.5) * j;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return line;
}

// ---------- the seven designs ----------
const DESIGNS = {
  // LANCER: gunmetal arrow hull with cyan seams, upright solar wings, ringed emitter barrel
  laser(g, tur, L, P, anim) {
    const cyan = Accent("#45e3ff");
    alongZ(g, G.cyl8, GUN, 5, 14);
    add(g, G.cone, STEEL, [10, 10, 10], [0, 0, 12], [H, 0, 0]);
    add(g, G.cone, DARK, [10.4, 1.2, 10.4], [0, 0, 7.4], [H, 0, 0]);
    alongZ(g, G.cyl, DARK, 4, 1.6, [0, 0, -7.6]);
    alongZ(g, G.cyl, Glow("#6cf0ff"), 3.2, 1.6, [0, 0, -8.4]);
    for (const z of [-4, 4]) alongZ(g, G.cyl8, cyan, 5.25, 0.7, [0, 0, z]);
    add(g, G.bbox, GOLD, [6, 3, 6], [-3.5, 0, 0]);
    beacon(g, 0, 4.6, -3, 5);
    const tint = P === "A" ? "#d6b4ff" : P === "B" ? "#ffd08a" : null;
    wing(g, 9 + L * 2.5, 6, 4, tint, -0.5, true); wing(g, 9 + L * 2.5, 6, -4, tint, 0.5, true);
    add(tur, G.sph, GUN, 7, [3, 0, 0]);
    alongX(tur, G.cyl, STEEL, 3.8, 1.4, [3, 0, 0]);
    if (P === "B") { // SOLAR LANCE: gold sun-dish feeding a superheated lance
      add(tur, G.dish, M("#f3c86a", { metal: 1, rough: 0.2, side: THREE.DoubleSide }), [L >= 4 ? 26 : 20, 7, L >= 4 ? 26 : 20], [-3, 0, 0], [0, 0, H]);
      const LL = L >= 4 ? 30 : 24;
      const heatMat = Glow("#ff8a1e");
      alongX(tur, G.cyl, heatMat, 1.6, LL, [LL / 2 + 1, 0, 0]);
      for (let i = 0; i < 4; i++) add(tur, G.torThick, M("#c8922a", { metal: 1, rough: 0.25 }), [2.3, 2.3, 3], [4 + i * LL / 4, 0, 0], [0, H, 0]);
      const tip = live(add(tur, G.sph, Glow("#fff1c0"), 5, [LL + 1, 0, 0]));
      anim.push(t => { tip.scale.setScalar(4.5 + Math.sin(t * 8) * 0.8); heatMat.emissiveIntensity = 0.75 + Math.sin(t * 5) * 0.25; });
      if (L >= 4) halo(tur, "#ffb347", 34).position.set(LL + 1, 0, 0);
      return;
    }
    const twin = L >= 1, off = twin ? 2.4 : 0;
    for (const s of twin ? [-1, 1] : [0]) { alongX(tur, G.cyl, STEEL, 1.2, 16, [9, 0, s * off]); alongX(tur, G.cyl, DARK, 1.5, 2, [16.5, 0, s * off]); }
    for (let i = 0; i < (L >= 2 ? 3 : L >= 1 ? 1 : 0); i++) add(tur, G.tor, cyan, [2.6 + off, 2.6 + off, 2.6], [8 + i * 4, 0, 0], [0, H, 0]);
    if (P === "A") { // PRISM: spinning crystal + orbiting rainbow shards
      const prism = live(add(tur, G.oct, M("#ffffff", { metal: 0.1, rough: 0.05, emissive: "#c18cff", glow: 1.2 }), [L >= 4 ? 10 : 8, L >= 4 ? 14 : 11, L >= 4 ? 10 : 8], [20, 0, 0]));
      const shards = [];
      if (L >= 4) ["#ff5c7a", "#ffd166", "#7dff9a", "#6cf0ff"].forEach(c => shards.push(live(add(tur, G.oct, Glow(c), [2.5, 4, 2.5], [20, 0, 0]))));
      anim.push(t => {
        prism.rotation.y = t * 2.2; prism.rotation.x = Math.sin(t) * 0.3;
        shards.forEach((s, i) => { const a = t * 2 + i * TAU / 4; s.position.set(20 + Math.cos(a) * 3, Math.sin(a) * 9, Math.cos(a + 1) * 9); s.rotation.y = t * 3; });
      });
      if (L >= 4) halo(tur, "#c18cff", 36).position.set(20, 0, 0);
    } else {
      const lens = live(add(tur, G.sph, Glow("#bff8ff"), L >= 2 ? 5 : 3.5, [18, 0, 0]));
      anim.push(t => lens.scale.setScalar((L >= 2 ? 5 : 3.5) * (1 + Math.sin(t * 6) * 0.08)));
    }
  },

  // HORNET: armored launcher with hazard chevrons and visible missile tips
  missile(g, tur, L, P, anim) {
    const hazard = M("#ff9f43", { metal: 0.3, rough: 0.5, emissive: "#ff7a1a", glow: 0.35 });
    add(g, G.bbox, GUN, [14, 10, 18]);
    add(g, G.bbox, GUN_D, [10, 11, 6], [0, 0, 0]);
    for (const z of [-6.5, 6.5]) add(g, G.box, hazard, [14.4, 1.2, 1.4], [0, 5, z], [0, 0, 0.35]);
    add(g, G.bbox, DARK, [6, 12, 6], [-6, 0, 0]);
    add(g, G.bbox, GOLD, [4, 6, 12], [-7.5, 0, 0]);
    beacon(g, -3, 5, 7, 5);
    const tint = P === "A" ? "#ffe08a" : P === "B" ? "#ff8a8a" : null;
    wing(g, 7 + L * 2, 5, 9, tint); wing(g, 7 + L * 2, 5, -9, tint);
    const missileTip = (parent, x, y, z, s = 1) => { alongX(parent, G.cone, M("#e8e8e8", { metal: 0.5, rough: 0.3 }), 1.4 * s, 4 * s, [x, y, z]); add(parent, G.sphLo, Glow("#ff4a4a"), 1.2 * s, [x + 2.2 * s, y, z]); };
    if (P === "A") { // HIVE: rotating honeycomb pod
      const pod = live(new THREE.Group()); tur.add(pod); pod.position.set(6, 2, 0);
      const ring = L >= 4 ? [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * TAU / 6) * 3.8, Math.sin(i * TAU / 6) * 3.8]), ...[...Array(12)].map((_, i) => [Math.cos(i * TAU / 12) * 7.4, Math.sin(i * TAU / 12) * 7.4])]
        : [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * TAU / 6) * 3.8, Math.sin(i * TAU / 6) * 3.8])];
      for (const [y, z] of ring) { alongX(pod, G.hex, GOLD, 1.95, 11, [0, y, z]); missileTip(pod, 5, y, z, 0.6); }
      add(pod, G.hex, GUN, [L >= 4 ? 18 : 10, 2, L >= 4 ? 18 : 10], [-5.5, 0, 0], [0, 0, H]);
      bakeGroup(pod);
      anim.push(t => { pod.rotation.x = t * (L >= 4 ? 0.8 : 0.4); });
      if (L >= 4) halo(tur, "#ffd166", 34).position.set(6, 2, 0);
      return;
    }
    if (P === "B") { // NOVA: one giant silo with a glowing warhead
      const big = L >= 4 ? 1.3 : 1, coreMat = Glow("#ff4a3a");
      alongX(tur, G.cyl, GUN, 5 * big, 24 * big, [8, 2, 0]);
      for (let i = 0; i < 3; i++) add(tur, G.tor, hazard, [5.4 * big, 5.4 * big, 5.4 * big], [2 + i * 6 * big, 2, 0], [0, H, 0]);
      alongX(tur, G.cone, STEEL, 4.6 * big, 9 * big, [24 * big, 2, 0]);
      alongX(tur, G.cyl, coreMat, 4.8 * big, 1.6, [19 * big, 2, 0]);
      anim.push(t => { coreMat.emissiveIntensity = 0.55 + Math.sin(t * 7) * 0.35; });
      if (L >= 4) halo(tur, "#ff5c5c", 40).position.set(18, 2, 0);
      return;
    }
    // launcher box with 1 / 2 / 4 tubes
    add(tur, G.bbox, GUN, [12, 9, 11], [4, 2, 0]);
    add(tur, G.box, hazard, [12.2, 1, 11.2], [4, 6, 0]);
    const tubes = L === 0 ? [[2, 0]] : L === 1 ? [[2, -2.6], [2, 2.6]] : [[4.4, -2.6], [4.4, 2.6], [-0.4, -2.6], [-0.4, 2.6]];
    for (const [y, z] of tubes) { alongX(tur, G.cyl, DARK, 2, 13, [6, y, z]); alongX(tur, G.tor, STEEL, 2.1, 0.6, [12.4, y, z]); missileTip(tur, 11.5, y, z); }
  },

  // GRAVITY WELL: glowing core inside a spinning gyroscope on a pylon
  tractor(g, tur, L, P, anim) {
    const violet = Accent("#9d6bff");
    add(g, G.cyl, GUN, [5, 14, 5], [0, -6, 0]);
    add(g, G.cyl, GUN_D, [10, 2, 10], [0, -12, 0]);
    add(g, G.cyl, violet, [5.4, 0.8, 5.4], [0, -2, 0]);
    add(g, G.cyl, GOLD, [7, 3, 7], [0, -9, 0]);
    beacon(g, 4, -12, 0, 4);
    const tint = P === "A" ? "#9b7bff" : P === "B" ? "#bff3ff" : null;
    wing(g, 8 + L * 2, 5, 6, tint); wing(g, 8 + L * 2, 5, -6, tint);
    const rings = [];
    const n = P ? 3 : Math.min(3, L + 1), rCol = P === "B" ? "#bff3ff" : "#b388ff";
    for (let i = 0; i < n; i++) rings.push(live(add(g, G.torThick, M(rCol, { metal: 0.9, rough: 0.2, emissive: rCol, glow: 0.3 }), 11 - i * 2.2, [0, 4, 0])));
    if (P === "A") { // SINGULARITY: black hole + accretion disc
      add(g, G.sph, M("#000000", { metal: 0, rough: 1, envI: 0 }), L >= 4 ? 10 : 8, [0, 4, 0]);
      const disc = live(add(g, G.torThick, Glow("#ff9de6"), [L >= 4 ? 9 : 7.5, L >= 4 ? 9 : 7.5, 1.2], [0, 4, 0], [H * 0.8, 0, 0]));
      const disc2 = L >= 4 ? live(add(g, G.tor, Glow("#7a5cff"), [11, 11, 1], [0, 4, 0], [H * 0.8, 0.3, 0])) : null;
      halo(g, "#7a5cff", L >= 4 ? 46 : 34).position.set(0, 4, 0);
      anim.push(t => { disc.rotation.z = t * 2.5; if (disc2) disc2.rotation.z = -t * 1.7; rings.forEach((r, i) => { r.rotation.set(t * (0.6 + i * 0.3), t * (0.4 + i * 0.5), 0); }); });
      return;
    }
    if (P === "B") { // CRYO: cluster of ice crystals
      const ice = M("#e6fbff", { metal: 0.1, rough: 0.05, emissive: "#9ae8ff", glow: 0.7, opacity: 0.85 });
      const spikes = live(new THREE.Group()); spikes.position.set(0, 4, 0); g.add(spikes);
      const count = L >= 4 ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const yy = (i + 0.5) / count * 2 - 1, rr = Math.sqrt(1 - yy * yy);
        const dir = new THREE.Vector3(Math.cos(i * 2.39996) * rr, yy, Math.sin(i * 2.39996) * rr);
        const s = add(spikes, G.oct, ice, [3, 9 + (i % 3) * 2, 3]);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); s.position.copy(dir.multiplyScalar(3));
      }
      add(spikes, G.oct, Glow("#ffffff"), 4);
      bakeGroup(spikes);
      halo(g, "#9ae8ff", L >= 4 ? 40 : 30).position.set(0, 4, 0);
      anim.push(t => { spikes.rotation.y = t * 0.5; rings.forEach((r, i) => { r.rotation.set(t * (0.3 + i * 0.2), t * (0.5 + i * 0.25), 0); }); });
      return;
    }
    const core = live(add(g, G.sph, Glow("#b388ff"), 5 + L, [0, 4, 0]));
    halo(g, "#b388ff", 22 + L * 4).position.set(0, 4, 0);
    anim.push(t => { core.scale.setScalar((5 + L) * (1 + Math.sin(t * 4) * 0.12)); rings.forEach((r, i) => { r.rotation.set(t * (0.7 + i * 0.4), t * (0.5 + i * 0.6), 0); }); });
  },

  // SPEAR: twin-rail cannon with capacitor banks and a reactor
  rail(g, tur, L, P, anim) {
    const green = Accent("#5dff8a"), reactorMat = Glow("#7dff9a");
    add(g, G.bbox, GUN, [10, 8, 20]);
    add(g, G.bbox, GUN_D, [11, 4, 14], [0, -2.5, 0]);
    for (const z of [-5, 0, 5]) add(g, G.box, green, [10.2, 0.5, 0.5], [0, 2.2, z]);
    alongZ(g, G.cyl, DARK, 4.2, 3, [0, 0, -11]);
    alongZ(g, G.cyl, reactorMat, 3.5, 4, [0, 0, -13]);
    add(g, G.bbox, GOLD, [6, 5, 6], [-4, 2, 6]);
    beacon(g, 3, 4, -7, 5);
    anim.push(t => { reactorMat.emissiveIntensity = 0.65 + Math.sin(t * 3) * 0.25; });
    const tint = P === "A" ? "#d4ff9a" : P === "B" ? "#9affd6" : null;
    wing(g, 9 + L * 2.5, 5, 10, tint); wing(g, 9 + L * 2.5, 5, -10, tint);
    add(tur, G.bbox, GUN, [9, 7, 9], [0, 2, 0]);
    add(tur, G.cyl, STEEL, [7, 1.2, 7], [0, -1.6, 0]);
    if (P === "B") { // COIL REPEATER: rotary gatling, spins up when firing
      const spin = live(new THREE.Group()); spin.position.set(4, 2, 0); tur.add(spin);
      const n = L >= 4 ? 6 : 3;
      for (let i = 0; i < n; i++) { const a = i * TAU / n; alongX(spin, G.cyl, M("#39e6a0", { metal: 0.7, rough: 0.3, emissive: "#39e6a0", glow: 0.3 }), 1.1, 22, [11, Math.cos(a) * 3, Math.sin(a) * 3]); }
      for (const x of [3, 20]) add(spin, G.cyl, GUN_D, [9, 1.5, 9], [x, 0, 0], [0, 0, H]);
      bakeGroup(spin);
      let sp = 0;
      anim.push((t, fire, dt) => { sp += (fire ? 16 : 1.5) * (dt || 0.016); spin.rotation.x = sp; });
      if (L >= 4) halo(tur, "#39e6a0", 30).position.set(20, 2, 0);
      return;
    }
    const len = P === "A" ? (L >= 4 ? 48 : 40) : L >= 2 ? 30 : 24;
    for (const s of [-1, 1]) add(tur, G.bbox, P === "A" ? M("#9fbf86", { metal: 0.95, rough: 0.2 }) : STEEL, [len, 2.2, 1.6], [len / 2 + 2, 2, s * 2.4]);
    if (L >= 2 || P) add(tur, G.box, Glow("#7dff9a"), [len - 4, 0.6, 0.6], [len / 2 + 2, 2, 0]);
    const coils = P === "A" ? (L >= 4 ? 7 : 5) : L >= 1 ? 3 : 0;
    for (let i = 0; i < coils; i++) add(tur, G.torThick, i % 2 ? GUN_D : M("#b87333", { metal: 1, rough: 0.3 }), [P === "A" ? 4.6 : 3.8, P === "A" ? 4.6 : 3.8, 4], [5 + i * (len - 8) / Math.max(1, coils), 2, 0], [0, H, 0]);
    if (L >= 1 && !P) for (const z of [-5.5, 5.5]) { add(tur, G.bbox, GUN_D, [8, 4, 2], [0, 2, z]); add(tur, G.box, green, [8.2, 0.4, 2.2], [0, 3, z]); }
    if (P === "A") {
      const muzzle = live(add(tur, G.sph, Glow("#e8ffe0"), L >= 4 ? 6 : 4, [len + 2, 2, 0]));
      anim.push(t => muzzle.scale.setScalar((L >= 4 ? 6 : 4) * (0.85 + Math.sin(t * 5) * 0.15)));
      if (L >= 4) halo(tur, "#b6ff6c", 36).position.set(len, 2, 0);
    }
  },

  // TESLA: a copper coil spire with a crackling orb
  emp(g, tur, L, P, anim) {
    const copper = M("#c07a3c", { metal: 1, rough: 0.25 });
    add(g, G.cyl, GUN, [14, 4, 14], [0, -4, 0]);
    add(g, G.cyl, GUN_D, [16, 1.2, 16], [0, -6.2, 0]);
    add(g, G.cyl, Accent("#ffd54a"), [14.4, 0.6, 14.4], [0, -2.2, 0]);
    beacon(g, 6, -2, 0, 4);
    const tint = P === "A" ? "#fff3a0" : P === "B" ? "#a8c8ff" : null;
    wing(g, 8 + L * 2, 5, 8, tint); wing(g, 8 + L * 2, 5, -8, tint);
    add(g, G.cyl, DARK, [2.4, 16, 2.4], [0, 4, 0]);
    const nCoils = Math.min(4, 2 + L);
    for (let i = 0; i < nCoils; i++) add(g, G.torThick, copper, [5.5 - i * 0.8, 5.5 - i * 0.8, 6], [0, -1 + i * 3, 0], [H, 0, 0]);
    const topY = 12;
    if (P === "A") { // SHOCKWAVE: pulse dish ring
      const ring = live(add(g, G.torThick, Glow("#fff3a0"), [9, 9, 4], [0, topY, 0], [H, 0, 0]));
      add(g, G.cyl, Glow("#fffbe0"), [12, 0.6, 12], [0, topY, 0]);
      const waves = [0, ...(L >= 4 ? [0.5] : [])].map(ph => {
        const w = live(add(g, G.tor, new THREE.MeshBasicMaterial({ color: "#ffe680", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 9, [0, topY, 0], [H, 0, 0]));
        w.userData.ph = ph; return w;
      });
      anim.push(t => { for (const w of waves) { const k = (t * 0.8 + w.userData.ph) % 1; w.scale.set(9 + k * 9, 9 + k * 9, 1); w.material.opacity = 1 - k; } ring.rotation.z = t; });
      if (L >= 4) halo(g, "#fff3a0", 44).position.set(0, topY, 0);
      return;
    }
    const orb = live(add(g, G.sph, Glow(P === "B" ? "#8fb8ff" : "#ffe680"), P === "B" ? 5 : 6 + L, [0, topY, 0]));
    halo(g, P === "B" ? "#80b3ff" : "#ffe680", 22 + L * 3).position.set(0, topY, 0);
    const arcs = [];
    if (P === "B") { // ION STORM: crown of orbiting orbs with lightning between them
      const n = L >= 4 ? 5 : 3, orbs = [];
      for (let i = 0; i < n; i++) { orbs.push(live(add(g, G.sphLo, Glow("#dfe9ff"), 3.5))); arcs.push(arc(g, "#cfe0ff")); }
      const center = new THREE.Vector3(0, topY, 0);
      anim.push(t => {
        orbs.forEach((o, i) => { const a = t * 1.3 + i * TAU / n; o.position.set(Math.cos(a) * 11, topY + Math.sin(t * 2 + i) * 2, Math.sin(a) * 11); });
        arcs.forEach((l, i) => l.userData.zap(center, orbs[i].position, 3));
      });
      if (L >= 4) halo(g, "#80b3ff", 44).position.set(0, topY, 0);
      return;
    }
    for (let i = 0; i < 2 + L; i++) arcs.push(arc(g, "#fff6b0"));
    const c = new THREE.Vector3(0, topY, 0), tmp = new THREE.Vector3();
    anim.push(t => {
      orb.scale.setScalar((6 + L) * (1 + Math.sin(t * 9) * 0.06));
      arcs.forEach((l, i) => { const a = t * 3 + i * 2.1 + Math.random() * 0.3; tmp.set(Math.cos(a) * 9, topY - 5 + Math.random() * 3, Math.sin(a) * 9); l.userData.zap(c, tmp, 2.5); });
    });
  },

  // PROSPECTOR: industrial rig drilling a captured asteroid
  miner(g, tur, L, P, anim) {
    const yellow = M("#d9a62a", { metal: 0.7, rough: 0.45 });
    const s = 6;
    for (const [x, y] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.bbox, yellow, [1.4, 1.4, 2 * s + 1.4], [x, y, 0]);
    for (const [x, z] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.bbox, GUN_D, [1.4, 2 * s, 1.4], [x, 0, z]);
    for (const [y, z] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.bbox, yellow, [2 * s, 1.4, 1.4], [0, y, z]);
    add(g, G.bbox, GUN, [8, 8, 8]);
    add(g, G.bbox, GOLD, [8.4, 3, 8.4], [0, -2, 0]);
    const cargoCols = ["#8f3a30", "#2f5c8c", "#3d7a4a", "#6a4a8c"];
    for (let i = 0; i < Math.min(4, 1 + L); i++) add(g, G.bbox, M(cargoCols[i], { metal: 0.6, rough: 0.5 }), [4, 4, 7], [2 + (i % 2) * -4, -2 + Math.floor(i / 2) * 4.5, 9.5]);
    beacon(g, s, s, -s, 5);
    const tint = P === "A" ? "#ffcf8a" : P === "B" ? "#a8dcff" : null;
    wing(g, 7 + L * 2, 5, -9, tint);
    // drill arm toward the planet (-X) and the captured asteroid
    alongX(g, G.cyl, GUN_D, 1.2, 10, [-11, 0, 0]);
    alongX(g, G.cyl, STEEL, 2, 2, [-15, 0, 0]);
    const drill = live(alongX(g, G.cone, STEEL, 2.4 + L * 0.3, 7, [-18, 0, 0]));
    drill.rotation.z = H; // point toward -X
    const rock = live(add(g, G.ico, M("#7d6a58", { metal: 0.1, rough: 0.9, flat: true }), [12 + L, 10 + L, 11 + L], [-28, 0, 0]));
    const sparks = live(add(g, G.sphLo, Glow("#ffb347"), 2, [-22, 0, 0]));
    anim.push(t => { drill.rotation.x = t * 8; rock.rotation.set(t * 0.2, t * 0.3, 0); sparks.visible = Math.sin(t * 20) > 0; sparks.position.y = (Math.random() - 0.5) * 2; });
    if (P === "A") { // DEEP CORE / STELLAR FORGE: glowing furnace
      const furnace = live(add(g, G.sph, Glow(L >= 4 ? "#fff3c0" : "#ff9a3c"), L >= 4 ? 9.5 : 8.6, [0, 0, 0]));
      for (const y of [-3, 0, 3]) add(g, G.box, Glow("#ff6b2a"), [12.4, 0.6, 0.6], [0, y, -6.1]);
      anim.push(t => furnace.scale.setScalar((L >= 4 ? 9.5 : 8.6) * (1 + Math.sin(t * 3) * 0.06)));
      if (L >= 4) halo(g, "#ff9a3c", 44);
    } else if (P === "B") { // COMMAND RELAY: big comms dishes + a blinking mast
      const dishes = L >= 4 ? 2 : 1;
      for (let i = 0; i < dishes; i++) {
        const d = add(g, G.dish, M("#e6edf5", { metal: 0.7, rough: 0.25, side: THREE.DoubleSide }), [16 - i * 4, 6, 16 - i * 4], [2, 9 + i * 7, -i * 4], [-0.5, 0, -0.5]);
        add(d, G.cyl, DARK, [0.08, 0.5, 0.08], [0, 0.3, 0]);
      }
      add(g, G.cyl, DARK, [0.8, 14, 0.8], [-4, 13, 4]);
      const light = live(add(g, G.sphLo, Glow("#5cc8ff"), 1.8, [-4, 20.5, 4]));
      anim.push(t => { light.visible = (t * 2) % 1 < 0.5; });
    } else {
      add(g, G.sph, Glow("#ffb347"), 3 + L, [0, 4.5, 0]);
    }
  },

  // HANGAR: armored flight-deck carrier with parked drones and engines
  carrier(g, tur, L, P, anim) {
    const accent = P === "B" ? "#ff4d6d" : P === "A" ? "#ff9de6" : "#ff7ad9";
    const hull = P === "B" ? GUN_D : GUN;
    const len = 26 + L * 5, wid = P === "B" ? 13 : 11;
    add(g, G.bbox, hull, [wid, 6, len]);
    add(g, G.bbox, GUN_D, [wid + 1, 3, len - 4], [0, -2.5, 0]);
    const prow = add(g, G.pyr, hull, [wid * 1.4, 10, 6 * 1.4], [0, 0, len / 2 + 5]);
    prow.rotation.set(H, 0, 0); prow.rotateY(Math.PI / 4);
    add(g, G.box, DARK, [wid - 3, 0.6, len - 6], [0, 3.2, 0]);
    add(g, G.box, Accent(accent), [0.4, 0.2, len - 8], [0, 3.6, 0]); // deck centreline
    add(g, G.bbox, GUN, [3, 5, 6], [wid / 2 - 1.5, 5.5, len / 6]); // bridge island
    add(g, G.box, Glow("#9fe8ff"), [3.1, 0.8, 4], [wid / 2 - 1.5, 7, len / 6]);
    beacon(g, wid / 2 - 1.5, 8, len / 6 - 1.5, 4);
    // landing lights chase along the deck
    const lights = [];
    for (let i = 0; i < 6; i++) lights.push(live(add(g, G.sphLo, Glow(accent), 1, [-(wid / 2 - 1), 3.6, -len / 2 + 3 + i * (len - 6) / 5])));
    // hangar bay glow (front) + engines (back)
    add(g, G.box, Glow(accent), [wid - 4, 3.5, 0.4], [0, 0, len / 2 + 0.2]);
    const engines = [];
    for (const x of P === "B" ? [-4, 0, 4] : [-3, 3]) { alongZ(g, G.cyl, DARK, 2, 4, [x, 0, -len / 2 - 2]); engines.push(live(add(g, G.sph, Glow("#ffd0f0"), 3.2, [x, 0, -len / 2 - 4.4]))); }
    // parked drones on deck
    const drones = Math.min(5, 2 + L);
    for (let i = 0; i < drones; i++) add(g, G.cone, M(accent, { metal: 0.5, rough: 0.35, emissive: accent, glow: 0.3 }), [2.4, 5, 2.4], [-2 + (i % 2) * 4, 4.6, -len / 2 + 6 + i * 4], [H, 0, 0]);
    if (P === "A") for (const s of [-1, 1]) { add(g, G.bbox, GUN, [12 + L * 2, 0.8, 9], [s * (wid / 2 + 5 + L), 0, -3], [0, s * 0.45, 0]); add(g, G.box, Accent(accent), [12 + L * 2, 0.9, 0.6], [s * (wid / 2 + 5 + L), 0, 1.2], [0, s * 0.45, 0]); }
    if (P === "B") { add(g, G.box, Glow("#ff3b5c"), [6, 0.5, 8], [0, -4.2, 0]); for (const s of [-1, 1]) add(g, G.bbox, DARK, [2, 7, len * 0.7], [s * (wid / 2 + 1), 0, 0]); }
    if (L >= 4) halo(g, accent, 46);
    anim.push(t => { lights.forEach((l, i) => l.visible = Math.floor(t * 6 - i) % 6 === 0 || Math.floor(t * 6 - i) % 6 === 1); engines.forEach(e => e.scale.setScalar(3 + Math.sin(t * 20) * 0.4)); });
  },
};

// ---------- shared detailing (from the visual-upgrade ZIP, placed per design so nothing clips) ----------
// Rear maneuvering thrusters with flickering flames, and tier markings that read at game scale.
// Positions are hand-fitted to each hull; the ZIP's fixed-position side rails were left out (they cut
// through or floated beside most hulls, and every design already carries its own armor detail).
const FLAME = Glow("#67bfff");
const KIT = {
  //           thrusters [x, y, z]              thrust   tier marks
  laser:   L => ({ thr: [[-3.4, -2, -7.4], [3.4, -2, -7.4]], dir: "z", band: { axis: "z", r: 5.15, at: i => -5.6 - i * 0.75 } }),
  missile: L => ({ thr: [[-4, -3, -9], [4, -3, -9]], dir: "z", plate: (i) => [-4.5, 5.12, -3 + i * 2] }),
  tractor: L => ({ thr: [[-3, -13.2, 0], [3, -13.2, 0]], dir: "y", band: { axis: "y", r: 2.62, at: i => -6.5 + i * 1.0 } }),
  rail:    L => ({ thr: [[-3.6, -3, -10], [3.6, -3, -10]], dir: "z", plate: (i) => [-2, 4.12, -9 + i * 1.1] }),
  emp:     L => ({ thr: [[-4, -7.2, 0], [4, -7.2, 0]], dir: "y", ring: (i) => { const a = 2.75 + i * 0.32; return [Math.cos(a) * 6.1, -1.94, Math.sin(a) * 6.1, a]; } }),
  miner:   L => ({ thr: [[-2.4, -2.5, -4], [2.4, -2.5, -4]], dir: "z", plate: (i) => [-2.4 + i * 1.6, 4.12, -2.9] }),
  carrier: (L, P) => ({ thr: [], side: (i) => [(P === "B" ? 13 / 2 + 2.05 : 11 / 2 + 0.05), 0, -(26 + L * 5) / 2 + 3 + i * 1.2] }),
};
function addKit(g, type, L, P, anim) {
  const k = KIT[type](L, P), accent = { laser: "#45e3ff", missile: "#ff9f43", tractor: "#bc83ff", rail: "#74ffa4", emp: "#ffe06a", miner: "#ffd166", carrier: "#ff7ad9" }[type];
  const lit = Accent(accent);
  for (const [x, y, z] of k.thr) {
    // flames flicker through their shared material (see buildSatellite), so they merge: no extra draw calls
    if (k.dir === "z") { alongZ(g, G.cyl8, DARK, 1.1, 2.4, [x, y, z - 1.2]); add(g, G.sphLo, FLAME, [1.6, 1.6, 2], [x, y, z - 3]); }
    else { add(g, G.cyl8, DARK, [2.2, 2.4, 2.2], [x, y - 1.2, z]); add(g, G.sphLo, FLAME, [1.6, 2, 1.6], [x, y - 3, z]); }
  }
  const n = Math.min(L, 4); // tiers 2-5 show 1-4 marks
  for (let i = 0; i < n; i++) {
    if (k.band) { const b = add(g, G.cyl8, lit, [k.band.r * 2, 0.35, k.band.r * 2], [0, 0, 0]); if (k.band.axis === "z") { b.rotation.x = H; b.position.z = k.band.at(i); } else b.position.y = k.band.at(i); }
    if (k.plate) add(g, G.box, lit, [2.3, 0.22, 0.6], k.plate(i));
    if (k.ring) { const [x, y, z, a] = k.ring(i); add(g, G.box, lit, [0.6, 0.22, 1.6], [x, y, z], [0, -a, 0]); }
    if (k.side) add(g, G.box, lit, [0.22, 3, 0.6], k.side(i));
  }
}

// ---------- merging static parts ----------
const geoCache = new Map();
function mergeList(list) {
  let n = 0; const parts = list.map(({ geo, m }) => { const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m); n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); return out;
}
// Merge the static meshes under `root` (not crossing into live or other baked parts) into one mesh per material.
function bake(root, key, stop = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), byMat = new Map(), victims = [];
  const walk = node => {
    for (const ch of node.children) {
      if (ch.userData.live || ch.userData.baked || stop.includes(ch)) continue;
      if (ch.isMesh) {
        if (!byMat.has(ch.material)) byMat.set(ch.material, []);
        byMat.get(ch.material).push({ geo: ch.geometry, m: new THREE.Matrix4().multiplyMatrices(inv, ch.matrixWorld) });
        victims.push(ch);
      }
      walk(ch);
    }
  };
  walk(root);
  for (const v of victims) {
    for (const c of [...v.children]) if (!c.isMesh || c.userData.live) { c.applyMatrix4(v.matrix); v.parent.add(c); } // keep non-mesh children (sprites, lines)
    v.parent.remove(v);
  }
  let i = 0;
  for (const [mat, list] of byMat) {
    const k = key && `${key}|${i++}|${mat.uuid}`;
    let geo = k && geoCache.get(k);
    if (!geo) { geo = mergeList(list); if (k) geoCache.set(k, geo); }
    const m = new THREE.Mesh(geo, mat); m.userData.baked = true; root.add(m);
  }
}
// moving groups (a spinning pod, a gatling) merge their own contents once and then turn as one piece
function bakeGroup(group) { const p = group.parent; group.removeFromParent(); bake(group, null); if (p) p.add(group); }

export const metalEnv = () => (reflections ? ENV : null); // for other modules' metal (the invaders)
export function setReflections(on) {
  reflections = on;
  for (const m of mats.values()) if (m.userData.env) { m.envMap = on ? ENV : null; m.needsUpdate = true; }
}

// Codenames for the hangar / shop (kept with the models so art and names stay together).
export const SAT_NAMES = { laser: "Lancer", missile: "Hornet", tractor: "Gravity Well", rail: "Spear", emp: "Tesla", miner: "Prospector", carrier: "Hangar" };

let beaconFrame = -1;
export function buildSatellite({ type, level = 0, path = null }) {
  const g = new THREE.Group(), tur = new THREE.Group();
  tur.name = "turret"; g.add(tur);
  const anim = [];
  DESIGNS[type](g, tur, level, path, anim);
  addKit(g, type, level, path, anim);
  const key = `${type}|${level}|${path}`;
  bake(tur, key + "|t");
  bake(g, key + "|g", [tur]);
  g.userData.baseScale = 1 + level * 0.06; // a little growth with each tier
  g.userData.update = (t, fire, dt) => {
    for (const f of anim) f(t, fire, dt);
    const f = Math.floor(t * 60); // blink every beacon together, once per frame
    if (f !== beaconFrame) { beaconFrame = f; BEACON.emissiveIntensity = (t % 1.6) < 0.18 ? 1.4 : 0.15; FLAME.emissiveIntensity = 0.75 + 0.2 * Math.sin(t * 23) * Math.sin(t * 7.3); }
  };
  return g;
}
