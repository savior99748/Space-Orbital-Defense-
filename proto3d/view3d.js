// 3D view (preview): draws the running game with Three.js. The game logic, UI and balance are the
// same as the 2D game; this file only replaces the drawing and turns taps into slot selections.
import * as THREE from "../vendor/three/three.module.js";

const od = () => window.__od;
const TAU = Math.PI * 2;
const SAT = 0.7;       // satellites are drawn at 70% of their 2D size (planets are bigger)
const H = 2;           // height above the orbital plane for satellites / effects

// ---------- renderer, scene, camera ----------
const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.id = "game3d";
stage.insertBefore(canvas, stage.firstChild);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);

const ambient = new THREE.AmbientLight(0x334466, 0.9);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-700, 520, -420);
const sunPoint = new THREE.PointLight(0xffe2b0, 3, 0, 0);
scene.add(ambient, sun, sunPoint);

// stars
{
  const n = 1800, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * TAU, r = 2600 + Math.random() * 600, s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc8d2ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
}

// ---------- camera controls: drag to rotate, pinch / wheel to zoom, tap to build ----------
const cam = { yaw: 0, pitch: 0.95, dist: 900, fit: 900, tx: 0, tz: 0 };
function fitCamera() {
  const B = od().board(); if (!B) return;
  const ext = B.extent + 45, half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  cam.fit = Math.max(ext / half, ext / (half * camera.aspect)) * 0.98;
  cam.dist = cam.fit * 0.86; cam.tx = 0; cam.tz = 0;
}
function placeCamera() {
  const cp = Math.cos(cam.pitch);
  camera.position.set(cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.tz + cam.dist * cp * Math.cos(cam.yaw));
  camera.lookAt(cam.tx, 0, cam.tz);
}
function resize() {
  const r = stage.getBoundingClientRect();
  if (!r.width || !r.height) return;
  renderer.setSize(r.width, r.height, false);
  camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
  const keep = cam.dist / cam.fit;
  fitCamera(); cam.dist = cam.fit * keep;
}
new ResizeObserver(resize).observe(stage);

const pointers = new Map();
let gesture = null;
const local = ev => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
canvas.addEventListener("pointerdown", ev => {
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
  const p = local(ev);
  pointers.set(ev.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
  if (pointers.size === 1) gesture = { moved: false, pinched: false };
  if (pointers.size === 2 && gesture) {
    const [a, b] = [...pointers.values()];
    gesture.pinched = true; gesture.d0 = Math.hypot(a.x - b.x, a.y - b.y) || 1; gesture.dist0 = cam.dist;
  }
});
canvas.addEventListener("pointermove", ev => {
  const ptr = pointers.get(ev.pointerId); if (!ptr) return;
  const p = local(ev), dx = p.x - ptr.x, dy = p.y - ptr.y;
  ptr.x = p.x; ptr.y = p.y;
  if (pointers.size >= 2 && gesture && gesture.pinched) {
    const [a, b] = [...pointers.values()];
    cam.dist = THREE.MathUtils.clamp(gesture.dist0 * gesture.d0 / (Math.hypot(a.x - b.x, a.y - b.y) || 1), cam.fit * 0.3, cam.fit * 1.25);
    return;
  }
  if (gesture && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 8) gesture.moved = true;
  if (gesture && gesture.moved) {
    cam.yaw -= dx * 0.006;
    cam.pitch = THREE.MathUtils.clamp(cam.pitch + dy * 0.004, 0.35, 1.45);
  }
});
function endPointer(ev) {
  const ptr = pointers.get(ev.pointerId); if (!ptr) return;
  pointers.delete(ev.pointerId);
  if (ev.type === "pointerup" && pointers.size === 0 && gesture && !gesture.moved && !gesture.pinched) tap(ptr.x, ptr.y, ev.pointerType !== "mouse");
  if (pointers.size === 0) gesture = null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("wheel", ev => { ev.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * Math.exp(ev.deltaY * 0.0012), cam.fit * 0.3, cam.fit * 1.25); }, { passive: false });

// Tap: pick the slot whose 3D position is closest on screen (within a finger's width).
const _v = new THREE.Vector3();
function tap(sx, sy, touch) {
  const S = od().state(), B = od().board(); if (!S || !B) return;
  const r = canvas.getBoundingClientRect(), C = od().center();
  let best = null, bd = (touch ? 34 : 22) ** 2;
  for (const s of B.slots) {
    const p = od().slotPos(s.id);
    _v.set(p.x - C.x, H, p.y - C.y).project(camera);
    const px = (_v.x + 1) / 2 * r.width, py = (1 - _v.y) / 2 * r.height;
    const d = (px - sx) ** 2 + (py - sy) ** 2;
    if (d < bd) { bd = d; best = s.id; }
  }
  od().tapSlot(best, touch);
}

// view buttons (zoom in / out / reset)
document.getElementById("v3in").onclick = () => { cam.dist = Math.max(cam.fit * 0.3, cam.dist * 0.75); };
document.getElementById("v3out").onclick = () => { cam.dist = Math.min(cam.fit * 1.25, cam.dist / 0.75); };
document.getElementById("v3reset").onclick = () => { cam.yaw = 0; cam.pitch = 0.95; cam.dist = cam.fit * 0.86; };

// ---------- procedural planet textures ----------
function hash(x, y, z) { let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const s = t => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct = 5) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); a *= 0.5; f *= 2; } return s; }
const hex = h => { const n = parseInt(h.slice(1), 7 === h.length ? 16 : 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const parseColor = c => { if (c.startsWith("#")) return hex(c); const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2]]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function equirect(w, h, fn) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * TAU, cl = Math.cos(lat);
      const col = fn(Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl, lat, x / w, y / h);
      const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] ?? 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

