// Procedural art for planets, moons and the Sun.
window.OD = window.OD || {};
(function (OD) {
  "use strict";
  const TAU = Math.PI * 2;

  // c: [highlight, mid, shadow] sphere colours. Other keys add surface details.
  const STYLE = {
    mercury:   { c: ["#e2ddd6", "#9b948d", "#3f3a36"], craters: 10 },
    venus:     { c: ["#fff4d2", "#e3c27a", "#7a5a22"], swirl: "rgba(255,240,200,0.45)" },
    earth:     { c: ["#8fdcff", "#2a6fd6", "#0b2559"], land: "rgba(80,190,110,0.75)", clouds: true },
    mars:      { c: ["#ffb592", "#c8552b", "#4e1708"], cap: true, craters: 5, dust: "rgba(120,40,15,0.35)" },
    jupiter:   { c: ["#f6e8cc", "#c9a27a", "#5a3d24"], bands: ["#efdcc0", "#b98a5e", "#f1e1c6", "#a5714a", "#e7cfa8", "#b3825a", "#efdcc0"], spot: "#c0563a" },
    saturn:    { c: ["#fbeec4", "#d8b872", "#6b5426"], bands: ["#f4e3b0", "#d6b674", "#efdba2", "#c9a865", "#f4e3b0"], rings: ["rgba(230,210,160,0.55)", "rgba(200,180,130,0.35)", "rgba(240,225,185,0.6)"] },
    uranus:    { c: ["#e3fdff", "#86dde4", "#2a6a73"], faintRing: true },
    neptune:   { c: ["#a8ccff", "#3a63d6", "#0f1f5e"], bands: ["#3a63d6", "#4a74e0", "#3558c4", "#4a74e0"], spot: "#18286e" },
    luna:      { c: ["#f2f2f2", "#a9a9a9", "#454545"], craters: 7 },
    phobos:    { c: ["#c9b29a", "#7d6650", "#2e241a"], craters: 4, lumpy: true },
    deimos:    { c: ["#d5c3ad", "#8e7a63", "#352b20"], craters: 3, lumpy: true },
    io:        { c: ["#fffaa8", "#e3c43a", "#6e4f0a"], volcano: true },
    europa:    { c: ["#fdf8ee", "#d9c7a8", "#6e604a"], cracks: true },
    ganymede:  { c: ["#ded6cb", "#8f8576", "#38322b"], craters: 6 },
    callisto:  { c: ["#bdb2a0", "#5f5548", "#211c16"], craters: 9 },
    titan:     { c: ["#ffdca8", "#d99a3e", "#5e3a0c"], haze: "rgba(255,190,90,0.35)" },
    enceladus: { c: ["#ffffff", "#e3edf6", "#7d93a8"], cracks: true },
    titania:   { c: ["#e6e0dc", "#9a908a", "#3b3532"], craters: 5 },
    oberon:    { c: ["#d8cbc4", "#8c7a70", "#352a25"], craters: 6 },
    miranda:   { c: ["#e8e8ec", "#9a9aa6", "#3b3b44"], cracks: true },
    triton:    { c: ["#fff0ea", "#d9b3aa", "#5e3f3a"], cap: true },
  };

  // deterministic pseudo-random numbers per style so craters don't jump around
  function rng(seed) {
    let h = 2166136261;
    for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
  }
  const featureCache = {};
  function features(style) {
    if (featureCache[style]) return featureCache[style];
    const r = rng(style), f = { craters: [], land: [], cracks: [], spots: [] };
    for (let i = 0; i < 12; i++) f.craters.push({ x: r() * 1.6 - 0.8, y: r() * 1.6 - 0.8, s: 0.08 + r() * 0.16 });
    for (let i = 0; i < 6; i++) f.land.push({ x: r() * 2 - 1, y: r() * 1.4 - 0.7, w: 0.2 + r() * 0.35, h: 0.12 + r() * 0.2, a: r() * 3 });
    for (let i = 0; i < 6; i++) f.cracks.push([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
    for (let i = 0; i < 5; i++) f.spots.push({ x: r() * 1.4 - 0.7, y: r() * 1.4 - 0.7, s: 0.08 + r() * 0.12, c: ["#ff8a2a", "#fff36b", "#b0451a", "#ffffff"][i % 4] });
    return (featureCache[style] = f);
  }

  // Saturn's rings and Uranus's faint ring are drawn behind the planet (top-down view = circles).
  OD.BODY_STYLE = STYLE; // shared with the 3D view
  OD.drawBodyRings = function (ctx, style, x, y, r) {
    const st = STYLE[style];
    if (!st) return;
    if (st.rings) {
      st.rings.forEach((c, i) => {
        ctx.strokeStyle = c; ctx.lineWidth = r * (0.22 - i * 0.03);
        ctx.beginPath(); ctx.arc(x, y, r * (1.5 + i * 0.25), 0, TAU); ctx.stroke();
      });
    }
    if (st.faintRing) {
      ctx.strokeStyle = "rgba(200,240,255,0.25)"; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.stroke();
    }
  };

  // lightX/lightY: unit vector pointing toward the light source.
  OD.drawBody = function (ctx, style, x, y, r, time, lightX = -0.7, lightY = -0.7) {
    if (style === "sun") return drawSun(ctx, x, y, r, time);
    const st = STYLE[style] || STYLE.luna, f = features(style);
    ctx.save();
    ctx.translate(x, y);
    // base sphere
    const g = ctx.createRadialGradient(lightX * r * 0.4, lightY * r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, st.c[0]); g.addColorStop(0.55, st.c[1]); g.addColorStop(1, st.c[2]);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (st.lumpy) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = r * (0.85 + 0.15 * Math.sin(i * 2.7 + 1)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.save(); ctx.clip();

    const spin = time * (r > 30 ? 0.05 : 0.12);
    if (st.bands) {
      const n = st.bands.length, h = (2 * r) / n;
      st.bands.forEach((c, i) => {
        ctx.fillStyle = c; ctx.globalAlpha = 0.55;
        const wob = Math.sin(time * 0.6 + i) * r * 0.02;
        ctx.fillRect(-r, -r + i * h + wob, 2 * r, h * 0.8);
      });
      ctx.globalAlpha = 1;
    }
    if (st.spot) {
      const sx = ((spin * r * 2 + r * 0.4) % (r * 3)) - r * 1.5;
      ctx.fillStyle = st.spot; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(sx, r * 0.3, r * 0.22, r * 0.12, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (st.swirl) {
      ctx.strokeStyle = st.swirl; ctx.lineWidth = r * 0.12;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.3 + i * 0.2), spin * 3 + i, spin * 3 + i + 2.2); ctx.stroke(); }
    }
    if (st.land) {
      ctx.fillStyle = st.land;
      for (const l of f.land) {
        const lx = ((l.x * r + spin * r * 3) % (r * 2.6) + r * 2.6) % (r * 2.6) - r * 1.3;
        ctx.beginPath(); ctx.ellipse(lx, l.y * r, l.w * r, l.h * r, l.a, 0, TAU); ctx.fill();
      }
    }
    if (st.dust) { ctx.fillStyle = st.dust; for (const l of f.land.slice(0, 3)) { ctx.beginPath(); ctx.ellipse(l.x * r, l.y * r, l.w * r, l.h * r * 0.7, l.a, 0, TAU); ctx.fill(); } }
    if (st.craters) {
      for (const c of f.craters.slice(0, st.craters)) {
        ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.arc(c.x * r, c.y * r, c.s * r, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = Math.max(0.5, r * 0.02);
        ctx.beginPath(); ctx.arc(c.x * r, c.y * r, c.s * r, Math.PI, Math.PI * 1.6); ctx.stroke();
      }
    }
    if (st.cracks) {
      ctx.strokeStyle = "rgba(150,90,60,0.55)"; ctx.lineWidth = Math.max(0.6, r * 0.04);
      for (const [a, b, c, d] of f.cracks) { ctx.beginPath(); ctx.moveTo(a * r, b * r); ctx.quadraticCurveTo(0, 0, c * r, d * r); ctx.stroke(); }
    }
    if (st.volcano) for (const s of f.spots) { ctx.fillStyle = s.c; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(s.x * r, s.y * r, s.s * r, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    if (st.cap) { ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.beginPath(); ctx.ellipse(0, -r * 0.92, r * 0.45, r * 0.2, 0, 0, TAU); ctx.fill(); }
    if (st.clouds) {
      ctx.strokeStyle = "rgba(255,255,255,0.45)"; ctx.lineWidth = r * 0.07; ctx.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const cx = ((i * r * 0.9 - spin * r * 4) % (r * 2.8) + r * 2.8) % (r * 2.8) - r * 1.4;
        ctx.beginPath(); ctx.moveTo(cx - r * 0.3, -r * 0.6 + i * r * 0.4); ctx.lineTo(cx + r * 0.3, -r * 0.55 + i * r * 0.4); ctx.stroke();
      }
    }
    // night side shading
    const shade = ctx.createLinearGradient(lightX * r, lightY * r, -lightX * r, -lightY * r);
    shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(0.55, "rgba(0,0,0,0.05)"); shade.addColorStop(1, "rgba(0,0,10,0.65)");
    ctx.fillStyle = shade; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
    if (st.haze) { ctx.strokeStyle = st.haze; ctx.lineWidth = r * 0.25; ctx.beginPath(); ctx.arc(0, 0, r * 1.05, 0, TAU); ctx.stroke(); }
    // atmosphere rim
    if (r > 8) {
      ctx.strokeStyle = OD.rgba(st.c[0], 0.25); ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.beginPath(); ctx.arc(0, 0, r + r * 0.04, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  };

  function drawSun(ctx, x, y, r, time) {
    ctx.save(); ctx.translate(x, y);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5);
    const corona = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 3);
    corona.addColorStop(0, `rgba(255,200,80,${0.55 + pulse * 0.1})`); corona.addColorStop(0.4, "rgba(255,140,40,0.18)"); corona.addColorStop(1, "rgba(255,100,20,0)");
    ctx.fillStyle = corona; ctx.beginPath(); ctx.arc(0, 0, r * 3, 0, TAU); ctx.fill();
    // flares
    ctx.save(); ctx.rotate(time * 0.1);
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * TAU, len = r * (1.25 + 0.2 * Math.sin(time * 2 + i * 1.7));
      ctx.fillStyle = "rgba(255,170,60,0.35)";
      ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); ctx.fill();
    }
    ctx.restore();
    const g = ctx.createRadialGradient(-r * 0.2, -r * 0.2, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#fffbe6"); g.addColorStop(0.5, "#ffd34d"); g.addColorStop(1, "#ff8a1f");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    // granulation
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.clip();
    ctx.fillStyle = "rgba(255,120,20,0.25)";
    for (let i = 0; i < 7; i++) { const a = time * 0.2 + i * 0.9, d = r * (0.3 + (i % 3) * 0.2); ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, r * 0.15, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.restore();
  }
})(window.OD);
