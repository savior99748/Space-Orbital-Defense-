// 3D satellite models (v3.1): seven distinct designs, each changing at every tier and specialization.
//   buildSatellite({ type, level, path }) → THREE.Group
//     - child "turret" is aimed by the game (its +X axis points at the target)
//     - group.userData.update(time, firing) animates moving parts
// Local frame: +X points away from the body it orbits, +Y is "up" from the orbit, +Z runs along the orbit.
// Sizes: the main body is ~20 units across, like the 2D art.
import * as THREE from "../vendor/three/three.module.js";

const TAU = Math.PI * 2;

// ---------- shared materials, geometry and helpers ----------
const mats = new Map();
function M(color, { metal = 0.55, rough = 0.38, emissive = null, glow = 0, opacity = 1, side } = {}) {
  const key = [color, metal, rough, emissive, glow, opacity, side].join("|");
  if (!mats.has(key)) {
    mats.set(key, new THREE.MeshStandardMaterial({
      color, metalness: metal, roughness: rough, emissive: emissive || 0x000000, emissiveIntensity: glow,
      transparent: opacity < 1, opacity, side: side || THREE.FrontSide, depthWrite: opacity >= 1,
    }));
  }
  return mats.get(key);
}
const Glow = (color, g = 1.6) => M(color, { metal: 0, rough: 0.6, emissive: color, glow: Math.min(g, 1) * 0.85 });
const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 20),
  cyl8: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
  hex: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sph: new THREE.SphereGeometry(0.5, 24, 16),
  cone: new THREE.ConeGeometry(0.5, 1, 20),
  tor: new THREE.TorusGeometry(1, 0.08, 10, 48),
  torThick: new THREE.TorusGeometry(1, 0.16, 12, 48),
  oct: new THREE.OctahedronGeometry(0.5),
  pyr: new THREE.ConeGeometry(0.5, 1, 4),
  ico: new THREE.IcosahedronGeometry(0.5, 0),
  dish: new THREE.LatheGeometry([...Array(12)].map((_, i) => new THREE.Vector2(0.02 + i * 0.045, (i * 0.045) ** 2 * 1.4)), 32),
};
G.dish.computeVertexNormals();

// Solar-cell texture (shared)
const cellTex = (() => {
  const c = document.createElement("canvas"); c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#16224a"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#2f5fd0";
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + 1.5, y * 16 + 1.5, 13, 13);
  g.fillStyle = "rgba(255,255,255,0.18)"; for (let y = 0; y < 4; y++) g.fillRect(0, y * 16 + 8, 64, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
function panelMat(tint) {
  const k = "panel|" + tint;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ map: cellTex, color: tint || 0xffffff, metalness: 0.3, roughness: 0.35, emissive: tint || 0x000000, emissiveIntensity: tint ? 0.12 : 0 }));
  return mats.get(k);
}