const texCache = {};
function bodyTexture(style) {
  if (texCache[style]) return texCache[style];
  const ST = (window.OD.BODY_STYLE || {})[style] || { c: ["#dddddd", "#999999", "#444444"] };
  let seed = 0; for (const ch of style) seed = seed * 31 + ch.charCodeAt(0);
  const o = (seed % 97) * 1.7;
  const base = ST.c.map(parseColor);
  let fn;
  if (style === "earth") {
    const deep = [16, 48, 120], shallow = [36, 102, 196], green = [62, 140, 72], brown = [140, 118, 70], ice = [235, 240, 248];
    fn = (x, y, z, lat) => {
      const n = fbm(x * 2.2 + o, y * 2.2, z * 2.2, 6);
      if (Math.abs(lat) > 1.22 + (n - 0.5) * 0.3) return ice;
      if (n > 0.53) return mix(green, brown, Math.min(1, (n - 0.53) * 5 + Math.abs(lat) * 0.3));
      return mix(deep, shallow, Math.max(0, (n - 0.3) * 4));
    };
  } else {
    const bands = ST.bands ? ST.bands.map(parseColor) : null;
    fn = (x, y, z, lat) => {
      const n = fbm(x * 3 + o, y * 3, z * 3, 5);
      let col = mix(base[2], base[0], 0.35 + n * 0.55);
      if (bands) { const t = (y * 0.5 + 0.5) * bands.length + (n - 0.5) * 0.9; col = mix(col, bands[Math.max(0, Math.min(bands.length - 1, Math.floor(t)))], 0.7); }
      if (ST.swirl) col = mix(col, [255, 240, 200], Math.max(0, Math.sin(y * 9 + n * 6)) * 0.35);
      if (ST.craters) { const c = fbm(x * 9 + o, y * 9, z * 9, 2); if (c > 0.62) col = mix(col, [0, 0, 0], (c - 0.62) * 1.6); }
      if (ST.volcano && fbm(x * 7 + 3, y * 7, z * 7, 2) > 0.66) col = mix(col, [255, 140, 40], 0.6);
      if (ST.cracks && Math.abs(fbm(x * 4 + 9, y * 4, z * 4, 3) - 0.5) < 0.015) col = mix(col, [150, 90, 60], 0.7);
      if (ST.cap && y < -0.82) col = mix(col, [250, 250, 255], 0.85);
      if (ST.spot) { const sx = x - 0.55, sy = y - 0.28, sz = z; if (sx * sx * 3 + sy * sy * 9 + sz * sz * 6 < 0.05) col = parseColor(ST.spot); }
      return col;
    };
  }
  return (texCache[style] = equirect(512, 256, fn));
}
let cloudTex = null;
function clouds() {
  if (cloudTex) return cloudTex;
  cloudTex = equirect(512, 256, (x, y, z) => { const n = fbm(x * 3 + 40, y * 6, z * 3, 5); const a = Math.max(0, (n - 0.5) * 3.2); return [255, 255, 255, Math.min(220, a * 255)]; });
  return cloudTex;
}
function glowTexture(color) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, color); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function textSprite(text, color = "#9aa3d6", size = 26) {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  g.font = `600 ${size}px system-ui, sans-serif`;
  c.width = Math.ceil(g.measureText(text).width) + 16; c.height = size + 14;
  g.font = `600 ${size}px system-ui, sans-serif`; g.fillStyle = color; g.textBaseline = "middle"; g.fillText(text, 8, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(c.width * 0.5, c.height * 0.5, 1);
  return s;
}

// ---------- the board: bodies, rings, slots ----------
let world = null; // rebuilt when the map changes
function buildWorld(B) {
  if (world) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  const group = new THREE.Group(), MAP = od().map();
  const bodies = B.bodies.map(b => {
    const g = new THREE.Group();
    if (b.style === "sun") {
      g.add(new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 32), new THREE.MeshBasicMaterial({ color: 0xffc04d })));
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture("rgba(255,170,60,0.85)"), blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.set(b.r * 6, b.r * 6, 1); g.add(glow);
    } else {
      // the globe sits in a "tilt" group so its equator faces the camera (we look down on the orbital plane)
      const tilt = new THREE.Group(); tilt.name = "tilt"; tilt.rotation.order = "YXZ"; g.add(tilt);
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.r, 64, 40), new THREE.MeshStandardMaterial({ map: bodyTexture(b.style), roughness: 0.95, metalness: 0 }));
      m.name = "surface"; tilt.add(m);
      if (b.style === "earth") {
        const cl = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.015, 64, 40), new THREE.MeshStandardMaterial({ map: clouds(), transparent: true, depthWrite: false, roughness: 1 }));
        cl.name = "clouds"; tilt.add(cl);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.07, 48, 32), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.14, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
      }
      const ST = (window.OD.BODY_STYLE || {})[b.style] || {};
      if (ST.rings || (b.root && b.belt)) {
        const inner = b.belt ? b.belt.inner : b.r * 1.4, outer = b.belt ? b.belt.outer : b.r * 2.2;
        const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 96, 1), new THREE.MeshStandardMaterial({ color: 0xe8d6a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2; g.add(ring);
      }
      if (ST.faintRing) { const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * 1.55, b.r * 1.65, 64), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.25, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; g.add(ring); }
    }
    if (!b.root) {
      const lbl = textSprite(b.name, "#8b90b8", 22); lbl.name = "label"; g.add(lbl); lbl.position.set(0, b.r + 10, 0);
      const orbit = circleLine(b.orbit, 0x5a6090, 0.35, false); group.add(orbit); // orbit path around the centre
    }
    group.add(g);
    return g;
  });
  sunPoint.visible = MAP.final; sun.visible = !MAP.final;
  // turret rings (dashed) + labels (LEO / MEO / HEO or moon names)
  const rings = B.rings.map((r, i) => {
    const line = circleLine(r.r, 0x6cf0ff, 0.35, true);
    const name = i < MAP.rings.length ? MAP.rings[i].name : null;
    let label = null;
    if (name) { label = textSprite(name, "#6cf0ff", 24); label.position.set(r.r + 14, 6, 0); line.add(label); }
    group.add(line);
    return line;
  });
  // slots
  const slotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.6 }), B.slots.length);
  group.add(slotMesh);
  scene.add(group);
  world = { B, group, bodies, rings, slotMesh };
  fitCamera();
}
function circleLine(radius, color, opacity, dashed) {
  const pts = []; for (let i = 0; i <= 128; i++) { const a = i / 128 * TAU; pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius)); }
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const m = dashed ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, dashSize: 6, gapSize: 9 }) : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  const l = new THREE.Line(g, m); if (dashed) l.computeLineDistances();
  return l;
}

