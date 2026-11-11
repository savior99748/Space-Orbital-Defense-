// 20-second CrazyGames preview video (landscape 1920x1080 and portrait 1080x1620), cut from real gameplay:
//   satellites launching at Earth → Saturn: flak + mines + warp-ins → Jupiter: Missile Silos and railguns →
//   an Endless Void Titan with Overdrive → a sweep over the whole Solar System under attack.
//   Plays at 3× game speed. No text, no black intro, no cursor (CrazyGames' preview rules).
//   node tools/preview-video.mjs                     → dist/preview/ both formats
//   FORMAT=landscape|portrait node tools/preview-video.mjs   → just one
//   PREVIEW=1 node tools/preview-video.mjs           → contact sheets only (fast)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "dist/preview"), PREVIEW = !!process.env.PREVIEW, FPS = 30;
const FORMATS = { landscape: [1920, 1080], portrait: [1080, 1620] };
const which = process.env.FORMAT ? [process.env.FORMAT] : Object.keys(FORMATS);
const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);

// ---------- the cut ----------
// keys: [time in the clip, yaw, pitch, distance as a fraction of the fitted view]; acts: [time, action]
const CLIPS = [
  { map: "earth", wave: 14, secs: 3, fill: 0.55, warm: 60,
    keys: [[0, -1.15, 0.32, 0.36], [3, -0.75, 0.42, 0.46]],
    acts: [[0.15, "build:laser"], [0.6, "build:flak"], [1.05, "build:rail"], [1.5, "build:missile"], [1.9, "upgrade"], [2.3, "upgrade"]] },
  { map: "saturn", wave: 28, secs: 4, swarm: true,
    keys: [[0, -0.9, 0.36, 0.42], [4, -0.45, 0.5, 0.56]] },
  { map: "jupiter", wave: 26, secs: 3.5,
    keys: [[0, -1.35, 0.4, 0.5], [3.5, -0.95, 0.52, 0.62]] },
  { map: "uranus", wave: 55, endless: true, secs: 4.5, boss: "titan", cap: 26, warm: 110,
    keys: [[0, 0.3, 0.4, 0.58], [4.5, 0.75, 0.5, 0.68]], acts: [[2.2, "overdrive"]] },
  { map: "sol", wave: 32, endless: true, secs: 5, warm: 260,
    keys: [[0, 0.25, 0.42, 0.3], [2.5, 0.6, 0.48, 0.4], [5, 0.9, 0.6, 0.56]], acts: [[2, "overdrive"]] },
];

// ---------- static server + virtual clock ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/index.html?view=3d`;
const CLOCK = () => {
  let now = 0; const q = []; const d0 = Date.now();
  performance.now = () => now; Date.now = () => d0 + now;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = ms => { now += ms; for (const cb of q.splice(0)) cb(now); };
  window.OD_NO_SW = true;
  try { localStorage.setItem("od_tut_done", "1"); localStorage.setItem("od_stats_off", "1"); localStorage.setItem("od_shake", "0.4"); } catch { /* ignore */ }
};
async function step(page, ms, n = 1) {
  for (let done = 0; done < n; done += 5) {
    await page.evaluate(([ms, k]) => { for (let i = 0; i < k; i++) { window.__step(ms); window.__keepAlive && window.__keepAlive(); } }, [ms, Math.min(5, n - done)]);
    if (n > 5) await page.waitForTimeout(5);
  }
}

