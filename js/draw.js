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
  function glow(ctx, x, y, r, color, a = 0.5) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(color, a)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
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

  // Solar panels along the orbit (local frame: +x points away from the planet).
  function panels(ctx, lvl, accent) {
    const len = 10 + lvl * 2.5, w = 6 + (lvl >= 3 ? 2 : 0);
    const cell = lvl >= 3 ? accent : "#3c5bb8";
    for (const s of [-1, 1]) {
      const y0 = s > 0 ? 9 : -9 - len;
      rect(ctx, -w / 2 - 1, s > 0 ? 6 : -9, w + 2, 3, "#2a3366"); // strut
      rect(ctx, -w / 2, y0, w, len, "#1d2550");
      ctx.fillStyle = cell;
      const cells = 2 + Math.floor(lvl / 2);
      const ch = (len - (cells + 1)) / cells;
      for (let i = 0; i < cells; i++) ctx.fillRect(-w / 2 + 1, y0 + 1 + i * (ch + 1), w - 2, ch);
      if (lvl >= 2) { // second, angled wing pair
        ctx.save(); ctx.rotate(s * 0.5);
        rect(ctx, -w / 2 - 6, s > 0 ? 9 : -9 - len * 0.6, w * 0.6, len * 0.6, rgba(cell === "#3c5bb8" ? "#3c5bb8" : accent, 0.7));
        ctx.restore();
      }
    }
  }

  function body(ctx, r, color, fill = "#121633") { circle(ctx, 0, 0, r, fill, color, 2); }

  // ---------- satellites ----------
  const ART = {
    laser(ctx, lvl, path, c, pc, time, t) {
      body(ctx, 9 + lvl * 0.8, lvl >= 3 ? pc : c);
      ctx.rotate(t.aim);
      if (lvl === 0) { rect(ctx, 0, -2, 14, 4, c); return; }
      if (path === "B") { // Solar Lance: one long superheated barrel
        const L = lvl >= 4 ? 30 : 25;
        const g = ctx.createLinearGradient(0, 0, L, 0);
        g.addColorStop(0, c); g.addColorStop(0.6, pc); g.addColorStop(1, "#fff6d0");
        rect(ctx, 0, -3.5, L, 7, g);
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
      rect(ctx, 0, -5.5, L, 3, c); rect(ctx, 0, 2.5, L, 3, c);
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
        body(ctx, 10, pc);
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
      else body(ctx, 9 + lvl, c);
      ctx.rotate(t.aim);
      const tubes = lvl === 0 ? [0] : lvl === 1 ? [-4, 4] : [-6.5, -2, 2.5, 7];
      for (const y of tubes) {
        rect(ctx, 0, y - (lvl >= 2 ? 1.8 : 3), 13, lvl >= 2 ? 3.6 : 6, c);
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
      body(ctx, 9 + lvl, c);
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      for (let i = 0; i < lvl; i++) circle(ctx, 0, 0, 4 + i * 2.5, null, rgba(c, 0.5 + 0.2 * i), 1);
      circle(ctx, 0, 0, 3 + pulse * 1.5, c);
      if (lvl >= 2) { // emitter prongs
        ctx.save(); ctx.rotate(time * 0.8);
        for (let i = 0; i < 4; i++) { ctx.rotate(TAU / 4); rect(ctx, 11, -1.5, 5, 3, c); }
        ctx.restore();
      }
    },

    rail(ctx, lvl, path, c, pc, time, t) {
      body(ctx, 9 + lvl * 0.8, lvl >= 3 ? pc : c);
      ctx.rotate(t.aim);
      const kick = Math.max(0, (t.recoil || 0)) * 6;
      ctx.translate(-kick, 0);
      if (path === "B") { // rotary coil barrels
        const n = lvl >= 4 ? 5 : 3, spin = t.spin || 0;
        for (let i = 0; i < n; i++) {
          const a = spin + i * TAU / n, y = Math.sin(a) * 5, depth = Math.cos(a);
          rect(ctx, 0, y - 1.5, 20, 3, depth > 0 ? pc : rgba(pc, 0.5));
        }
        rect(ctx, 3, -6.5, 3, 13, "#1b4d3a"); rect(ctx, 14, -6.5, 3, 13, "#1b4d3a");
        return;
      }
      if (lvl === 0) { rect(ctx, 0, -2.5, 20, 5, c); return; }
      const L = path === "A" ? (lvl >= 4 ? 40 : 34) : lvl >= 2 ? 26 : 22;
      if (lvl === 1) { rect(ctx, 0, -2.5, L, 5, c); for (let i = 0; i < 3; i++) rect(ctx, 4 + i * 5, -5, 3, 10, "#2f6b42"); return; }
      // twin rails with a glowing gap
      const col = path === "A" ? pc : c;
      rect(ctx, 0, -5, L, 3, col); rect(ctx, 0, 2, L, 3, col);
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
    if (lvl >= 4) glow(ctx, 0, 0, 32, pc, 0.25 + 0.1 * Math.sin(time * 2));
    ctx.save(); ctx.rotate(ringAngle);
    if (t.type !== "carrier") panels(ctx, lvl, pc);
    if (t.type === "miner" || t.type === "carrier") ART[t.type](ctx, lvl, path, c, pc, time, t);
    ctx.restore();
    if (t.type !== "miner" && t.type !== "carrier") {
      if (t.aim == null) t.aim = ringAngle;
      ART[t.type](ctx, lvl, path, c, pc, time, t);
    }
    ctx.restore();
    // tier pips (gold for shared tiers, path colour for specialised)
    for (let i = 0; i <= lvl; i++) {
      ctx.fillStyle = i >= 3 ? pc : "#ffd166";
      ctx.fillRect(x - 12 + i * 5, y + 19, 3.5, 3);
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
  OD.drawEnemy = function (ctx, e, time, cx, cy) {
    const d = e.def, s = d.size;
    const col = e.hit > 0 ? "#ffffff" : e.frozen > 0 ? "#cdf6ff" : d.color;
    ctx.save();
    ctx.translate(e.x, e.y);
    const heading = Math.atan2(cy - e.y, cx - e.x) + e.dir * (d.spiral * 1.1);
    if (e.cloaked) ctx.globalAlpha = 0.18 + 0.08 * Math.sin(time * 20 + e.seed); // Phase Wraith out of phase
    switch (e.type) {
      case "brute": { // Juggernaut: armored ram with a furnace grille
        ctx.rotate(heading);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 0.4, -s * 0.8); ctx.lineTo(-s, -s * 0.7); ctx.lineTo(-s, s * 0.7); ctx.lineTo(s * 0.4, s * 0.8); ctx.closePath(); ctx.fill();
        rect(ctx, -s * 0.7, -s * 0.85, s * 1.2, s * 0.25, "#4a3a34"); rect(ctx, -s * 0.7, s * 0.6, s * 1.2, s * 0.25, "#4a3a34");
        for (let i = 0; i < 3; i++) rect(ctx, s * 0.2 - i * s * 0.22, -s * 0.35, s * 0.08, s * 0.7, "#ffe0b0");
        glow(ctx, -s, 0, s * 0.45, "#ff7a3c", 0.6);
        break;
      }
      case "phantom": { // Phase Wraith: crescent blade
        ctx.rotate(heading);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, s, -1.2, 1.2); ctx.arc(-s * 0.35, 0, s * 0.8, 1.0, -1.0, true); ctx.closePath(); ctx.fill();
        glow(ctx, s * 0.2, 0, s * 0.5, "#ffffff", 0.7);
        break;
      }
      case "brood": { // Brood Hive: bloated sac with pulsing eggs
        ctx.rotate(heading);
        ctx.fillStyle = "#5d7a24"; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.75, 0, 0, TAU); ctx.fill();
        for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + 0.4; circle(ctx, Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.35, s * (0.18 + 0.04 * Math.sin(time * 5 + i)), col); }
        circle(ctx, s * 0.7, 0, s * 0.18, "#f4ffd0");
        break;
      }
      case "aegis": { // Aegis Bastion: fortress ring + heavy shield
        ctx.rotate(time * 0.8);
        ctx.fillStyle = "#2c4258"; poly(ctx, 8, s, 0); ctx.fill();
        circle(ctx, 0, 0, s * 0.5, col);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; circle(ctx, Math.cos(a) * s * 0.8, Math.sin(a) * s * 0.8, s * 0.12, "#bff6ff"); }
        if (e.shield > 0) circle(ctx, 0, 0, s + 9, "rgba(74,240,255,0.1)", `rgba(140,250,255,${0.3 + 0.5 * e.shield / e.maxShield})`, 2.5);
        break;
      }
      case "titan": { // Void Titan: violet world-breaker
        ctx.rotate(heading);
        ctx.fillStyle = "#3a2450";
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s * 0.2, -s * 0.9); ctx.lineTo(-s * 0.9, -s * 0.8); ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.9, s * 0.8); ctx.lineTo(s * 0.2, s * 0.9); ctx.closePath(); ctx.fill();
        rect(ctx, -s * 0.8, -s * 0.06, s * 1.5, s * 0.12, col);
        circle(ctx, s * 0.35, 0, s * 0.2, col); circle(ctx, s * 0.4, 0, s * 0.08, "#fff");
        glow(ctx, -s, 0, s * 0.5, "#c58cff", 0.7);
        if (e.shield > 0) circle(ctx, 0, 0, s + 10, "rgba(157,77,255,0.08)", `rgba(200,150,255,${0.3 + 0.5 * e.shield / e.maxShield})`, 3);
        break;
      }
      case "asteroid": case "rock": {
        ctx.rotate(e.spin * 0.4);
        ctx.fillStyle = col; ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = i / 9 * TAU, rr = s * (0.75 + 0.25 * Math.sin(i * 3.7 + e.seed));
          i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath(); ctx.fill();
        circle(ctx, s * 0.3, -s * 0.2, s * 0.25, "rgba(0,0,0,0.25)");
        circle(ctx, -s * 0.3, s * 0.3, s * 0.15, "rgba(0,0,0,0.2)");
        break;
      }
      case "comet": {
        ctx.rotate(heading);
        const tail = ctx.createLinearGradient(-s * 4, 0, 0, 0);
        tail.addColorStop(0, "rgba(154,215,255,0)"); tail.addColorStop(1, "rgba(154,215,255,0.7)");
        ctx.fillStyle = tail;
        ctx.beginPath(); ctx.moveTo(-s * 4, -s * 0.6); ctx.lineTo(0, -s * 0.8); ctx.lineTo(0, s * 0.8); ctx.lineTo(-s * 4, s * 0.6); ctx.fill();
        circle(ctx, 0, 0, s, col);
        break;
      }
      case "swarm": {
        ctx.rotate(heading);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, -s * 0.7); ctx.lineTo(-s, 0); ctx.lineTo(0, s * 0.7); ctx.closePath(); ctx.fill();
        break;
      }
      case "cruiser": {
        ctx.rotate(heading);
        ctx.fillStyle = col; poly(ctx, 6, s, 0); ctx.fill();
        rect(ctx, -s * 0.2, -s * 0.25, s * 0.9, s * 0.5, "#c8dcff");
        if (e.shield > 0) {
          const a = 0.25 + 0.5 * (e.shield / e.maxShield);
          circle(ctx, 0, 0, s + 6, `rgba(120,180,255,${a * 0.25})`, `rgba(160,210,255,${a})`, 1.5);
        }
        break;
      }
      case "mother": {
        ctx.rotate(e.spin * 0.3);
        ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45, 0, 0, TAU); ctx.fill();
        circle(ctx, 0, 0, s * 0.35, "#ffd1fb");
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + time * 3;
          rect(ctx, Math.cos(a) * s * 0.75 - 1.5, Math.sin(a) * s * 0.33 - 1.5, 3, 3, "#fff");
        }
        break;
      }
      case "dread": {
        ctx.rotate(heading);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.6, -s * 0.7); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s, s * 0.3); ctx.lineTo(-s * 0.6, s * 0.7); ctx.closePath(); ctx.fill();
        rect(ctx, -s * 0.5, -s * 0.12, s * 1.1, s * 0.24, "#3a0010");
        for (let i = 0; i < 5; i++) circle(ctx, -s * 0.4 + i * s * 0.25, 0, 2, (Math.floor(time * 4) + i) % 2 ? "#fff" : "#ff8fa3");
        glow(ctx, -s, 0, s * 0.5, "#ff9a3c", 0.6);
        if (e.shield > 0) circle(ctx, 0, 0, s + 8, "rgba(255,80,120,0.08)", `rgba(255,120,160,${0.3 + 0.5 * e.shield / e.maxShield})`, 2);
        break;
      }
      default: { // drone
        ctx.rotate(heading);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.8, -s * 0.75); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s * 0.8, s * 0.75); ctx.closePath(); ctx.fill();
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
      rect(ctx, e.x - w / 2, y, w, 4, "rgba(0,0,0,0.6)");
      rect(ctx, e.x - w / 2, y, w * Math.max(0, e.hp / e.maxHp), 4, e.hp / e.maxHp > 0.4 ? "#7dff9a" : "#ff5c7a");
      if (e.maxShield) {
        rect(ctx, e.x - w / 2, y + 5, w, 3, "rgba(0,0,0,0.6)");
        rect(ctx, e.x - w / 2, y + 5, w * Math.max(0, e.shield / e.maxShield), 3, "#8cc8ff");
      }
    }
  };
})(window.OD);
