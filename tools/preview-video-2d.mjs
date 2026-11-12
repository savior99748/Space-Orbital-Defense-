// 20-second CrazyGames preview of the 2D (arcade) game, from real gameplay on a virtual clock.
//   node tools/preview-video-2d.mjs          → dist/preview/ringwarden-preview-2d-1920x1080.mp4 + -1080x1620.mp4
//   FORMAT=landscape|portrait  only one; PREVIEW=1  contact sheet instead (dist/preview/sheet-2d-*.jpg)
//   Steady 2× game speed, orbit lines only in the opening launch shot, camera punch-ins. No text, no audio.
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
// keys: [time in the clip, zoom (1-3), pan x, pan y in world units from the centre]
const CLIPS = [
  { map: "earth", wave: 14, secs: 3, fill: 0.5, warm: 170, lines: true,
    keys: [[0, 2.1, 0, 10], [3, 1.55, 0, 20]],
    acts: [[0.15, "build:laser"], [0.6, "build:flak"], [1.05, "build:rail"], [1.5, "build:missile"], [1.9, "upgrade"], [2.3, "upgrade"]] },
  { map: "saturn", wave: 28, secs: 4, swarm: true, keys: [[0, 1.7, -40, -20], [4, 1.2, 0, 0]] },
  { map: "jupiter", wave: 26, secs: 3.5, keys: [[0, 1.25, 60, 30], [3.5, 1.6, 20, 10]] },
  { map: "uranus", wave: 55, endless: true, secs: 4.5, boss: "titan", cap: 26, warm: 110, keys: [[0, 1.2, 0, 0], [4.5, 1.75, 0, 0]] },
  { map: "sol", wave: 32, endless: true, secs: 5, warm: 260, keys: [[0, 1.5, 0, 0], [2.5, 1.2, 0, 0], [5, 1.0, 0, 0]] },
];

// ---------- static server + virtual clock ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/index.html?view=2d`;
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
const SETUP = ({ map, wave, endless, fill = 1, swarm, boss, cap = 0, lines = false }) => {
  const od = window.__od; od.begin(map, "hard", false, !!endless);
  const S = od.state(), B = od.board(); S.money = 1e9; S.lives = 1e6;
  const plan = [["laser", "B"], ["flak", "A"], ["rail", "A"], ["missile", "A"], ["mines", "A"], ["emp", "B"], ["focus", "A"], ["laser", "A"],
    ["tractor", "B"], ["carrier", "A"], ["flak", "B"], ["rail", "B"], ["missile", "B"], ["mines", "B"], ["miner", "B"]];
  const pads = B.slots.filter(s => s.surface);
  window.OD.orbitLines = lines; // orbit lines off for the battle shots, so the fight reads
  let k = 0; // Own Orbits: launch satellites onto their own orbits, LEO / MEO / HEO around the planet and its moons
  B.bodies.forEach((b, bi) => {
    if (od.launchSlot(bi) == null) return;
    for (const z of [0, 1, 2]) {
      const n = Math.round(od.freeLanes(bi, z).length * fill);
      for (let i = 0; i < n; i++) { const [type, p] = plan[k++ % plan.length]; S.launchBand = z; od.placeTower(od.launchSlot(bi), type); const t = S.towers[S.towers.length - 1]; if (t) for (let l = 0; l < 4; l++) od.upgradeTower(t, p); }
    }
  });
  pads.forEach((s, k) => { od.placeTower(s.id, "silo"); const t = od.towerAt(s.id); if (t) for (let l = 0; l < 4; l++) od.upgradeTower(t, k % 2 ? "A" : "B"); });
  S.wave = wave - 1; od.startWave();
  const order = boss ? [boss, "aegis", "brute", "dread", "mother", "cruiser", "drone", "swarm", "comet", "asteroid"] : swarm ? ["swarm", "mother", "brood", "drone", "comet", "cruiser", "asteroid"] : ["dread", "mother", "cruiser", "brute", "drone", "swarm", "comet", "asteroid"];
  const rank = t => { const i = order.indexOf(t); return i < 0 ? 99 : i; };
  S.queue.sort((a, b) => rank(a.type) - rank(b.type)).forEach(q => { q.gap = Math.min(q.gap, 0.2); });
  if (cap) S.queue = S.queue.slice(0, cap); // a readable fight (the boss up front, not a white-out)
  window.__keepAlive = () => { S.lives = 1e6; for (const t of S.towers) if (t.fuel != null) t.fuel = 20; // full tanks: nothing blinks or burns up on camera
    if (S.bodyHp) S.bodyHp = S.bodyHp.map((h, i) => (i ? Math.max(h, 6) : h)); if (!cap && S.queue.length === 0 && S.enemies.length < 14) { S.waveActive = false; od.startWave(); } };
  S.speed = 2; // steady 2× game speed for the whole preview (no Overdrive, so nothing speeds up mid-clip)
};
const ACT = (what) => {
  const od = window.__od, S = od.state(), B = od.board();
  if (what === "overdrive") return document.getElementById("odBtn").click();
  if (what === "upgrade") { const t = S.towers.filter(t => t.level < 4 && !t.offline).pop() || S.towers[0]; S.money = 1e9; return t && od.upgradeTower(t, "A"); }
  if (what.startsWith("build:")) { // launch from the planet onto a free orbit (zones take turns: LEO, MEO, HEO)
    window.__z = ((window.__z ?? -1) + 1) % 3;
    for (const z of [window.__z, 0, 1, 2]) if (od.freeLanes(0, z).length) { S.launchBand = z; S.money = 1e9; od.placeTower(od.launchSlot(0), what.slice(6)); break; }
  }
};
const SIZE = () => {
  if (!document.getElementById("ad-css")) { const st = document.createElement("style"); st.id = "ad-css"; st.textContent = "#hud,#shop,#preview,#toast,#info,#coach,#overlay,#coachArrow,#zoomCtl,#launchPad{display:none!important}"; document.head.appendChild(st); }
  window.dispatchEvent(new Event("resize"));
};
const FRAME = ([keys, t]) => {
  const od = window.__od, C = od.center();
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] || a, u = b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
  const L = k => a[k] + (b[k] - a[k]) * e;
  od.setCamera(L(1), C.x + L(2), C.y + L(3));
  window.__step(1000 / 30); window.__keepAlive && window.__keepAlive();
  return document.getElementById("game").toDataURL("image/jpeg", 0.94);
};

