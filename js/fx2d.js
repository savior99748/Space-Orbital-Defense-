// 2D combat effects: cached glow sprites, per-weapon beams and projectiles, explosions, sparks, shield ripples.
// Purely visual. It reads the game's beams / shots / rings / particles and draws them; the only state it keeps is
// its own short-lived list of kill flashes and debris (never saved, never read by gameplay). It uses its own random
// numbers, so the game's random sequence is unchanged. Graphics: Low draws fewer, simpler effects.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const TAU = Math.PI * 2;
  const FX = (OD.fx2d = { now: 0 });
  const low = () => OD.gfx === "low";
  FX.low = low;

  // own random numbers (keeps Math.random's sequence exactly as the game uses it)
  let seed = 0x9e3779b9;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };

  // ---------- cached sprites ----------
  // Every glow is one small pre-rendered image stamped with drawImage: far cheaper than a gradient per frame.
  const sprites = new Map();
  function sprite(color, kind = "glow") {
    const key = kind + color;
    let c = sprites.get(key);
    if (c) return c;
    const N = kind === "streak" ? 32 : 64;
    c = document.createElement("canvas"); c.width = N; c.height = N;
    const g = c.getContext("2d"), h = N / 2;
    g.fillStyle = color; g.fillRect(0, 0, N, N); // any CSS colour works: paint it, then cut an alpha mask
    g.globalCompositeOperation = "destination-in";
    const m = g.createRadialGradient(h, h, 0, h, h, h);
    if (kind === "core") { m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.25, "rgba(0,0,0,0.9)"); m.addColorStop(0.6, "rgba(0,0,0,0.25)"); m.addColorStop(1, "rgba(0,0,0,0)"); }
    else { m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.3, "rgba(0,0,0,0.45)"); m.addColorStop(0.65, "rgba(0,0,0,0.12)"); m.addColorStop(1, "rgba(0,0,0,0)"); }
    g.fillStyle = m; g.fillRect(0, 0, N, N);
    if (kind === "core") { // white-hot centre
      g.globalCompositeOperation = "lighter";
      const w = g.createRadialGradient(h, h, 0, h, h, h * 0.35);
      w.addColorStop(0, "rgba(255,255,255,0.95)"); w.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = w; g.fillRect(0, 0, N, N);
    }
    sprites.set(key, c);
    return c;
  }
  FX.sprite = sprite;
  // a soft glow of radius r (call with globalCompositeOperation "lighter" for light, "source-over" for haze)
  function glow(ctx, x, y, r, color, a = 1, kind) {
    if (a <= 0.01 || r <= 0.2) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(sprite(color, kind), x - r, y - r, r * 2, r * 2);
  }
  FX.glow = glow;

  // ---------- beams ----------
  // b.fx (cosmetic tag from the shooter): laser, lance, prism, rail, railB, bolt, arc, fighter
  const pts = new Float32Array(32);
  FX.beam = function (ctx, b) {
    const a = Math.min(1, b.life * 10), kind = b.fx || (b.bolt ? "bolt" : "laser");
    // jagged bolts: the same Math.random calls as before, computed once and reused for every layer
    let n = 2; pts[0] = b.x1; pts[1] = b.y1;
    if (b.bolt) {
      for (let i = 1; i < 6; i++) { pts[n++] = b.x1 + (b.x2 - b.x1) * i / 6 + (Math.random() - 0.5) * 14; pts[n++] = b.y1 + (b.y2 - b.y1) * i / 6 + (Math.random() - 0.5) * 14; }
    }
    pts[n++] = b.x2; pts[n++] = b.y2;
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < n; i += 2) ctx.lineTo(pts[i], pts[i + 1]); };
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const w = b.w, wide = kind === "rail" ? 3.4 : kind === "lance" ? 3 : 2.6;
    if (!low()) { // soft outer glow
      ctx.globalAlpha = a * (kind === "rail" ? 0.22 : 0.16); ctx.strokeStyle = b.color; ctx.lineWidth = w * wide + 3; path(); ctx.stroke();
    }
    ctx.globalAlpha = a * 0.85; ctx.strokeStyle = b.color; ctx.lineWidth = Math.max(1, w); path(); ctx.stroke();
    if (b.core || kind === "laser" || kind === "rail" || kind === "lance" || kind === "prism") { // white-hot core
      ctx.globalAlpha = a * 0.95; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = Math.max(0.8, w * 0.38); path(); ctx.stroke();
    }
    if (low()) { ctx.globalAlpha = 1; return; }
    // impact + muzzle flashes
    const hit = kind === "rail" ? w * 4.5 + 6 : kind === "lance" ? w * 3.5 + 6 : kind === "arc" || kind === "bolt" ? 9 : w * 3 + 5;
    glow(ctx, b.x2, b.y2, hit, b.color, a * 0.9, "core");
    if (kind === "rail" || kind === "lance") glow(ctx, b.x1, b.y1, hit * 0.6, b.color, a * 0.7, "core");
    if (kind === "rail" && b.life > 0.12) { // directional splash past the target
      const ang = Math.atan2(b.y2 - b.y1, b.x2 - b.x1);
      ctx.save(); ctx.translate(b.x2, b.y2); ctx.rotate(ang); ctx.globalAlpha = a * 0.7;
      ctx.drawImage(sprite(b.color), 0, -w * 1.6, w * 9 + 12, w * 3.2); ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  // ---------- projectiles ----------
  const MISSILE = "#ffb347", NOVA = "#ff5c5c";
  FX.shot = function (ctx, m, time) {
    if (m.kind === "bomblet") { glow(ctx, m.x, m.y, 6, "#ffd166", 0.9, "core"); return; }
    const ang = Math.atan2(m.vy, m.vx), nova = !!m.nova, s = nova ? 1.5 : 1;
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(ang);
    if (!low()) { // exhaust plume, flickering
      const L = (14 + 4 * Math.sin(time * 40 + m.x)) * s;
      ctx.globalAlpha = 0.9; ctx.drawImage(sprite(nova ? NOVA : MISSILE), -L - 3 * s, -3.5 * s, L, 7 * s);
      ctx.globalAlpha = 1; ctx.drawImage(sprite("#fff1c8", "core"), -7 * s, -3 * s, 6 * s, 6 * s);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.fillStyle = nova ? "#3b2026" : "#2b2f3c"; // hull
    ctx.beginPath(); ctx.moveTo(6 * s, 0); ctx.lineTo(2 * s, -2.2 * s); ctx.lineTo(-5 * s, -2.2 * s); ctx.lineTo(-5 * s, 2.2 * s); ctx.lineTo(2 * s, 2.2 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = nova ? NOVA : "#ff7a3c"; // nose cone + fins
    ctx.beginPath(); ctx.moveTo(6.5 * s, 0); ctx.lineTo(2.5 * s, -2.2 * s); ctx.lineTo(2.5 * s, 2.2 * s); ctx.fill();
    ctx.fillStyle = "#c9d2e6"; ctx.fillRect(-5 * s, -3.2 * s, 2.2 * s, 6.4 * s);
    ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(-4 * s, -2 * s, 6 * s, 0.9 * s); // highlight
    ctx.globalCompositeOperation = "lighter";
    if (nova) glow(ctx, 0, 0, 10, NOVA, 0.35 + 0.25 * Math.sin(time * 18));
    ctx.restore();
  };

  // ---------- rings (blasts, pulses) ----------
  // r.fx: emp, push (tractor pull), freeze; anything else is a blast
  FX.ring = function (ctx, r) {
    const k = 1 - r.life / r.max, a = 1 - k;
    const rad = Math.max(1, r.r * (r.inward ? 1 - k * 0.8 : 0.3 + k * 0.7));
    if (!r.fx && !r.inward && !low() && k < 0.35) glow(ctx, r.x, r.y, r.r * (0.5 + k), r.color, (0.35 - k) * 2.2, "core"); // blast flash
    if (r.fx === "emp" && !low()) { // crackling electric edge
      ctx.globalAlpha = a; ctx.strokeStyle = r.color; ctx.lineWidth = 2;
      ctx.beginPath();
      const segs = 36;
      for (let i = 0; i <= segs; i++) { const t = i / segs * TAU, j = rad * (1 + (rnd() - 0.5) * 0.07); i ? ctx.lineTo(r.x + Math.cos(t) * j, r.y + Math.sin(t) * j) : ctx.moveTo(r.x + Math.cos(t) * j, r.y + Math.sin(t) * j); }
      ctx.stroke();
      ctx.globalAlpha = a * 0.25; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; return;
    }
    if (!low()) { ctx.globalAlpha = a * 0.22; ctx.strokeStyle = r.color; ctx.lineWidth = 8 * a + 3; ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = a; ctx.strokeStyle = r.color; ctx.lineWidth = 2.5 * a + 0.8;
    ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    if (r.fx === "push" || r.fx === "freeze") { // second ripple for fields
      const k2 = (k + 0.5) % 1, rad2 = r.r * (r.inward ? 1 - k2 * 0.8 : 0.3 + k2 * 0.7);
      ctx.globalAlpha = (1 - k2) * 0.5; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(r.x, r.y, rad2, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // ---------- sparks (the game's particles) ----------
  FX.particles = function (ctx, list) {
    const lo = low();
    for (const p of list) {
      const k = Math.max(0, p.life / p.max);
      if (k <= 0) continue;
      if (lo) { ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); continue; }
      const sz = 1.8 + 3.2 * k;
      ctx.globalAlpha = k;
      ctx.drawImage(sprite(p.color, "core"), p.x - sz, p.y - sz, sz * 2, sz * 2);
      const sp = Math.abs(p.vx) + Math.abs(p.vy);
      if (sp > 40) { // motion streak
        ctx.globalAlpha = k * 0.55; ctx.strokeStyle = p.color; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };

  // ---------- kill bursts (render-only: a flash, a shockwave and a few hull shards) ----------
  const kills = [];
  FX.reset = () => { kills.length = 0; known.clear(); lastSlot.clear(); lastPos.clear(); flights.clear(); fresh = true; };

  // ---------- launches and orbit changes (drawing only: the satellite's real position is untouched) ----------
  // A new satellite lifts off its planet or moon and climbs to its orbit on an arc, engine blazing; one that changes
  // orbit flies across. Satellites already there when a game starts or resumes don't launch.
  const known = new Set(), lastSlot = new Map(), lastPos = new Map(), flights = new Map();
  let fresh = true;
  const LAUNCH = 0.9, MOVE = 0.8, ease = k => 1 - (1 - k) ** 3;
  FX.flight = function (ctx, t, p, body, ground) {
    const now = performance.now() / 1000;
    if (!known.has(t.id)) {
      known.add(t.id); lastSlot.set(t.id, t.slot);
      if (!fresh && !ground && body) flights.set(t.id, { t0: now, launch: true });
    } else if (lastSlot.get(t.id) !== t.slot) {
      const from = lastPos.get(t.id);
      lastSlot.set(t.id, t.slot);
      if (from) flights.set(t.id, { t0: now, launch: false, fx: from.x, fy: from.y });
    }
    const f = flights.get(t.id);
    let out = p;
    if (f) {
      const k = (now - f.t0) / (f.launch ? LAUNCH : MOVE);
      if (k >= 1 || k < 0) flights.delete(t.id);
      else {
        const pos = k2 => { // position along the flight at progress k2
          const e = ease(Math.max(0, k2));
          let fx, fy;
          if (f.launch) { const dx = p.x - body.x, dy = p.y - body.y, d = Math.hypot(dx, dy) || 1; fx = body.x + dx / d * body.r * 0.95; fy = body.y + dy / d * body.r * 0.95; }
          else { fx = f.fx; fy = f.fy; }
          const x = fx + (p.x - fx) * e, y = fy + (p.y - fy) * e, dx = p.x - fx, dy = p.y - fy, L = Math.hypot(dx, dy) || 1, bulge = Math.sin(Math.max(0, k2) * Math.PI) * Math.min(L * 0.3, (body ? body.r : 20) * 0.5);
          return { x: x - dy / L * bulge, y: y + dx / L * bulge };
        };
        const q = pos(k);
        out = { x: q.x, y: q.y, a: p.a, sc: f.launch ? 0.4 + 0.6 * ease(k) : 1 };
        ctx.globalCompositeOperation = "lighter"; // exhaust trail + engine
        for (let j = 6; j >= 1; j--) { const r = pos(k - j * 0.045); glow(ctx, r.x, r.y, (9 - j) * (low() ? 0.8 : 1.1), j < 3 ? "#ffb070" : "#9aa8c8", (1 - j / 7) * (1 - k * 0.6)); }
        glow(ctx, q.x, q.y, 16, "#ffd08a", 1 - k * 0.5, "core");
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
    }
    lastPos.set(t.id, out);
    return out;
  };
  FX.settle = towers => { if (fresh) { for (const t of towers) { known.add(t.id); lastSlot.set(t.id, t.slot); } fresh = false; } };
  FX.kill = function (x, y, color, size, big, time) {
    if (kills.length > (low() ? 20 : 70)) kills.shift();
    const shards = [];
    const n = low() ? 0 : big ? 10 : 4;
    for (let i = 0; i < n; i++) { const a = rnd() * TAU, v = (big ? 70 : 45) * (0.5 + rnd()); shards.push({ a, v, spin: (rnd() - 0.5) * 12, s: size * (0.18 + rnd() * 0.22) }); }
    kills.push({ x, y, color, size, big, t0: time, life: big ? 1.1 : 0.45, shards });
  };
  FX.drawKills = function (ctx, time) {
    for (let i = kills.length - 1; i >= 0; i--) {
      const q = kills[i], age = time - q.t0;
      if (age < 0 || age > q.life) { if (age > q.life || age < -1) kills.splice(i, 1); continue; }
      const k = age / q.life, a = 1 - k;
      ctx.globalCompositeOperation = "lighter";
      glow(ctx, q.x, q.y, q.size * (2.2 + k * 2) * (q.big ? 1.6 : 1), q.color, a * a * 0.9, "core"); // flash
      if (k < 0.5) glow(ctx, q.x, q.y, q.size * 1.4, "#ffffff", (0.5 - k) * 1.6, "core");
      ctx.globalAlpha = a * 0.8; ctx.strokeStyle = q.color; ctx.lineWidth = q.big ? 3 : 1.6; // shockwave
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (1 + k * (q.big ? 5 : 2.6)), 0, TAU); ctx.stroke();
      if (q.shards.length) { // tumbling hull shards
        ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = q.color; ctx.globalAlpha = a;
        for (const s of q.shards) {
          const d = s.v * age, x = q.x + Math.cos(s.a) * d, y = q.y + Math.sin(s.a) * d;
          ctx.save(); ctx.translate(x, y); ctx.rotate(s.spin * age);
          ctx.beginPath(); ctx.moveTo(s.s, 0); ctx.lineTo(-s.s * 0.6, -s.s * 0.5); ctx.lineTo(-s.s * 0.4, s.s * 0.6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  };

  // ---------- mines ----------
  FX.mine = function (ctx, m, time, color) {
    if (m.fly > 0) { ctx.globalCompositeOperation = "lighter"; glow(ctx, m.x, m.y, 8, m.nuke ? "#ff4a4a" : color, 0.7, "core"); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; } // tossed into place
    const r = m.nuke ? 4.2 : 3.2, on = m.arm <= 0 && Math.sin(time * 8 + m.seed) > 0;
    ctx.fillStyle = "#1a1d26"; ctx.strokeStyle = m.nuke ? "#ff4a4a" : color; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(m.x, m.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.beginPath(); // spikes
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.4; ctx.moveTo(m.x + Math.cos(a) * r, m.y + Math.sin(a) * r); ctx.lineTo(m.x + Math.cos(a) * (r + 2.2), m.y + Math.sin(a) * (r + 2.2)); }
    ctx.stroke();
    if (on) { ctx.globalCompositeOperation = "lighter"; glow(ctx, m.x, m.y, low() ? 4 : 9, m.nuke ? "#ff4a4a" : color, 0.95, "core"); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
  };
})(window.OD);
