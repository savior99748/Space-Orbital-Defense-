// Runs the automated test suite: builds what the tests need, serves it, runs every *.test.cjs, and
// exits non-zero if any check fails or any test crashes.
//   npm test                       all tests
//   npm test -- crazygames menu    only tests whose file name contains one of the words
// Needs Playwright with Chromium (npm install && npx playwright install chromium).
import { createServer } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, existsSync, statSync, readdirSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.resolve(here, "..");
const OUT = path.join(here, ".out");
const filters = process.argv.slice(2);
const files = readdirSync(here).filter(f => f.endsWith(".test.cjs")).filter(f => !filters.length || filters.some(w => f.includes(w))).sort();
if (!files.length) { console.error("No tests match", filters.join(" ")); process.exit(1); }

// 1. builds the tests load
console.log("Building test targets…");
execFileSync("node", ["tools/build.mjs", "itch", "crazygames", "crazygames-basic", "steam"], { cwd: root, stdio: "inherit" });
execFileSync("node", ["tools/flatten.mjs", "crazygames"], { cwd: root, stdio: "inherit" });
execFileSync("node", ["tools/flatten.mjs", "crazygames-basic"], { cwd: root, stdio: "inherit" });

// 2. static servers on the ports the tests expect
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".txt": "text/plain" };
const SERVE = { 8765: ".", 8766: ".", 8768: ".", 8769: ".", 8771: "dist/crazygames", 8774: "dist/crazygames-flat", 8775: "dist/crazygames-basic-flat", 8776: "platforms/electron/app" };
const servers = Object.entries(SERVE).map(([port, dir]) => {
  const base = path.join(root, dir);
  return createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
    let p = path.join(base, rel);
    if (p.startsWith(base) && existsSync(p) && statSync(p).isDirectory()) p = path.join(p, "index.html");
    if (!p.startsWith(base) || !existsSync(p)) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": TYPES[path.extname(p)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(p));
  }).listen(+port, "127.0.0.1");
});

// 3. run each test in its own process
let hasXvfb = false; try { execFileSync("which", ["xvfb-run"], { stdio: "ignore" }); hasXvfb = true; } catch { /* not installed */ }
rmSync(OUT, { recursive: true, force: true }); mkdirSync(path.join(OUT, "shots"), { recursive: true });
const run = f => new Promise(resolve => {
  const t0 = Date.now(), lines = [];
  // the desktop (Electron) test needs a display: use a virtual one on a headless Linux machine
  const virtual = f.startsWith("steam") && process.platform === "linux" && !process.env.DISPLAY && hasXvfb;
  const child = virtual ? spawn("xvfb-run", ["-a", process.execPath, path.join(here, f)], { cwd: OUT, env: process.env })
    : spawn(process.execPath, [path.join(here, f)], { cwd: OUT, env: process.env });
  const timer = setTimeout(() => { lines.push("FAIL timed out after 15 min"); child.kill("SIGKILL"); }, 15 * 60 * 1000);
  const take = d => String(d).split("\n").forEach(l => { if (l.trim()) lines.push(l); });
  child.stdout.on("data", take); child.stderr.on("data", take);
  child.on("close", code => {
    clearTimeout(timer);
    const pass = lines.filter(l => l.startsWith("PASS")).length, fail = lines.filter(l => l.startsWith("FAIL")).length;
    lines.filter(l => l.startsWith("SKIP")).forEach(l => console.log("    " + l));
    const crashed = code !== 0 && !fail;
    resolve({ f, pass, fail: fail + (crashed ? 1 : 0), crashed, lines, secs: ((Date.now() - t0) / 1000).toFixed(0) });
  });
});
let total = 0, failed = 0;
for (const f of files) {
  process.stdout.write(`▶ ${f} … `);
  let r = await run(f);
  if (r.fail) { // shared CI runners are slow and occasionally hiccup (a frame late, Electron failing to start): retry the
    // file once. A real bug fails both times; a pass on the retry is reported as flaky, not hidden.
    const first = r;
    r = await run(f);
    if (!r.fail) console.log(`(flaky: ${first.lines.filter(l => l.startsWith("FAIL")).slice(0, 2).join(" | ") || "crashed"}; passed on retry) `);
  }
  total += r.pass; failed += r.fail;
  console.log(r.fail ? `✗ ${r.pass} passed, ${r.fail} failed (${r.secs}s)` : `✓ ${r.pass} passed (${r.secs}s)`);
  if (r.fail) for (const l of r.lines.filter(l => !l.startsWith("PASS")).slice(0, 25)) console.log("    " + l);
}
servers.forEach(s => s.close());
console.log(`\n${failed ? "FAILED" : "OK"}: ${total} checks passed, ${failed} failed, ${files.length} test files. Screenshots: tests/.out/`);
process.exit(failed ? 1 : 0);