// ---------- satellite models (change with tier and specialization) ----------
const matCache = {};
function mat(color, emissive = 0, ei = 0) {
  const k = color + "|" + emissive + "|" + ei;
  return matCache[k] || (matCache[k] = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.5, metalness: 0.35 }));
}
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), sph: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 12), hex: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), tor: new THREE.TorusGeometry(1, 0.12, 8, 32),
  oct: new THREE.OctahedronGeometry(0.5), tet: new THREE.TetrahedronGeometry(0.6),
};
function part(g, material, sx, sy, sz, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(g, material); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); return m;
}
function buildSat(t) {
  const T = window.OD.TOWERS[t.type], lvl = t.level, path = t.path;
  const c = T.color, pc = path ? T.paths[path].color : c;
  const col = lvl >= 3 ? pc : c, glow = lvl >= 4 ? 0.9 : lvl >= 3 ? 0.45 : 0.15;
  const g = new THREE.Group(), turret = new THREE.Group(); turret.name = "turret";
  // body + solar panels along the orbit (local z = along the ring)
  g.add(part(geo.sph, mat("#1a1f40", col, 0.25), 18, 14, 18));
  const pl = 14 + lvl * 4, panel = mat(lvl >= 3 ? pc : "#3c5bb8", lvl >= 3 ? pc : "#000000", lvl >= 3 ? 0.25 : 0);
  if (t.type !== "carrier") { g.add(part(geo.box, panel, 7, 1.2, pl, 0, 0, 9 + pl / 2)); g.add(part(geo.box, panel, 7, 1.2, pl, 0, 0, -9 - pl / 2)); }
  const M = mat(col, col, glow), dark = mat("#20243f");
  switch (T.kind) {
    case "laser":
      if (path === "B") { turret.add(part(geo.cyl, M, 5, lvl >= 4 ? 30 : 24, 5, 15, 0, 0, 0, 0, Math.PI / 2)); turret.add(part(geo.sph, mat("#fff1c0", "#ffb347", 1.5), 7, 7, 7, lvl >= 4 ? 30 : 24)); }
      else {
        const n = lvl >= 1 ? 2 : 1;
        for (let i = 0; i < n; i++) turret.add(part(geo.cyl, M, 3, 16, 3, 9, 0, n > 1 ? (i ? 3 : -3) : 0, 0, 0, Math.PI / 2));
        if (lvl >= 2 && !path) turret.add(part(geo.sph, mat("#e9fdff", c, 1.2), 5, 5, 5, 18));
        if (path === "A") turret.add(part(geo.tet, mat("#ffffff", "#c18cff", 1.2), lvl >= 4 ? 11 : 8, lvl >= 4 ? 11 : 8, lvl >= 4 ? 11 : 8, 20));
      }
      break;
    case "missile":
      if (path === "A") turret.add(part(geo.hex, M, lvl >= 4 ? 26 : 22, 10, lvl >= 4 ? 26 : 22, 0, 4));
      else if (path === "B") { turret.add(part(geo.cyl, dark, 10, 26, 10, 8, 2, 0, 0, 0, Math.PI / 2)); turret.add(part(geo.cone, mat("#dddddd", "#ff5c5c", 0.6), 9, 10, 9, 25, 2, 0, 0, 0, -Math.PI / 2)); }
      else { const n = lvl === 0 ? 1 : lvl === 1 ? 2 : 4; for (let i = 0; i < n; i++) turret.add(part(geo.cyl, M, 4, 13, 4, 8, 3 + (i >= 2 ? 4 : 0), (i % 2 ? 3 : -3) * (n > 1 ? 1 : 0), 0, 0, Math.PI / 2)); }
      break;
    case "field":
      if (path === "A") { turret.add(part(geo.sph, mat("#000000"), 12, 12, 12)); turret.add(part(geo.tor, mat(pc, pc, 1.2), 12, 12, 12, 0, 0, 0, Math.PI / 2.4)); }
      else if (path === "B") turret.add(part(geo.oct, mat("#e6fbff", "#9ae8ff", 1), lvl >= 4 ? 26 : 20, lvl >= 4 ? 26 : 20, lvl >= 4 ? 26 : 20, 0, 4));
      else { turret.add(part(geo.tor, M, 9 + lvl * 2, 9 + lvl * 2, 9 + lvl * 2, 0, 3, 0, Math.PI / 2)); turret.add(part(geo.sph, mat(c, c, 1), 6, 6, 6, 0, 3)); }
      break;
    case "rail": {
      const L = path === "A" ? (lvl >= 4 ? 44 : 36) : lvl >= 2 ? 30 : 24;
      if (path === "B") for (let i = 0; i < (lvl >= 4 ? 5 : 3); i++) { const a = i / (lvl >= 4 ? 5 : 3) * TAU; turret.add(part(geo.cyl, M, 2.4, 24, 2.4, 12, Math.sin(a) * 4 + 2, Math.cos(a) * 4, 0, 0, Math.PI / 2)); }
      else { turret.add(part(geo.box, M, L, 3, 2, L / 2, 2, -2.5)); turret.add(part(geo.box, M, L, 3, 2, L / 2, 2, 2.5)); }
      break;
    }
    case "emp":
      turret.add(part(geo.sph, mat("#fff8d0", col, 1.4), 12, 12, 12, 0, 3));
      if (path === "B") for (let i = 0; i < (lvl >= 4 ? 5 : 3); i++) { const a = i / (lvl >= 4 ? 5 : 3) * TAU; turret.add(part(geo.sph, mat("#dfe9ff", col, 1), 5, 5, 5, Math.cos(a) * 15, 3, Math.sin(a) * 15)); }
      else for (let i = 0; i < [4, 6, 8, 8, 10][lvl]; i++) { const a = i / [4, 6, 8, 8, 10][lvl] * TAU; turret.add(part(geo.cone, M, 2.2, 9, 2.2, Math.cos(a) * 11, 3, Math.sin(a) * 11, 0, -a, -Math.PI / 2)); }
      break;
    case "miner":
      g.add(part(geo.hex, mat("#2a2412", col, 0.4), 20, 9, 20));
      g.add(part(geo.cone, mat("#c9c9d6"), 5, 11, 5, -14, 0, 0, 0, 0, Math.PI / 2));
      if (path === "A") g.add(part(geo.sph, mat("#fff3c0", "#ff9a3c", 2), 9, 9, 9, 0, 6));
      if (path === "B") g.add(part(geo.sph, mat(pc, pc, 0.6), 14, 6, 14, 6, 7));
      break;
    case "carrier": {
      const L = 26 + lvl * 5;
      g.add(part(geo.box, mat(path === "B" ? "#2b1420" : "#22152c", col, 0.35), 12, 6, L));
      g.add(part(geo.cone, mat(col, col, 0.6), 6, 10, 6, 0, 0, L / 2 + 4, Math.PI / 2));
      g.add(part(geo.sph, mat("#ffd0f0", col, 2), 6, 6, 6, 0, 0, -L / 2));
      break;
    }
  }
  g.add(turret);
  if (lvl >= 4) { const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(hexA(pc, 0.55)), blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(70, 70, 1); g.add(halo); }
  g.scale.setScalar(SAT); // model units match the 2D sizes
  return g;
}
const hexA = (h, a) => { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; };

