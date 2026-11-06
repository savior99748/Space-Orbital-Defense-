// Flat copy of a build: every file in one folder, no subfolders (easier to upload from a phone, where
// pickers can't keep folders). Rewrites the page's and the 3D modules' paths to match.
//   node tools/build.mjs crazygames && node tools/flatten.mjs crazygames
//   → dist/crazygames-flat/ and dist/ringwarden-crazygames-flat.zip
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, statSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const name = process.argv[2] || "crazygames";
const src = path.join(root, "dist", name), out = path.join(root, "dist", `${name}-flat`);
const walk = d => readdirSync(d).flatMap(f => statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]);
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const seen = new Set();
for (const f of walk(src)) {
  const base = f.endsWith("vendor/three/LICENSE") ? "three-LICENSE.txt" : path.basename(f);
  if (seen.has(base)) throw new Error(`two files named ${base}`);
  seen.add(base);
  let data = readFileSync(f);
  if (/\.(html|js)$/.test(base)) {
    let s = data.toString("utf8");
    s = s.replace(/(src|href)="(js|assets\/icons)\//g, '$1="').replace(/import\("\.\/js\//g, 'import("./')
      .replace(/from "\.\.\/vendor\/three\//g, 'from "./');
    data = Buffer.from(s);
  }
  writeFileSync(path.join(out, base), data);
}
const zip = path.join(root, "dist", `ringwarden-${name}-flat.zip`);
rmSync(zip, { force: true });
execFileSync("zip", ["-q", "-j", zip, ...readdirSync(out).map(f => path.join(out, f))]);
console.log(`${path.relative(root, out)}/ (${seen.size} files) → ${path.relative(root, zip)}`);
