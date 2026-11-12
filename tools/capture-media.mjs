// Records showcase gameplay and produces press-kit media in presskit/media/:
//   trailer-landscape.mp4 (YouTube / Steam / publishers), trailer-portrait.mp4 (TikTok / Shorts / mobile publishers)
//   clip-*.mp4 (15-second portrait clips for mobile publisher portals), *.gif, screenshots.
// Usage: node tools/capture-media.mjs   (needs Playwright + Chromium and ffmpeg)
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync, renameSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "presskit/media");
const TMP = path.join(root, "dist/capture");
const URL = "https://savior99748.github.io/Space-Orbital-Defense-/";
const sh = (...args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args]);
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

// ---------- in-page helpers ----------
const HELPERS = () => {
  const P = (type, level, path = null) => [type, level, path];
  window.__plans = {
    earth: [
      [P("laser", 4, "A"), P("laser", 4, "B")],
      [P("missile", 4, "A"), P("rail", 4, "B"), P("tractor", 3, "B"), P("emp", 4, "B"), P("missile", 3, "B"), P("carrier", 4, "A")],
      [P("laser", 4, "A"), P("emp", 4, "A"), P("carrier", 4, "B"), P("missile", 4, "A"), P("rail", 3, "A"), P("tractor", 4, "A")],
    ],
    jupiter: [
      [P("laser", 4, "B"), P("rail", 4, "A"), P("emp", 3, "B"), P("laser", 4, "A"), P("missile", 4, "B")],
      [P("rail", 4, "A"), P("missile", 4, "A"), P("tractor", 4, "B"), P("laser", 4, "B"), P("carrier", 4, "A"), P("emp", 4, "A"), P("rail", 4, "B")],
      [P("laser", 4, "A"), P("missile", 3, "A"), P("emp", 4, "B"), P("carrier", 4, "B"), P("rail", 4, "A")],
    ],
    saturn: [
      [P("missile", 4, "B"), P("emp", 4, "A"), P("missile", 4, "A"), P("laser", 4, "A")],
      [P("missile", 4, "B"), P("rail", 4, "B"), P("tractor", 4, "A"), P("emp", 4, "B"), P("missile", 4, "A"), P("laser", 4, "B"), P("carrier", 4, "B")],
      [P("emp", 4, "A"), P("laser", 4, "A"), P("missile", 4, "B"), P("carrier", 4, "A"), P("rail", 3, "B"), P("tractor", 4, "B")],
    ],
    sol: [
      [P("laser", 4, "A"), P("missile", 4, "A"), P("emp", 4, "B"), P("rail", 4, "B"), P("tractor", 4, "B"), P("carrier", 4, "A"), P("laser", 4, "B")],
    ],
  };
  // Build a showcase defense and start a wave.
  window.__build = (map, wave, bossFirst) => {
    const od = window.__od;
    od.begin(map, "easy");
    const S = od.state(), B = od.board(), plans = window.__plans[map];
    S.money = 1e7;
    B.slots.forEach((sl, i) => {
      const ringPlan = plans[Math.min(sl.ring, plans.length - 1)];
      const spec = ringPlan[(sl.i + sl.ring) % ringPlan.length];
      if ((sl.i + sl.ring) % 3 === 2 && B.rings[sl.ring].slots > 6) return; // leave some gaps so it doesn't look crowded
      od.placeTower(sl.id, spec[0]);
      const t = od.towerAt(sl.id);
      while (t.level < spec[1]) od.upgradeTower(t, spec[2]);
    });
    S.money = 2400 + wave * 150; S.score = wave * 1900; S.stats.spent = 0;
    // keep the showcase running even if a few invaders slip through
    clearInterval(window.__hpGuard); window.__hpGuard = setInterval(() => { const st = od.state(); if (st) st.lives = Math.max(st.lives, 38); }, 100);
    S.wave = wave - 1;
    od.startWave();
    if (bossFirst) S.queue.sort((a, b) => (b.type === "mother") - (a.type === "mother"));
    S.selectedTower = null;
  };
  // Smoothly move the camera to follow a body (or a fixed point) for `ms` milliseconds.
  window.__follow = (bodyIndex, fromZ, toZ, ms, fx, fy) => new Promise(done => {
    const od = window.__od, t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const B = od.board(), b = bodyIndex == null ? null : B.bodies[bodyIndex];
      const z = fromZ + (toZ - fromZ) * Math.min(1, e * 1.6);
      od.setCamera(z, b ? b.x : fx, b ? b.y : fy);
      if (k < 1) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  window.__endCard = () => {
    const d = document.createElement("div");
    d.id = "endcard";
    d.innerHTML = `<img src="assets/icons/icon-512.png" alt=""><h1>ORBITAL DEFENSE</h1>
      <p class="tag">Defend the Solar System from alien invasion</p>
      <p class="feat">7 satellites · 14 specializations · 9 worlds</p>
      <p class="url">Play free · savior99748.github.io/Space-Orbital-Defense-</p>`;
    document.body.appendChild(d);
  };
};
const CSS = `
  #toast { display: none !important; }
  #endcard { position: fixed; inset: 0; z-index: 99; display: flex; flex-direction: column; align-items: center; justify-content: center;
    background: radial-gradient(circle at 50% 45%, rgba(10,16,40,.86), rgba(5,6,15,.97)); color: #e6e9ff; text-align: center; padding: 20px;
    font-family: system-ui, sans-serif; animation: fadein .6s ease-out both; }
  #endcard img { width: min(30vw, 30vh); border-radius: 22%; box-shadow: 0 0 40px rgba(108,240,255,.35); }
  #endcard h1 { font-size: min(9vw, 9vh); letter-spacing: .12em; color: #6cf0ff; margin: 18px 0 6px; }
  #endcard .tag { font-size: min(4.2vw, 3.6vh); margin: 4px 0; }
  #endcard .feat { font-size: min(3.4vw, 2.8vh); color: #ffd166; margin: 10px 0; }
  #endcard .url { font-size: min(3vw, 2.6vh); color: #8b90b8; margin-top: 16px; }
  @keyframes fadein { from { opacity: 0; } to { opacity: 1; } }`;

async function record(name, viewport) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, recordVideo: { dir: TMP, size: viewport } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const segs = {};
  const mark = (seg, fn) => async () => { const s = (Date.now() - t0) / 1000; await fn(); segs[seg] = { start: s, dur: (Date.now() - t0) / 1000 - s }; };
  await page.goto("file://" + path.join(root, "index.html"));
  await page.evaluate(() => { localStorage.setItem("od_tut_done", "1"); localStorage.setItem("od_orbits", "classic"); });
  await page.reload();
  await page.waitForSelector('[data-act="start"]');
  await page.addStyleTag({ content: CSS });
  await page.evaluate(HELPERS);
  const wait = ms => page.waitForTimeout(ms);
  const speed = v => page.evaluate(v => { window.__od.state().speed = v; }, v);

  await page.evaluate(() => document.querySelector('[data-map="saturn"]').click());
  await wait(300);
  await mark("menu", () => wait(3000))();

  await page.evaluate(() => window.__build("earth", 24));
  await speed(4); await wait(2500); await speed(1);
  await mark("earth", () => wait(7000))();
  await mark("moon", async () => { await page.evaluate(() => window.__follow(1, 1, 2.6, 5000)); })();

  await page.evaluate(() => window.__build("jupiter", 20, true));
  await speed(5); await wait(3500); await speed(1);
  await mark("boss", () => wait(7000))();

  await page.evaluate(() => window.__build("saturn", 26));
  await speed(4); await wait(2500); await speed(1);
  await mark("saturn", () => wait(6000))();

  await page.evaluate(() => window.__build("sol", 22));
  await speed(4); await wait(2500); await speed(1);
  await mark("sol", async () => {
    await page.evaluate(() => { const B = window.__od.board(); return window.__follow(null, 1, 1.7, 7000, B.bodies[0].x, B.bodies[0].y); });
  })();
  await mark("end", async () => { await page.evaluate(() => window.__endCard()); await wait(4000); })();

  const video = page.video();
  await ctx.close(); await browser.close();
  const file = path.join(TMP, `${name}.webm`);
  renameSync(await video.path(), file);
  return { file, segs };
}

function cut(src, seg, out, { w, h, trimStart = 0, dur }) {
  const d = dur ?? seg.dur - trimStart;
  sh("-ss", String(seg.start + trimStart), "-t", String(d), "-i", src,
    "-vf", `scale=${w}:${h}:flags=lanczos,fps=30,fade=t=in:st=0:d=0.25,fade=t=out:st=${Math.max(0, d - 0.25)}:d=0.25`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-an", out);
  return out;
}
function concat(parts, out) {
  const list = path.join(TMP, path.basename(out) + ".txt");
  writeFileSync(list, parts.map(p => `file '${p}'`).join("\n"));
  sh("-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", out);
}
function gif(src, seg, out, { start = 0.5, dur = 4, width = 640 }) {
  sh("-ss", String(seg.start + start), "-t", String(dur), "-i", src,
    "-vf", `fps=15,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`, out);
}

// ---------- satellite gallery (every tier and specialization) ----------
async function gallery() {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 1060 }, deviceScaleFactor: 2 })).newPage();
  await page.goto("file://" + path.join(root, "index.html"));
  await page.waitForFunction(() => window.OD && OD.drawTower);
  await page.evaluate(() => {
    document.body.innerHTML = '<canvas id="g" width="2800" height="2120" style="width:1400px;height:1060px"></canvas>';
    const c = document.getElementById("g").getContext("2d");
    c.scale(2, 2);
    c.fillStyle = "#05060f"; c.fillRect(0, 0, 1400, 1060);
    c.textAlign = "center";
    const types = Object.keys(OD.TOWERS), specs = [[0, null], [1, null], [2, null], [3, "A"], [4, "A"], [3, "B"], [4, "B"]];
    c.font = "bold 13px system-ui"; c.fillStyle = "#8b90b8";
    ["Tier 1", "Tier 2", "Tier 3", "Path A · Tier 4", "Path A · Tier 5", "Path B · Tier 4", "Path B · Tier 5"].forEach((h, i) => c.fillText(h, 290 + i * 160, 34));
    types.forEach((type, row) => {
      const def = OD.TOWERS[type], y = 105 + row * 135;
      c.textAlign = "left"; c.font = "bold 15px system-ui"; c.fillStyle = def.color; c.fillText(def.name, 24, y + 4);
      c.textAlign = "center";
      specs.forEach(([lvl, p], col) => {
        const x = 290 + col * 160;
        c.save(); c.translate(x, y - 8); c.scale(2.1, 2.1);
        OD.drawTower(c, { type, level: lvl, path: p, aim: -0.6, cd: 0, heat: 1, st: OD.tierOf(type, lvl, p) }, 0, 0, -Math.PI / 2, 1.3);
        c.restore();
        c.font = "12px system-ui"; c.fillStyle = "#c9cdee"; c.fillText(OD.tierOf(type, lvl, p).name, x, y + 58);
      });
    });
  });
  await page.locator("#g").screenshot({ path: path.join(OUT, "satellites.png") });
  await browser.close();
}
if (process.argv.includes("--gallery-only")) { await gallery(); console.log("satellites.png written"); process.exit(0); }
await gallery();

