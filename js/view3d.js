// 3D view: draws the running game with Three.js (the default view since v3; Classic 2D uses game.js drawing). The game logic, UI and balance are the
// same as the 2D game; this file only replaces the drawing and turns taps into slot selections.
import * as THREE from "../vendor/three/three.module.js";
import { buildSatellite, setReflections } from "./sat3d.js";
import { buildAlien } from "./aliens3d.js";
import { createBloom } from "./bloom3d.js";

const od = () => window.__od;
const TAU = Math.PI * 2;
const SAT = 1.0;       // satellites are drawn at their 2D size…
const SAT_MIN_PX = 13; // …and the body never smaller than ~13 px across on screen
const H = 2;           // height above the orbital plane for satellites / effects

// ---------- renderer, scene, camera ----------
const stage = document.getElementById("stage");
const canvas = document.createElement("canvas");
canvas.id = "game3d";
stage.insertBefore(canvas, stage.firstChild);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Filmic tone mapping (from the visual-upgrade ZIP): rich highlights without blown-out planets. Glowing effects
// (beams, sparks, shockwaves, halos) opt out with toneMapped: false so they keep their full brightness.
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const bloom = createBloom(renderer); // glow halo around bright things; see js/bloom3d.js
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
const camera = new THREE.PerspectiveCamera(40, 1, 1, 8000);

const ambient = new THREE.AmbientLight(0x434a58, 0.8); // near-neutral: a blue ambient turned beige planets teal
const rim = new THREE.DirectionalLight(0x4f8dff, 1.1); // cool blue back light from behind the scene (follows the camera): outlines hulls and planets
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(-700, 520, -420);
const sunPoint = new THREE.PointLight(0xffe2b0, 3, 0, 0);
scene.add(ambient, sun, sunPoint, rim);