// ---------- render ----------
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const fmt of which) {
    const [W, H] = FORMATS[fmt], TMP = path.join(OUT, "frames2d-" + fmt);
    rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: Math.round(W / 2), height: Math.round(H / 2) }, deviceScaleFactor: PREVIEW ? 0.6 : 2 });
    await ctx.addInitScript(CLOCK);
    const page = await ctx.newPage();
    page.on("pageerror", e => console.warn("page error:", e.message));
    await page.goto(BASE);
    for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__od && window.OD && window.OD.MAPS))); i++) { await step(page, 16); await page.waitForTimeout(25); }
    await step(page, 16, 10);
    let frame = 0;
    for (const clip of CLIPS.filter((c, i) => !process.env.CLIP || process.env.CLIP.split(',').includes(String(i)))) { // CLIP=0,3: only those shots (checking)
      await page.evaluate(SIZE);
      await page.evaluate(SETUP, clip);
      await step(page, 50, Math.round((clip.warm ?? 150) / 2)); // let the wave close in before rolling
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
      ff("-pattern_type", "glob", "-i", path.join(TMP, "f*.jpg"), "-vf", `scale=${fmt === "landscape" ? 320 : 180}:-1,tile=8x5`, "-frames:v", "1", path.join(OUT, `sheet-2d-${fmt}.jpg`));
      console.log(`dist/preview/sheet-2d-${fmt}.jpg`);
    } else {
      const out = path.join(OUT, `ringwarden-preview-2d-${W}x${H}.mp4`);
      ff("-framerate", String(FPS), "-i", path.join(TMP, "f%04d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos,format=yuv420p`,
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "-an", out);
      console.log(`${path.relative(root, out)} (${(statSync(out).size / 1e6).toFixed(1)} MB, ${(frame / FPS).toFixed(1)} s)`);
    }
    rmSync(TMP, { recursive: true, force: true });
  }
} finally { await browser.close(); server.close(); }
