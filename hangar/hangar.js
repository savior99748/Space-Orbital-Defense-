// Satellite Hangar: preview every satellite model at every tier (dev / design review page).
import * as THREE from "../vendor/three/three.module.js";
import { buildSatellite, SAT_NAMES } from "../js/sat3d.js";

const PATHS = {
  laser: ["Prism Array", "Spectrum Cannon", "Solar Lance", "Sunspear"],
  missile: ["Cluster Swarm", "Hive Barrage", "Nova Warhead", "Supernova"],
  tractor: ["Singularity", "Event Horizon", "Cryo Field", "Absolute Zero"],
  rail: ["Mass Driver", "Planet Cracker", "Coil Repeater", "Gauss Storm"],
  emp: ["Shockwave", "Pulsar", "Ion Storm", "Tesla Crown"],
  miner: ["Deep Core Rig", "Stellar Forge", "Command Relay", "Fleet Uplink"],
  carrier: ["Strike Wing", "Armada", "Bomber Wing", "Siege Wing"],
};
const VARIANTS = (type) => {
  const p = PATHS[type];
  return [
    { level: 0, path: null, label: "Tier 1" }, { level: 1, path: null, label: "Tier 2" }, { level: 2, path: null, label: "Tier 3" },
    { level: 3, path: "A", label: p[0] }, { level: 4, path: "A", label: p[1] },
    { level: 3, path: "B", label: p[2] }, { level: 4, path: "B", label: p[3] },
  ];
};
const qs = new URLSearchParams(location.search);
let current = qs.get("type") || "overview";

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0x6070a0, 1.2));
const key = new THREE.DirectionalLight(0xfff1dc, 2.8); key.position.set(60, 80, 70); scene.add(key);
const rim = new THREE.DirectionalLight(0x6c8bff, 1.4); rim.position.set(-80, -20, -60); scene.add(rim);
const camera = new THREE.PerspectiveCamera(32, 1, 1, 1000);

let cells = [], yaw = 0.6, pitch = 0.35, dragging = false, lx = 0, ly = 0;
const holder = new THREE.Group(); scene.add(holder);

function setup() {
  holder.clear(); cells = [];
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.t === current));
  const list = current === "overview"
    ? Object.keys(SAT_NAMES).flatMap(t => [{ type: t, level: 2, path: null, label: SAT_NAMES[t], sub: "Tier 3" }])
    : VARIANTS(current).map(v => ({ ...v, type: current, sub: v.label, label: v.path ? `${v.path}${v.level - 2}` : "" }));
  for (const v of list) {
    const m = buildSatellite(v);
    holder.add(m); m.userData.update(0, false, 0); m.scale.setScalar(m.userData.baseScale);
    const box = new THREE.Box3().setFromObject(m);
    m.visible = false;
    cells.push({ ...v, m, size: box.getSize(new THREE.Vector3()).length(), ctr: box.getCenter(new THREE.Vector3()) });
  }
  layout();
}
function layout() {
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H);
  const n = cells.length, cols = n <= 4 ? n : W > H ? (n === 7 ? 4 : Math.ceil(n / 2)) : 2;
  const rows = Math.ceil(n / cols), top = 56, cw = W / cols, ch = (H - top - 40) / rows;
  const labs = document.getElementById("labels"); labs.innerHTML = "";
  cells.forEach((c, i) => {
    const r = Math.floor(i / cols), k = i % cols;
    const inRow = Math.min(cols, n - r * cols), off = (W - inRow * cw) / 2;
    c.rect = { x: off + k * cw, y: top + r * ch, w: cw, h: ch };
    const d = document.createElement("div"); d.className = "lab";
    d.style.left = c.rect.x + cw / 2 + "px"; d.style.top = c.rect.y + ch - 40 + "px";
    d.innerHTML = current === "overview" ? `<b>${c.label}</b>${c.type}` : `<b>${c.sub}</b>${c.label || "&nbsp;"}`;
    labs.appendChild(d);
  });
}
const tabs = document.getElementById("tabs");
for (const t of ["overview", ...Object.keys(SAT_NAMES)]) {
  const b = document.createElement("button"); b.dataset.t = t; b.textContent = t === "overview" ? "All seven" : SAT_NAMES[t];
  b.onclick = () => { current = t; setup(); }; tabs.appendChild(b);
}
addEventListener("resize", layout);
addEventListener("pointerdown", e => { dragging = true; lx = e.clientX; ly = e.clientY; });
addEventListener("pointerup", () => dragging = false);
addEventListener("pointermove", e => { if (!dragging) return; yaw += (e.clientX - lx) * 0.01; pitch = Math.max(-1.2, Math.min(1.2, pitch + (e.clientY - ly) * 0.01)); lx = e.clientX; ly = e.clientY; });

const clock = new THREE.Clock(); let t0 = 0;
window.__hangar = { setTime: (t) => { t0 = t; }, ready: true };
function frame() {
  const dt = Math.min(0.05, clock.getDelta()); t0 += dt;
  if (!dragging && !qs.has("still")) yaw += dt * 0.25;
  renderer.setScissor(0, 0, innerWidth, innerHeight); renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.setClearColor(0x05070f); renderer.clear();
  for (const c of cells) {
    const { x, y, w, h } = c.rect, by = innerHeight - y - h;
    renderer.setScissor(x, by, w, h); renderer.setViewport(x, by, w, h);
    for (const o of cells) o.m.visible = o === c;
    c.m.userData.update(t0, Math.sin(t0) > 0, dt);
    const { size, ctr } = c, dist = size * 1.35 + 20;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.position.set(ctr.x + Math.cos(yaw) * Math.cos(pitch) * dist, ctr.y + Math.sin(pitch) * dist, ctr.z + Math.sin(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(ctr);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
setup(); frame();