// ---------- enemies ----------
function buildEnemy(e) {
  const d = e.def, s = d.size, col = d.color;
  const M = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.6, metalness: 0.2, flatShading: true });
  const g = new THREE.Group(); let m;
  switch (e.type) {
    case "asteroid": case "rock": m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), M); m.scale.set(1, 0.8, 0.9); break;
    case "comet": m = new THREE.Mesh(geo.sph, M); m.scale.setScalar(s * 2); { const tail = new THREE.Mesh(geo.cone, new THREE.MeshBasicMaterial({ color: 0x9ad7ff, transparent: true, opacity: 0.35, depthWrite: false })); tail.scale.set(s * 1.6, s * 5, s * 1.6); tail.rotation.z = Math.PI / 2; tail.position.x = -s * 2.6; g.add(tail); } break;
    case "cruiser": m = new THREE.Mesh(geo.oct, M); m.scale.set(s * 2.4, s * 1.2, s * 2); break;
    case "mother": m = new THREE.Mesh(geo.sph, M); m.scale.set(s * 2, s * 0.6, s * 2); g.add(part(geo.tor, new THREE.MeshBasicMaterial({ color: 0xffd1fb }), s * 0.8, s * 0.8, s * 0.8, 0, 0, 0, Math.PI / 2)); break;
    case "dread": m = new THREE.Mesh(geo.cone, M); m.scale.set(s * 1.3, s * 2.4, s * 0.8); m.rotation.z = -Math.PI / 2; break;
    case "swarm": m = new THREE.Mesh(geo.tet, M); m.scale.setScalar(s * 1.6); break;
    default: m = new THREE.Mesh(geo.cone, M); m.scale.set(s * 1.1, s * 2, s * 1.1); m.rotation.z = -Math.PI / 2;
  }
  g.add(m); g.userData.mat = M;
  if (d.shield) { const sh = new THREE.Mesh(geo.sph, new THREE.MeshBasicMaterial({ color: 0x8cc8ff, transparent: true, opacity: 0.18, depthWrite: false })); sh.scale.setScalar(s * 2 + 12); sh.name = "shield"; g.add(sh); }
  g.userData.hover = (e.seed % 1) * 8 + 4;
  return g;
}

