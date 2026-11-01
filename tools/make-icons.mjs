// Renders the app icon with the game's own art and saves PNGs in assets/icons/.
// Usage: node tools/make-icons.mjs   (needs Playwright + Chromium installed)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Use a local Playwright install if present, otherwise a global one (NODE_PATH).
const { chromium } = await import("playwright").catch(() => createRequire(import.meta.url)("playwright"));
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("file://" + path.join(root, "index.html"));
await page.waitForFunction(() => window.OD && OD.drawBody && OD.drawTower);
const sizes = [1024, 512, 192, 180];
const pngs = await page.evaluate(sizes => {
  const big = document.createElement("canvas");
  big.width = big.height = 1024;
  const c = big.getContext("2d");
  // background: deep space with a soft blue glow (full-bleed, so it also works as a maskable icon)
  c.fillStyle = "#05060f"; c.fillRect(0, 0, 1024, 1024);
  const g = c.createRadialGradient(512, 512, 40, 512, 512, 620);
  g.addColorStop(0, "rgba(60,90,200,0.55)"); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.fillRect(0, 0, 1024, 1024);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(210,220,255,${0.3 + rnd() * 0.6})`; const s = rnd() * 4 + 1; c.fillRect(rnd() * 1024, rnd() * 1024, s, s); }
  // orbit ring
  c.strokeStyle = "rgba(108,240,255,0.55)"; c.lineWidth = 10; c.setLineDash([26, 30]);
  c.beginPath(); c.arc(512, 512, 300, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  OD.drawBody(c, "earth", 512, 512, 170, 4);
  // satellites on the ring
  const sats = [["laser", -2.2, 2, null], ["rail", -0.2, 3, "A"], ["missile", 1.9, 4, "A"]];
  for (const [type, a, level, path] of sats) {
    const x = 512 + Math.cos(a) * 300, y = 512 + Math.sin(a) * 300;
    c.save(); c.translate(x, y); c.scale(4.2, 4.2);
    OD.drawTower(c, { type, level, path, aim: a + Math.PI * 0.9, cd: 0, st: OD.tierOf(type, level, path) }, 0, 0, a, 2);
    c.restore();
  }
  return sizes.map(sz => {
    const out = document.createElement("canvas"); out.width = out.height = sz;
    const o = out.getContext("2d"); o.imageSmoothingQuality = "high"; o.drawImage(big, 0, 0, sz, sz);
    return out.toDataURL("image/png").split(",")[1];
  });
}, sizes);
sizes.forEach((sz, i) => writeFileSync(path.join(root, "assets/icons", `icon-${sz}.png`), Buffer.from(pngs[i], "base64")));
await browser.close();
console.log("Icons written to assets/icons/:", sizes.join(", "));
