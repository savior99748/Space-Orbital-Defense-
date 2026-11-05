// 20-second vertical ad (Meta Reels / Stories, 1080x1920), cut from real gameplay at full speed:
//   Saturn's rings and moons → Jupiter's four moons → Earth and the Moon → Solar System, Endless wave 50
//   (the Dreadnought), then an end card with the cover art.
//   node tools/ad-video.mjs            → dist/ad/ringwarden-ad-1080x1920.mp4
//   PREVIEW=1 node tools/ad-video.mjs  → dist/ad/preview.jpg (contact sheet, fast)
// Needs Playwright + Chromium and ffmpeg. The game runs on a virtual clock and every frame is captured, so the
// result plays at real game speed even though rendering is slow.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "dist/ad"), TMP = path.join(OUT, "frames");
const PREVIEW = !!process.env.PREVIEW;
const W = 1080, H = 1920, FPS = 30, SS = PREVIEW ? 0.3 : 1.2;
const COVER = path.join(root, "presskit/crazygames/cover-portrait-800x1200.jpg");
const FONT = "/usr/share/fonts/opentype/inter/InterDisplay-Black.otf";
const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });

// ---------- the cut ----------
// keys: [time in the clip, yaw, pitch, distance as a fraction of the fitted view]
const CLIPS = [
  { map: "saturn", wave: 22, secs: 3.5, caption: "DEFEND EVERY WORLD",
    keys: [[0, -1.0, 0.3, 0.42], [3.5, -0.55, 0.42, 0.58]] },
  { map: "jupiter", wave: 24, secs: 3.5, caption: "MOONS BEND THEIR PATHS",
    keys: [[0, -1.3, 0.45, 0.72], [3.5, -0.9, 0.55, 0.58]] },
  { map: "earth", wave: 25, secs: 2.5, caption: "COMMAND THE ORBITS",
    keys: [[0, -1.25, 0.24, 0.42], [2.5, -0.95, 0.32, 0.5]] },
  { map: "sol", wave: 50, endless: true, secs: 8, caption: "WAVE 50: THE DREADNOUGHT",
    keys: [[0, 0.2, 0.5, 0.46], [4, 0.7, 0.6, 0.62], [8, 1.1, 0.5, 0.48]] },
];
const END = 2.5; // end card seconds

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
// A late-game defense: every slot filled with top-tier satellites, a big wave, bosses first.
const SETUP = ({ map, wave, endless }) => {
  const od = window.__od; od.begin(map, "hard", false, !!endless);
  const S = od.state(), B = od.board(); S.money = 1e8;
  const plan = [["laser", 4, "B"], ["missile", 4, "A"], ["rail", 4, "A"], ["emp", 4, "B"], ["tractor", 4, "A"], ["carrier", 4, "A"], ["laser", 4, "A"],
    ["missile", 4, "B"], ["rail", 4, "B"], ["emp", 4, "A"], ["tractor", 4, "B"], ["carrier", 4, "B"], ["miner", 4, "B"]];
  B.slots.forEach((s, id) => { const [type, lvl, p] = plan[id % plan.length]; od.placeTower(id, type); const t = od.towerAt(id); for (let l = 0; l < lvl; l++) od.upgradeTower(t, p); });
  S.money = 18450; S.wave = wave - 1; od.startWave();
  const order = ["dread", "mother", "cruiser", "drone", "swarm", "comet", "asteroid"];
  S.queue.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).forEach(q => { q.gap = Math.min(q.gap, 0.25); });
  window.__keepAlive = () => { S.lives = Math.max(S.lives, 10); if (S.queue.length === 0 && S.enemies.length < 12) { S.waveActive = false; od.startWave(); } };
  const v = window.__view3d; if (v.quality) v.quality.level = 99; // virtual clock: keep full quality
};
const CLEAN = () => { // no orbit / moon name tags, no empty-slot markers
  const v = window.__view3d, n = window.__od.board().slots.length;
  v.scene.traverse(o => { const im = o.isSprite && o.material.map && o.material.map.image; if (im && o.material.blending === 1 && im.height < 64 && im.width > im.height) o.visible = false; if (o.isInstancedMesh && o.count === n) o.visible = false; });
};
const SIZE = ([w, h]) => {
  if (!document.getElementById("ad-css")) { const st = document.createElement("style"); st.id = "ad-css"; st.textContent = "#hud,#shop,#preview,#toast,#v3ctl,#info,#coach,#overlay,#coachArrow,#zoomCtl{display:none!important}"; document.head.appendChild(st); }
  const v = window.__view3d; v.renderer.setPixelRatio(1); v.renderer.setSize(w, h, false); v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
};
// one frame: move the camera, advance the game, draw the caption, return a JPEG
const FRAME = ([keys, t, caption, capAlpha]) => {
  const v = window.__view3d;
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1] || a, u = b === a ? 0 : Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
  v.cam.yaw = a[1] + (b[1] - a[1]) * e; v.cam.pitch = a[2] + (b[2] - a[2]) * e; v.cam.dist = v.cam.fit * (a[3] + (b[3] - a[3]) * e); v.cam.tx = 0; v.cam.tz = 0;
  window.__step(1000 / 30); window.__keepAlive && window.__keepAlive();
  const src = v.renderer.domElement, c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  const g = c.getContext("2d"); g.drawImage(src, 0, 0);
  if (caption && capAlpha > 0) {
    const Wc = c.width, Hc = c.height, y = Hc * 0.78;
    g.font = `900 100px "Inter Display", Inter, sans-serif`;
    const size = Math.min(Wc * 0.072, 100 * Wc * 0.84 / (g.measureText(caption).width * 1.06)); // fit the width
    const band = g.createLinearGradient(0, y - size * 1.6, 0, y + size * 2.2); band.addColorStop(0, "rgba(2,6,16,0)"); band.addColorStop(0.5, `rgba(2,6,16,${0.55 * capAlpha})`); band.addColorStop(1, "rgba(2,6,16,0)");
    g.fillStyle = band; g.fillRect(0, y - size * 1.6, Wc, size * 3.8);
    g.globalAlpha = capAlpha; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `900 ${size}px "Inter Display", Inter, sans-serif`;
    if ("letterSpacing" in g) g.letterSpacing = `${size * 0.05}px`;
    const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2); grad.addColorStop(0, "#ffffff"); grad.addColorStop(1, "#7fe3ff");
    g.shadowColor = "rgba(60,190,255,0.85)"; g.shadowBlur = size * 0.35; g.fillStyle = grad; g.fillText(caption, Wc / 2, y);
  }
  return c.toDataURL("image/jpeg", 0.93);
};

