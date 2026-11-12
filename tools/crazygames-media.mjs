// CrazyGames listing media: 3 covers + 2 preview videos, made from the real 3D game.
//   node tools/crazygames-media.mjs            (needs Playwright + Chromium and ffmpeg; serves the repo itself)
//   TITLE="New Name" node tools/crazygames-media.mjs   to re-render the covers with another game name
// Output (dist/crazygames-media/):
//   cover-landscape-1920x1080.png, cover-portrait-800x1200.png, cover-square-800x800.png
//   video-landscape-1920x1080.mp4, video-portrait-1080x1620.mp4   (20 s, real-time gameplay, no UI, under 50 MB)
// The game runs on a virtual clock and every frame is captured, so the videos are smooth at normal speed
// even on a slow machine.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "dist/crazygames-media"), TMP = path.join(OUT, "frames");
const TITLE = process.env.TITLE || "Orbital Defense";
const ONLY = process.argv[2]; // "covers" or "videos" to make just one kind
const ff = (...a) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...a]);
mkdirSync(OUT, { recursive: true });

// ---------- tiny static server for the repo ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/json", ".css": "text/css" };
const server = createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html");
  if (!p.startsWith(root) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream" }); res.end(readFileSync(p));
}).listen(0);
const BASE = `http://127.0.0.1:${server.address().port}/index.html?view=3d`;

// ---------- in-page: virtual clock (installed before the game loads) ----------
const CLOCK = () => {
  let now = 0; const q = []; const d0 = Date.now();
  performance.now = () => now; Date.now = () => d0 + now;
  window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = ms => { now += ms; for (const cb of q.splice(0)) cb(now); };
  window.OD_NO_SW = true;
  try { localStorage.setItem("od_tut_done", "1"); localStorage.setItem("od_orbits", "classic"); localStorage.setItem("od_stats_off", "1"); } catch { /* ignore */ }
};

// ---------- in-page: build a busy late-game battle on Earth ----------
const SETUP = ({ emptySlot }) => {
  const od = window.__od; od.begin("earth", "medium");
  const S = od.state(), B = od.board(); S.money = 1e7;
  const plan = [["laser", 4, "A"], ["missile", 4, "A"], ["tractor", 3, "A"], ["rail", 4, "A"], ["emp", 4, "B"], ["laser", 4, "B"], ["carrier", 4, "A"],
    ["missile", 4, "B"], ["emp", 3, "A"], ["rail", 3, "B"], ["miner", 3, "A"], ["tractor", 4, "B"], ["carrier", 3, "B"], ["laser", 2, null]];
  let i = 0;
  B.slots.forEach((s, id) => {
    if (id === emptySlot || id % 2) return;
    const [type, lvl, p] = plan[i++ % plan.length];
    od.placeTower(id, type); const t = od.towerAt(id);
    for (let l = 0; l < lvl; l++) od.upgradeTower(t, p || "A");
  });
  S.money = 2450; S.score = 48210; S.lives = 21;
  S.wave = 19; od.startWave();
  const order = ["mother", "drone", "swarm", "comet", "cruiser", "asteroid"]; // boss first: the star of the shot
  S.queue.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type)).forEach(q => { q.gap = Math.min(q.gap, 0.35); });
  window.__keepAlive = () => { S.lives = Math.max(S.lives, 18); S.money = Math.max(S.money, 1200); };
};

// Advance the game n frames, a few per call, letting the browser present between batches.
async function step(page, ms, n = 1) {
  for (let done = 0; done < n; done += 5) {
    await page.evaluate(([ms, k]) => { for (let i = 0; i < k; i++) { window.__step(ms); window.__keepAlive && window.__keepAlive(); } }, [ms, Math.min(5, n - done)]);
    if (n > 5) await page.waitForTimeout(5);
  }
}

async function openGame(browser, viewport, dpr) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  await ctx.addInitScript(CLOCK);
  const page = await ctx.newPage();
  page.on("pageerror", e => console.warn("page error:", e.message));
  await page.goto(BASE);
  for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__view3d && window.__od))); i++) { await step(page, 16); await page.waitForTimeout(25); }
  await step(page, 16, 10);
  return { ctx, page };
}