// ---------- pooled effects: beams, missiles, particles, rings, fighters ----------
const BEAMS = 700, beamMesh = new THREE.InstancedMesh(geo.box, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }), BEAMS);
beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beamMesh.frustumCulled = false;
const SHOTS = 400, shotMesh = new THREE.InstancedMesh(geo.sph, new THREE.MeshBasicMaterial({ color: 0xffe0b0 }), SHOTS);
shotMesh.frustumCulled = false;
const CRAFT = 120, craftMesh = new THREE.InstancedMesh(geo.cone, new THREE.MeshStandardMaterial({ color: 0xff7ad9, emissive: 0xff7ad9, emissiveIntensity: 0.5 }), CRAFT);
craftMesh.frustumCulled = false;
const PMAX = 2500, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false;
const ringPool = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 48), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; return m; });
const rangeMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
rangeMesh.rotation.x = -Math.PI / 2;
const rangeEdge = circleLine(1, 0x6cf0ff, 0.6, false);
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
selRing.rotation.x = -Math.PI / 2;
scene.add(beamMesh, shotMesh, craftMesh, particles, rangeMesh, rangeEdge, selRing, ...ringPool);

// ---------- per-frame sync with the game state ----------
const satMeshes = new Map(), enemyMeshes = new Map();
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
const W = (x, y, h = 0) => { const C = od().center(); return new THREE.Vector3(x - C.x, h, y - C.y); };

