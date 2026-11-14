// Fixed-state screenshots of the 2D game for before/after comparisons, plus a render-time measurement.
//   node tools/visual-shots.mjs <out-dir>        e.g. dist/visual/before  → <out-dir>/*.png + perf.json
// Same clock, same random numbers, same satellites and wave every run, so two runs compare like for like.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium, devices } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.resolve(root, process.argv[2] || "dist/visual/shots");
const ONLY = process.env.SCENE ? process.env.SCENE.split(",") : null;

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/index.html?view=2d`;

// virtual clock + seeded Math.random: identical frames every run
const CLOCK = () => {
  let now = 0; const q = []; const d0 = 1767225600000;
  performance.now = () => now; Date.now = () => d0 + now;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = ms => { now += ms; for (const cb of q.splice(0)) cb(now); };
  let s = 12345; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  window.OD_NO_SW = true;
  try { if (window.__GFX) localStorage.setItem("od_gfx", window.__GFX); } catch { /* ignore */ }
  try { localStorage.setItem("od_tut_done", "1"); localStorage.setItem("od_stats_off", "1"); localStorage.setItem("od_shake", "0"); } catch { /* ignore */ }
};

// scenes: a map, a wave, how much to build, how long to let it run before the shot
const SCENES = [
  { name: "heo-earth", map: "earth", wave: 3, build: [["laser", 2, 0], ["missile", 2, 0], ["rail", 2, 0], ["laser", 0, 0], ["flak", 1, 0], ["laser", 0, 1], ["missile", 2, 1]], run: 21000, zoom: 1.5 },
  { name: "heo-saturn", map: "saturn", wave: 3, build: [["laser", 2, 0], ["missile", 2, 0], ["rail", 2, 0], ["laser", 0, 0], ["flak", 1, 0], ["laser", 0, 1], ["laser", 0, 2]], run: 21000, zoom: 1 },
  { name: "early-earth", map: "earth", wave: 3, build: [["laser", 0, 1], ["laser", 0, 0], ["missile", 1, 1]], run: 9000, zoom: 1.5 },
  { name: "mid-mars", map: "mars", wave: 12, fill: 0.5, tier: 2, run: 7000, zoom: 1.3 },
  { name: "crowded-saturn", map: "saturn", wave: 28, fill: 1, tier: 4, swarm: true, run: 6000, zoom: 1.15 },
  { name: "boss-uranus", map: "uranus", wave: 55, endless: true, fill: 1, tier: 4, boss: "titan", cap: 26, run: 7000, zoom: 1.5 },
  { name: "solar-system", map: "sol", wave: 32, endless: true, fill: 1, tier: 4, run: 9000, zoom: 1 },
  { name: "closeup-mars", map: "mars", wave: 12, fill: 0.5, tier: 2, run: 7000, zoom: 2.6 },
  { name: "closeup-boss", map: "uranus", wave: 55, endless: true, fill: 1, tier: 4, boss: "titan", cap: 26, run: 9500, zoom: 2.2, pan: [-150, 60] },
  { name: "ui-desktop", map: "earth", wave: 8, fill: 0.4, tier: 2, run: 6000, ui: true, select: true },
  { name: "ui-phone", map: "earth", wave: 8, fill: 0.4, tier: 2, run: 6000, ui: true, phone: true, pick: "laser" },
];

const SETUP = ({ map, wave, endless, fill, tier = 0, build, swarm, boss, cap = 0 }) => {
  const od = window.__od; od.begin(map, "hard", false, !!endless);
  const S = od.state(), B = od.board(); S.money = 1e9; S.lives = 1e6;
  const plan = [["laser", "B"], ["flak", "A"], ["rail", "A"], ["missile", "A"], ["mines", "A"], ["emp", "B"], ["focus", "A"], ["laser", "A"],
    ["tractor", "B"], ["carrier", "A"], ["flak", "B"], ["rail", "B"], ["missile", "B"], ["mines", "B"], ["miner", "B"]];
  const up = (t, p) => { if (t) for (let l = 0; l < tier; l++) od.upgradeTower(t, p); };
  if (build) for (const [type, zone, bi] of build) { S.launchBand = zone; od.placeTower(od.launchSlot(bi), type); }
  else {
    let k = 0;
    B.bodies.forEach((b, bi) => {
      if (od.launchSlot(bi) == null) return;
      for (const z of [0, 1, 2]) { const n = Math.round(od.freeLanes(bi, z).length * fill); for (let i = 0; i < n; i++) { const [type, p] = plan[k++ % plan.length]; S.launchBand = z; od.placeTower(od.launchSlot(bi), type); up(S.towers[S.towers.length - 1], p); } }
    });
    B.slots.filter(s => s.surface).forEach((s, k) => { od.placeTower(s.id, "silo"); up(od.towerAt(s.id), k % 2 ? "A" : "B"); });
  }
  S.selectedType = null; S.wave = wave - 1; od.startWave();
  if (swarm || boss) {
    const order = boss ? [boss, "aegis", "brute", "dread", "mother", "cruiser", "drone", "swarm", "comet", "asteroid"] : ["swarm", "mother", "brood", "drone", "comet", "cruiser", "asteroid"];
    const rank = t => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
    S.queue.sort((a, b) => rank(a.type) - rank(b.type)).forEach(q => { q.gap = Math.min(q.gap, 0.2); });
  }
  if (cap) S.queue = S.queue.slice(0, cap);
  window.__keepAlive = () => { S.lives = 1e6; S.money = 1e9; for (const t of S.towers) if (t.fuel != null) t.fuel = 20; if (S.bodyHp) S.bodyHp = S.bodyHp.map((h, i) => (i ? Math.max(h, 6) : h)); };
  S.speed = 1;
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const perf = {};
try {
  for (const sc of SCENES.filter(s => !ONLY || ONLY.includes(s.name))) {
    const ctx = await browser.newContext(sc.phone ? { ...devices["iPhone 13"] } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 });
    if (process.env.GFX) await ctx.addInitScript(g => { window.__GFX = g; }, process.env.GFX);
    await ctx.addInitScript(CLOCK);
    const page = await ctx.newPage();
    page.on("pageerror", e => console.warn(sc.name, "page error:", e.message));
    await page.goto(BASE);
    for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__od && window.OD && window.OD.MAPS))); i++) { await page.evaluate(() => window.__step(16)); await page.waitForTimeout(20); }
    await page.evaluate(() => { for (let i = 0; i < 10; i++) window.__step(16); });
    if (!sc.ui) await page.addStyleTag({ content: "#hud,#shop,#preview,#toast,#info,#coach,#overlay,#coachArrow,#zoomCtl,#launchPad{display:none!important}" });
    await page.evaluate(SETUP, sc);
    // run the scene on the virtual clock (60 fps)
    await page.evaluate(ms => { for (let t = 0; t < ms; t += 1000 / 60) { window.__step(1000 / 60); window.__keepAlive(); } }, sc.run);
    if (sc.zoom) await page.evaluate(([z, p]) => { const od = window.__od, C = od.center(); od.setCamera(z, C.x + p[0], C.y + p[1]); }, [sc.zoom, sc.pan || [0, 0]]);
    if (sc.select) await page.evaluate(() => { const od = window.__od, S = od.state(); od.tapSlot(S.towers[0].slot); });
    if (sc.pick) await page.click(`#shop [data-type="${sc.pick}"]`);
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__step(1000 / 60); });
    if (process.env.NOOP) await page.evaluate(names => { for (const n of names.split(",")) window.OD[n] = () => {}; }, process.env.NOOP); // diagnostics: skip a drawing function
    // render cost: time real JS work per frame (update + draw) over 120 frames
    const t = await page.evaluate(() => {
      const real = performance.constructor.prototype.now.bind(performance), times = [];
      const g = document.getElementById("game").getContext("2d"); // reading a pixel forces the frame to finish drawing
      for (let i = 0; i < 150; i++) { const a = real(); window.__step(1000 / 60); window.__keepAlive(); g.getImageData(0, 0, 1, 1); times.push(real() - a); }
      times.splice(0, 30); times.sort((x, y) => x - y); // drop warm-up frames
      const S = window.__od.state(), q = k => +times[Math.floor(times.length * k)].toFixed(2);
      return { median: q(0.5), p95: q(0.95), enemies: S.enemies.length, towers: S.towers.length, particles: S.particles.length };
    });
    perf[sc.name] = t;
    await page.screenshot({ path: path.join(OUT, `${sc.name}.png`) });
    console.log(sc.name, JSON.stringify(t));
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
writeFileSync(path.join(OUT, "perf.json"), JSON.stringify(perf, null, 2));