function add(parent, geom, mat, s, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geom, mat);
  if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]); m.rotation.set(r[0], r[1], r[2]);
  parent.add(m); return m;
}
const H = Math.PI / 2;
// cylinder lying along X (barrels), along Z (hull)
const alongX = (parent, geom, mat, radius, len, p = [0, 0, 0]) => add(parent, geom, mat, [radius * 2, len, radius * 2], [p[0], p[1], p[2]], [0, 0, -H]);
const alongZ = (parent, geom, mat, radius, len, p = [0, 0, 0]) => add(parent, geom, mat, [radius * 2, len, radius * 2], [p[0], p[1], p[2]], [H, 0, 0]);
// solar wing: a panel along ±Z with a strut
function wing(parent, len, width, z, tint, sweep = 0, upright = false) {
  const w = new THREE.Group(); w.position.set(0, 0, z); w.rotation.y = sweep; parent.add(w);
  if (upright) { w.position.set(0, z, 0); w.rotation.set(-Math.PI / 2, 0, sweep); }
  const dir = Math.sign(z) || 1;
  add(w, G.box, M("#8b93a8", { metal: 0.8, rough: 0.3 }), [0.9, 0.9, 3], [0, 0, dir * 1.5]);
  add(w, G.box, panelMat(tint), [width, 0.6, len], [0, 0, dir * (3 + len / 2)]);
  return w;
}
function halo(parent, color, size) {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const col = new THREE.Color(color);
  gr.addColorStop(0, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.55)`); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
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
  // LANCER: sleek white arrow hull, swept wings, crystal lens emitter
  laser(g, tur, L, P, anim) {
    const hull = M("#dfe7f2", { metal: 0.35, rough: 0.28 }), trim = M("#6cf0ff", { metal: 0.2, emissive: "#6cf0ff", glow: 0.6 });
    alongZ(g, G.cyl8, hull, 5, 14);
    add(g, G.cone, hull, [10, 10, 10], [0, 0, 12], [H, 0, 0]);
    alongZ(g, G.cyl, Glow("#6cf0ff", 1), 3.2, 1.5, [0, 0, -7.5]);
    add(g, G.box, trim, [11.2, 1, 1], [0, 0, 4]); add(g, G.box, trim, [11.2, 1, 1], [0, 0, -4]);
    const tint = P === "A" ? "#d6b4ff" : P === "B" ? "#ffd08a" : null;
    wing(g, 9 + L * 2.5, 6, 4, tint, -0.5, true); wing(g, 9 + L * 2.5, 6, -4, tint, 0.5, true);
    add(tur, G.sph, hull, 7, [3, 0, 0]);
    if (P === "B") { // SOLAR LANCE: gold sun-dish feeding a superheated lance
      const dish = add(tur, G.dish, M("#f3c86a", { metal: 0.9, rough: 0.2, side: THREE.DoubleSide }), [L >= 4 ? 26 : 20, 7, L >= 4 ? 26 : 20], [-3, 0, 0], [0, 0, H]);
      dish.material = dish.material.clone(); dish.material.side = THREE.DoubleSide;
      const LL = L >= 4 ? 30 : 24;
      const heat = alongX(tur, G.cyl, Glow("#ff9a2a", 1), 1.6, LL, [LL / 2 + 1, 0, 0]);
      for (let i = 0; i < 4; i++) add(tur, G.torThick, M("#c8922a", { metal: 0.9, rough: 0.25 }), [2.3, 2.3, 3], [4 + i * LL / 4, 0, 0], [0, H, 0]);
      const tip = add(tur, G.sph, Glow("#fff1c0", 3), 5, [L >= 4 ? 31 : 25, 0, 0]);
      anim.push(t => { tip.scale.setScalar(4.5 + Math.sin(t * 8) * 0.8); heat.material.emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.4; });
      if (L >= 4) halo(tur, "#ffb347", 34).position.set(31, 0, 0);
      return;
    }
    const twin = L >= 1, off = twin ? 2.4 : 0;
    for (const s of twin ? [-1, 1] : [0]) alongX(tur, G.cyl, hull, 1.2, 16, [9, 0, s * off]);
    for (let i = 0; i < (L >= 2 ? 3 : L >= 1 ? 1 : 0); i++) add(tur, G.tor, trim, [2.6 + off, 2.6 + off, 2.6], [8 + i * 4, 0, 0], [0, H, 0]);
    const lens = add(tur, G.sph, Glow("#bff8ff", 2.2), L >= 2 ? 5 : 3.5, [17.5, 0, 0]);
    if (P === "A") { // PRISM: spinning crystal + orbiting rainbow shards
      lens.visible = false;
      const prism = add(tur, G.oct, M("#ffffff", { metal: 0.1, rough: 0.05, emissive: "#c18cff", glow: 1.2 }), [L >= 4 ? 10 : 8, L >= 4 ? 14 : 11, L >= 4 ? 10 : 8], [20, 0, 0]);
      const shards = [];
      if (L >= 4) ["#ff5c7a", "#ffd166", "#7dff9a", "#6cf0ff"].forEach((c, i) => shards.push(add(tur, G.oct, Glow(c, 1.6), [2.5, 4, 2.5], [20, 0, 0])));
      anim.push(t => {
        prism.rotation.y = t * 2.2; prism.rotation.x = Math.sin(t) * 0.3;
        shards.forEach((s, i) => { const a = t * 2 + i * TAU / 4; s.position.set(20 + Math.cos(a) * 3, Math.sin(a) * 9, Math.cos(a + 1) * 9); s.rotation.y = t * 3; });
      });
      if (L >= 4) halo(tur, "#c18cff", 36).position.set(20, 0, 0);
    } else anim.push(t => lens.scale.setScalar((L >= 2 ? 5 : 3.5) * (1 + Math.sin(t * 6) * 0.08)));
  },

  // HORNET: armored launcher, hazard stripes, visible missile tips
  missile(g, tur, L, P, anim) {
    const armor = M("#5a564a", { metal: 0.55, rough: 0.5 }), hazard = M("#ff9f43", { metal: 0.3, emissive: "#ff9f43", glow: 0.25 });
    add(g, G.box, armor, [14, 10, 18]);
    for (const z of [-6, 0, 6]) add(g, G.box, hazard, [14.4, 1.2, 1.4], [0, 5, z], [0, 0, 0.35]);
    add(g, G.box, M("#262521", { metal: 0.7 }), [6, 12, 6], [-6, 0, 0]);
    const tint = P === "A" ? "#ffe08a" : P === "B" ? "#ff8a8a" : null;
    wing(g, 7 + L * 2, 5, 9, tint); wing(g, 7 + L * 2, 5, -9, tint);
    const missileTip = (parent, x, y, z, s = 1) => { alongX(parent, G.cone, M("#e8e8e8", { metal: 0.3 }), 1.4 * s, 4 * s, [x, y, z]); add(parent, G.sph, Glow("#ff5c5c", 1.5), 1.2 * s, [x + 2.2 * s, y, z]); };
    if (P === "A") { // HIVE: honeycomb pod
      const pod = new THREE.Group(); tur.add(pod); pod.position.set(6, 2, 0);
      const ring = L >= 4 ? [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * TAU / 6) * 3.8, Math.sin(i * TAU / 6) * 3.8]), ...[...Array(12)].map((_, i) => [Math.cos(i * TAU / 12) * 7.4, Math.sin(i * TAU / 12) * 7.4])]
        : [[0, 0], ...[...Array(6)].map((_, i) => [Math.cos(i * TAU / 6) * 3.8, Math.sin(i * TAU / 6) * 3.8])];
      for (const [y, z] of ring) { alongX(pod, G.hex, M("#b8892c", { metal: 0.7, rough: 0.3 }), 1.95, 11, [0, y, z]); missileTip(pod, 5, y, z, 0.6); }
      add(pod, G.hex, armor, [L >= 4 ? 18 : 10, 2, L >= 4 ? 18 : 10], [-5.5, 0, 0], [0, 0, H]);
      anim.push((t, fire) => { pod.rotation.x = t * (L >= 4 ? 0.8 : 0.4); });
      if (L >= 4) halo(tur, "#ffd166", 34).position.set(6, 2, 0);
      return;
    }
    if (P === "B") { // NOVA: one giant silo with a glowing warhead
      const big = L >= 4 ? 1.3 : 1;
      alongX(tur, G.cyl, armor, 5 * big, 24 * big, [8, 2, 0]);
      for (let i = 0; i < 3; i++) add(tur, G.tor, hazard, [5.4 * big, 5.4 * big, 5.4 * big], [2 + i * 6 * big, 2, 0], [0, H, 0]);
      alongX(tur, G.cone, M("#d9d9d9", { metal: 0.4 }), 4.6 * big, 9 * big, [24 * big, 2, 0]);
      const core = alongX(tur, G.cyl, Glow("#ff5c5c", 2), 4.8 * big, 1.6, [19 * big, 2, 0]);
      anim.push(t => { core.material.emissiveIntensity = 1.4 + Math.sin(t * 7) * 0.9; });
      if (L >= 4) halo(tur, "#ff5c5c", 40).position.set(18, 2, 0);
      return;
    }
    // launcher box with 1 / 2 / 4 tubes
    add(tur, G.box, armor, [12, 9, 11], [4, 2, 0]);
    const tubes = L === 0 ? [[2, 0]] : L === 1 ? [[2, -2.6], [2, 2.6]] : [[4.4, -2.6], [4.4, 2.6], [-0.4, -2.6], [-0.4, 2.6]];
    for (const [y, z] of tubes) { alongX(tur, G.cyl, M("#1c1b18"), 2, 13, [6, y, z]); missileTip(tur, 11.5, y, z); }
  },

  // GRAVITY WELL: glowing core inside a spinning gyroscope
  tractor(g, tur, L, P, anim) {
    const frame = M("#3a2f5a", { metal: 0.7, rough: 0.3 });
    add(g, G.cyl, frame, [5, 14, 5], [0, -6, 0]);
    add(g, G.cyl, frame, [9, 2, 9], [0, -12, 0]);
    const tint = P === "A" ? "#9b7bff" : P === "B" ? "#bff3ff" : null;
    wing(g, 8 + L * 2, 5, 6, tint); wing(g, 8 + L * 2, 5, -6, tint);
    const rings = [];
    const n = P ? 3 : Math.min(3, L + 1), rCol = P === "B" ? "#bff3ff" : "#b388ff";
    for (let i = 0; i < n; i++) rings.push(add(g, G.torThick, M(rCol, { metal: 0.8, rough: 0.2, emissive: rCol, glow: 0.35 }), 11 - i * 2.2, [0, 4, 0]));
    if (P === "A") { // SINGULARITY: black hole + accretion disc
      add(g, G.sph, M("#000000", { metal: 0, rough: 1 }), L >= 4 ? 10 : 8, [0, 4, 0]);
      const disc = add(g, G.torThick, Glow("#ff9de6", 1.4), [L >= 4 ? 9 : 7.5, L >= 4 ? 9 : 7.5, 1.2], [0, 4, 0], [H * 0.8, 0, 0]);
      const disc2 = L >= 4 ? add(g, G.tor, Glow("#7a5cff", 1.6), [11, 11, 1], [0, 4, 0], [H * 0.8, 0.3, 0]) : null;
      halo(g, "#7a5cff", L >= 4 ? 46 : 34).position.set(0, 4, 0);
      anim.push(t => { disc.rotation.z = t * 2.5; if (disc2) disc2.rotation.z = -t * 1.7; rings.forEach((r, i) => { r.rotation.set(t * (0.6 + i * 0.3), t * (0.4 + i * 0.5), 0); }); });
      return;
    }
    if (P === "B") { // CRYO: cluster of ice crystals
      const ice = M("#e6fbff", { metal: 0.1, rough: 0.05, emissive: "#9ae8ff", glow: 0.7, opacity: 0.85 });
      const spikes = new THREE.Group(); spikes.position.set(0, 4, 0); g.add(spikes);
      const count = L >= 4 ? 10 : 6;
      for (let i = 0; i < count; i++) {
        const dir = new THREE.Vector3(Math.cos(i * 2.39996) * Math.sqrt(1 - ((i + 0.5) / count * 2 - 1) ** 2), (i + 0.5) / count * 2 - 1, Math.sin(i * 2.39996) * Math.sqrt(1 - ((i + 0.5) / count * 2 - 1) ** 2));
        const s = add(spikes, G.oct, ice, [3, 9 + (i % 3) * 2, 3]);
        s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); s.position.copy(dir.multiplyScalar(3));
      }
      add(spikes, G.oct, Glow("#ffffff", 2), 4);
      halo(g, "#9ae8ff", L >= 4 ? 40 : 30).position.set(0, 4, 0);
      anim.push(t => { spikes.rotation.y = t * 0.5; rings.forEach((r, i) => { r.rotation.set(t * (0.3 + i * 0.2), t * (0.5 + i * 0.25), 0); }); });
      return;
    }
    const core = add(g, G.sph, Glow("#b388ff", 1), 5 + L, [0, 4, 0]);
    halo(g, "#b388ff", 22 + L * 4).position.set(0, 4, 0);
    anim.push(t => { core.scale.setScalar((5 + L) * (1 + Math.sin(t * 4) * 0.12)); rings.forEach((r, i) => { r.rotation.set(t * (0.7 + i * 0.4), t * (0.5 + i * 0.6), 0); }); });
  },

  // SPEAR: twin-rail cannon with capacitors and a reactor
  rail(g, tur, L, P, anim) {
    const chassis = M("#55685b", { metal: 0.6, rough: 0.4 }), neon = Glow("#7dff9a", 1.4);
    add(g, G.box, chassis, [10, 8, 20]);
    const reactor = alongZ(g, G.cyl, Glow("#7dff9a", 1), 3.5, 6, [0, 0, -12]);
    anim.push(t => { reactor.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.4; });
    const tint = P === "A" ? "#d4ff9a" : P === "B" ? "#9affd6" : null;
    wing(g, 9 + L * 2.5, 5, 10, tint); wing(g, 9 + L * 2.5, 5, -10, tint);
    add(tur, G.box, chassis, [9, 7, 9], [0, 2, 0]);
    if (P === "B") { // COIL REPEATER: rotary gatling
      const spin = new THREE.Group(); spin.position.set(4, 2, 0); tur.add(spin);
      const n = L >= 4 ? 6 : 3;
      for (let i = 0; i < n; i++) { const a = i * TAU / n; alongX(spin, G.cyl, M("#39e6a0", { metal: 0.6, emissive: "#39e6a0", glow: 0.3 }), 1.1, 22, [11, Math.cos(a) * 3, Math.sin(a) * 3]); }
      for (const x of [3, 20]) add(spin, G.cyl, chassis, [9, 1.5, 9], [x, 0, 0], [0, 0, H]);
      let sp = 0;
      anim.push((t, fire, dt) => { sp += (fire ? 16 : 1.5) * (dt || 0.016); spin.rotation.x = sp; });
      if (L >= 4) halo(tur, "#39e6a0", 30).position.set(20, 2, 0);
      return;
    }
    const len = P === "A" ? (L >= 4 ? 48 : 40) : L >= 2 ? 30 : 24;
    for (const s of [-1, 1]) add(tur, G.box, M(P === "A" ? "#b6ff6c" : "#9fb4a6", { metal: 0.8, rough: 0.25 }), [len, 2.2, 1.6], [len / 2 + 2, 2, s * 2.4]);
    if (L >= 2 || P) add(tur, G.box, neon, [len - 4, 0.6, 0.6], [len / 2 + 2, 2, 0]);
    const coils = P === "A" ? (L >= 4 ? 7 : 5) : L >= 1 ? 3 : 0;
    for (let i = 0; i < coils; i++) add(tur, G.torThick, M("#4f7a2a", { metal: 0.85, rough: 0.25 }), [P === "A" ? 4.6 : 3.8, P === "A" ? 4.6 : 3.8, 4], [5 + i * (len - 8) / Math.max(1, coils), 2, 0], [0, H, 0]);
    if (L >= 1 && !P) for (const z of [-5.5, 5.5]) add(tur, G.box, M("#2f6b42", { metal: 0.6 }), [8, 4, 2], [0, 2, z]);
    if (P === "A") {
      const muzzle = add(tur, G.sph, Glow("#e8ffe0", 2.5), L >= 4 ? 6 : 4, [len + 2, 2, 0]);
      anim.push(t => muzzle.scale.setScalar((L >= 4 ? 6 : 4) * (0.85 + Math.sin(t * 5) * 0.15)));
      if (L >= 4) halo(tur, "#b6ff6c", 36).position.set(len, 2, 0);
    }
  },

  // TESLA: a coil spire with a crackling orb
  emp(g, tur, L, P, anim) {
    const copper = M("#b8763a", { metal: 0.95, rough: 0.25 }), base = M("#3a3420", { metal: 0.7, rough: 0.4 });
    add(g, G.cyl, base, [14, 4, 14], [0, -4, 0]);
    const tint = P === "A" ? "#fff3a0" : P === "B" ? "#a8c8ff" : null;
    wing(g, 8 + L * 2, 5, 8, tint); wing(g, 8 + L * 2, 5, -8, tint);
    add(g, G.cyl, M("#2a2a2a", { metal: 0.6 }), [2.4, 16, 2.4], [0, 4, 0]);
    const nCoils = Math.min(4, 2 + L);
    for (let i = 0; i < nCoils; i++) add(g, G.torThick, copper, [5.5 - i * 0.8, 5.5 - i * 0.8, 6], [0, -1 + i * 3, 0], [H, 0, 0]);
    const topY = 12;
    if (P === "A") { // SHOCKWAVE: pulse dish ring
      const ring = add(g, G.torThick, Glow("#fff3a0", 1.8), [9, 9, 4], [0, topY, 0], [H, 0, 0]);
      add(g, G.cyl, Glow("#fffbe0", 1.2), [12, 0.6, 12], [0, topY, 0]);
      const waves = [0, ...(L >= 4 ? [0.5] : [])].map(ph => {
        const w = add(g, G.tor, new THREE.MeshBasicMaterial({ color: "#ffe680", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 9, [0, topY, 0], [H, 0, 0]);
        w.userData.ph = ph; return w;
      });
      anim.push(t => { for (const w of waves) { const k = (t * 0.8 + w.userData.ph) % 1; w.scale.set(9 + k * 9, 9 + k * 9, 1); w.material.opacity = 1 - k; } ring.rotation.z = t; });
      if (L >= 4) halo(g, "#fff3a0", 44).position.set(0, topY, 0);
      return;
    }
    const orb = add(g, G.sph, Glow(P === "B" ? "#8fb8ff" : "#ffe680", 1), P === "B" ? 5 : 6 + L, [0, topY, 0]);
    halo(g, P === "B" ? "#80b3ff" : "#ffe680", 22 + L * 3).position.set(0, topY, 0);
    const arcs = [];
    if (P === "B") { // ION STORM: crown of orbiting orbs with lightning between them
      const n = L >= 4 ? 5 : 3, orbs = [];
      for (let i = 0; i < n; i++) { orbs.push(add(g, G.sph, Glow("#dfe9ff", 1.8), 3.5)); arcs.push(arc(g, "#cfe0ff")); }
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
    const yellow = M("#e0b030", { metal: 0.4, rough: 0.45 }), black = M("#22201a", { metal: 0.5, rough: 0.6 });
    // truss frame cube
    const s = 6;
    for (const [x, y] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.box, yellow, [1.2, 1.2, 2 * s + 1.2], [x, y, 0]);
    for (const [x, z] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.box, black, [1.2, 2 * s, 1.2], [x, 0, z]);
    for (const [y, z] of [[-s, -s], [-s, s], [s, -s], [s, s]]) add(g, G.box, yellow, [2 * s, 1.2, 1.2], [0, y, z]);
    // cargo containers
    const cargoCols = ["#c0392b", "#2e86de", "#27ae60", "#8e44ad"];
    for (let i = 0; i < Math.min(4, 1 + L); i++) add(g, G.box, M(cargoCols[i], { metal: 0.3, rough: 0.6 }), [4, 4, 7], [2 + (i % 2) * -4, -2 + Math.floor(i / 2) * 4.5, 9.5]);
    const tint = P === "A" ? "#ffcf8a" : P === "B" ? "#a8dcff" : null;
    wing(g, 7 + L * 2, 5, -9, tint);
    // drill arm toward the planet (-X) and the captured asteroid
    alongX(g, G.cyl, black, 1.2, 10, [-11, 0, 0]);
    const drill = alongX(g, G.cone, M("#c9c9d6", { metal: 0.9, rough: 0.2 }), 2.4 + L * 0.3, 7, [-18, 0, 0]);
    drill.rotation.z = H; // point toward -X
    const rock = add(g, G.ico, M("#8f7a64", { metal: 0.1, rough: 0.9 }), [12 + L, 10 + L, 11 + L], [-28, 0, 0]);
    rock.material = rock.material.clone(); rock.material.flatShading = true;
    const sparks = add(g, G.sph, Glow("#ffd166", 2.5), 2, [-22, 0, 0]);
    anim.push(t => { drill.rotation.x = t * 8; rock.rotation.set(t * 0.2, t * 0.3, 0); sparks.visible = Math.sin(t * 20) > 0; sparks.position.y = (Math.random() - 0.5) * 2; });
    if (P === "A") { // DEEP CORE / STELLAR FORGE: glowing furnace
      const furnace = add(g, G.sph, Glow(L >= 4 ? "#fff3c0" : "#ff9a3c", 2.6), L >= 4 ? 9 : 7, [0, 0, 0]);
      for (const y of [-3, 0, 3]) add(g, G.box, Glow("#ff6b2a", 1.5), [12.4, 0.6, 0.6], [0, y, -6.1]);
      anim.push(t => furnace.scale.setScalar((L >= 4 ? 9 : 7) * (1 + Math.sin(t * 3) * 0.1)));
      if (L >= 4) halo(g, "#ff9a3c", 44);
    } else if (P === "B") { // COMMAND RELAY: big comms dish + blinking mast
      const dishes = L >= 4 ? 2 : 1;
      for (let i = 0; i < dishes; i++) {
        const d = add(g, G.dish, M("#e6edf5", { metal: 0.6, rough: 0.25, side: THREE.DoubleSide }), [16 - i * 4, 6, 16 - i * 4], [2, 9 + i * 7, -i * 4], [-0.5, 0, -0.5]);
        add(d, G.cyl, black, [0.08, 0.5, 0.08], [0, 0.3, 0]);
      }
      add(g, G.cyl, black, [0.8, 14, 0.8], [-4, 13, 4]);
      const light = add(g, G.sph, Glow("#5cc8ff", 3), 1.8, [-4, 20.5, 4]);
      anim.push(t => { light.visible = (t * 2) % 1 < 0.5; });
    } else {
      add(g, G.sph, Glow("#ffd166", 1.5), 3 + L, [0, 0, 0]);
    }
  },

  // HANGAR: flight-deck carrier with parked drones and engines
  carrier(g, tur, L, P, anim) {
    const hullCol = P === "B" ? "#4a2b38" : "#e8dde6", accent = P === "B" ? "#ff6b8b" : P === "A" ? "#ff9de6" : "#ff7ad9";
    const hull = M(hullCol, { metal: 0.45, rough: 0.35 }), dark = M("#2a1f2c", { metal: 0.6 });
    const len = 26 + L * 5, wid = P === "B" ? 13 : 11;
    add(g, G.box, hull, [wid, 6, len]);
    const prow = add(g, G.pyr, hull, [wid * 1.4, 10, 6 * 1.4], [0, 0, len / 2 + 5], [H, Math.PI / 4, 0]);
    prow.rotation.set(H, 0, 0); prow.rotateY(Math.PI / 4);
    add(g, G.box, dark, [wid - 3, 0.6, len - 6], [0, 3.2, 0]);
    // landing lights chase along the deck
    const lights = [];
    for (let i = 0; i < 6; i++) lights.push(add(g, G.sph, Glow(accent, 2), 1, [wid / 2 - 1, 3.6, -len / 2 + 3 + i * (len - 6) / 5]));
    // hangar bay glow (front) + engines (back)
    add(g, G.box, Glow(accent, 1.2), [wid - 4, 3.5, 0.4], [0, 0, len / 2 + 0.2]);
    const engines = [];
    for (const x of P === "B" ? [-4, 0, 4] : [-3, 3]) { alongZ(g, G.cyl, dark, 2, 4, [x, 0, -len / 2 - 2]); engines.push(add(g, G.sph, Glow("#ffd0f0", 2.5), 3.2, [x, 0, -len / 2 - 4.4])); }
    // parked drones on deck
    const drones = Math.min(5, 2 + L);
    for (let i = 0; i < drones; i++) add(g, G.cone, M(accent, { metal: 0.4, emissive: accent, glow: 0.3 }), [2.4, 5, 2.4], [-2 + (i % 2) * 4, 4.6, -len / 2 + 6 + i * 4], [H, 0, 0]);
    if (P === "A") for (const s of [-1, 1]) add(g, G.box, M(accent, { metal: 0.4, emissive: accent, glow: 0.2 }), [12 + L * 2, 0.8, 9], [s * (wid / 2 + 5 + L), 0, -3], [0, s * 0.45, 0]);
    if (P === "B") { add(g, G.box, Glow("#ff3b5c", 1.2), [6, 0.5, 8], [0, -3.2, 0]); for (const s of [-1, 1]) add(g, G.box, dark, [2, 7, len * 0.7], [s * (wid / 2 + 1), 0, 0]); }
    if (L >= 4) halo(g, accent, 46);
    anim.push(t => { lights.forEach((l, i) => l.visible = Math.floor(t * 6 - i) % 6 === 0 || Math.floor(t * 6 - i) % 6 === 1); engines.forEach(e => e.scale.setScalar(3 + Math.sin(t * 20) * 0.4)); });
  },
};

// Codenames for the hangar / shop (kept with the models so art and names stay together).
export const SAT_NAMES = { laser: "Lancer", missile: "Hornet", tractor: "Gravity Well", rail: "Spear", emp: "Tesla", miner: "Prospector", carrier: "Hangar" };

export function buildSatellite({ type, level = 0, path = null }) {
  const g = new THREE.Group(), tur = new THREE.Group();
  tur.name = "turret"; g.add(tur);
  const anim = [];
  DESIGNS[type](g, tur, level, path, anim);
  // a little growth with each tier
  g.userData.baseScale = 1 + level * 0.06;
  g.userData.update = (t, fire, dt) => { for (const f of anim) f(t, fire, dt); };
  return g;
}