function sync() {
  const OD = window.__od; if (!OD) return;
  const B = OD.board(); if (!B) return;
  if (!world || world.B !== B) buildWorld(B);
  const S = OD.state(), C = OD.center(), t = B.time;

  // bodies: position + slow spin
  B.bodies.forEach((b, i) => {
    const g = world.bodies[i]; g.position.set(b.x - C.x, 0, b.y - C.y);
    const surf = g.getObjectByName("surface"); if (surf) surf.rotation.y = t * (b.root ? 0.05 : 0.12);
    const cl = g.getObjectByName("clouds"); if (cl) cl.rotation.y = t * 0.07;
    const tilt = g.getObjectByName("tilt"); if (tilt) tilt.rotation.set(-(cam.pitch - 0.35), cam.yaw, 0);
  });
  if (od().map().final) sunPoint.position.set(0, 0, 0);
  // rings follow their body and rotate
  B.rings.forEach((r, i) => { const b = B.bodies[r.body], l = world.rings[i]; l.position.set(b.x - C.x, 0, b.y - C.y); l.rotation.y = -r.angle; l.children.forEach(ch => ch.position.set(r.r + 14, 6, 0)); });
  // empty slots
  const building = S && S.selectedType;
  B.slots.forEach((s, i) => {
    const p = OD.slotPos(s.id), taken = S && OD.towerAt(s.id);
    dummy.position.set(p.x - C.x, H, p.y - C.y); dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(taken ? 0.0001 : building ? 1.6 : 1); dummy.updateMatrix();
    world.slotMesh.setMatrixAt(i, dummy.matrix);
  });
  world.slotMesh.instanceMatrix.needsUpdate = true;
  world.slotMesh.material.opacity = building ? 0.95 : 0.4;
  world.slotMesh.material.color.set(building ? 0xffd166 : 0x6cf0ff);

  // satellites
  const seen = new Set();
  if (S) for (const tw of S.towers) {
    seen.add(tw.id);
    const key = `${tw.type}|${tw.level}|${tw.path}`;
    let m = satMeshes.get(tw.id);
    if (!m || m.userData.key !== key) { if (m) scene.remove(m); m = buildSat(tw); m.userData.key = key; satMeshes.set(tw.id, m); scene.add(m); }
    const p = OD.slotPos(tw.slot);
    m.position.set(p.x - C.x, H, p.y - C.y);
    m.rotation.y = -p.a;
    const tur = m.getObjectByName("turret"); if (tur && tw.aim != null) tur.rotation.y = -(tw.aim - p.a);
  }
  for (const [id, m] of satMeshes) if (!seen.has(id)) { scene.remove(m); satMeshes.delete(id); }

  // enemies
  const eseen = new Set();
  if (S) for (const e of S.enemies) {
    eseen.add(e.id);
    let m = enemyMeshes.get(e.id);
    if (!m) { m = buildEnemy(e); enemyMeshes.set(e.id, m); scene.add(m); m.userData.px = e.x; m.userData.py = e.y; }
    const h = H + m.userData.hover + Math.sin(t * 2 + e.seed) * 2;
    m.position.set(e.x - C.x, h, e.y - C.y);
    const dx = e.x - m.userData.px, dy = e.y - m.userData.py;
    if (dx * dx + dy * dy > 0.01) { m.rotation.y = -Math.atan2(dy, dx); m.userData.px = e.x; m.userData.py = e.y; }
    if (e.type === "asteroid" || e.type === "rock") m.rotation.x = e.spin;
    if (e.type === "mother") m.rotation.y = e.spin;
    const mt = m.userData.mat;
    mt.emissiveIntensity = e.hit > 0 ? 1.6 : e.frozen > 0 ? 0.9 : 0.35;
    mt.emissive.set(e.hit > 0 ? 0xffffff : e.frozen > 0 ? 0xcdf6ff : e.def.color);
    const sh = m.getObjectByName("shield"); if (sh) sh.visible = e.shield > 0;
  }
  for (const [id, m] of enemyMeshes) if (!eseen.has(id)) { scene.remove(m); enemyMeshes.delete(id); }

  // beams
  let n = 0;
  if (S) for (const bm of S.beams) {
    if (n >= BEAMS) break;
    const a = W(bm.x1, bm.y1, H + 1), b = W(bm.x2, bm.y2, H + 4), len = a.distanceTo(b);
    if (len < 0.5) continue;
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.lookAt(b); dummy.scale.set(Math.max(0.8, bm.w * 0.7), Math.max(0.8, bm.w * 0.7), len); dummy.updateMatrix();
    beamMesh.setMatrixAt(n, dummy.matrix);
    beamMesh.setColorAt(n, tmpC.set(bm.color).multiplyScalar(Math.min(1, bm.life * 12)));
    n++;
  }
  beamMesh.count = n; beamMesh.instanceMatrix.needsUpdate = true; if (beamMesh.instanceColor) beamMesh.instanceColor.needsUpdate = true;

  // missiles + bomblets
  n = 0;
  if (S) for (const m of S.shots) { if (n >= SHOTS) break; dummy.position.copy(W(m.x, m.y, H + 3)); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(m.nova ? 7 : m.kind === "bomblet" ? 2.5 : 4); dummy.updateMatrix(); shotMesh.setMatrixAt(n++, dummy.matrix); }
  shotMesh.count = n; shotMesh.instanceMatrix.needsUpdate = true;

  // carrier fighters
  n = 0;
  if (S) for (const tw of S.towers) if (tw.crafts) for (const f of tw.crafts) {
    if (n >= CRAFT) break;
    dummy.position.copy(W(f.x, f.y, H + 10)); dummy.rotation.set(0, -f.angle, -Math.PI / 2); dummy.scale.set(3, f.bomber ? 9 : 7, 3); dummy.updateMatrix();
    craftMesh.setMatrixAt(n++, dummy.matrix);
  }
  craftMesh.count = n; craftMesh.instanceMatrix.needsUpdate = true;

  // particles
  n = 0;
  if (S) for (const p of S.particles) {
    if (n >= PMAX) break;
    pPos[n * 3] = p.x - C.x; pPos[n * 3 + 1] = H + 4; pPos[n * 3 + 2] = p.y - C.y;
    tmpC.set(p.color).multiplyScalar(Math.max(0, p.life / p.max));
    pCol[n * 3] = tmpC.r; pCol[n * 3 + 1] = tmpC.g; pCol[n * 3 + 2] = tmpC.b; n++;
  }
  pGeo.setDrawRange(0, n); pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;

  // expanding rings (explosions, pulses)
  ringPool.forEach((m, i) => {
    const r = S && S.rings[i];
    if (!r) { m.visible = false; return; }
    const k = 1 - r.life / r.max, rad = Math.max(1, r.r * (r.inward ? 1 - k * 0.8 : 0.3 + k * 0.7));
    m.visible = true; m.position.copy(W(r.x, r.y, H + 2)); m.scale.setScalar(rad);
    m.material.color.set(r.color); m.material.opacity = 1 - k;
  });

  // selection + range
  const sel = S && S.selectedTower;
  const showRange = (x, y, r, color) => { rangeMesh.visible = rangeEdge.visible = true; rangeMesh.position.copy(W(x, y, 0.5)); rangeMesh.scale.setScalar(r); rangeEdge.position.copy(rangeMesh.position); rangeEdge.scale.setScalar(r); rangeMesh.material.color.set(color); rangeEdge.material.color.set(color); };
  rangeMesh.visible = rangeEdge.visible = false; selRing.visible = false;
  if (sel) {
    const T = window.OD.TOWERS[sel.type], st = sel.st || window.OD.tierOf(sel.type, sel.level, sel.path);
    const r = st.buffRange || st.range;
    if (r) showRange(sel.x, sel.y, r, sel.path ? T.paths[sel.path].color : T.color);
    selRing.visible = true; selRing.position.copy(W(sel.x, sel.y, H + 0.5)); selRing.scale.setScalar(13);
  }

  // shake
  if (S && S.shake) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.6; camera.position.z += (Math.random() - 0.5) * S.shake * 0.6; }
}

function loop() {
  placeCamera();
  sync();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
window.__view3d = { cam, camera, scene, renderer };