// ---------- in-page: hide the UI, size the 3D view, and grab frames straight from its canvas ----------
const FULLSCREEN = ([w, h]) => {
  if (!document.getElementById("od-media-css")) {
    const st = document.createElement("style"); st.id = "od-media-css";
    st.textContent = "#hud, #shop, #preview, #toast, #v3ctl, #info, #coach, #overlay, #coachArrow, #zoomCtl { display: none !important; }";
    document.head.appendChild(st);
  }
  const v = window.__view3d; v.renderer.setPixelRatio(1); v.renderer.setSize(w, h, false);
  v.camera.aspect = w / h; v.camera.updateProjectionMatrix();
};
const GRAB = ([ms, title, type]) => {
  window.__step(ms); window.__keepAlive && window.__keepAlive();
  const src = window.__view3d.renderer.domElement, c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d"); g.drawImage(src, 0, 0);
  if (title) {
    const W = c.width, H = c.height, portrait = H > W * 1.1, square = !portrait && H > W * 0.8;
    const words = title.toUpperCase().split(" "), size = W * (portrait ? 0.15 : square ? 0.125 : 0.086);
    g.textAlign = "center"; g.textBaseline = "top"; g.font = `900 ${size}px "Inter Display", Inter, sans-serif`;
    if ("letterSpacing" in g) g.letterSpacing = `${size * 0.04}px`;
    let y = H * (portrait ? 0.06 : 0.065);
    for (const w of words) {
      const grad = g.createLinearGradient(0, y, 0, y + size); grad.addColorStop(0, "#ffffff"); grad.addColorStop(0.45, "#bff4ff"); grad.addColorStop(1, "#4fd8ff");
      g.save(); g.shadowColor = "rgba(80,200,255,0.9)"; g.shadowBlur = size * 0.18; g.fillStyle = grad; g.fillText(w, W / 2, y); g.restore();
      g.save(); g.shadowColor = "rgba(0,0,0,0.75)"; g.shadowOffsetY = size * 0.04; g.shadowBlur = size * 0.05; g.fillStyle = grad; g.fillText(w, W / 2, y); g.restore();
      y += size * 0.98;
    }
  }
  return c.toDataURL(type, 0.92);
};
const save = (dataUrl, file) => writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));