// stars: varied sizes and tints (blue-white, white, warm), a few bright ones; one static draw call
{
  const n = 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const tints = [[0.75, 0.85, 1], [1, 1, 1], [1, 0.9, 0.75], [0.85, 0.9, 1]];
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, t = Math.random() * TAU, r = 2600 + Math.random() * 600, s = Math.sqrt(1 - u * u);
    pos.set([r * s * Math.cos(t), r * u, r * s * Math.sin(t)], i * 3);
    const bright = Math.random() < 0.04, k = bright ? 1 : 0.35 + Math.random() * 0.5, tint = tints[i % 4];
    col.set([tint[0] * k, tint[1] * k, tint[2] * k], i * 3);
    size[i] = bright ? 3.2 + Math.random() * 1.6 : 1.3 + Math.random() * 1.4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { px: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float px;
      void main() { vC = color; gl_PointSize = size * px; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vC; void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; gl_FragColor = vec4(vC * pow(1.0 - d, 1.5), 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  scene.add(new THREE.Points(g, m));
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
  rim.position.set(cam.tx - camera.position.x, -camera.position.y * 0.25, cam.tz - camera.position.z); // always behind the scene
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
    _v.set(p.x - C.x, H + (p.z || 0), p.y - C.y).project(camera);
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

// Paints an equirectangular texture. fn(x, y, z, lat, u, v, out) returns a color; it may also set out.h (height,
// 0-1, for a bump map) and out.r (roughness, 0-1; saved inverted as a specular map). Returns the color texture with
// .bump / .rough attached when used.
function equirect(w, h, fn, { bump = false, rough = false } = {}) {
  const mk = () => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d"); return { c, g, img: g.createImageData(w, h) }; };
  const C = mk(), Bm = bump && mk(), Rm = rough && mk(), d = C.img.data, out = { h: 0, r: 1 };
  for (let y = 0; y < h; y++) {
    const lat = (y / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const lon = (x / w) * TAU, cl = Math.cos(lat);
      out.h = 0; out.r = 1;
      const col = fn(Math.cos(lon) * cl, Math.sin(lat), Math.sin(lon) * cl, lat, x / w, y / h, out);
      const i = (y * w + x) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = col[3] ?? 255;
      if (Bm) { const v = Math.max(0, Math.min(255, out.h * 255)); Bm.img.data[i] = Bm.img.data[i + 1] = Bm.img.data[i + 2] = v; Bm.img.data[i + 3] = 255; }
      if (Rm) { const v = Math.max(0, Math.min(255, (1 - out.r) * 255)); Rm.img.data[i] = Rm.img.data[i + 1] = Rm.img.data[i + 2] = v; Rm.img.data[i + 3] = 255; } // specular map: bright = glossy
    }
  }
  const tex = ({ c, g, img }, srgb) => { g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const t = tex(C, true);
  if (Bm) t.bump = tex(Bm, false);
  if (Rm) t.rough = tex(Rm, false);
  return t;
}

const texCache = {};
function bodyTexture(style, big = false) {
  const ck = style + (big ? "|big" : "");
  if (texCache[ck]) return texCache[ck];
  const ST = (window.OD.BODY_STYLE || {})[style] || { c: ["#dddddd", "#999999", "#444444"] };
  let seed = 0; for (const ch of style) seed = seed * 31 + ch.charCodeAt(0);
  const o = (seed % 97) * 1.7;
  const base = ST.c.map(parseColor);
  let fn;
  if (style === "earth") {
    const deep = [16, 48, 120], shallow = [36, 102, 196], green = [62, 140, 72], brown = [140, 118, 70], ice = [235, 240, 248];
    fn = (x, y, z, lat, u, v, out) => {
      const n = fbm(x * 2.2 + o, y * 2.2, z * 2.2, 6);
      if (Math.abs(lat) > 1.22 + (n - 0.5) * 0.3) { out.h = 0.6; out.r = 0.7; return ice; }
      if (n > 0.53) { out.h = 0.45 + (n - 0.53) * 2.5; out.r = 0.92; return mix(green, brown, Math.min(1, (n - 0.53) * 5 + Math.abs(lat) * 0.3)); }
      out.h = 0.3; out.r = 0.32; // glossy oceans catch the sun
      return mix(deep, shallow, Math.max(0, (n - 0.3) * 4));
    };
  } else {
    const bands = ST.bands ? ST.bands.map(parseColor) : null;
    fn = (x, y, z, lat, u, v, out) => {
      const n = fbm(x * 3 + o, y * 3, z * 3, 5);
      out.h = n;
      let col = mix(base[2], base[0], 0.35 + n * 0.55);
      if (bands) { const t = (y * 0.5 + 0.5) * bands.length + (n - 0.5) * 0.9; col = mix(col, bands[Math.max(0, Math.min(bands.length - 1, Math.floor(t)))], 0.7); }
      if (ST.swirl) col = mix(col, [255, 240, 200], Math.max(0, Math.sin(y * 9 + n * 6)) * 0.35);
      if (ST.craters) { const c = fbm(x * 9 + o, y * 9, z * 9, 2); if (c > 0.62) { col = mix(col, [0, 0, 0], (c - 0.62) * 1.6); out.h -= (c - 0.62) * 2.2; } else if (c > 0.56) out.h += (c - 0.56) * 3; }
      if (ST.volcano && fbm(x * 7 + 3, y * 7, z * 7, 2) > 0.66) col = mix(col, [255, 140, 40], 0.6);
      if (ST.cracks && Math.abs(fbm(x * 4 + 9, y * 4, z * 4, 3) - 0.5) < 0.015) col = mix(col, [150, 90, 60], 0.7);
      if (ST.cap && y < -0.82) col = mix(col, [250, 250, 255], 0.85);
      if (ST.spot) { const sx = x - 0.55, sy = y - 0.28, sz = z; if (sx * sx * 3 + sy * sy * 9 + sz * sz * 6 < 0.05) col = parseColor(ST.spot); }
      return col;
    };
  }
  const gas = !!ST.bands || style === "venus" || style === "uranus";
  return (texCache[ck] = equirect(big ? 1024 : 512, big ? 512 : 256, fn, { bump: !gas, rough: style === "earth" }));
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

// ---------- atmospheres, ring bands, the sun ----------
// Fresnel glow on the planet's limb, brighter on the sunlit side. One cheap shader, shared geometry.
const ATMOS = { earth: ["#4aa8ff", 1.0], venus: ["#ffd27a", 0.9], mars: ["#ff8a5a", 0.45], jupiter: ["#ffe0b0", 0.35], saturn: ["#ffe6a8", 0.35],
  uranus: ["#9ef2ff", 0.6], neptune: ["#5f8cff", 0.65], titan: ["#ffb050", 0.9], triton: ["#cfe4ff", 0.3], io: ["#fff3a0", 0.25], europa: ["#cfe8ff", 0.2] };
const atmoMeshes = [];
function atmosphere(r, color, strength) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, strength: { value: strength }, sunDir: { value: new THREE.Vector3(-0.7, 0.5, -0.4).normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vW = normalize(mat3(modelMatrix) * normal);
        vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * wp).xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: `uniform vec3 color; uniform float strength; uniform vec3 sunDir; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() { float rimF = pow(1.0 - max(dot(vN, vV), 0.0), 2.6); float lit = clamp(dot(vW, sunDir) * 0.7 + 0.45, 0.12, 1.0);
        gl_FragColor = vec4(color * rimF * lit * strength * 1.6, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * 1.045, 48, 32), mat); m.name = "atmosphere";
  atmoMeshes.push(m); return m;
}
function ringBands() { // Saturn: banded, gapped, translucent
  const c = document.createElement("canvas"); c.width = 512; c.height = 4;
  const g = c.getContext("2d");
  for (let x = 0; x < 512; x++) {
    const t = x / 512, n = fbm(t * 40, 0.5, 0.5, 3);
    let a = 0.25 + n * 0.55; if (t > 0.62 && t < 0.67) a *= 0.12; if (t < 0.05) a *= t / 0.05; if (t > 0.95) a *= (1 - t) / 0.05; // Cassini gap + soft edges
    const b = 190 + n * 55; g.fillStyle = `rgba(${b + 20 | 0},${b | 0},${b * 0.78 | 0},${a.toFixed(3)})`; g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function radialRing(inner, outer) { // RingGeometry with u running from the inner to the outer edge
  const geo = new THREE.RingGeometry(inner, outer, 128, 1), p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); uv.setXY(i, (r - inner) / (outer - inner), 0.5); }
  return geo;
}
// Earth's night side: city lights that fade in past the terminator (lit side shows none)
let cityTex = null;
const EARTH_O = (() => { let seed = 0; for (const ch of "earth") seed = seed * 31 + ch.charCodeAt(0); return (seed % 97) * 1.7; })();
function cityLights() {
  return cityTex || (cityTex = equirect(512, 256, (x, y, z, lat) => {
    const land = fbm(x * 2.2 + EARTH_O, y * 2.2, z * 2.2, 6); // the same continents as the Earth texture
    if (land < 0.53 || Math.abs(lat) > 1.1) return [0, 0, 0];
    const c = vnoise(x * 60, y * 60, z * 60) * vnoise(x * 13 + 4, y * 13, z * 13);
    const k = c > 0.42 ? Math.min(1, (c - 0.42) * 3.5) : 0;
    return [255 * k, 196 * k, 120 * k];
  }));
}
function nightLights(r) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: cityLights() }, sunDir: { value: new THREE.Vector3(-0.7, 0.5, -0.4).normalize() } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vW = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vW;
      void main() { float night = smoothstep(0.05, -0.25, dot(vW, sunDir)); vec3 c = texture2D(map, vUv).rgb; gl_FragColor = vec4(c * night * 1.4, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r * 1.003, 64, 40), mat); m.name = "night"; return m;
}
let sunTex = null;
function sunSurface() {
  return sunTex || (sunTex = equirect(512, 256, (x, y, z) => { const n = fbm(x * 6, y * 6, z * 6, 4), m = fbm(x * 20 + 5, y * 20, z * 20, 2); const k = n * 0.75 + m * 0.35; return mix([255, 120, 20], [255, 236, 160], Math.min(1, k)); }));
}

// ---------- nebula backdrop ----------
const nebula = equirect(512, 256, (x, y, z) => {
  const n = fbm(x * 1.6 + 7, y * 1.6, z * 1.6, 5), m = fbm(x * 3 + 2, y * 3 + 9, z * 3, 4);
  const k = Math.max(0, n - 0.45) * 2.2, j = Math.max(0, m - 0.5) * 2;
  return [6 + k * 46 + j * 12, 8 + k * 22 + j * 30, 18 + k * 70 + j * 60];
});
nebula.mapping = THREE.EquirectangularReflectionMapping;
scene.background = nebula;

// ---------- the board: bodies, rings, slots ----------
let world = null; // rebuilt when the map changes
function buildWorld(B) {
  if (world) { scene.remove(world.group); world.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  atmoMeshes.length = 0;
  const group = new THREE.Group(), MAP = od().map();
  const bodies = B.bodies.map(b => {
    const g = new THREE.Group();
    if (b.style === "sun") {
      const core = new THREE.Mesh(new THREE.SphereGeometry(b.r, 48, 32), new THREE.MeshBasicMaterial({ map: sunSurface() })); core.name = "surface"; g.add(core);
      for (const [col, k] of [["rgba(255,200,110,0.95)", 3.2], ["rgba(255,140,40,0.55)", 6.5], ["rgba(255,110,30,0.22)", 11]]) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(col), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        glow.scale.set(b.r * k, b.r * k, 1); g.add(glow);
      }
    } else {
      // the globe sits in a "tilt" group so its equator faces the camera (we look down on the orbital plane)
      const tilt = new THREE.Group(); tilt.name = "tilt"; tilt.rotation.order = "YXZ"; g.add(tilt);
      const tex = bodyTexture(b.style, b.root);
      // Phong, not Standard: planets must ignore the metal-reflection environment (it tinted them blue)
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.r, 64, 40), new THREE.MeshPhongMaterial({ map: tex, shininess: tex.rough ? 28 : 4,
        specular: tex.rough ? 0x6f8fb0 : 0x111111, specularMap: tex.rough || null, bumpMap: tex.bump || null, bumpScale: tex.bump ? (b.root ? 1.6 : 1.1) : 1 }));
      m.name = "surface"; tilt.add(m);
      if (b.style === "earth") m.add(nightLights(b.r)); // turns with the surface
      if (ATMOS[b.style]) g.add(atmosphere(b.r, ...ATMOS[b.style]));
      if (b.style === "earth") {
        const cl = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.015, 64, 40), new THREE.MeshLambertMaterial({ map: clouds(), transparent: true, depthWrite: false }));
        cl.name = "clouds"; tilt.add(cl);
        g.add(new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.09, 48, 32), new THREE.MeshBasicMaterial({ color: 0x4aa8ff, transparent: true, opacity: 0.1, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false })));
      }
      const ST = (window.OD.BODY_STYLE || {})[b.style] || {};
      if (ST.rings || (b.root && b.belt)) {
        const inner = b.belt ? b.belt.inner : b.r * 1.4, outer = b.belt ? b.belt.outer : b.r * 2.2;
        const ring = new THREE.Mesh(radialRing(inner, outer), new THREE.MeshLambertMaterial({ map: ringBands(), transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x2a2418 }));
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
    const body = B.bodies[r.body], pts = [];
    for (let k = 0; k <= 160; k++) { const p = od().ringPoint(r, k / 160 * TAU); pts.push(new THREE.Vector3(p.x - body.x, p.z, p.y - body.y)); }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.4, dashSize: 6, gapSize: 9 }));
    line.computeLineDistances();
    const name = i < MAP.rings.length ? MAP.rings[i].name : null;
    if (name) { // label at the highest point of the orbit
      const lp = od().ringPoint(r, r.node + Math.PI / 2), label = textSprite(name, "#6cf0ff", 24);
      label.position.set(lp.x - body.x, lp.z + 10, lp.y - body.y); line.add(label);
    }
    group.add(line);
    return line;
  });
  // slots
  const slotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(4.2, 10, 8), new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.6 }), B.slots.length);
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

// ---------- shared geometry for effects ----------
const geo = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12), sph: new THREE.SphereGeometry(0.5, 16, 12),
  cone: new THREE.ConeGeometry(0.5, 1, 12), hex: new THREE.CylinderGeometry(0.5, 0.5, 1, 6), tor: new THREE.TorusGeometry(1, 0.12, 8, 32),
  oct: new THREE.OctahedronGeometry(0.5), tet: new THREE.TetrahedronGeometry(0.6),
};
// satellite models live in js/sat3d.js (seven designs, every tier and specialization)
function buildSat(t) {
  const g = buildSatellite({ type: t.type, level: t.level, path: t.path });
  g.scale.setScalar(SAT * g.userData.baseScale);
  if (t.oc) { // Overclock: golden sparks orbit the satellite, one per level (up to 6)
    const ring = new THREE.Group(), n = Math.min(6, t.oc), sparks = [];
    const sm = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), sm); ring.add(s); sparks.push(s); }
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(20, 0.5, 6, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }));
    hoop.rotation.x = Math.PI / 2; ring.add(hoop); g.add(ring);
    const base = g.userData.update;
    g.userData.update = (time, fire, dt) => {
      base(time, fire, dt);
      sparks.forEach((s, i) => { const a = time * 1.6 + i * Math.PI * 2 / n; s.position.set(Math.cos(a) * 20, Math.sin(time * 2 + i) * 3, Math.sin(a) * 20); s.rotation.y = time * 3; });
    };
  }
  return g;
}

// ---------- satellite icons for the build bar and upgrade panel ----------
// Rendered once per model on a small offscreen renderer and cached as 2D canvases.
let thumbR = null, thumbScene, thumbCam;
const thumbs = new Map();
function satThumb(type, level, path) {
  const key = `${type}|${level}|${path}`;
  if (thumbs.has(key)) return thumbs.get(key);
  try {
    if (!thumbR) {
      thumbR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      thumbR.setPixelRatio(1); thumbR.setSize(192, 192, false); thumbR.outputColorSpace = THREE.SRGBColorSpace; thumbR.toneMapping = THREE.ACESFilmicToneMapping; thumbR.toneMappingExposure = 1.2; thumbR.setClearColor(0x000000, 0);
      thumbScene = new THREE.Scene();
      thumbScene.add(new THREE.AmbientLight(0x8090c0, 2.2));
      const k = new THREE.DirectionalLight(0xfff1dc, 3); k.position.set(60, 80, 70); thumbScene.add(k);
      const r = new THREE.DirectionalLight(0x6c8bff, 1.6); r.position.set(-80, -20, -60); thumbScene.add(r);
      thumbCam = new THREE.PerspectiveCamera(30, 1, 1, 2000);
    }
    const m = buildSatellite({ type, level, path });
    m.userData.update(1.3, true, 0);
    thumbScene.add(m);
    const box = new THREE.Box3().setFromObject(m), ctr = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
    const d = size * 1.15 + 6, yaw = 0.75, pitch = 0.42;
    thumbCam.position.set(ctr.x + Math.cos(yaw) * Math.cos(pitch) * d, ctr.y + Math.sin(pitch) * d, ctr.z + Math.sin(yaw) * Math.cos(pitch) * d);
    thumbCam.lookAt(ctr);
    thumbR.render(thumbScene, thumbCam);
    const c = document.createElement("canvas"); c.width = c.height = 192;
    c.getContext("2d").drawImage(thumbR.domElement, 0, 0);
    thumbScene.remove(m);
    thumbs.set(key, c); return c;
  } catch (err) { console.warn("satellite icon failed", err); thumbs.set(key, null); return null; }
}
window.OD.satThumb = satThumb;

// ---------- planet portraits for the map selector ----------
// Same textures, atmosphere and rings as the battlefield, lit from the upper left; rendered once and cached.
let planetScene = null, planetCam, planetLight;
const planetThumbs = new Map();
function buildPortrait(style) {
  const g = new THREE.Group(), ST = (window.OD.BODY_STYLE || {})[style] || {};
  let extent = 1.15;
  if (style === "sun") {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshBasicMaterial({ map: sunSurface() })));
    for (const [col, k] of [["rgba(255,200,110,0.95)", 2.6], ["rgba(255,140,40,0.5)", 4]]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(col), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); sp.scale.set(k, k, 1); g.add(sp); }
    extent = 1.7;
  } else {
    const tex = bodyTexture(style);
    const surf = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), new THREE.MeshPhongMaterial({ map: tex, shininess: tex.rough ? 28 : 4, specular: tex.rough ? 0x6f8fb0 : 0x111111, specularMap: tex.rough || null, bumpMap: tex.bump || null, bumpScale: 0.04 })); g.add(surf); g.userData.surface = surf;
    if (ATMOS[style]) { const a = atmosphere(1, ...ATMOS[style]); atmoMeshes.pop(); a.material.uniforms.sunDir.value.copy(planetLight.position).normalize(); g.add(a); }
    if (ST.rings) { const ring = new THREE.Mesh(radialRing(1.4, 2.25), new THREE.MeshLambertMaterial({ map: ringBands(), transparent: true, side: THREE.DoubleSide, depthWrite: false, emissive: 0x2a2418 })); ring.rotation.x = -Math.PI / 2 + 0.42; ring.rotation.y = 0.2; g.add(ring); extent = 2.35; }
    if (ST.faintRing) { const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.65, 64), new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0.3, side: THREE.DoubleSide })); ring.rotation.x = 0.3; g.add(ring); extent = 1.7; }
    g.rotation.z = 0.15;
  }
  g.userData.extent = extent;
  return g;
}
const globeCanvas = document.createElement("canvas"); globeCanvas.width = globeCanvas.height = 192;
let globeModel = null;
function planetThumb(style, spin) {
  if (spin !== undefined) return spinningPlanet(style, spin);
  if (planetThumbs.has(style)) return planetThumbs.get(style);
  try {
    if (!thumbR) satThumb("laser", 0, null); // creates the shared offscreen renderer
    if (!planetScene) {
      planetScene = new THREE.Scene();
      planetScene.add(new THREE.AmbientLight(0x434a58, 0.55));
      planetLight = new THREE.DirectionalLight(0xfff1dc, 3); planetLight.position.set(-3, 2, 3); planetScene.add(planetLight);
      const back = new THREE.DirectionalLight(0x4f8dff, 1.2); back.position.set(3, -1, -2); planetScene.add(back);
      planetCam = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    }
    const g = buildPortrait(style), extent = g.userData.extent;
    planetScene.children.forEach(o => { if (o.isGroup) o.visible = false; }); // only this planet in the shot
    planetScene.add(g);
    planetCam.position.set(0, 0, extent / Math.tan(THREE.MathUtils.degToRad(15)) * 1.04); planetCam.lookAt(0, 0, 0);
    thumbR.render(planetScene, planetCam);
    const c = document.createElement("canvas"); c.width = c.height = 192;
    c.getContext("2d").drawImage(thumbR.domElement, 0, 0);
    planetScene.remove(g);
    g.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    const out = { canvas: c, extent };
    planetThumbs.set(style, out); return out;
  } catch (err) { console.warn("planet portrait failed", err); planetThumbs.set(style, null); return null; }
}
// the mission panel's turning globe: the same portrait model, kept in the scene and re-rendered at a new angle
function spinningPlanet(style, spin) {
  try {
    if (!globeModel || globeModel.style !== style) {
      if (globeModel) { planetScene.remove(globeModel.g); globeModel.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      planetThumb(style); // makes sure the scene, camera and textures exist
      const keep = planetThumbs.get(style); if (!keep) return null;
      const g = buildPortrait(style); planetScene.add(g);
      globeModel = { style, g, extent: keep.extent };
    }
    planetScene.children.forEach(o => { if (o.isGroup) o.visible = o === globeModel.g; });
    const surf = globeModel.g.userData.surface; if (surf) surf.rotation.y = spin;
    planetCam.position.set(0, 0, globeModel.extent / Math.tan(THREE.MathUtils.degToRad(15)) * 1.04); planetCam.lookAt(0, 0, 0);
    thumbR.render(planetScene, planetCam);
    const g2 = globeCanvas.getContext("2d"); g2.clearRect(0, 0, 192, 192); g2.drawImage(thumbR.domElement, 0, 0);
    return { canvas: globeCanvas, extent: globeModel.extent };
  } catch (err) { console.warn("globe failed", err); return null; }
}
window.OD.planetThumb = planetThumb;

// ---------- enemies ----------
// invader models live in js/aliens3d.js
function buildEnemy(e) {
  const g = buildAlien(e.type, e.def.size, e.def.color);
  g.userData.hover = (e.seed % 1) * 8 + 4;
  return g;
}

// ---------- pooled effects: beams, missiles, particles, rings, fighters ----------
const beamGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true).rotateX(Math.PI / 2); // round tube along +Z
const BEAMS = 700, beamMesh = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), BEAMS);
beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beamMesh.frustumCulled = false;
const SHOTS = 400, shotMesh = new THREE.InstancedMesh(geo.sph, new THREE.MeshBasicMaterial({ color: 0xffe0b0, toneMapped: false }), SHOTS);
shotMesh.frustumCulled = false;
const CRAFT = 120, craftMesh = new THREE.InstancedMesh(geo.cone, new THREE.MeshStandardMaterial({ color: 0xff7ad9, emissive: 0xff7ad9, emissiveIntensity: 0.5 }), CRAFT);
craftMesh.frustumCulled = false;
const PMAX = 2500, pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 4, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
particles.frustumCulled = false;
const ringThick = new THREE.RingGeometry(0.9, 1, 48), ringThin = new THREE.RingGeometry(0.975, 1, 96); // big pulses get a thin edge
const ringPool = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(ringThick, new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.rotation.x = -Math.PI / 2; m.visible = false; return m; });
const rangeMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
rangeMesh.rotation.x = -Math.PI / 2;
const rangeEdge = circleLine(1, 0x6cf0ff, 0.6, false);
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
selRing.rotation.x = -Math.PI / 2;
const rangeSphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.MeshBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.07, depthWrite: false }));
rangeSphere.add(new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 16, 10)), new THREE.LineBasicMaterial({ color: 0x6cf0ff, transparent: true, opacity: 0.18 })));
// Beam cores: a thin white-hot line inside each colored beam
const beamCore = new THREE.InstancedMesh(beamGeo, new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), BEAMS);
beamCore.instanceMatrix.setUsage(THREE.DynamicDrawUsage); beamCore.frustumCulled = false;
// Glow points: soft round additive sprites with their own size and color (sparks, muzzle/impact flashes,
// fireballs, missile engines and trails). Everything glowing is one draw call.
const GMAX = 7000, gPos = new Float32Array(GMAX * 3), gCol = new Float32Array(GMAX * 3), gSize = new Float32Array(GMAX);
const gGeo = new THREE.BufferGeometry();
gGeo.setAttribute("position", new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
gGeo.setAttribute("color", new THREE.BufferAttribute(gCol, 3).setUsage(THREE.DynamicDrawUsage));
gGeo.setAttribute("size", new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage));
const glowMat = new THREE.ShaderMaterial({
  uniforms: { scale: { value: 600 } },
  vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; uniform float scale;
    void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * scale / -mv.z, 1.5, 256.0); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vC;
    void main() { float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 1.8); gl_FragColor = vec4(vC * a + vec3(a * a * a) * 0.6 * length(vC), 1.0); }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
});
const glowPoints = new THREE.Points(gGeo, glowMat); glowPoints.frustumCulled = false;
let gN = 0;
const _gc = new THREE.Color();
function glow(v, color, size, k = 1) { // v: world position, k: brightness 0..1
  if (gN >= GMAX || k <= 0.01) return;
  gPos[gN * 3] = v.x; gPos[gN * 3 + 1] = v.y; gPos[gN * 3 + 2] = v.z;
  _gc.set(color); gCol[gN * 3] = _gc.r * k; gCol[gN * 3 + 1] = _gc.g * k; gCol[gN * 3 + 2] = _gc.b * k;
  gSize[gN] = size; gN++;
}
const trails = new WeakMap(); // missile → recent positions
// send only the used part of a dynamic buffer to the GPU (not the whole pool) each frame
function upload(attr, count) { if (!count) return; attr.clearUpdateRanges(); attr.addUpdateRange(0, count); attr.needsUpdate = true; }
// destruction debris: a pooled set of glowing fragments that fly apart and cool (visual only)
const DEBRIS = 600, debris = [];
for (let i = 0; i < DEBRIS; i++) debris.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), c: "#fff", s: 1, t0: 0, life: 1 });
let debrisNext = 0, debrisLast = 0;
function spawnDebris(L, t) {
  const n = L.boss ? 60 : Math.min(18, 6 + L.size);
  _gv.set(L.x, L.y, L.z); glow(_gv, "#fff2d0", L.size * (L.boss ? 9 : 5), 1); glow(_gv, L.color, L.size * (L.boss ? 14 : 7), 0.8); // kill flash
  for (let i = 0; i < n; i++) {
    const d = debris[debrisNext]; debrisNext = (debrisNext + 1) % DEBRIS;
    d.on = true; d.p.set(L.x, L.y, L.z); d.t0 = t; d.life = 0.7 + Math.random() * 0.8;
    d.v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar((L.boss ? 90 : 40) * (0.4 + Math.random()));
    d.c = i % 3 ? "#ff9a3c" : L.color; d.s = (L.boss ? 3 : 1.6) * (0.6 + Math.random());
  }
}
function stepDebris(t) {
  const dt = Math.min(0.1, Math.max(0, t - debrisLast)); debrisLast = t;
  for (const d of debris) {
    if (!d.on) continue;
    const age = t - d.t0; if (age > d.life || age < 0) { d.on = false; continue; }
    d.p.addScaledVector(d.v, dt); d.v.multiplyScalar(1 - dt * 1.5);
    const k = 1 - age / d.life; glow(d.p, d.c, d.s * (1 + k * 2), k);
  }
}
// muzzle flash: brief glow at the turret when a satellite fires (cooldown just reset)
const MUZZLE = { laser: "#bff8ff", missile: "#ffb347", rail: "#c9ffb0", emp: "#fff3a0", carrier: "#ffc4ee" };
// invader engine glows: [color, distance behind the centre, size] in units of the invader's size
const ENGINE = { drone: ["#ffb070", 1.3, 1.6], swarm: ["#ff7ab0", 0.9, 1.2], cruiser: ["#9fe0ff", 1.45, 1.4], dread: ["#ff7a3c", 1.3, 1.1], asteroid: ["#ff9a3c", 1.3, 1.3] };
const _ev = new THREE.Vector3();
scene.add(beamMesh, beamCore, shotMesh, craftMesh, particles, glowPoints, rangeMesh, rangeEdge, rangeSphere, selRing, ...ringPool);

// ---------- per-frame sync with the game state ----------
const satMeshes = new Map(), enemyMeshes = new Map();
const dummy = new THREE.Object3D(), tmpC = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), _white = new THREE.Color(1, 1, 1), _gv = new THREE.Vector3();
const _ax = new THREE.Vector3(), _ay = new THREE.Vector3(), _az = new THREE.Vector3(), _dir = new THREE.Vector3(), _xAxis = new THREE.Vector3(1, 0, 0);
const _m4 = new THREE.Matrix4(), _qi = new THREE.Quaternion();
const W = (x, y, h = 0, z = 0) => { const C = od().center(); return new THREE.Vector3(x - C.x, h + (z || 0), y - C.y); };

// ---------- animations: satellites launch into orbit, upgrades burst, sells puff, invaders warp in (visual only) ----------
const LAUNCH = 0.9, POP = 0.6, WARP = 0.5;
const satKnown = new Set(), satLaunch = new Map(), satPop = new Map(); // tower id → start time (seconds)
const _from = new THREE.Vector3(), _to = new THREE.Vector3();
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
function towerColor(tw) { const T = window.OD.TOWERS[tw.type]; return (tw.path && T.paths[tw.path].color) || T.color; }
function burst(pos, color, size, k, spin) { // ring of sparkles + a soft flash, k: 0 → 1 over the animation
  const f = 1 - k;
  glow(pos, color, size * (1.2 + k * 1.5), f * 0.9); glow(pos, "#ffffff", size * 0.6, f * f);
  for (let i = 0; i < 10; i++) {
    const a = spin + i * TAU / 10, r = size * (0.3 + k * 1.3);
    _gv.set(pos.x + Math.cos(a) * r, pos.y + Math.sin(a * 2 + spin) * size * 0.25, pos.z + Math.sin(a) * r);
    glow(_gv, i % 2 ? color : "#fff6d8", size * 0.4, f);
  }
}

function sync() {
  const OD = window.__od; if (!OD) return;
  const B = OD.board(); if (!B) return;
  let fresh = false; // a new board: satellites already on it (a resumed game) don't launch
  if (!world || world.B !== B) { buildWorld(B); fresh = true; satKnown.clear(); satLaunch.clear(); satPop.clear(); }
  const now = performance.now() / 1000, calm = reducedMotion.matches;
  const S = OD.state(), C = OD.center(), t = B.time;

  // bodies: position + slow spin
  B.bodies.forEach((b, i) => {
    const g = world.bodies[i]; g.position.set(b.x - C.x, 0, b.y - C.y);
    const surf = g.getObjectByName("surface"); if (surf) surf.rotation.y = t * (b.root ? 0.05 : 0.12);
    const night = g.getObjectByName("night");
    if (night) { const d = night.material.uniforms.sunDir.value; if (od().map().final) d.set(-(b.x - C.x), 0, -(b.y - C.y)).normalize(); else d.copy(sun.position).normalize(); }
    const atm = g.getObjectByName("atmosphere");
    if (atm) { const d = atm.material.uniforms.sunDir.value; if (od().map().final) d.set(-(b.x - C.x), 0, -(b.y - C.y)).normalize(); else d.copy(sun.position).normalize(); }
    const cl = g.getObjectByName("clouds"); if (cl) cl.rotation.y = t * 0.07;
    const tilt = g.getObjectByName("tilt"); if (tilt) tilt.rotation.set(-(cam.pitch - 0.35), cam.yaw, 0);
  });
  if (od().map().final) sunPoint.position.set(0, 0, 0);
  // rings follow their body and rotate
  B.rings.forEach((r, i) => { const b = B.bodies[r.body]; world.rings[i].position.set(b.x - C.x, H, b.y - C.y); });
  // empty slots
  const building = S && S.selectedType;
  B.slots.forEach((s, i) => {
    const p = OD.slotPos(s.id), taken = S && OD.towerAt(s.id);
    dummy.position.set(p.x - C.x, H + (p.z || 0), p.y - C.y); dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(taken ? 0.0001 : building ? 1.6 : 1); dummy.updateMatrix();
    world.slotMesh.setMatrixAt(i, dummy.matrix);
  });
  world.slotMesh.instanceMatrix.needsUpdate = true;
  world.slotMesh.material.opacity = building ? 0.95 : 0.4;
  world.slotMesh.material.color.set(building ? 0xffd166 : 0x6cf0ff);

  // satellites: grow when zoomed out so they stay at least SAT_MIN_PX across on screen
  const viewH = canvas.clientHeight || 1;
  const worldPerPx = 2 * cam.dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / viewH;
  const satScale = Math.max(SAT, SAT_MIN_PX * worldPerPx / 20); // a satellite body is ~20 model units wide
  const seen = new Set();
  if (S) for (const tw of S.towers) {
    seen.add(tw.id);
    const key = `${tw.type}|${tw.level}|${tw.path}|${tw.oc || 0}`;
    let m = satMeshes.get(tw.id);
    if (!satKnown.has(tw.id)) { satKnown.add(tw.id); if (!fresh && !calm) satLaunch.set(tw.id, now); }
    if (!m || m.userData.key !== key) { if (m) { scene.remove(m); if (!calm) satPop.set(tw.id, now); } m = buildSat(tw); m.userData.key = key; satMeshes.set(tw.id, m); scene.add(m); }
    const p = OD.slotPos(tw.slot), ring = B.rings[B.slots[tw.slot].ring], body = B.bodies[ring.body];
    m.position.set(p.x - C.x, H + (p.z || 0), p.y - C.y);
    m.scale.setScalar(satScale * m.userData.baseScale);
    const lt = satLaunch.get(tw.id);
    if (lt != null) { // launch: lifts off the planet's surface and climbs to its slot on an arc, engine blazing
      const k = (now - lt) / LAUNCH;
      if (k >= 1 || k < 0) { satLaunch.delete(tw.id); satPop.set(tw.id, now); }
      else {
        const e = easeOut(k);
        _to.copy(m.position);
        _from.set(_to.x - (body.x - C.x), 0, _to.z - (body.y - C.y)).normalize().multiplyScalar(body.r * 0.95).add(_gv.set(body.x - C.x, H, body.y - C.y));
        m.position.lerpVectors(_from, _to, e); m.position.y += Math.sin(k * Math.PI) * body.r * 0.35;
        m.scale.multiplyScalar(0.35 + 0.65 * e);
        glow(m.position, "#ffd08a", 70 * satScale, 1 - k * 0.5); glow(m.position, "#ffffff", 26 * satScale, 1 - k); // engine
        for (let j = 1; j <= 6; j++) { const kk = Math.max(0, e - j * 0.05); _gv.lerpVectors(_from, _to, kk); _gv.y += Math.sin(Math.max(0, k - j * 0.05) * Math.PI) * body.r * 0.35; glow(_gv, j < 3 ? "#ffb070" : "#8fa0c0", (50 - j * 5) * satScale, (1 - j / 7) * (1 - k * 0.7)); }
      }
    }
    const pt = satPop.get(tw.id);
    if (pt != null) { // arrival / upgrade: a quick swell and a burst of light in the satellite's color
      const k = (now - pt) / POP;
      if (k >= 1 || k < 0) satPop.delete(tw.id);
      else { m.scale.multiplyScalar(1 + 0.35 * (1 - k) * (1 - k)); burst(m.position, towerColor(tw), 60 * satScale, k, now * 4); }
    }
    m.userData.update(t, (tw.cd || 0) > 0, 1 / 60);
    // firing visuals, read from the satellite's cooldown (no gameplay change)
    const st = tw.st, period = st && st.rate ? 1 / st.rate : 0, cd = tw.cd || 0;
    if (period && MUZZLE[tw.type] && !st.dps) {
      const since = period - cd; // seconds since the last shot
      if (since >= 0 && since < 0.09 && tw.aim != null) {
        const cp = Math.cos(tw.aimP || 0), reach = 18 * satScale;
        _gv.set(m.position.x + Math.cos(tw.aim) * cp * reach, m.position.y + Math.sin(tw.aimP || 0) * reach, m.position.z + Math.sin(tw.aim) * cp * reach);
        glow(_gv, MUZZLE[tw.type], 9 * satScale, 1 - since / 0.09);
      }
      if (tw.type === "rail" && period > 0.8 && cd < 0.6 && cd > 0) { // railgun charge-up before each shot
        const k = 1 - cd / 0.6, cp = Math.cos(tw.aimP || 0), reach = 12 * satScale;
        _gv.set(m.position.x + Math.cos(tw.aim) * cp * reach, m.position.y + Math.sin(tw.aimP || 0) * reach, m.position.z + Math.sin(tw.aim) * cp * reach);
        glow(_gv, "#7dff9a", (4 + k * 8) * satScale, 0.3 + k * 0.6);
      }
    }
    // orient: local x = outward from the body, local z = along the orbit
    const q = OD.ringPoint(ring, p.a + 0.02);
    _ax.set(p.x - body.x, p.z || 0, p.y - body.y).normalize();
    _az.set(q.x - p.x, (q.z || 0) - (p.z || 0), q.y - p.y).normalize();
    _ay.crossVectors(_az, _ax).normalize(); _az.crossVectors(_ax, _ay);
    m.quaternion.setFromRotationMatrix(_m4.makeBasis(_ax, _ay, _az));
    const tur = m.getObjectByName("turret");
    if (tur && tw.aim != null) { // world aim direction → turret's local frame
      const cp = Math.cos(tw.aimP || 0);
      _dir.set(Math.cos(tw.aim) * cp, Math.sin(tw.aimP || 0), Math.sin(tw.aim) * cp).applyQuaternion(_qi.copy(m.quaternion).invert());
      tur.quaternion.setFromUnitVectors(_xAxis, _dir.normalize());
    }
  }
  for (const [id, m] of satMeshes) if (!seen.has(id)) { // sold: a puff of sparks where it was
    if (S && !fresh && !calm) spawnDebris({ x: m.position.x, y: m.position.y, z: m.position.z, size: 4, color: "#9fe8ff", boss: false }, t);
    scene.remove(m); satMeshes.delete(id); satKnown.delete(id); satLaunch.delete(id); satPop.delete(id);
  }

  // enemies
  const eseen = new Set();
  if (S) for (const e of S.enemies) {
    eseen.add(e.id);
    let m = enemyMeshes.get(e.id);
    if (!m) { m = buildEnemy(e); enemyMeshes.set(e.id, m); scene.add(m); m.userData.px = e.x; m.userData.py = e.y; m.userData.born = calm ? -9 : now; m.userData.bs = m.scale.x; }
    const threeD = od().map().threeD;
    const h = H + (e.z || 0) + (threeD ? 0 : m.userData.hover + Math.sin(t * 2 + e.seed) * 2);
    m.position.set(e.x - C.x, h, e.y - C.y);
    if (e.vx != null && (e.vx || e.vy || e.vz)) { _dir.set(e.vx, e.vz || 0, e.vy).normalize(); m.quaternion.setFromUnitVectors(_xAxis, _dir); }
    if (e.type === "asteroid" || e.type === "rock") m.rotateX(e.spin);
    if (e.type === "mother") m.rotateY(e.spin);
    const wk = (now - m.userData.born) / WARP;
    if (wk < 1) { // warp-in: a purple rift flashes open and the invader snaps to full size
      m.scale.setScalar(m.userData.bs * Math.max(0.05, easeBack(Math.max(0, wk))));
      glow(m.position, "#b07aff", e.def.size * (12 + wk * 10), (1 - wk) * 0.9); glow(m.position, "#ffffff", e.def.size * 5, (1 - wk) * (1 - wk));
    } else if (m.userData.bs) { m.scale.setScalar(m.userData.bs); m.userData.bs = 0; }
    m.userData.flash(e.hit > 0, e.frozen > 0);
    m.userData.last = m.userData.last || {};
    const L = m.userData.last; L.x = m.position.x; L.y = m.position.y; L.z = m.position.z; L.size = e.def.size; L.color = e.def.color; L.boss = !!e.def.boss; L.dead = e.dead;
    const sh = m.getObjectByName("shield");
    if (sh) sh.visible = e.shield > 0;
    if (sh && sh.visible) { // shield-hit ripple: the bubble flares and swells for a moment when it absorbs a hit
      const since = S.time - (e.shieldHitAt ?? -10), k = since < 0.35 ? 1 - since / 0.35 : 0;
      sh.scale.setScalar(sh.userData.base || (sh.userData.base = sh.scale.x));
      if (k > 0 && e.shield > 0) { sh.scale.multiplyScalar(1 + k * 0.08); glow(m.position, "#9fd8ff", e.def.size * 4.2, k * 0.45); }
      sh.children.forEach(c => { if (c.material) c.material.opacity = (c.isLineSegments ? 0.28 : 0.1) + k * (c.isLineSegments ? 0.5 : 0.18); });
    }
    const eg = ENGINE[e.type]; // engine exhaust glow behind the ship (shared glow system: no extra draw calls)
    if (eg) { _ev.set(-1, 0, 0).applyQuaternion(m.quaternion).multiplyScalar(e.def.size * eg[1]).add(m.position); glow(_ev, eg[0], e.def.size * eg[2], 0.9); }
    m.userData.update(t);
  }
  for (const [id, m] of enemyMeshes) if (!eseen.has(id)) {
    const L = m.userData.last; // destroyed (not leaked): flash + glowing fragments
    if (L && L.dead && S) spawnDebris(L, t);
    scene.remove(m); enemyMeshes.delete(id);
  }
  stepDebris(t);

  // beams
  let n = 0;
  if (S) for (const bm of S.beams) {
    if (n >= BEAMS) break;
    const a = W(bm.x1, bm.y1, H + 1, bm.z1), b = W(bm.x2, bm.y2, H + 4, bm.z2), len = a.distanceTo(b);
    if (len < 0.5) continue;
    const fade = Math.min(1, bm.life * 12), wide = Math.max(1.4, bm.w * 1.1);
    dummy.position.copy(a).add(b).multiplyScalar(0.5);
    dummy.lookAt(b); dummy.scale.set(wide, wide, len); dummy.updateMatrix();
    beamMesh.setMatrixAt(n, dummy.matrix);
    beamMesh.setColorAt(n, tmpC.set(bm.color).multiplyScalar(0.42 * fade));
    dummy.scale.set(Math.max(0.5, bm.w * 0.32), Math.max(0.5, bm.w * 0.32), len); dummy.updateMatrix();
    beamCore.setMatrixAt(n, dummy.matrix);
    beamCore.setColorAt(n, tmpC.set(bm.color).lerp(_white, 0.65).multiplyScalar(fade));
    if (!bm.bolt) { glow(b, bm.color, 10 + bm.w * 3, 0.9 * fade); glow(b, "#ffffff", 4 + bm.w, 0.8 * fade); } // impact flash
    n++;
  }
  beamMesh.count = beamCore.count = n;
  for (const im of [beamMesh, beamCore]) { upload(im.instanceMatrix, n * 16); if (im.instanceColor) upload(im.instanceColor, n * 3); }

  // missiles + bomblets
  n = 0;
  if (S) for (const m of S.shots) {
    if (n >= SHOTS) break;
    const p = W(m.x, m.y, H + 3, m.z), big = m.nova ? 2 : m.kind === "bomblet" ? 0.6 : 1;
    dummy.position.copy(p); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(m.nova ? 7 : m.kind === "bomblet" ? 2.5 : 4); dummy.updateMatrix(); shotMesh.setMatrixAt(n++, dummy.matrix);
    glow(p, m.nova ? "#ff6a2a" : "#ffb347", 14 * big, 1); // engine
    let tr = trails.get(m); if (!tr) { tr = []; trails.set(m, tr); }
    if (!tr.length || tr[tr.length - 1].distanceToSquared(p) > 9) { tr.push(p.clone()); if (tr.length > 14) tr.shift(); }
    for (let i = tr.length - 1, j = 0; i >= 0; i--, j++) { // hot near the missile, cooling to smoke
      const k = 1 - j / tr.length;
      glow(tr[i], j < 3 ? "#ff9a3c" : "#7f8aa3", (6 + j * 0.9) * big, (j < 3 ? 0.8 : 0.32) * k);
    }
  }
  shotMesh.count = n; upload(shotMesh.instanceMatrix, n * 16);

  // carrier fighters
  n = 0;
  if (S) for (const tw of S.towers) if (tw.crafts) for (const f of tw.crafts) {
    if (n >= CRAFT) break;
    dummy.position.copy(W(f.x, f.y, H + 10, f.z)); dummy.rotation.set(0, -f.angle, -Math.PI / 2); dummy.scale.set(3, f.bomber ? 9 : 7, 3); dummy.updateMatrix();
    craftMesh.setMatrixAt(n++, dummy.matrix);
  }
  craftMesh.count = n; upload(craftMesh.instanceMatrix, n * 16);

  // particles
  particles.visible = false;
  if (S) for (const p of S.particles) {
    const k = Math.max(0, p.life / p.max);
    _gv.set(p.x - C.x, H + 4 + (p.z || 0), p.y - C.y);
    glow(_gv, p.color, 3 + k * 4, k);
  }

  // expanding rings (explosions, pulses)
  ringPool.forEach((m, i) => {
    const r = S && S.rings[i];
    if (!r) { m.visible = false; return; }
    const k = 1 - r.life / r.max, rad = Math.max(1, r.r * (r.inward ? 1 - k * 0.8 : 0.3 + k * 0.7));
    m.visible = true; m.position.copy(W(r.x, r.y, H + 2, r.z)); m.scale.setScalar(rad);
    m.geometry = r.r > 70 ? ringThin : ringThick;
    if (r.r <= 70) m.quaternion.copy(camera.quaternion); // small blasts face the camera, so they read from any angle
    else m.rotation.set(-Math.PI / 2, 0, 0);              // big area pulses (EMP, novas) stay flat on the orbital plane
    m.material.color.set(r.color); m.material.opacity = (1 - k) * 0.85;
    if (!r.inward && k < 0.55) { // fireball: hot white core in a colored bloom, quick to fade
      const f = 1 - k / 0.55;
      glow(m.position, r.color, r.r * (0.9 + k * 1.4), f * 0.9);
      glow(m.position, "#fff2d0", r.r * (0.45 + k * 0.6), f);
    }
  });
  gGeo.setDrawRange(0, gN);
  upload(gGeo.attributes.position, gN * 3); upload(gGeo.attributes.color, gN * 3); upload(gGeo.attributes.size, gN);
  gN = 0;
  glowMat.uniforms.scale.value = renderer.domElement.height * 0.9;

  // selection + range
  const sel = S && S.selectedTower;
  const showRange = (x, y, r, color, z) => {
    if (od().map().threeD) { rangeSphere.visible = true; rangeSphere.position.copy(W(x, y, H, z)); rangeSphere.scale.setScalar(r); rangeSphere.material.color.set(color); return; }
    rangeMesh.visible = rangeEdge.visible = true; rangeMesh.position.copy(W(x, y, 0.5)); rangeMesh.scale.setScalar(r); rangeEdge.position.copy(rangeMesh.position); rangeEdge.scale.setScalar(r); rangeMesh.material.color.set(color); rangeEdge.material.color.set(color);
  };
  rangeMesh.visible = rangeEdge.visible = rangeSphere.visible = false; selRing.visible = false;
  if (sel) {
    const T = window.OD.TOWERS[sel.type], st = sel.st || window.OD.tierOf(sel.type, sel.level, sel.path);
    const r = st.buffRange || st.range;
    if (r) showRange(sel.x, sel.y, r, sel.path ? T.paths[sel.path].color : T.color, sel.z);
    selRing.visible = true; selRing.position.copy(W(sel.x, sel.y, H + 0.5, sel.z)); selRing.scale.setScalar(13);
  }

  // shake
  const shk = S && S.shake ? S.shake * 0.6 * (window.OD.shake ?? 1) : 0;
  if (shk) { camera.position.x += (Math.random() - 0.5) * shk; camera.position.z += (Math.random() - 0.5) * shk; }
}

// ---------- automatic quality ----------
// Slow devices (low-end Chromebooks, older phones) step down: first a lower render resolution, then no metal
// reflections. Measured only while a game is running and the tab is visible; fast devices keep full quality.
const quality = { level: 0, frames: 0, time: 0, last: performance.now() };
const QUALITY_STEPS = [
  () => renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25)),
  () => { bloom.enabled = false; },
  () => { renderer.setPixelRatio(1); },
  () => { setReflections(false); },
  () => { scene.background = new THREE.Color(0x05060f); },
];
// Player's Graphics setting (main menu): "auto" = the steps above; "high" = full detail, never stepped down;
// "low" = lower resolution and no reflections from the start.
const fullDetail = () => { renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); setReflections(true); scene.background = nebula; bloom.enabled = true; };
function applyGfx(mode) {
  if (mode === "low") { renderer.setPixelRatio(1); setReflections(false); scene.background = nebula; bloom.enabled = false; quality.level = 99; }
  else { fullDetail(); quality.level = mode === "high" ? 99 : 0; quality.frames = 0; quality.time = 0; }
  resize();
}
window.OD.applyGfx = applyGfx;
applyGfx(window.OD.gfx || "auto");
function trackQuality() {
  const now = performance.now(), dt = now - quality.last; quality.last = now;
  const S = od() && od().state();
  if (!S || S.paused || S.over || document.hidden || dt > 1000) return; // menus, pauses and tab switches don't count
  quality.frames++; quality.time += dt;
  if (quality.time < 4000) return;
  const fps = quality.frames * 1000 / quality.time;
  quality.frames = 0; quality.time = 0;
  if (fps < 40 && quality.level < QUALITY_STEPS.length) {
    QUALITY_STEPS[quality.level++]();
    resize();
    console.info(`[view3d] ${fps.toFixed(0)} fps: quality step ${quality.level}`);
  }
}

// ---------- main menu backdrop ----------
// While the menu is open the camera slowly orbits the selected world; defense satellites ride its orbits,
// a few invaders drift in from deep space and the satellites fire at them. Purely decorative: no game state.
// Respects prefers-reduced-motion (a still scene).
let inMenu = false, menuSet = null;
const reducedMotion = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
function buildMenuSet(B) {
  const g = new THREE.Group(), sats = [], foes = [];
  const types = ["laser", "rail", "missile", "emp", "tractor", "carrier", "laser", "rail"];
  B.rings.slice(0, 3).forEach((ring, ri) => {
    const n = ri === 0 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const type = types[(ri * 3 + i) % types.length], m = buildSatellite({ type, level: 2 + (i % 3), path: i % 3 === 2 ? (ri % 2 ? "B" : "A") : null });
      m.scale.setScalar(1.15); g.add(m);
      sats.push({ m, ring, a: (i / n) * TAU + ri, type });
    }
  });
  for (let i = 0; i < 5; i++) {
    const type = i === 0 ? "mother" : i === 1 ? "cruiser" : "drone", def = window.OD.ENEMIES[type];
    const m = buildAlien(type, def.size, def.color); g.add(m);
    foes.push({ m, type, size: def.size, color: def.color, a: i * 1.3 + 0.4, h: (i % 2 ? 1 : -1) * (30 + i * 18), r0: B.extent * (1.25 + i * 0.12), speed: 0.025 + i * 0.006 });
  }
  scene.add(g);
  return { B, g, sats, foes, shots: [] };
}
function menuBackdrop(t) {
  const B = od().board();
  if (!B) return;
  if (!menuSet || menuSet.B !== B) { if (menuSet) scene.remove(menuSet.g); menuSet = buildMenuSet(B); }
  const still = reducedMotion.matches, C = od().center(), T = still ? 0 : t;
  for (const s of menuSet.sats) {
    const p = od().ringPoint(s.ring, s.a + T * s.ring.speed), body = B.bodies[s.ring.body];
    s.m.position.set(p.x - C.x, H + (p.z || 0), p.y - C.y);
    _ax.set(p.x - body.x, p.z || 0, p.y - body.y).normalize(); _ay.set(0, 1, 0); _az.crossVectors(_ax, _ay).normalize(); _ay.crossVectors(_az, _ax);
    s.m.quaternion.setFromRotationMatrix(_m4.makeBasis(_ax, _ay, _az));
    s.m.userData.update(T, false, 1 / 60);
  }
  for (const f of menuSet.foes) { // drift in on a slow spiral, then loop back out
    const k = (T * f.speed + f.a / TAU) % 1, r = f.r0 * (1.25 - k * 0.55), a = f.a + T * 0.05;
    f.m.position.set(Math.cos(a) * r, H + f.h * (1 - k * 0.5), Math.sin(a) * r);
    _dir.set(-Math.cos(a), 0, -Math.sin(a)); f.m.quaternion.setFromUnitVectors(_xAxis, _dir);
    f.m.userData.flash(false, false); f.m.userData.update(T);
    const eg = ENGINE[f.type]; if (eg) { _ev.set(-1, 0, 0).applyQuaternion(f.m.quaternion).multiplyScalar(f.size * eg[1]).add(f.m.position); glow(_ev, eg[0], f.size * eg[2], 0.9); }
  }
  // satellites fire short bursts at the nearest invader
  let n = 0;
  if (!still) menuSet.sats.forEach((s, i) => {
    const burst = (T * 0.7 + i * 0.37) % 1; if (burst > 0.18) return;
    let best = null, bd = Infinity; for (const f of menuSet.foes) { const d = f.m.position.distanceToSquared(s.m.position); if (d < bd) { bd = d; best = f; } }
    if (!best || n >= BEAMS) return;
    const col = { laser: "#45e3ff", rail: "#7dff9a", missile: "#ffb347", emp: "#fff3a0", tractor: "#b388ff", carrier: "#ff7ad9" }[s.type], fade = 1 - burst / 0.18;
    const a = s.m.position, b = best.m.position, len = a.distanceTo(b);
    dummy.position.copy(a).add(b).multiplyScalar(0.5); dummy.lookAt(b); dummy.scale.set(2.2, 2.2, len); dummy.updateMatrix();
    beamMesh.setMatrixAt(n, dummy.matrix); beamMesh.setColorAt(n, tmpC.set(col).multiplyScalar(0.42 * fade));
    dummy.scale.set(0.7, 0.7, len); dummy.updateMatrix(); beamCore.setMatrixAt(n, dummy.matrix); beamCore.setColorAt(n, tmpC.set(col).lerp(_white, 0.65).multiplyScalar(fade));
    glow(b, col, 12, fade); glow(a, col, 7, fade); n++;
  });
  beamMesh.count = beamCore.count = n;
  for (const im of [beamMesh, beamCore]) { upload(im.instanceMatrix, n * 16); if (im.instanceColor) upload(im.instanceColor, n * 3); }
  gGeo.setDrawRange(0, gN); upload(gGeo.attributes.position, gN * 3); upload(gGeo.attributes.color, gN * 3); upload(gGeo.attributes.size, gN); gN = 0;
  glowMat.uniforms.scale.value = renderer.domElement.height * 0.9;
}
function menuCamera() {
  const menu = !od().state();
  if (menu && !inMenu) { cam.pitch = 0.42; cam.dist = cam.fit * 0.62; cam.tx = 0; cam.tz = 0; }
  if (!menu && inMenu) { cam.yaw = 0; cam.pitch = 0.95; cam.dist = cam.fit * 0.86; cam.tx = 0; cam.tz = 0; }
  if (menu && !reducedMotion.matches) cam.yaw += 0.0012;
  if (menuSet) menuSet.g.visible = menu;
  inMenu = menu;
}

function loop() {
  if (od()) menuCamera();
  placeCamera();
  sync();
  if (inMenu) menuBackdrop(performance.now() / 1000); // after sync: its beams and glows replace the (empty) game ones
  bloom.render(scene, camera);
  trackQuality();
  requestAnimationFrame(loop);
}
resize();
requestAnimationFrame(loop);
// Screen position (relative to the stage) of a game-world point; used by the tutorial arrow.
function project(x, y, z = 0) {
  const C = od().center(), r = canvas.getBoundingClientRect();
  _v.set(x - C.x, H + z, y - C.y).project(camera);
  return { x: (_v.x + 1) / 2 * r.width, y: (1 - _v.y) / 2 * r.height, behind: _v.z > 1 };
}
window.__view3d = { cam, camera, scene, renderer, bloom, project, satThumb, quality, lights: { ambient, sun, rim, sunPoint },
  setQuality: n => { while (quality.level < Math.min(n, QUALITY_STEPS.length)) QUALITY_STEPS[quality.level++](); resize(); } }; // for tests
if (window.__od && window.__od.repaintIcons) window.__od.repaintIcons();