// ---------- in-page helpers ----------
// A strong late-game defense (all ten satellites, silos on the ground pads), then a big wave with the action up front.
const SETUP = ({ map, wave, endless, fill = 1, swarm, boss, cap = 0 }) => {
  const od = window.__od; od.begin(map, "hard", false, !!endless);
  const S = od.state(), B = od.board(); S.money = 1e9; S.lives = 1e6;
  const plan = [["laser", "B"], ["flak", "A"], ["rail", "A"], ["missile", "A"], ["mines", "A"], ["emp", "B"], ["focus", "A"], ["laser", "A"],
    ["tractor", "B"], ["carrier", "A"], ["flak", "B"], ["rail", "B"], ["missile", "B"], ["mines", "B"], ["miner", "B"]];
  const orbit = B.slots.filter(s => !s.surface), pads = B.slots.filter(s => s.surface);
  orbit.forEach((s, k) => { if (k / orbit.length >= fill) return; const [type, p] = plan[k % plan.length]; od.placeTower(s.id, type); const t = od.towerAt(s.id); if (t) for (let l = 0; l < 4; l++) od.upgradeTower(t, p); });
  pads.forEach((s, k) => { od.placeTower(s.id, "silo"); const t = od.towerAt(s.id); if (t) for (let l = 0; l < 4; l++) od.upgradeTower(t, k % 2 ? "A" : "B"); });
  S.wave = wave - 1; od.startWave();
  const order = boss ? [boss, "aegis", "brute", "dread", "mother", "cruiser", "drone", "swarm", "comet", "asteroid"] : swarm ? ["swarm", "mother", "brood", "drone", "comet", "cruiser", "asteroid"] : ["dread", "mother", "cruiser", "brute", "drone", "swarm", "comet", "asteroid"];
  const rank = t => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
  S.queue.sort((a, b) => rank(a.type) - rank(b.type)).forEach(q => { q.gap = Math.min(q.gap, 0.2); });
  if (cap) S.queue = S.queue.slice(0, cap); // a readable fight (the boss up front, not a white-out)
  window.__keepAlive = () => { S.lives = 1e6; if (S.bodyHp) S.bodyHp = S.bodyHp.map((h, i) => (i ? Math.max(h, 6) : h)); if (!cap && S.queue.length === 0 && S.enemies.length < 14) { S.waveActive = false; od.startWave(); } };
  S.speed = 3; // fast-paced: the whole preview plays at 3× game speed (camera moves stay smooth)
  const v = window.__view3d; if (v.quality) v.quality.level = 99;
  v.cam.fit = v.cam.fit || 900;
};
const ACT = (what) => {
  const od = window.__od, S = od.state(), B = od.board();
  if (what === "overdrive") return document.getElementById("odBtn").click();
  if (what === "upgrade") { const t = S.towers.filter(t => t.level < 4 && !t.offline).pop() || S.towers[0]; S.money = 1e9; return t && od.upgradeTower(t, "A"); }
  if (what.startsWith("build:")) { // the free orbit slot closest to the camera's side, so the launch is in view
    const v = window.__view3d, C = od.center();
    const free = B.slots.filter(s => !s.surface && !od.towerAt(s.id)).map(s => { const p = od.slotPos(s.id), q = v.project(p.x, p.y, p.z || 0); return { id: s.id, d: (q.x - 0.5 * innerWidth) ** 2 + (q.y - 0.5 * innerHeight) ** 2 }; }).sort((a, b) => a.d - b.d);
    if (free[0]) { S.money = 1e9; od.placeTower(free[0].id, what.slice(6)); }
  }
};
const CLEAN = () => { // no orbit / moon name tags, no empty-slot markers
  const v = window.__view3d, n = window.__od.board().slots.length;
  v.scene.traverse(o => { const im = o.isSprite && o.material.map && o.material.map.image; if (im && o.material.blending === 1 && im.height < 64 && im.width > im.height) o.visible = false; if (o.isInstancedMesh && o.count === n) o.visible = false; });
};
const SIZE = ([w, h]) => {
  if (!document.getElementById("ad-css")) { const st = document.createElement("style"); st.id = "ad-css"; st.textContent = "#hud,#shop,#preview,#toast,#v3ctl,#info,#coach,#overlay,#coachArrow,#zoomCtl{display:none!important}"; document.head.appendChild(st); }
  const v = window.__view3d; v.renderer.setPixelRatio(1); v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
};
const FRAME = ([keys, t]) => {
  const v = window.__view3d;
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] || a, u = b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
  v.cam.yaw = a[1] + (b[1] - a[1]) * e; v.cam.pitch = a[2] + (b[2] - a[2]) * e; v.cam.dist = v.cam.fit * (a[3] + (b[3] - a[3]) * e); v.cam.tx = 0; v.cam.tz = 0;
  window.__step(1000 / 30); window.__keepAlive && window.__keepAlive();
  return v.renderer.domElement.toDataURL("image/jpeg", 0.94);
};

// ---------- render ----------
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const fmt of which) {
    const [W, H] = FORMATS[fmt], SS = PREVIEW ? 0.3 : 1, TMP = path.join(OUT, "frames-" + fmt);
    rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: Math.round(W / 2), height: Math.round(H / 2) }, deviceScaleFactor: 1 });
    await ctx.addInitScript(CLOCK);
    const page = await ctx.newPage();
    page.on("pageerror", e => console.warn("page error:", e.message));
    await page.goto(BASE);
    for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__view3d && window.__od))); i++) { await step(page, 16); await page.waitForTimeout(25); }
    await step(page, 16, 10);
    let frame = 0;
    for (const clip of CLIPS) {
      await page.evaluate(SIZE, [W / 4, H / 4]);
      await page.evaluate(SETUP, clip);
      await step(page, 50, Math.round((clip.warm ?? 150) / 3)); // let the wave close in before rolling
      await page.evaluate(CLEAN);
      await page.evaluate(SIZE, [Math.round(W * SS), Math.round(H * SS)]);
      const n = Math.round(clip.secs * FPS), acts = [...(clip.acts || [])];
      for (let f = 0; f < n; f++) {
        const t = f / FPS;
        while (acts.length && acts[0][0] <= t) await page.evaluate(ACT, acts.shift()[1]);
        if (PREVIEW && f % 15) { await page.evaluate(() => { window.__step(1000 / 30); window.__keepAlive && window.__keepAlive(); }); continue; }
        const url = await page.evaluate(FRAME, [clip.keys, t]);
        writeFileSync(path.join(TMP, `f${String(frame++).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
      }
      console.log(`${fmt} ${clip.map}: done`);
    }
    await ctx.close();
    if (PREVIEW) {
      ff("-pattern_type", "glob", "-i", path.join(TMP, "f*.jpg"), "-vf", `scale=${fmt === "landscape" ? 320 : 180}:-1,tile=8x5`, "-frames:v", "1", path.join(OUT, `sheet-${fmt}.jpg`));
      console.log(`dist/preview/sheet-${fmt}.jpg`);
    } else {
      const out = path.join(OUT, `ringwarden-preview-${W}x${H}.mp4`);
      ff("-framerate", String(FPS), "-i", path.join(TMP, "f%04d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "-an", out);
      console.log(`${path.relative(root, out)} (${(statSync(out).size / 1e6).toFixed(1)} MB, ${(frame / FPS).toFixed(1)} s)`);
    }
    rmSync(TMP, { recursive: true, force: true });
  }
} finally { await browser.close(); server.close(); }