// ---------- landscape ----------
console.log("Recording landscape…");
const L = await record("landscape", { width: 1280, height: 720 });
const lp = n => path.join(TMP, `L-${n}.mp4`);
const lw = { w: 1280, h: 720 };
concat([
  cut(L.file, L.segs.menu, lp("menu"), lw), cut(L.file, L.segs.earth, lp("earth"), lw), cut(L.file, L.segs.moon, lp("moon"), lw),
  cut(L.file, L.segs.boss, lp("boss"), lw), cut(L.file, L.segs.saturn, lp("saturn"), lw), cut(L.file, L.segs.sol, lp("sol"), lw),
  cut(L.file, L.segs.end, lp("end"), lw),
], path.join(OUT, "trailer-landscape.mp4"));
gif(L.file, L.segs.earth, path.join(OUT, "gif-earth-defense.gif"), { start: 1 });
gif(L.file, L.segs.moon, path.join(OUT, "gif-moon-zoom.gif"), { start: 0.3 });
gif(L.file, L.segs.boss, path.join(OUT, "gif-mothership.gif"), { start: 1.5 });
gif(L.file, L.segs.sol, path.join(OUT, "gif-solar-system.gif"), { start: 1 });

// ---------- portrait ----------
console.log("Recording portrait…");
const Pt = await record("portrait", { width: 720, height: 1280 });
const pp = n => path.join(TMP, `P-${n}.mp4`);
const pw = { w: 720, h: 1280 };
const parts = {
  earth: cut(Pt.file, Pt.segs.earth, pp("earth"), pw), moon: cut(Pt.file, Pt.segs.moon, pp("moon"), pw),
  boss: cut(Pt.file, Pt.segs.boss, pp("boss"), pw), saturn: cut(Pt.file, Pt.segs.saturn, pp("saturn"), pw),
  sol: cut(Pt.file, Pt.segs.sol, pp("sol"), pw), end: cut(Pt.file, Pt.segs.end, pp("end"), pw),
  end3: cut(Pt.file, Pt.segs.end, pp("end3"), { ...pw, dur: 3 }),
};
concat([parts.earth, parts.moon, parts.boss, parts.saturn, parts.sol, parts.end], path.join(OUT, "trailer-portrait.mp4"));
// 15-second clips for mobile publisher portals
concat([parts.earth, parts.moon, parts.end3], path.join(OUT, "clip-1-orbit-defense.mp4"));
concat([parts.boss, cut(Pt.file, Pt.segs.saturn, pp("saturn5"), { ...pw, dur: 5 }), parts.end3], path.join(OUT, "clip-2-boss-fight.mp4"));
concat([cut(Pt.file, Pt.segs.sol, pp("sol-full"), pw), cut(Pt.file, Pt.segs.moon, pp("moon5"), { ...pw, dur: 5 }), parts.end3], path.join(OUT, "clip-3-solar-system.mp4"));

