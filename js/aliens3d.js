// 3D invader models: one alien faction (dark carapace hulls with glowing eyes and engines), plus natural
// comets and asteroids that the aliens have rigged with engines and crystals.
//   buildAlien(type, size, color) → THREE.Group
//     - faces +X (the game turns it to face its velocity)
//     - userData.flash(hit, frozen) tints the hull when hit or frozen
//     - userData.update(time) animates moving parts
//     - child "shield" (if the type has one) is shown while the shield is up
// Models are built once per type at unit size and merged into a few meshes per material, so a big swarm
// stays cheap to draw; each enemy then only adds a hull material of its own (for the hit flash).
import * as THREE from "../vendor/three/three.module.js";
import { metalEnv } from "./sat3d.js";

const TAU = Math.PI * 2, H = Math.PI / 2;

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  sph: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  oct: new THREE.OctahedronGeometry(0.5),
  tor: new THREE.TorusGeometry(1, 0.06, 8, 40),
};
// lumpy rock: icosahedron with each vertex pushed in/out by a smooth function of its direction
function rockGeo(seed, detail = 1, amp = 0.28) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    const n = Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed * 1.3) + Math.sin(v.z * 3.7 + seed * 0.7) * 0.6;
    v.multiplyScalar(1 + n * amp); p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals(); return g;
}
const saucerGeo = new THREE.LatheGeometry([[0, -0.26], [0.45, -0.24], [0.85, -0.12], [1.0, -0.03], [1.0, 0.02], [0.78, 0.12], [0.4, 0.18], [0, 0.19]].reverse().map(([x, y]) => new THREE.Vector2(x, y)), 40);

// shared (non-hull) materials
const shared = new Map();
function mat(key, make) { if (!shared.has(key)) shared.set(key, make()); return shared.get(key); }
const Glow = (c) => mat("glow" + c, () => new THREE.MeshBasicMaterial({ color: c }));
const Std = (c, o = {}) => mat("std" + c + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.4, ...o }));
const Add = (c, op) => mat("add" + c + op, () => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }));

function part(parent, geom, material, s, p = [0, 0, 0], r = [0, 0, 0]) {
  const m = new THREE.Mesh(geom, material);
  if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
  m.position.set(p[0], p[1], p[2]); m.rotation.set(r[0], r[1], r[2]); parent.add(m); return m;
}
// HULL marks the parts that use each enemy's own hull material
const HULL = new THREE.MeshStandardMaterial();

