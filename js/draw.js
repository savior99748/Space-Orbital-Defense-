// Procedural art for satellites, fighters and enemies. Every tier and path changes the satellite's look.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const TAU = Math.PI * 2;

  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  OD.rgba = rgba;

  function circle(ctx, x, y, r, fill, stroke, lw = 2) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  }
  // soft glow: a cached sprite (js/fx2d.js) instead of a new gradient every frame
  function glow(ctx, x, y, r, color, a = 0.5) {
    if (!OD.fx2d || r <= 0) return;
    const ga = ctx.globalAlpha;
    OD.fx2d.glow(ctx, x, y, r, color, a * 1.6 * ga);
    ctx.globalAlpha = ga;
  }
  // colour helpers (cached): shade(hex, -1..1) darkens toward navy / lightens toward white
  const shadeCache = new Map();
  function shade(hex, f) {
    const key = hex + f; let v = shadeCache.get(key); if (v) return v;
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r = r * (1 + f) + 6 * -f; g = g * (1 + f) + 8 * -f; b = b * (1 + f) + 22 * -f; }
    else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    v = `rgb(${r | 0},${g | 0},${b | 0})`; shadeCache.set(key, v); return v;
  }
  // gradients are made once per canvas and reused (their coordinates are local, so any position works)
  const gcache = new WeakMap();
  function grad(ctx, key, make) {
    let m = gcache.get(ctx); if (!m) gcache.set(ctx, (m = new Map()));
    let g = m.get(key); if (!g) { g = make(); m.set(key, g); }
    return g;
  }
  const isHex = c => typeof c === "string" && c[0] === "#" && c.length === 7;
  // a shaded metal part (barrels, struts): base colour with a light top edge and a dark underside
  function metal(ctx, x, y, w, h, fill) {
    ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
    if (Math.abs(h) < 1.6 || Math.abs(w) < 1.6) return;
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.fillRect(x, y, w, h * 0.32);
  }
  function poly(ctx, n, r, rot = 0) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU;
      i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function rect(ctx, x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }

  // Solar panels along the orbit (local frame: +x points away from the planet): framed cells with a sheen.
  function panels(ctx, lvl, accent) {
    const len = 10 + lvl * 2.5, w = 6 + (lvl >= 3 ? 2 : 0);
    const cell = lvl >= 3 ? accent : "#3c5bb8";
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? 9 : -9 - len;
      metal(ctx, -w / 2 - 1, s > 0 ? 6 : -9, w + 2, 3, "#5a6688"); // strut
      rect(ctx, -w / 2 - 0.8, y0 - 0.8, w + 1.6, len + 1.6, "#0b1024"); // frame
      rect(ctx, -w / 2, y0, w, len, "#1a2350");
      const cells = 2 + Math.floor(lvl / 2);
      const ch = (len - (cells + 1)) / cells;
      for (let i = 0; i < cells; i++) {
        ctx.fillStyle = cell; ctx.fillRect(-w / 2 + 1, y0 + 1 + i * (ch + 1), w - 2, ch);
        ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(-w / 2 + 1, y0 + 1 + i * (ch + 1), (w - 2) * 0.4, ch); // sheen
      }
      if (lvl >= 2) { // second, angled wing pair
        ctx.save(); ctx.rotate(s * 0.5);
        rect(ctx, -w / 2 - 6, s > 0 ? 9 : -9 - len * 0.6, w * 0.6, len * 0.6, rgba(cell === "#3c5bb8" ? "#3c5bb8" : accent, 0.7));
        ctx.restore();
      }
    }
  }

  // satellite hull: shaded metal disc, coloured rim, inner panel ring and a specular highlight (lit from top-left)
  // Satellite hulls: each type has its own silhouette (lit metal, coloured trim, an outline that reads over bright
  // planets). Pre-rendered once per shape, size and colour at 4× resolution and stamped with drawImage. The hull is
  // aligned with the orbit (local +x points away from the planet), like the solar panels.
  //   round · diamond (Laser) · box (Missile Pod) · oct (Flak) · capsule (Railgun) · torus (Tractor) · hex (Silo)
  const hullCache = new Map();
  let hullRot = 0; // the satellite's orbit angle (set by drawTower)
  function hullPath(g, shape, r) {
    g.beginPath();
    if (shape === "diamond") { g.moveTo(r * 1.2, 0); g.lineTo(r * 0.1, -r * 0.92); g.lineTo(-r * 1.0, 0); g.lineTo(r * 0.1, r * 0.92); g.closePath(); }
    else if (shape === "box") { const w = r * 0.92, k = r * 0.3; g.moveTo(-w + k, -w); g.lineTo(w - k, -w); g.lineTo(w, -w + k); g.lineTo(w, w - k); g.lineTo(w - k, w); g.lineTo(-w + k, w); g.lineTo(-w, w - k); g.lineTo(-w, -w + k); g.closePath(); }
    else if (shape === "oct") { for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
    else if (shape === "hex") { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
    else if (shape === "capsule") { const hw = r * 0.62, hl = r * 1.3; g.moveTo(-hw, -hl + hw); g.arc(0, -hl + hw, hw, Math.PI, 0); g.lineTo(hw, hl - hw); g.arc(0, hl - hw, hw, 0, Math.PI); g.closePath(); }
    else g.arc(0, 0, r, 0, TAU);
  }
  function hullDetail(g, shape, r, color) {
    const trim = isHex(color) ? rgba(color, 0.55) : "rgba(255,255,255,0.3)";
    g.lineWidth = 1;
    if (shape === "diamond") { // focusing lens at the nose, keel line
      g.strokeStyle = trim; g.beginPath(); g.moveTo(-r * 0.8, 0); g.lineTo(r * 0.45, 0); g.stroke();
      circle(g, r * 0.62, 0, r * 0.3, "#0b1a2c", color, 1.4); circle(g, r * 0.66, -r * 0.06, r * 0.12, "rgba(255,255,255,0.75)");
    } else if (shape === "box") { // 2×2 launch hatches
      for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.fillStyle = "rgba(4,8,20,0.75)"; g.fillRect(x * r * 0.42 - r * 0.28, y * r * 0.42 - r * 0.28, r * 0.56, r * 0.56); g.strokeStyle = trim; g.strokeRect(x * r * 0.42 - r * 0.28, y * r * 0.42 - r * 0.28, r * 0.56, r * 0.56); }
    } else if (shape === "oct") { // segmented armour plates
      g.strokeStyle = "rgba(0,0,10,0.5)"; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); g.lineTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95); g.stroke(); }
      circle(g, 0, 0, r * 0.55, null, trim, 1.2);
    } else if (shape === "hex") { // blast doors + bolts
      g.strokeStyle = "rgba(0,0,10,0.6)"; g.lineWidth = 1.4; g.beginPath(); g.moveTo(-r * 0.85, 0); g.lineTo(r * 0.85, 0); g.stroke();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + TAU / 12; circle(g, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.07, trim); }
    } else if (shape === "capsule") { // capacitor coils along the bank
      for (const y of [-0.75, -0.25, 0.25, 0.75]) { g.fillStyle = trim; g.fillRect(-r * 0.62, y * r - r * 0.07, r * 1.24, r * 0.14); }
    } else if (shape === "torus") { // hollow emitter ring
      circle(g, 0, 0, r * 0.5, "#03040c", color, 1.2);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + TAU / 8; circle(g, Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76, r * 0.1, trim); }
    } else circle(g, 0, 0, r * 0.62, null, isHex(color) ? rgba(color, 0.35) : "rgba(255,255,255,0.2)", 1);
  }
  function body(ctx, r, color, shape = "round") {
    const key = shape + color + "|" + Math.round(r * 4);
    let c = hullCache.get(key);
    if (!c) {
      const k = 4, R = r * (shape === "capsule" ? 1.4 : shape === "diamond" ? 1.25 : 1) + 2.5, N = Math.ceil(R * 2 * k);
      c = document.createElement("canvas"); c.width = N; c.height = N;
      const g = c.getContext("2d"); g.setTransform(k, 0, 0, k, N / 2, N / 2);
      g.lineJoin = "round";
      hullPath(g, shape, r); g.strokeStyle = "rgba(4,6,16,0.8)"; g.lineWidth = 3.4; g.stroke(); // outline
      const q = g.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.2); q.addColorStop(0, "#5c6788"); q.addColorStop(0.55, "#262d48"); q.addColorStop(1, "#0d1124");
      hullPath(g, shape, r); g.fillStyle = q; g.fill();
      g.save(); hullPath(g, shape, r); g.clip(); hullDetail(g, shape, r, color); g.restore();
      hullPath(g, shape, r); g.strokeStyle = color; g.lineWidth = 2; g.stroke(); // coloured trim
      g.save(); hullPath(g, shape, r - 1.4); g.clip(); g.strokeStyle = "rgba(255,255,255,0.4)"; g.lineWidth = 1.2; g.beginPath(); g.arc(0, 0, r * 1.05, -2.7, -1.3); g.stroke(); g.restore(); // highlight
      c.R = R; hullCache.set(key, c);
    }
    const R = c.R;
    if (hullRot && shape !== "round" && shape !== "torus") { ctx.save(); ctx.rotate(hullRot); ctx.drawImage(c, -R, -R, R * 2, R * 2); ctx.restore(); }
    else ctx.drawImage(c, -R, -R, R * 2, R * 2);
  }

  // ---------- satellites ----------
  const ART = {
    // FLAK ARRAY: a squat drum with a fan of short barrels
    flak(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      body(ctx, 8.5 + lvl * 0.6, col, "oct");
      ctx.rotate(t.aim);
      const n = 3 + Math.min(lvl, 2) + (path === "A" ? 2 : 0);
      for (let i = 0; i < n; i++) { const a = (i - (n - 1) / 2) * 0.22; ctx.save(); ctx.rotate(a); metal(ctx, 4, -1.3, path === "B" ? 17 : 13, 2.6, col); ctx.restore(); }
      circle(ctx, 0, 0, 4, "#2a1a10", col, 1.5);
      if (path === "B" && lvl >= 4) glow(ctx, 16, 0, 6, pc, 0.7);
    },
    // MINE LAYER: a boxy dispenser with a rack of red mines
    mines(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      rect(ctx, -9.5, -8.5, 19, 17, "rgba(4,6,16,0.75)"); // outline
      rect(ctx, -8, -7, 16, 14, grad(ctx, "minebox", () => { const g = ctx.createLinearGradient(0, -7, 0, 7); g.addColorStop(0, "#4a3a52"); g.addColorStop(1, "#140d18"); return g; }));
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(-8, -7, 16, 14);
      rect(ctx, -7, -6, 14, 1, "rgba(255,255,255,0.3)");
      const n = Math.min(6, 2 + lvl);
      for (let i = 0; i < n; i++) circle(ctx, -5 + (i % 3) * 5, -3 + Math.floor(i / 3) * 6, path === "B" ? 2.6 : 2, col);
      if ((t.flash || 0) > 0) glow(ctx, 0, 0, 14, col, t.flash * 0.8);
    },
    // FOCUS ARRAY: a lens ring around a glowing crystal
    focus(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      glow(ctx, 0, 0, 14 + lvl * 2, col, 0.25 + 0.1 * Math.sin(time * 3));
      circle(ctx, 0, 0, 10 + lvl, null, col, 2);
      ctx.save(); ctx.rotate(time * 0.8); ctx.fillStyle = col; poly(ctx, path === "B" ? 6 : 4, 6); ctx.fill(); ctx.restore();
      circle(ctx, 0, 0, 2.5, "#ffffff");
    },
    // MISSILE SILO: a round hatch with the warhead peeking out
    silo(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      body(ctx, 8.5 + lvl * 0.5, col, "hex"); // armoured hatch
      const n = path === "A" ? (lvl >= 4 ? 6 : 4) : lvl >= 1 && path !== "B" ? 2 : 1;
      for (let i = 0; i < n; i++) { const a = i * TAU / n, r = n > 1 ? 4 : 0; circle(ctx, Math.cos(a) * r, Math.sin(a) * r, path === "B" ? 4.5 : 2.4, path === "B" ? "#ff5c5c" : "#e8eef6"); }
    },
    laser(ctx, lvl, path, c, pc, time, t) {
      body(ctx, 9 + lvl * 0.8, lvl >= 3 ? pc : c, "diamond");
      ctx.rotate(t.aim);
      if (lvl === 0) { metal(ctx, 0, -2, 14, 4, c); return; }
      if (path === "B") { // Solar Lance: one long superheated barrel
        const L = lvl >= 4 ? 30 : 25;
        const g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, c); g.addColorStop(0.6, pc); g.addColorStop(1, "#fff6d0");
        metal(ctx, 0, -3.5, L, 7, g);
        for (let i = 0; i < 3; i++) rect(ctx, 5 + i * 6, -5, 2.5, 10, "#5a3a1a");
        glow(ctx, L, 0, 10 + (t.heat || 0) * 4, pc, 0.7);
        if (lvl >= 4) { // corona fins
          ctx.fillStyle = rgba(pc, 0.85);
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-4, s * 6); ctx.lineTo(-14, s * 16); ctx.lineTo(4, s * 8); ctx.fill(); }
        }
        return;
      }
      // twin emitters
      const L = lvl >= 2 ? 16 : 14;
      metal(ctx, 0, -5.5, L, 3, c); metal(ctx, 0, 2.5, L, 3, c);
      if (lvl === 2) { circle(ctx, L + 2, 0, 4, "#e9fdff", c, 1.5); glow(ctx, L + 2, 0, 9, c, 0.5); }
      if (path === "A") { // Prism: a spinning crystal at the muzzle
        ctx.save(); ctx.translate(L + 5, 0); ctx.rotate(time * 2);
        const s = lvl >= 4 ? 9 : 7;
        const g = ctx.createLinearGradient(-s, -s, s, s);
        g.addColorStop(0, "#ff7ad9"); g.addColorStop(0.5, "#fff"); g.addColorStop(1, "#6cf0ff");
        ctx.fillStyle = g; poly(ctx, 3, s); ctx.fill();
        ctx.strokeStyle = pc; ctx.lineWidth = 1; ctx.stroke();
        ctx.restore();
        if (lvl >= 4) {
          const hues = ["#ff5c7a", "#ffd166", "#7dff9a", "#6cf0ff"];
          for (let i = 0; i < 4; i++) {
            const a = -time * 1.5 + i * TAU / 4;
            ctx.save(); ctx.translate(Math.cos(a) * 15, Math.sin(a) * 15); ctx.rotate(a);
            ctx.fillStyle = hues[i]; poly(ctx, 3, 3.5); ctx.fill(); ctx.restore();
          }
        }
      }
    },

    missile(ctx, lvl, path, c, pc, time, t) {
      if (path === "A") { // hive pod
        ctx.save(); ctx.rotate(t.aim);
        const r = lvl >= 4 ? 14 : 12;
        ctx.fillStyle = "#2a1d10"; poly(ctx, 6, r, Math.PI / 6); ctx.fill();
        ctx.strokeStyle = pc; ctx.lineWidth = 2; ctx.stroke();
        const holes = lvl >= 4 ? [[0, 0], [5, 3], [5, -3], [0, 6], [0, -6], [-5, 3], [-5, -3], [8, 0], [-8, 0]] : [[0, 0], [5, 3], [5, -3], [-5, 3], [-5, -3], [0, 6], [0, -6]];
        for (const [x, y] of holes) circle(ctx, x, y, 1.8, (t.cd || 0) < 0.15 ? "#fff3c0" : "#ff9f43");
        if (lvl >= 4) { ctx.strokeStyle = rgba(pc, 0.6); ctx.lineWidth = 1.5; poly(ctx, 6, r + 4, Math.PI / 6 + time * 0.5); ctx.stroke(); }
        ctx.restore();
        return;
      }
      if (path === "B") { // nova warhead launcher
        body(ctx, 10, pc, "box");
        ctx.rotate(t.aim);
        const big = lvl >= 4;
        rect(ctx, -6, big ? -8 : -6, big ? 26 : 22, big ? 16 : 12, "#3a1d1d");
        ctx.strokeStyle = pc; ctx.lineWidth = 1.5; ctx.strokeRect(-6, big ? -8 : -6, big ? 26 : 22, big ? 16 : 12);
        const ready = (t.cd || 0) <= 0.3;
        if (ready) { // warhead sitting in the tube
          ctx.fillStyle = "#ddd"; ctx.beginPath(); ctx.moveTo(big ? 20 : 16, big ? -6 : -4.5); ctx.lineTo(big ? 30 : 24, 0); ctx.lineTo(big ? 20 : 16, big ? 6 : 4.5); ctx.fill();
          circle(ctx, big ? 27 : 22, 0, 2, "#ff5c5c");
        }
        if (big) { const p = 0.5 + 0.5 * Math.sin(time * 5); glow(ctx, 2, 0, 14, "#ff5c5c", 0.3 + p * 0.4); circle(ctx, 2, 0, 3.5, "#ffd0a0"); }
        return;
      }
      if (lvl >= 2) { rect(ctx, -10, -10, 20, 20, "#121633"); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20); }
      else body(ctx, 9 + lvl, c, "box");
      ctx.rotate(t.aim);
      const tubes = lvl === 0 ? [0] : lvl === 1 ? [-4, 4] : [-6.5, -2, 2.5, 7];
      for (const y of tubes) {
        metal(ctx, 0, y - (lvl >= 2 ? 1.8 : 3), 13, lvl >= 2 ? 3.6 : 6, c);
        circle(ctx, 13, y, lvl >= 2 ? 1.6 : 2.4, "#ff5c5c");
      }
    },

    tractor(ctx, lvl, path, c, pc, time) {
      if (path === "A") { // singularity: black core with a spinning accretion disc
        const r = lvl >= 4 ? 10 : 8;
        glow(ctx, 0, 0, r * 3, pc, 0.45);
        ctx.save(); ctx.rotate(time * 1.5);
        for (let i = 0; i < 3; i++) {
          ctx.strokeStyle = rgba(i % 2 ? "#ff9de6" : pc, 0.8 - i * 0.2); ctx.lineWidth = 2.5 - i * 0.5;
          ctx.beginPath(); ctx.ellipse(0, 0, r + 5 + i * 3, (r + 5 + i * 3) * 0.4, i * 0.6, 0, TAU); ctx.stroke();
        }
        ctx.restore();
        circle(ctx, 0, 0, r, "#000", lvl >= 4 ? "#fff" : pc, 1.5);
        return;
      }
      if (path === "B") { // cryo: rotating snowflake crystal
        const arms = lvl >= 4 ? 12 : 6, L = lvl >= 4 ? 16 : 13;
        glow(ctx, 0, 0, L + 6, pc, 0.35);
        ctx.save(); ctx.rotate(time * 0.4);
        ctx.strokeStyle = pc; ctx.lineCap = "round";
        for (let i = 0; i < arms; i++) {
          const long = lvl < 4 || i % 2 === 0, len = long ? L : L * 0.6;
          ctx.save(); ctx.rotate(i * TAU / arms);
          ctx.lineWidth = long ? 2.5 : 1.5;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0);
          if (long) { ctx.moveTo(len * 0.6, 0); ctx.lineTo(len * 0.8, -4); ctx.moveTo(len * 0.6, 0); ctx.lineTo(len * 0.8, 4); }
          ctx.stroke(); ctx.restore();
        }
        ctx.restore();
        circle(ctx, 0, 0, 4, "#ffffff");
        return;
      }
      body(ctx, 9.5 + lvl, c, "torus");
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      for (let i = 0; i < lvl; i++) circle(ctx, 0, 0, 4 + i * 2.5, null, rgba(c, 0.5 + 0.2 * i), 1);
      circle(ctx, 0, 0, 3 + pulse * 1.5, c);
      if (lvl >= 2) { // emitter prongs
        ctx.save(); ctx.rotate(time * 0.8);
        for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); metal(ctx, 11, -1.5, 5, 3, c); }
        ctx.restore();
      }
    },

    rail(ctx, lvl, path, c, pc, time, t) {
      body(ctx, 8 + lvl * 0.7, lvl >= 3 ? pc : c, "capsule");
      ctx.rotate(t.aim);
      const kick = Math.max(0, (t.recoil || 0)) * 6;
      ctx.translate(-kick, 0);
      if (path === "B") { // rotary coil barrels
        const n = lvl >= 4 ? 5 : 3, spin = t.spin || 0;
        for (let i = 0; i < n; i++) {
          const a = spin + i * TAU / n, y = Math.sin(a) * 5, depth = Math.cos(a);
          metal(ctx, 0, y - 1.5, 20, 3, depth > 0 ? pc : rgba(pc, 0.5));
        }
        rect(ctx, 3, -6.5, 3, 13, "#1b4d3a"); rect(ctx, 14, -6.5, 3, 13, "#1b4d3a");
        return;
      }
      if (lvl === 0) { metal(ctx, 0, -2.5, 20, 5, c); return; }
      const L = path === "A" ? (lvl >= 4 ? 40 : 34) : lvl >= 2 ? 26 : 22;
      if (lvl === 1) { metal(ctx, 0, -2.5, L, 5, c); for (let i = 0; i < 3; i++) rect(ctx, 4 + i * 5, -5, 3, 10, "#2f6b42"); return; }
      // twin rails with a glowing gap
      const col = path === "A" ? pc : c;
      metal(ctx, 0, -5, L, 3, col); metal(ctx, 0, 2, L, 3, col);
      const charge = Math.max(0, Math.min(1, 1 - (t.cd || 0) * (t.st ? t.st.rate : 1)));
      rect(ctx, 2, -1, (L - 2) * charge, 2, rgba("#e8ffe0", 0.5 + charge * 0.5));
      if (path === "A") {
        for (let i = 0; i < (lvl >= 4 ? 6 : 4); i++) { ctx.strokeStyle = "#4f7a2a"; ctx.lineWidth = 2; ctx.strokeRect(5 + i * 5.5, -7, 3, 14); }
        if (lvl >= 4) glow(ctx, L, 0, 10 * charge + 2, pc, 0.8);
      }
    },

    emp(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      if (path === "B") { // ion storm: orbiting tesla spheres with crackling arcs
        const n = lvl >= 4 ? 5 : 3;
        circle(ctx, 0, 0, 6, "#1c2240", col, 2);
        glow(ctx, 0, 0, 12, col, 0.5);
        for (let i = 0; i < n; i++) {
          const a = time * 1.2 + i * TAU / n, x = Math.cos(a) * 13, y = Math.sin(a) * 13;
          ctx.strokeStyle = rgba("#dfe9ff", 0.7); ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(0, 0);
          for (let k = 1; k < 4; k++) ctx.lineTo(x * k / 4 + (Math.random() - 0.5) * 5, y * k / 4 + (Math.random() - 0.5) * 5);
          ctx.lineTo(x, y); ctx.stroke();
          circle(ctx, x, y, 3, "#dfe9ff", col, 1.5);
        }
        if (lvl >= 4) { ctx.strokeStyle = rgba(col, 0.5); ctx.lineWidth = 1; circle(ctx, 0, 0, 19, null, rgba(col, 0.4), 1); }
        return;
      }
      const charge = Math.max(0, Math.min(1, 1 - (t.cd || 0) * (t.st ? t.st.rate : 1)));
      glow(ctx, 0, 0, 10 + charge * 8, col, 0.25 + charge * 0.4);
      const spikes = [4, 6, 8, 8, 10][lvl], L = 12 + lvl;
      ctx.save(); ctx.rotate(time * 0.3);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      for (let i = 0; i < spikes; i++) {
        const a = i * TAU / spikes;
        ctx.beginPath(); ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6); ctx.lineTo(Math.cos(a) * L, Math.sin(a) * L); ctx.stroke();
        circle(ctx, Math.cos(a) * L, Math.sin(a) * L, 1.8, "#fff");
      }
      ctx.restore();
      if (lvl >= 2) circle(ctx, 0, 0, 9, null, rgba(col, 0.7), 1.5);
      const core = ctx.createRadialGradient(-2, -2, 1, 0, 0, 7);
      core.addColorStop(0, "#fffbe0"); core.addColorStop(1, col);
      circle(ctx, 0, 0, 7, core);
      if (path === "A" && lvl >= 4) { // pulsar beams
        ctx.save(); ctx.rotate(time * 3);
        const g = ctx.createLinearGradient(0, 0, 26, 0); g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        for (const s of [0, Math.PI]) { ctx.save(); ctx.rotate(s); ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(26, -4); ctx.lineTo(26, 4); ctx.lineTo(0, 2); ctx.fill(); ctx.restore(); }
        ctx.restore();
      }
    },

    miner(ctx, lvl, path, c, pc, time, t) {
      const col = lvl >= 3 ? pc : c;
      // drills point toward the planet (local -x)
      const drills = lvl === 0 ? [0] : [-5, 5];
      for (const y of drills) {
        ctx.save(); ctx.translate(-9, y); ctx.rotate(Math.PI);
        ctx.fillStyle = "#c9c9d6"; ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(9, 0); ctx.lineTo(0, 3); ctx.fill();
        ctx.strokeStyle = "#7a7a8a"; ctx.lineWidth = 1;
        const off = (time * 20) % 3;
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(k * 3 + off, -2.5 + (k * 3 + off) / 4); ctx.lineTo(k * 3 + off, 2.5 - (k * 3 + off) / 4); ctx.stroke(); }
        ctx.restore();
      }
      ctx.fillStyle = "#2a2412"; poly(ctx, 6, 10 + lvl * 0.6); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      if (lvl >= 2 && path !== "B") rect(ctx, 6, -4, 7, 8, "#6b5a1e"); // cargo pod
      if (path === "A") { // forge: glowing molten core
        const p = 0.5 + 0.5 * Math.sin(time * 3);
        glow(ctx, 0, 0, 14 + p * 4 + (lvl >= 4 ? 6 : 0), pc, 0.6);
        circle(ctx, 0, 0, lvl >= 4 ? 6 : 4.5, lvl >= 4 ? "#fff3c0" : "#ffb347");
        if (lvl >= 4) for (let i = 0; i < 6; i++) { const a = time + i * TAU / 6; circle(ctx, Math.cos(a) * 9, Math.sin(a) * 9, 1.2, "#ffd166"); }
      } else if (path === "B") { // relay: dish + broadcast waves
        circle(ctx, 0, 0, 4, col);
        ctx.save(); ctx.translate(4, 0);
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 8, -1, 1); ctx.stroke();
        for (let i = 0; i < (lvl >= 4 ? 3 : 2); i++) {
          const k = ((time * 0.8 + i / 3) % 1);
          ctx.strokeStyle = rgba(col, 1 - k); ctx.beginPath(); ctx.arc(0, 0, 10 + k * 16, -0.7, 0.7); ctx.stroke();
        }
        ctx.restore();
      } else {
        circle(ctx, 0, 0, 3.5, "#ffd166");
        if ((t.flash || 0) > 0) glow(ctx, 0, 0, 16, "#ffd166", t.flash);
      }
    },

    carrier(ctx, lvl, path, c, pc, time) {
      const col = lvl >= 3 ? pc : c;
      ctx.rotate(Math.PI / 2); // hull lies along the orbit
      const L = 13 + lvl * 2.5, w = path === "B" ? 9 : 7;
      ctx.fillStyle = path === "B" ? "#2b1420" : "#22152c";
      ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L * 0.3, -w); ctx.lineTo(-L, -w * 0.8); ctx.lineTo(-L, w * 0.8); ctx.lineTo(L * 0.3, w); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      if (path === "A") { ctx.fillStyle = rgba(pc, 0.8); for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-2, s * w); ctx.lineTo(-L * 0.8, s * (w + 7 + lvl)); ctx.lineTo(-L * 0.6, s * w); ctx.fill(); } }
      if (path === "B") rect(ctx, -L * 0.6, -2, L * 1.1, 4, rgba(pc, 0.6));
      // runway lights
      const n = lvl + 2;
      for (let i = 0; i < n; i++) {
        const on = Math.floor(time * 6 - i) % n === 0;
        circle(ctx, -L + 4 + i * ((2 * L - 8) / Math.max(1, n - 1)), 0, 1.3, on ? "#fff" : rgba(col, 0.6));
      }
      // engine glow
      glow(ctx, -L - 2, 0, 7, col, 0.6);
    },
  };

  OD.drawTower = function (ctx, t, x, y, ringAngle, time) {
    const def = OD.TOWERS[t.type], lvl = t.level, path = t.path;
    const c = def.color, pc = path ? def.paths[path].color : c;
    ctx.save();
    ctx.translate(x, y);
    hullRot = ringAngle; // hulls line up with the orbit
    if (lvl >= 4) glow(ctx, 0, 0, 34, pc, 0.22 + 0.08 * Math.sin(time * 2)); // fully upgraded: a halo in the path colour
    ctx.save(); ctx.rotate(ringAngle);
    if (t.type !== "carrier" && t.type !== "silo" && t.type !== "mines") panels(ctx, lvl, pc);
    if (t.type === "miner" || t.type === "carrier") ART[t.type](ctx, lvl, path, c, pc, time, t);
    ctx.restore();
    if (t.type !== "miner" && t.type !== "carrier") {
      if (t.aim == null) t.aim = ringAngle;
      ART[t.type](ctx, lvl, path, c, pc, time, t);
    }
    ctx.restore();
    // tier pips (gold for shared tiers, path colour for specialised) on a dark backing
    ctx.fillStyle = "rgba(4,6,16,0.7)"; ctx.fillRect(x - 13.5, y + 17.8, (lvl + 1) * 5 + 1.5, 5.4);
    for (let i = 0; i <= lvl; i++) {
      ctx.fillStyle = i >= 3 ? pc : "#ffd166";
      ctx.fillRect(x - 12 + i * 5, y + 19, 3.5, 3);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(x - 12 + i * 5, y + 19, 3.5, 1);
    }
  };

  OD.drawCraft = function (ctx, f, t, time) {
    const def = OD.TOWERS.carrier, col = t.path ? def.paths[t.path].color : def.color;
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.angle);
    if (f.bomber) {
      ctx.fillStyle = "#3a1a28"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -8); ctx.lineTo(-3, 0); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
    }
    glow(ctx, f.bomber ? -5 : -4, 0, 4, "#ffd0f0", 0.8);
    ctx.restore();
  };

  // ---------- enemies ----------
  // Layered hulls: a dark outline (readable on any background), a lit hull gradient, plating, a glowing cockpit and
  // engine flames. Shapes keep the same size and heading as before (sizes are the collision sizes).
  function hull(ctx, key, s, col, hit) { // fill style for a hull: lit from the top of the ship (local -y)
    if (hit) return "#ffffff";
    return grad(ctx, "e" + key + col + s, () => { const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.55)); return g; });
  }
  function outline(ctx, w = 2.2) { ctx.lineJoin = "round"; ctx.strokeStyle = "rgba(6,4,14,0.85)"; ctx.lineWidth = w; ctx.stroke(); }
  function engine(ctx, x, y, r, color, time, seed = 0) { // flickering exhaust behind the ship (local -x)
    if (!OD.fx2d) return;
    const f = 0.8 + 0.2 * Math.sin(time * 37 + seed * 11), ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.85 * ga; ctx.drawImage(OD.fx2d.sprite(color), x - r * 3.2 * f, y - r * 0.8, r * 3.4 * f, r * 1.6);
    ctx.globalAlpha = ga; ctx.drawImage(OD.fx2d.sprite("#fff2d6", "core"), x - r * 0.8, y - r * 0.6, r * 1.2, r * 1.2);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  function light(ctx, x, y, r, color, a = 0.9) { // a small glowing light (cockpit, eye, running light)
    if (!OD.fx2d) { circle(ctx, x, y, r * 0.5, color); return; }
    const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter"; OD.fx2d.glow(ctx, x, y, r, color, a * ga, "core");
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }
  function bubble(ctx, s, e, rgb, time) { // energy shield: tinted bubble, bright rim, ripple when hit
    const k = e.shield / e.maxShield, since = (OD.fx2d ? OD.fx2d.now : 0) - (e.shieldHitAt || -9);
    ctx.fillStyle = `rgba(${rgb},${0.05 + 0.07 * k})`; ctx.strokeStyle = `rgba(${rgb},${0.3 + 0.5 * k})`; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${0.25 * k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, s - 2.5, -2.4, -1.2); ctx.stroke();
    if (since >= 0 && since < 0.35) { const q = since / 0.35; ctx.strokeStyle = `rgba(255,255,255,${0.9 * (1 - q)})`; ctx.lineWidth = 2.5 * (1 - q) + 0.5; ctx.beginPath(); ctx.arc(0, 0, s * (0.75 + q * 0.4), 0, TAU); ctx.stroke(); }
  }
  OD.drawEnemy = function (ctx, e, time, cx, cy) {
    const d = e.def, s = d.size;
    const hit = e.hit > 0, col = e.frozen > 0 ? "#cdf6ff" : d.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    const heading = Math.atan2(cy - e.y, cx - e.x) + e.dir * (d.spiral * 1.1);
    if (e.cloaked) ctx.globalAlpha = 0.18 + 0.08 * Math.sin(time * 20 + e.seed); // Phase Wraith out of phase
    const seed = e.seed || 0;
    switch (e.type) {
      case "brute": { // Juggernaut: armored ram, layered plates, furnace grille
        ctx.rotate(heading);
        engine(ctx, -s * 0.95, -s * 0.38, s * 0.32, "#ff7a3c", time, seed); engine(ctx, -s * 0.95, s * 0.38, s * 0.32, "#ff7a3c", time, seed + 1);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 0.4, -s * 0.8); ctx.lineTo(-s, -s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.lineTo(s * 0.4, s * 0.8); ctx.closePath();
        outline(ctx, 3); ctx.fillStyle = hull(ctx, "brute", s, col, hit); ctx.fill();
        ctx.fillStyle = "#3d2f2a"; // armour plates
        ctx.beginPath(); ctx.moveTo(s * 0.55, -s * 0.62); ctx.lineTo(-s * 0.85, -s * 0.58); ctx.lineTo(-s * 0.85, -s * 0.3); ctx.lineTo(s * 0.35, -s * 0.36); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(s * 0.55, s * 0.62); ctx.lineTo(-s * 0.85, s * 0.58); ctx.lineTo(-s * 0.85, s * 0.3); ctx.lineTo(s * 0.35, s * 0.36); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,210,170,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s * 0.5, -s * 0.6); ctx.lineTo(-s * 0.8, -s * 0.56); ctx.stroke();
        for (let i = 0; i < 3; i++) rect(ctx, s * 0.2 - i * s * 0.22, -s * 0.3, s * 0.08, s * 0.6, "#ffe0b0");
        light(ctx, s * 0.05, 0, s * 0.55, "#ff9a3c", 0.55);
        break;
      }
      case "phantom": { // Phase Wraith: crescent blade with a ghost trail
        ctx.rotate(heading);
        if (!hit) light(ctx, -s * 0.9, 0, s * 0.9, col, 0.25);
        ctx.beginPath(); ctx.arc(0, 0, s, -1.2, 1.2); ctx.arc(-s * 0.35, 0, s * 0.8, 1.0, -1.0, true); ctx.closePath();
        outline(ctx); ctx.fillStyle = hull(ctx, "phantom", s, col, hit); ctx.fill();
        ctx.strokeStyle = "rgba(230,255,250,0.7)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, s - 1.5, -1.0, 1.0); ctx.stroke();
        light(ctx, s * 0.3, 0, s * 0.55, "#ffffff", 0.9);
        break;
      }
      case "brood": { // Brood Hive: bloated organic sac, veins, pulsing eggs
        ctx.rotate(heading);
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.75, 0, 0, TAU);
        outline(ctx, 3); ctx.fillStyle = hit ? "#fff" : grad(ctx, "brood" + s, () => { const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s); g.addColorStop(0, "#8fb33a"); g.addColorStop(0.6, "#4f6a1c"); g.addColorStop(1, "#22300a"); return g; }); ctx.fill();
        ctx.strokeStyle = "rgba(200,255,90,0.35)"; ctx.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) { const a = i * 1.6 + 0.3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(Math.cos(a + 0.5) * s * 0.5, Math.sin(a + 0.5) * s * 0.4, Math.cos(a) * s * 0.9, Math.sin(a) * s * 0.68); ctx.stroke(); }
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4, r = s * (0.18 + 0.04 * Math.sin(time * 5 + i)); const x = Math.cos(a) * s * 0.45, y = Math.sin(a) * s * 0.35; circle(ctx, x, y, r, hit ? "#fff" : col); light(ctx, x, y, r * 1.8, col, 0.35); }
        light(ctx, s * 0.7, 0, s * 0.35, "#f4ffd0", 0.9);
        break;
      }
      case "aegis": { // Aegis Bastion: armoured fortress ring + heavy shield
        ctx.rotate(time * 0.8);
        poly(ctx, 8, s, 0); outline(ctx, 3); ctx.fillStyle = hit ? "#fff" : grad(ctx, "aegis" + s, () => { const g = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s); g.addColorStop(0, "#5c7c9a"); g.addColorStop(1, "#162434"); return g; }); ctx.fill();
        ctx.strokeStyle = "rgba(190,240,255,0.35)"; ctx.lineWidth = 1; poly(ctx, 8, s * 0.72, 0); ctx.stroke();
        circle(ctx, 0, 0, s * 0.5, hull(ctx, "aegisC", s * 0.5, col, hit)); light(ctx, 0, 0, s * 0.45, col, 0.6);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; light(ctx, Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8, s * 0.22, "#bff6ff", 0.9); }
        if (e.shield > 0) bubble(ctx, s + 9, e, "140,250,255", time);
        break;
      }
      case "titan": { // Void Titan: violet world-breaker with a dark aura, spines, a burning eye
        ctx.rotate(heading);
        if (!hit) light(ctx, 0, 0, s * 2, "#7a2cff", 0.22 + 0.06 * Math.sin(time * 2));
        engine(ctx, -s * 0.95, -s * 0.45, s * 0.3, "#c58cff", time, seed); engine(ctx, -s, 0, s * 0.38, "#c58cff", time, seed + 2); engine(ctx, -s * 0.95, s * 0.45, s * 0.3, "#c58cff", time, seed + 3);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 0.2, -s * 0.9); ctx.lineTo(-s * 0.9, -s * 0.8); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.9, s * 0.8); ctx.lineTo(s * 0.2, s * 0.9); ctx.closePath();
        outline(ctx, 4); ctx.fillStyle = hit ? "#fff" : grad(ctx, "titan" + s, () => { const g = ctx.createLinearGradient(0, -s, 0, s); g.addColorStop(0, "#6a46a0"); g.addColorStop(0.5, "#33204e"); g.addColorStop(1, "#140a24"); return g; }); ctx.fill();
        ctx.fillStyle = "#1c1030"; // spines
        for (const sy of [-1, 1]) for (let i = 0; i < 4; i++) { const x0 = s * (0.1 - i * 0.25); ctx.beginPath(); ctx.moveTo(x0, sy * s * 0.75); ctx.lineTo(x0 - s * 0.2, sy * s * 1.05); ctx.lineTo(x0 - s * 0.16, sy * s * 0.72); ctx.fill(); }
        ctx.strokeStyle = "rgba(200,160,255,0.4)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(s * 0.8, 0); ctx.lineTo(-s * 0.85, -s * 0.55); ctx.moveTo(s * 0.8, 0); ctx.lineTo(-s * 0.85, s * 0.55); ctx.stroke();
        rect(ctx, -s * 0.8, -s * 0.06, s * 1.5, s * 0.12, hit ? "#fff" : col);
        light(ctx, s * 0.35, 0, s * 0.45, col, 0.9); circle(ctx, s * 0.35, 0, s * 0.11, "#fff");
        if (e.shield > 0) bubble(ctx, s + 10, e, "200,150,255", time);
        break;
      }
      case "asteroid": case "rock": { // tumbling rock, lit from one side, with craters
        ctx.rotate(e.spin * 0.4);
        ctx.beginPath();
        for (let i = 0; i < 9; i++) { const a = i / 9 * TAU, rr = s * (0.75 + 0.25 * Math.sin(i * 3.7 + seed)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); outline(ctx, 2);
        ctx.fillStyle = hit ? "#fff" : grad(ctx, "rock" + col + s, () => { const g = ctx.createRadialGradient(-s * 0.35, -s * 0.35, s * 0.1, 0, 0, s); g.addColorStop(0, shade(col, 0.3)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.6)); return g; }); ctx.fill();
        circle(ctx, s * 0.3, -s * 0.2, s * 0.25, "rgba(0,0,0,0.28)"); circle(ctx, -s * 0.3, s * 0.3, s * 0.15, "rgba(0,0,0,0.22)"); circle(ctx, -s * 0.15, -s * 0.4, s * 0.1, "rgba(0,0,0,0.2)");
        ctx.strokeStyle = "rgba(255,240,220,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(s * 0.3, -s * 0.2, s * 0.25, 2.2, 3.9); ctx.stroke();
        break;
      }
      case "comet": { // icy head with a glowing, flickering tail
        ctx.rotate(heading);
        if (OD.fx2d) { const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha; ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.8 * ga; ctx.drawImage(OD.fx2d.sprite("#7cc4ff"), -s * 5, -s * 1.1, s * 5.5, s * 2.2); ctx.globalAlpha = 0.6 * ga; ctx.drawImage(OD.fx2d.sprite("#dff2ff"), -s * 3, -s * 0.5, s * 3.2, s); ctx.globalCompositeOperation = op; ctx.globalAlpha = ga; }
        circle(ctx, 0, 0, s, hit ? "#fff" : grad(ctx, "comet" + s, () => { const g = ctx.createRadialGradient(s * 0.3, -s * 0.3, s * 0.1, 0, 0, s); g.addColorStop(0, "#ffffff"); g.addColorStop(0.6, col); g.addColorStop(1, "#3a7cc0"); return g; }));
        light(ctx, 0, 0, s * 1.6, col, 0.5);
        break;
      }
      case "swarm": { // Swarmer: a dart with a hot core
        ctx.rotate(heading);
        engine(ctx, -s * 0.8, 0, s * 0.45, "#ff6b8b", time, seed);
        ctx.beginPath(); ctx.moveTo(s * 1.1, 0); ctx.lineTo(0, -s * 0.75); ctx.lineTo(-s, 0); ctx.lineTo(0, s * 0.75); ctx.closePath();
        outline(ctx, 1.8); ctx.fillStyle = hull(ctx, "swarm", s, col, hit); ctx.fill();
        light(ctx, s * 0.15, 0, s * 0.7, "#ffe1ea", 0.9);
        break;
      }
      case "cruiser": { // Shield Cruiser: armoured hexagon, bridge, twin engines, shield bubble
        ctx.rotate(heading);
        engine(ctx, -s * 0.85, -s * 0.4, s * 0.3, "#7fb4ff", time, seed); engine(ctx, -s * 0.85, s * 0.4, s * 0.3, "#7fb4ff", time, seed + 1);
        poly(ctx, 6, s, 0); outline(ctx, 2.6); ctx.fillStyle = hull(ctx, "cruiser", s, col, hit); ctx.fill();
        ctx.fillStyle = "rgba(10,20,50,0.45)"; poly(ctx, 6, s * 0.62, 0); ctx.fill(); // inner armour plate
        ctx.strokeStyle = "rgba(200,225,255,0.4)"; ctx.lineWidth = 1; poly(ctx, 6, s * 0.62, 0); ctx.stroke();
        metal(ctx, -s * 0.2, -s * 0.22, s * 0.95, s * 0.44, hit ? "#fff" : "#c8dcff"); // bridge
        light(ctx, s * 0.62, 0, s * 0.3, "#e8f4ff", 0.9);
        if (e.shield > 0) bubble(ctx, s + 6, e, "140,195,255", time);
        break;
      }
      case "mother": { // Mothership: saucer with a glass dome, rim lights and an underglow
        ctx.rotate(e.spin * 0.3);
        if (!hit) light(ctx, 0, 0, s * 1.5, col, 0.22);
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU);
        outline(ctx, 3); ctx.fillStyle = hit ? "#fff" : grad(ctx, "mother" + col + s, () => { const g = ctx.createLinearGradient(0, -s * 0.45, 0, s * 0.45); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.6)); return g; }); ctx.fill();
        ctx.strokeStyle = "rgba(40,0,40,0.5)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.72, s * 0.3, 0, 0, TAU); ctx.stroke();
        circle(ctx, 0, 0, s * 0.35, hit ? "#fff" : grad(ctx, "dome" + s, () => { const g = ctx.createRadialGradient(-s * 0.12, -s * 0.12, 1, 0, 0, s * 0.35); g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#ffd1fb"); g.addColorStop(1, "#a03aa0"); return g; }), "rgba(255,255,255,0.6)", 1);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + time * 3; light(ctx, Math.cos(a) * s * 0.75, Math.sin(a) * s * 0.33, 4, i % 2 ? "#ffffff" : "#ffd1fb", 0.95); }
        break;
      }
      case "dread": { // Dreadnought: layered warship, armour, turret lights, a bank of engines
        ctx.rotate(heading);
        if (!hit) light(ctx, 0, 0, s * 1.6, "#ff2d55", 0.16 + 0.05 * Math.sin(time * 3));
        for (const y of [-0.42, -0.14, 0.14, 0.42]) engine(ctx, -s * 0.98, y * s, s * 0.17, "#ff9a3c", time, seed + y * 7);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s, s * 0.3); ctx.lineTo(-s * 0.6, s * 0.7); ctx.closePath();
        outline(ctx, 3.5); ctx.fillStyle = hull(ctx, "dread", s, col, hit); ctx.fill();
        ctx.fillStyle = "rgba(40,0,12,0.55)"; // armour plates
        for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.6, sy * s * 0.08); ctx.lineTo(-s * 0.55, sy * s * 0.58); ctx.lineTo(-s * 0.85, sy * s * 0.3); ctx.lineTo(-s * 0.3, sy * s * 0.14); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = "rgba(255,190,200,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s * 0.95, 0); ctx.lineTo(-s * 0.6, -s * 0.66); ctx.stroke();
        rect(ctx, -s * 0.5, -s * 0.12, s * 1.1, s * 0.24, "#3a0010");
        for (let i = 0; i < 5; i++) light(ctx, -s * 0.4 + i * s * 0.25, 0, 5, (Math.floor(time * 4) + i) % 2 ? "#ffffff" : "#ff8fa3", 0.95);
        for (const [x, y] of [[0.1, -0.42], [0.1, 0.42], [-0.35, -0.5], [-0.35, 0.5]]) { circle(ctx, x * s, y * s, s * 0.07, "#2a0a12", "rgba(255,150,170,0.6)", 1); }
        if (e.shield > 0) bubble(ctx, s + 8, e, "255,120,160", time);
        break;
      }
      default: { // Drone: swept arrowhead, spine, cockpit, engine
        ctx.rotate(heading);
        engine(ctx, -s * 0.45, 0, s * 0.4, "#ff6b8b", time, seed);
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.75); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s * 0.8, s * 0.75); ctx.closePath();
        outline(ctx, 2); ctx.fillStyle = hull(ctx, "drone", s, col, hit); ctx.fill();
        ctx.fillStyle = hit ? "#fff" : shade(col, -0.45); ctx.beginPath(); ctx.moveTo(s * 0.7, 0); ctx.lineTo(-s * 0.35, -s * 0.18); ctx.lineTo(-s * 0.35, s * 0.18); ctx.closePath(); ctx.fill(); // spine
        light(ctx, s * 0.3, 0, s * 0.45, "#ffe3ea", 0.9);
      }
    }
    ctx.restore();
    if (e.cloaked) return;
    if (e.frozen > 0) circle(ctx, e.x, e.y, s + 3, "rgba(170,235,255,0.25)", "rgba(220,250,255,0.8)", 1);
    else if (e.stun > 0) {
      ctx.strokeStyle = "rgba(255,240,120,0.9)"; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + time * 10; ctx.lineTo(e.x + Math.cos(a) * (s + 4 + (i % 2) * 3), e.y + Math.sin(a) * (s + 4 + (i % 2) * 3)); }
      ctx.closePath(); ctx.stroke();
    } else if (e.slow < 1) circle(ctx, e.x, e.y, s + 4, null, "rgba(179,136,255,0.8)", 1.5);
    if (e.burn && e.burn.t > 0 && Math.random() < 0.5) circle(ctx, e.x + (Math.random() - 0.5) * s, e.y + (Math.random() - 0.5) * s, 2, "#ff9a3c");
    // health + shield bars
    if (e.hp < e.maxHp || (e.maxShield && e.shield < e.maxShield)) {
      const w = Math.max(18, s * 2), y = e.y - s - (e.maxShield ? 13 : 9);
      rect(ctx, e.x - w / 2 - 1, y - 1, w + 2, (e.maxShield ? 9 : 4) + 2, "rgba(4,6,16,0.8)"); // framed backing
      rect(ctx, e.x - w / 2, y, w, 4, "rgba(255,255,255,0.08)");
      rect(ctx, e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4, e.hp / e.maxHp > 0.4 ? "#7dff9a" : "#ff5c7a");
      if (e.maxShield) {
        rect(ctx, e.x - w / 2, y + 5, w, 3, "rgba(0,0,0,0.6)");
        rect(ctx, e.x - w / 2, y + 5, w * Math.max(0, e.shield / e.maxShield), 3, "#8cc8ff");
      }
    }
  };
})(window.OD);