// ---------- covers ----------
async function cover(browser, name, w, h) {
  const SS = 2; // render at 2x, then downscale for clean edges
  const { ctx, page } = await openGame(browser, { width: 1280, height: 720 }, 1);
  await page.evaluate(SETUP, { emptySlot: -1 });
  await page.evaluate(FULLSCREEN, [w / 2, h / 2]);
  await step(page, 50, 240); // let the invaders close in (rendered small to stay fast)
  const portrait = h > w * 1.1, square = !portrait && h > w * 0.8;
  await page.evaluate(({ portrait, square }) => {
    const od = window.__od, v = window.__view3d, C = od.center(), S = od.state();
    const yaw = 0.55, pitch = portrait ? 0.5 : 0.36;
    v.cam.yaw = yaw; v.cam.pitch = pitch;
    v.cam.dist = v.cam.fit * (portrait ? 0.62 : square ? 0.56 : 0.5);
    // aim a little above the planet so it sits low in the frame, under the title
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)], back = [Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw)];
    const up = [-Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), -Math.sin(pitch) * Math.cos(yaw)];
    const lift = portrait ? 150 : square ? 95 : 75, shift = portrait ? 0 : square ? -10 : -40;
    v.cam.tx = up[0] * lift + right[0] * shift; v.cam.tz = up[2] * lift + right[2] * shift;
    // place an invader in camera space: a = right, b = up, c = toward the camera (world units from the planet)
    const put = (e, a, b, c) => {
      const X = right[0] * a + up[0] * b + back[0] * c, Y = right[1] * a + up[1] * b + back[1] * c, Z = right[2] * a + up[2] * b + back[2] * c;
      e.x = C.x + X; e.y = C.y + Z; e.z = Y - 2;
    };
    const m = S.enemies.find(e => e.type === "mother");
    if (m) put(m, portrait ? 150 : square ? 235 : 330, portrait ? -120 : square ? -40 : 10, portrait ? 40 : square ? 50 : 150);
    S.enemies.filter(e => e.type === "mother" && e !== m).forEach(e => put(e, 0, 0, -2000)); // one boss in the shot
    // the rest of the wave swarms in from the right
    S.enemies.filter(e => e.type !== "mother").forEach((e, i) => {
      const k = i * 2.39996, r = 140 + (i * 53) % 190;
      put(e, (portrait ? 0 : 60) + Math.cos(k) * r, (portrait ? -80 : -20) + Math.sin(k) * r * 0.6, 40 + (i * 29) % 120);
    });
    // hide orbit labels and the expanding pulse rings: cleaner key art
    v.scene.traverse(o => { const im = o.isSprite && o.material.map && o.material.map.image; if (im && o.material.blending === 1 && im.height < 64 && im.width > im.height) o.visible = false; });
    v.scene.traverse(o => { if (o.isInstancedMesh && o.count === od.board().slots.length) o.visible = false; }); // empty-slot markers
    // keep the frame clean: no pulse rings, and no long beams cutting across the title
    const keep = window.__keepAlive; window.__keepAlive = () => { keep(); S.rings.length = 0; S.beams = S.beams.filter(b => Math.hypot(b.x2 - b.x1, b.y2 - b.y1, (b.z2 || 0) - (b.z1 || 0)) < 260); };
  }, { portrait, square });
  await step(page, 33, 2);
  // put the Mothership where it reads best on this format: search positions near the orbits and keep the one
  // that lands closest to the target spot on screen
  await page.evaluate(({ portrait, square, aspect }) => {
    const od = window.__od, v = window.__view3d, C = od.center(), S = od.state();
    const m = S.enemies.find(e => e.type === "mother"); if (!m) return;
    v.camera.aspect = aspect; v.camera.updateProjectionMatrix(); v.camera.updateMatrixWorld();
    const rect = { width: 1000 * aspect, height: 1000 }, r0 = v.renderer.domElement.getBoundingClientRect();
    const proj = (x, y, z) => { const p = v.project(x, y, z); return { x: p.x / r0.width * rect.width, y: p.y / r0.height * rect.height, behind: p.behind }; };
    const tx = portrait ? 0.7 : square ? 0.78 : 0.85, ty = portrait ? 0.8 : square ? 0.66 : 0.58;
    let best = null;
    for (let x = -420; x <= 420; x += 15) for (let y = -420; y <= 420; y += 15) for (const z of [0, 50, 100]) {
      if (Math.hypot(x, y) < 210) continue;
      const p = proj(C.x + x, C.y + y, z); if (p.behind) continue;
      const d = Math.hypot(p.x / rect.width - tx, p.y / rect.height - ty) + Math.hypot(x, y, z) / 4000;
      if (!best || d < best.d) best = { d, x, y, z };
    }
    if (best) { m.x = C.x + best.x; m.y = C.y + best.y; m.z = best.z; }
  }, { portrait, square, aspect: w / h });
  await step(page, 33, 2);
  // freeze the action for the final frame and drop any long beam that would cut across the title
  await page.evaluate(() => { const S = window.__od.state(); S.paused = true; S.enemies.forEach(e => { e.hit = 0; }); S.beams = S.beams.filter(b => Math.hypot(b.x2 - b.x1, b.y2 - b.y1, (b.z2 || 0) - (b.z1 || 0)) < 260); });
  await page.evaluate(FULLSCREEN, [w * SS, h * SS]);
  await page.evaluate(() => document.fonts.load('900 100px "Inter Display"'));
  const raw = path.join(OUT, `raw-${name}.png`);
  save(await page.evaluate(GRAB, [33, TITLE, "image/png"]), raw);
  ff("-i", raw, "-vf", `scale=${w}:${h}:flags=lanczos`, path.join(OUT, `cover-${name}-${w}x${h}.png`));
  rmSync(raw);
  await ctx.close();
  console.log(`cover-${name}-${w}x${h}.png`);
}