// ---------- the designs (unit size: about 1 = the enemy's radius) ----------
const DESIGNS = {
  // STINGER: carapace dart with mandible claws, one big eye, swept wings and a hot engine
  drone(t, color) {
    part(t, G.sph, HULL, [2.0, 0.85, 1.1]);
    part(t, G.sph, HULL, [1.0, 0.7, 0.8], [-0.75, 0.12, 0]);
    for (const s of [-1, 1]) {
      part(t, G.cone, HULL, [0.22, 1.0, 0.22], [1.05, -0.05, s * 0.32], [0, s * 0.35, -H]);
      part(t, G.cone4, HULL, [1.3, 0.06, 0.9], [-0.35, 0.05, s * 0.75], [0, s * -0.5, 0]);
    }
    for (const s of [-1, 1]) {
      part(t, G.box, Glow(color), [1.5, 0.05, 0.05], [0.05, 0.12, s * 0.5], [0, s * 0.18, 0]); // glowing seams
      part(t, G.sph, Glow(color), 0.1, [1.5, -0.05, s * 0.18]);                                  // hot claw tips
    }
    part(t, G.sph, Glow(color), 0.42, [0.78, 0.18, 0]);
    part(t, G.sph, Glow("#ffffff"), 0.16, [0.95, 0.22, 0]);
    part(t, G.sph, Glow("#ffb070"), 0.38, [-1.2, 0.1, 0]);
    return { hull: "#2e1220", metal: 0.75, rough: 0.32 };
  },
  // MITE: a small round beetle with spiky legs, swarming in packs
  swarm(t, color) {
    part(t, G.sph, HULL, [1.5, 1.0, 1.2]);
    for (let i = 0; i < 3; i++) for (const s of [-1, 1])
      part(t, G.cone, HULL, [0.16, 1.0, 0.16], [0.3 - i * 0.4, -0.25, s * 0.75], [s * 1.0, 0, 0.3 - i * 0.25]);
    part(t, G.box, Glow(color), [1.1, 0.06, 0.08], [-0.1, 0.5, 0]); // glowing spine
    part(t, G.sph, Glow(color), 0.55, [0.6, 0.2, 0]);
    part(t, G.sph, Glow("#ffffff"), 0.2, [0.82, 0.28, 0]);
    return { hull: "#371626", metal: 0.7, rough: 0.35, wobble: true };
  },
  // COMET: icy nucleus with a long two-layer tail
  comet(t, color) {
    part(t, rockGeo(1.7, 1, 0.22), HULL, 1.05);
    part(t, G.sph, Add(color, 0.35), 2.0);
    const tail = new THREE.Group(); tail.name = "tail"; t.add(tail);
    part(tail, G.cone, Add(color, 0.32), [1.8, 6.5, 1.8], [-3.6, 0, 0], [0, 0, H]);
    part(tail, G.cone, Add("#ffffff", 0.35), [0.9, 4, 0.9], [-2.3, 0, 0], [0, 0, H]);
    return { hull: "#cfe9ff", rough: 0.9, metal: 0.05, flat: true, animate: ["tail"] };
  },
  // INFESTED ASTEROID: a rock grown over with alien crystals, pushed by a rigged-on engine
  asteroid(t, color) {
    part(t, rockGeo(0.4), HULL, [1.05, 0.9, 0.95]);
    for (const [x, y, z, s] of [[0.3, 0.75, 0.3, 0.8], [0.5, 0.4, -0.7, 0.7], [-0.2, -0.2, 0.9, 0.6], [0.75, -0.55, 0.05, 0.55], [-0.4, 0.6, -0.5, 0.6]]) {
      const c = part(t, G.oct, Glow("#e04cff"), [s * 0.45, s * 1.6, s * 0.45], [x * 0.85, y * 0.85, z * 0.85]);
      c.lookAt(new THREE.Vector3(x * 3, y * 3, z * 3)); c.rotateX(H);
    }
    part(t, G.cyl, Std("#2a2a30"), [0.5, 0.45, 0.5], [-1.0, 0, 0], [0, 0, H]);
    part(t, G.sph, Glow("#ff9a3c"), 0.42, [-1.25, 0, 0]);
    return { hull: "#8a7360", rough: 0.95, metal: 0.05, flat: true, spinAxis: true };
  },
  rock(t, color) {
    part(t, rockGeo(2.9), HULL, [1.0, 0.85, 0.9]);
    const c = part(t, G.oct, Glow("#e04cff"), [0.25, 0.7, 0.25], [0.2, 0.75, 0.2]);
    return { hull: "#7a6654", rough: 0.95, metal: 0.05, flat: true };
  },
  // WARDEN: blue arrowhead cruiser with shield-emitter fins under a hexagonal shield
  cruiser(t, color) {
    part(t, G.cone4, HULL, [1.4, 2.6, 0.5], [0.15, 0, 0], [H, 0, -H]);
    part(t, G.box, HULL, [1.2, 0.35, 0.7], [-0.75, 0.05, 0]);
    part(t, G.sph, Std("#99c4ff", { emissive: "#3a7bff", emissiveIntensity: 0.6, metalness: 0.1, roughness: 0.1 }), [0.6, 0.3, 0.4], [-0.2, 0.22, 0]);
    for (const s of [-1, 1]) {
      part(t, G.box, HULL, [0.9, 0.7, 0.08], [-0.6, 0.25, s * 0.85], [0, 0, 0.5]);
      part(t, G.sph, Glow(color), 0.22, [-0.45, 0.6, s * 0.85]);
      part(t, G.box, Glow("#8fd0ff"), [1.6, 0.05, 0.05], [0.05, 0.13, s * 0.45], [0, s * 0.38, 0]);
      part(t, G.sph, Glow("#9fe0ff"), 0.3, [-1.38, 0, s * 0.22]);
    }
    return { hull: "#1f2a40", metal: 0.85, rough: 0.28, shield: color };
  },
  // MOTHERSHIP: silver saucer, glowing dome, chasing rim lights and a tractor glow underneath
  mother(t, color) {
    part(t, saucerGeo, HULL, 1);
    part(t, G.sph, Std(color, { transparent: true, opacity: 0.75, emissive: color, emissiveIntensity: 0.7, roughness: 0.1 }), [0.75, 0.5, 0.75], [0, 0.18, 0]);
    part(t, G.cyl, Glow(color), [0.55, 0.04, 0.55], [0, -0.26, 0]);
    part(t, G.tor, Std("#4a4f5e", { metalness: 0.9, roughness: 0.3 }), [1.02, 1.02, 1.6], [0, -0.01, 0], [H, 0, 0]);
    part(t, G.tor, Glow(color), [0.72, 0.72, 0.5], [0, 0.1, 0], [H, 0, 0]); // window band
    const lights = new THREE.Group(); lights.name = "lights"; t.add(lights);
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; part(lights, G.sph, Glow(i % 2 ? "#ffe680" : color), 0.09, [Math.cos(a) * 0.93, 0.0, Math.sin(a) * 0.93]); }
    const beam = new THREE.Group(); beam.name = "beam"; t.add(beam);
    part(beam, G.cone, Add(color, 0.1), [1.1, 0.9, 1.1], [0, -0.7, 0]);
    return { hull: "#8a91a3", metal: 0.9, rough: 0.28, double: true, animate: ["lights", "beam"] };
  },
  // DREADNOUGHT: a long black warship with three forward prongs, spines, red window rows and big engines
  dread(t, color) {
    part(t, G.box, HULL, [2.0, 0.42, 0.62]);
    part(t, G.cone4, HULL, [0.85, 0.7, 0.85], [1.35, 0, 0], [H / 2, 0, -H]);
    for (const [y, z, l] of [[0, 0.32, 1.1], [0, -0.32, 1.1], [0.18, 0, 0.9]]) part(t, G.cone, HULL, [0.14, l, 0.14], [1.55 + l / 3, y, z], [0, 0, -H]);
    for (const s of [-1, 1]) {
      part(t, G.box, HULL, [1.6, 0.3, 0.32], [-0.1, -0.05, s * 0.45], [s * 0.25, 0, 0]);
      part(t, G.box, Glow(color), [1.4, 0.05, 0.02], [-0.05, 0.06, s * 0.62]);
      part(t, G.box, Glow(color), [1.0, 0.05, 0.02], [-0.25, -0.08, s * 0.62]);
    }
    part(t, G.box, HULL, [0.6, 0.35, 0.35], [-0.45, 0.35, 0]);
    part(t, G.box, Glow("#ffd0d0"), [0.05, 0.06, 0.25], [-0.15, 0.42, 0]);
    for (let i = 0; i < 4; i++) part(t, G.cone, HULL, [0.1, 0.4, 0.1], [0.65 - i * 0.35, 0.36, 0], [0, 0, 0.5]);
    for (const [y, z] of [[0, 0], [0, 0.3], [0, -0.3], [0.2, 0.15], [0.2, -0.15]]) {
      part(t, G.cyl, Std("#1c1c22"), [0.2, 0.25, 0.2], [-1.1, y, z], [0, 0, H]);
      part(t, G.sph, Glow("#ff7a3c"), 0.2, [-1.24, y, z]);
    }
    return { hull: "#2a161c", metal: 0.7, rough: 0.35, shield: "#ff5c7a" };
  },
};

