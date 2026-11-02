// Builds the game for every platform from the same source files. No dependencies needed.
//
//   node tools/build.mjs                 build everything
//   node tools/build.mjs crazygames itch build only some targets
//
// Targets:
//   web         dist/web/                       installable web app (same as GitHub Pages)
//   itch        dist/orbital-defense-itch.zip   upload to itch.io / Newgrounds as an HTML game
//   crazygames  dist/orbital-defense-crazygames.zip   CrazyGames upload (SDK v3: ads, cloud saves)
//   electron    platforms/electron/app/         desktop app for Steam / Windows / Mac / Linux
//   mobile      platforms/mobile/www/           iOS + Android app via Capacitor
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync, existsSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const VERSION = pkg.version;

// Files that make up the game.
const GAME_FILES = ["index.html", "privacy.html", "js", "assets/icons/icon-180.png", "assets/icons/icon-192.png", "assets/icons/icon-512.png"];
const PWA_FILES = ["manifest.webmanifest", "sw.js"];

const TARGETS = {
  web:        { out: "dist/web", platform: "web", pwa: true },
  itch:       { out: "dist/itch", platform: "web", zip: "dist/orbital-defense-itch.zip" },
  crazygames: { out: "dist/crazygames", platform: "crazygames", zip: "dist/orbital-defense-crazygames.zip",
                head: `<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>` },
  electron:   { out: "platforms/electron/app", platform: "electron", icon: "platforms/electron/build/icon.png" },
  mobile:     { out: "platforms/mobile/www", platform: "capacitor", icon: "platforms/mobile/resources/icon.png" },
};

function listFiles(rel) {
  const abs = path.join(root, rel);
  if (statSync(abs).isDirectory()) return readdirSync(abs).flatMap(f => listFiles(path.join(rel, f)));
  return [rel];
}

function build(name) {
  const t = TARGETS[name];
  const out = path.join(root, t.out);
  rmSync(out, { recursive: true, force: true });
  const files = [...GAME_FILES, ...(t.pwa ? PWA_FILES : [])].flatMap(listFiles);
  for (const f of files) {
    mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
    copyFileSync(path.join(root, f), path.join(out, f));
  }
  // Point the page at the right platform (and add any SDK tags).
  let html = readFileSync(path.join(root, "index.html"), "utf8");
  const inject = `<script>window.OD_PLATFORM = ${JSON.stringify(t.platform)}; window.OD_VERSION = ${JSON.stringify(VERSION)};</script>${t.head ? "\n" + t.head : ""}`;
  html = html.replace(/<!-- PLATFORM:[^>]*-->/, inject);
  if (!t.pwa) html = html.replace(/<link rel="manifest"[^>]*>\n?/, "");
  writeFileSync(path.join(out, "index.html"), html);
  if (t.icon) { mkdirSync(path.dirname(path.join(root, t.icon)), { recursive: true }); copyFileSync(path.join(root, "assets/icons/icon-1024.png"), path.join(root, t.icon)); }
  let msg = `${name.padEnd(11)} → ${t.out}/ (${files.length} files)`;
  if (t.zip) { const bytes = zipDir(out, path.join(root, t.zip)); msg += `\n${"".padEnd(11)} → ${t.zip} (${(bytes / 1024).toFixed(0)} KB)`; }
  console.log(msg);
}

// ---------- minimal ZIP writer (deflate), so no zip tool is needed ----------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zipDir(dir, zipPath) {
  const entries = listFilesAbs(dir).map(abs => ({ name: path.relative(dir, abs).split(path.sep).join("/"), data: readFileSync(abs) }));
  const chunks = [], central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8"), comp = deflateRawSync(e.data, { level: 9 }), crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(e.data.length, 24); cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + comp.length;
  }
  const cenSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  const buf = Buffer.concat([...chunks, ...central, end]);
  mkdirSync(path.dirname(zipPath), { recursive: true });
  writeFileSync(zipPath, buf);
  return buf.length;
}
function listFilesAbs(dir) {
  return readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? listFilesAbs(p) : [p]; }).sort();
}

// ---------- run ----------
const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(TARGETS);
for (const n of names) {
  if (!TARGETS[n]) { console.error(`Unknown target "${n}". Choose from: ${Object.keys(TARGETS).join(", ")}`); process.exit(1); }
  if (!existsSync(path.join(root, "assets/icons/icon-1024.png"))) { console.error("Missing icons: run node tools/make-icons.mjs first"); process.exit(1); }
  build(n);
}
console.log(`\nOrbital Defense v${VERSION}: built ${names.length} target(s).`);