// ---------- videos (pure gameplay, no UI or cursor) ----------
// A scripted cinematic camera over a real battle: a close sweep past the satellites as they fire, a pull-back
// that reveals the whole fight, then a slow push in. Rendered above the output size and scaled down
// (smooth edges). Orbit labels and empty-slot markers are hidden for a clean picture.
const SHOTS = {
  //            time  yaw    pitch  dist   (dist in units of the fitted view)
  landscape: [[0,    -1.2,  0.22,  0.34], [5, -0.8, 0.3, 0.38], [10, -0.45, 0.48, 0.54], [15, -0.15, 0.55, 0.58], [20, 0.1, 0.42, 0.44]],
  portrait:  [[0,    -1.2,  0.26,  0.48], [5, -0.8, 0.36, 0.52], [10, -0.45, 0.55, 0.68], [15, -0.15, 0.6, 0.72],  [20, 0.1, 0.48, 0.58]],
};
const PREVIEW = !!process.env.PREVIEW; // quick check: small frames, every 2.5 s
const SS = PREVIEW ? 0.4 : 1.34; // supersampling
async function video(browser, name, outW, outH) {
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
  const { ctx, page } = await openGame(browser, { width: 1280, height: 720 }, 1);
  const emptySlot = 3;
  await page.evaluate(SETUP, { emptySlot });
  await page.evaluate(() => { const v = window.__view3d; if (v.quality) v.quality.level = 99; }); // the recorder runs on a virtual clock: keep full quality
  await page.evaluate(FULLSCREEN, [outW / 3, outH / 3]);
  await step(page, 50, 160); // let the first invaders arrive
  await page.evaluate(() => { // cinematic clean-up: no orbit/moon name tags, no empty-slot markers
    const v = window.__view3d, n = window.__od.board().slots.length;
    v.scene.traverse(o => { const im = o.isSprite && o.material.map && o.material.map.image; if (im && o.material.blending === 1 && im.height < 64 && im.width > im.height) o.visible = false; if (o.isInstancedMesh && o.count === n) o.visible = false; });
  });
  await page.evaluate(FULLSCREEN, [Math.round(outW * SS), Math.round(outH * SS)]);
  const keys = SHOTS[outH > outW ? "portrait" : "landscape"];
  const FPS = 30, N = FPS * 20;
  for (let f = 0; f < N; f++) {
    await page.evaluate(([f, emptySlot, keys]) => {
      const od = window.__od, v = window.__view3d, S = od.state(), t = f / 30;
      // camera: smooth interpolation between the key shots
      let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
      const a = keys[i], b = keys[i + 1], u = Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))), e = u * u * (3 - 2 * u);
      v.cam.yaw = a[1] + (b[1] - a[1]) * e; v.cam.pitch = a[2] + (b[2] - a[2]) * e; v.cam.dist = v.cam.fit * (a[3] + (b[3] - a[3]) * e); v.cam.tx = 0; v.cam.tz = 0;
      // the battle: build and upgrade a railgun in shot, Overdrive at the climax, keep invaders coming
      if (f === 165) od.placeTower(emptySlot, "rail");
      if (f === 215) od.upgradeTower(od.towerAt(emptySlot));
      if (f === 260) od.upgradeTower(od.towerAt(emptySlot));
      if (f === 305) od.upgradeTower(od.towerAt(emptySlot), "A");
      if (f === 350) od.upgradeTower(od.towerAt(emptySlot));
      if (f === 400) document.getElementById("odBtn").click();
      if (S.queue.length === 0 && S.enemies.length < 10 && f < 540) { S.waveActive = false; od.startWave(); }
    }, [f, emptySlot, keys]);
    if (PREVIEW && f % 75) { await step(page, 1000 / FPS); continue; }
    save(await page.evaluate(GRAB, [1000 / FPS, null, "image/jpeg"]), path.join(TMP, `f${String(f).padStart(4, "0")}.jpg`));
    if (f % 60 === 0) process.stdout.write(`  ${name}: ${f / FPS}s\n`);
  }
  await ctx.close();
  if (PREVIEW) { ff("-pattern_type", "glob", "-i", path.join(TMP, "f*.jpg"), "-vf", "tile=4x2", path.join(OUT, `preview-${name}.jpg`)); return console.log(`preview-${name}.jpg`); }
  const out = path.join(OUT, `video-${name}-${outW}x${outH}.mp4`);
  ff("-framerate", String(FPS), "-i", path.join(TMP, "f%04d.jpg"), "-vf", `scale=${outW}:${outH}:flags=lanczos,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-movflags", "+faststart", "-an", out);
  rmSync(TMP, { recursive: true, force: true });
  console.log(`video-${name}-${outW}x${outH}.mp4 (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
}

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  if (ONLY !== "videos") {
    await cover(browser, "landscape", 1920, 1080);
    await cover(browser, "portrait", 800, 1200);
    await cover(browser, "square", 800, 800);
  }
  if (ONLY !== "covers") {
    if (process.env.VIDEO !== "portrait") await video(browser, "landscape", 1920, 1080);
    if (process.env.VIDEO !== "landscape") await video(browser, "portrait", 1080, 1620);
  }
} finally { await browser.close(); server.close(); }