// ---------- bake each design once ----------
const templates = new Map();
function mergeGeos(list) {
  let n = 0; const parts = list.map(({ geo, m }) => { const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m); n += g.attributes.position.count; return g; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere(); return out;
}
function template(type, color) {
  const key = type + color;
  if (templates.has(key)) return templates.get(key);
  const root = new THREE.Group();
  const info = DESIGNS[type](root, color) || {};
  root.updateMatrixWorld(true);
  const animated = new Set(info.animate || []), byMat = new Map(), anims = [];
  for (const child of root.children) {
    if (animated.has(child.name)) { anims.push(child); continue; }
    child.traverse(o => { if (o.isMesh) { if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push({ geo: o.geometry, m: o.matrixWorld.clone() }); } });
  }
  const baked = [...byMat].map(([material, list]) => ({ material, geo: mergeGeos(list) }));
  const t = { info, baked, anims };
  templates.set(key, t); return t;
}

export const ALIEN_NAMES = { drone: "Stinger", swarm: "Mite", comet: "Comet", asteroid: "Infested Asteroid", rock: "Rock", cruiser: "Warden", mother: "Mothership", dread: "Dreadnought" };

export function buildAlien(type, size, color) {
  if (!DESIGNS[type]) type = "drone";
  const T = template(type, color), info = T.info;
  const hullCol = new THREE.Color(info.hull || "#333"), accent = new THREE.Color(color);
  const hull = new THREE.MeshStandardMaterial({ color: hullCol, roughness: info.rough ?? 0.45, metalness: info.metal ?? 0.5, flatShading: !!info.flat, side: info.double ? THREE.DoubleSide : THREE.FrontSide, emissive: accent, emissiveIntensity: 0.06,
    envMap: (info.metal ?? 0.5) > 0.3 ? metalEnv() : null });
  const g = new THREE.Group(), rig = new THREE.Group(); rig.name = "rig"; g.add(rig);
  for (const b of T.baked) rig.add(new THREE.Mesh(b.geo, b.material === HULL ? hull : b.material));
  const parts = {};
  for (const a of T.anims) { const c = a.clone(); c.traverse(o => { if (o.isMesh && o.material === HULL) o.material = hull; }); rig.add(c); parts[a.name] = c; }
  rig.scale.setScalar(size);
  if (info.shield) {
    const sh = new THREE.Group(); sh.name = "shield";
    const r = size * 2 + 12;
    sh.add(new THREE.Mesh(G.sph, new THREE.MeshBasicMaterial({ color: info.shield, transparent: true, opacity: 0.1, depthWrite: false })));
    sh.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.5, 1)), new THREE.LineBasicMaterial({ color: info.shield, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false })));
    sh.scale.setScalar(r); g.add(sh);
  }
  const seed = Math.random() * 10;
  g.userData.mat = hull;
  g.userData.flash = (hit, frozen) => {
    const env = hull.metalness > 0.3 ? metalEnv() : null; // follows the automatic quality switch
    if (hull.envMap !== env) { hull.envMap = env; hull.needsUpdate = true; }
    if (hit) { hull.emissive.set(0xffd9c0); hull.emissiveIntensity = 0.45; } // a warm flash; bosses under fire stay readable
    else if (frozen) { hull.emissive.set(0xcdf6ff); hull.emissiveIntensity = 0.8; }
    else { hull.emissive.copy(accent); hull.emissiveIntensity = 0.06; }
  };
  g.userData.update = (t) => {
    if (info.wobble) rig.rotation.x = Math.sin(t * 14 + seed) * 0.35;
    if (parts.tail) { const k = 1 + Math.sin(t * 9 + seed) * 0.08; parts.tail.scale.set(1, k, k); }
    if (parts.lights) { parts.lights.rotation.y = t * 1.5; }
    if (parts.beam) parts.beam.scale.set(1, 1 + Math.sin(t * 4) * 0.15, 1);
    const sh = g.getObjectByName("shield"); if (sh) sh.rotation.y = t * 0.4;
  };
  return g;
}