// ---------- screenshots ----------
console.log("Taking screenshots…");
async function shots(prefix, viewport, scale) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport, deviceScaleFactor: scale })).newPage();
  await page.goto("file://" + path.join(root, "index.html"));
  await page.evaluate(() => localStorage.setItem("od_tut_done", "1"));
  await page.reload(); await page.waitForSelector('[data-act="start"]');
  await page.addStyleTag({ content: CSS }); await page.evaluate(HELPERS);
  await page.evaluate(() => document.querySelector('[data-map="jupiter"]').click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, `${prefix}-1-menu.png`) });
  const scenes = [["earth", 24, false, "2-earth"], ["jupiter", 20, true, "3-jupiter-boss"], ["saturn", 26, false, "4-saturn"], ["sol", 22, false, "5-solar-system"]];
  for (const [map, wave, boss, file] of scenes) {
    await page.evaluate(([m, w, b]) => window.__build(m, w, b), [map, wave, boss]);
    await page.evaluate(() => { window.__od.state().speed = 5; });
    await page.waitForTimeout(boss ? 3500 : 2500);
    await page.evaluate(() => { window.__od.state().speed = 1; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, `${prefix}-${file}.png`) });
  }
  // zoomed-in close-up with the specialization choice open
  await page.evaluate(() => {
    window.__build("earth", 6);
    const od = window.__od, S = od.state();
    const t = S.towers.find(x => x.level === 2) || S.towers[0];
    window.__pick = t.id;
    od.setCamera(1.7, t.x, t.y);
  });
  await page.waitForTimeout(300);
  const pos = await page.evaluate(() => { const od = window.__od, t = od.state().towers.find(x => x.id === window.__pick); return od.toScreen(t.x, t.y); });
  const box = await page.locator("#game").boundingBox();
  await page.mouse.click(box.x + pos.x, box.y + pos.y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${prefix}-6-zoom.png`) });
  await browser.close();
}
await shots("screenshot-desktop", { width: 1280, height: 720 }, 1.5);   // 1920×1080
await shots("screenshot-phone", { width: 430, height: 932 }, 3);        // 1290×2796 (App Store 6.9")

rmSync(TMP, { recursive: true, force: true });
console.log("Done →", readdirSync(OUT).join(", "));