// ---------- render ----------
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
let frame = 0;
try {
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(CLOCK);
  const page = await ctx.newPage();
  page.on("pageerror", e => console.warn("page error:", e.message));
  await page.goto(BASE);
  for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__view3d && window.__od))); i++) { await step(page, 16); await page.waitForTimeout(25); }
  await step(page, 16, 10);
  for (const clip of CLIPS) {
    await page.evaluate(SIZE, [W / 4, H / 4]);
    await page.evaluate(SETUP, clip);
    await step(page, 50, clip.map === "sol" ? 300 : 140); // let the wave close in before rolling
    await page.evaluate(CLEAN);
    await page.evaluate(SIZE, [Math.round(W * SS), Math.round(H * SS)]);
    const n = Math.round(clip.secs * FPS);
    for (let f = 0; f < n; f++) {
      const t = f / FPS, capAlpha = Math.min(1, t / 0.35, (clip.secs - t) / 0.3);
      if (clip.map === "sol" && f === Math.round(3.2 * FPS)) await page.evaluate(() => document.getElementById("odBtn").click()); // Overdrive at the climax
      if (PREVIEW && f % 30) { await page.evaluate(([k, t]) => { window.__step(1000 / 30); }, [clip.keys, t]); continue; }
      const url = await page.evaluate(FRAME, [clip.keys, t, clip.caption, capAlpha]);
      writeFileSync(path.join(TMP, `f${String(frame++).padStart(4, "0")}.jpg`), Buffer.from(url.split(",")[1], "base64"));
    }
    console.log(`${clip.map}: done`);
  }
  await ctx.close();
} finally { await browser.close(); server.close(); }

if (PREVIEW) {
  ff("-pattern_type", "glob", "-i", path.join(TMP, "f*.jpg"), "-vf", "scale=216:-1,tile=10x2", "-frames:v", "1", path.join(OUT, "preview.jpg"));
  console.log("dist/ad/preview.jpg");
} else {
  // gameplay → end card (blurred cover background, sharp cover, call to action), soft cross-fade
  const game = path.join(OUT, "game.mp4"), end = path.join(OUT, "end.mp4"), out = path.join(OUT, "ringwarden-ad-1080x1920.mp4");
  const gameSecs = frame / FPS;
  ff("-framerate", String(FPS), "-i", path.join(TMP, "f%04d.jpg"), "-vf", `scale=${W}:${H}:flags=lanczos,format=yuv420p`, "-c:v", "libx264", "-preset", "slow", "-crf", "17", game);
  const cta = "PLAY FREE IN YOUR BROWSER";
  ff("-loop", "1", "-t", String(END + 0.5), "-i", COVER, "-filter_complex",
    `[0]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.18[bg];` +
    `[0]scale=${W}:-1:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-110,` +
    `drawtext=fontfile=${FONT}:text='${cta}':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=h-300:shadowcolor=0x2fc8ff@0.8:shadowx=0:shadowy=0:borderw=2:bordercolor=0x0a1a30,` +
    `drawtext=fontfile=${FONT}:text='NO DOWNLOAD NEEDED':fontcolor=0x9fe8ff:fontsize=40:x=(w-text_w)/2:y=h-215,fps=${FPS},format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", end);
  ff("-i", game, "-i", end, "-filter_complex", `[0][1]xfade=transition=fade:duration=0.5:offset=${(gameSecs - 0.5).toFixed(2)},format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-movflags", "+faststart", "-t", String(gameSecs + END - 0.5 + 0.5), out);
  rmSync(game); rmSync(end); rmSync(TMP, { recursive: true, force: true });
  console.log(`${path.relative(root, out)} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
}
