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

  // ---------- surface textures (2D) ----------
  // Each body gets a procedural surface map, made once (value-noise fBm, wraps left-right), that scrolls under a
  // sphere-shaded overlay so the planet appears to turn. Far cheaper per frame than drawing details live.
  function noise2(seedStr, period) { // tileable (in x) value noise
    const r = rng(seedStr), N = 256, perm = new Uint8Array(512), val = new Float32Array(256);
    for (let i = 0; i < N; i++) { perm[i] = i; val[i] = r(); }
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < N; i++) perm[i + N] = perm[i];
    const at = (x, y, p) => val[perm[(((x % p) + p) % p) + perm[y & 255]] & 255];
    const sm = t => t * t * (3 - 2 * t);
    const one = (x, y, p) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = at(xi, yi, p), b = at(xi + 1, yi, p), c = at(xi, yi + 1, p), d = at(xi + 1, yi + 1, p);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
    return (u, v, oct = 5) => { let s = 0, amp = 0.5, f = 1, n = 0; for (let o = 0; o < oct; o++) { s += amp * one(u * period * f, v * period * f, period * f); n += amp; amp *= 0.5; f *= 2; } return s / n; };
  }
  const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const ramp = (stops, t) => { // stops: [[t, [r,g,b]], ...]
    if (t <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) { const [t0, c0] = stops[i - 1], [t1, c1] = stops[i]; return mix(c0, c1, (t - t0) / (t1 - t0)); }
    return stops[stops.length - 1][1];
  };
  const texCache = {};
  function surface(style) {
    if (texCache[style]) return texCache[style];
    const st = STYLE[style] || STYLE.luna, W = 384, H = 192;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), img = g.createImageData(W, H), px = img.data;
    const n = noise2(style, 4), n2 = noise2(style + "b", 8), land = noise2(style + "land", 2);
    const hi = hexRgb(st.c[0]), mid = hexRgb(st.c[1]), lo = hexRgb(st.c[2]);
    let clouds = null, seaLevel = 0.5;
    if (st.land) { // pick the sea level so about 38% of the surface is land, whatever the noise does
      const hs = []; for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) hs.push(land(x / W, y / H, 5) + (n(x / W, y / H, 3) - 0.5) * 0.12);
      hs.sort((a, b) => a - b); seaLevel = hs[Math.floor(hs.length * 0.62)];
    }
    for (let y = 0; y < H; y++) {
      const v = y / H, lat = Math.abs(v - 0.5) * 2;
      for (let x = 0; x < W; x++) {
        const u = x / W; let col;
        if (st.bands) { // gas giant: turbulent bands
          const warp = (n(u, v, 4) - 0.5) * 0.12, bi = Math.min(st.bands.length - 1, Math.max(0, Math.floor((v + warp) * st.bands.length)));
          const b = hexRgb(st.bands[bi]), t = n2(u * 2, v * 3, 3);
          col = mix(b, t > 0.55 ? hi : mid, Math.abs(t - 0.5) * 0.8);
        } else if (st.land) { // Earth: oceans, continents with deserts and forests, ice caps
          const h = land(u, v, 5) + (n(u, v, 3) - 0.5) * 0.12; // big smooth landmasses with ragged coasts
          if (h > seaLevel) { const d = n2(u, v, 2); col = ramp([[0.3, [58, 132, 66]], [0.5, [84, 150, 70]], [0.66, [168, 150, 96]], [0.8, [196, 178, 128]]], d); col = mix(col, [44, 96, 54], Math.min(0.5, (h - seaLevel) * 3)); }
          else col = ramp([[seaLevel - 0.25, [12, 44, 118]], [seaLevel - 0.06, [22, 78, 170]], [seaLevel, [64, 150, 214]]], h);
          if (lat > 0.86 + (n2(u, v, 2) - 0.5) * 0.08) col = mix(col, [236, 245, 255], Math.min(1, (lat - 0.84) * 12));
        } else if (style === "sun") {
          const t = n(u, v, 4) * 0.7 + n2(u * 3, v * 3, 2) * 0.3; col = ramp([[0.3, [255, 120, 20]], [0.5, [255, 190, 60]], [0.7, [255, 236, 150]]], t);
        } else { // rocky / icy bodies: mottled ground, darker maria
          const t = n(u, v, 5), m = n2(u, v, 3);
          col = ramp([[0.25, lo], [0.55, mid], [0.85, hi]], t);
          if (st.dust || m > 0.62) col = mix(col, lo, st.dust ? Math.max(0, (m - 0.45)) * 0.9 : (m - 0.62) * 1.5);
          if (st.volcano && m > 0.66) col = mix(col, [255, 140, 40], (m - 0.66) * 2.5);
          if (st.cap && lat > 0.84) col = mix(col, [250, 250, 255], Math.min(1, (lat - 0.84) * 9));
        }
        const i = (y * W + x) * 4; px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const f = features(style), r = rng(style + "c");
    if (st.craters) for (let k = 0; k < st.craters * 3; k++) { // craters: dark bowl, lit rim
      const x = r() * W, y = H * (0.15 + r() * 0.7), cr = 2 + r() * (H * 0.07);
      for (const dx of [0, -W, W]) {
        g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.ellipse(x + dx, y, cr, cr * 0.9, 0, 0, TAU); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = Math.max(1, cr * 0.18); g.beginPath(); g.ellipse(x + dx, y, cr, cr * 0.9, 0, Math.PI * 0.95, Math.PI * 1.7); g.stroke();
      }
    }
    if (st.cracks) { g.strokeStyle = "rgba(150,80,50,0.5)"; g.lineWidth = 1.6; for (const [a, b, c2, d] of f.cracks) for (const dx of [0, W]) { g.beginPath(); g.moveTo((a + 1) / 2 * W - dx, (b + 1) / 2 * H); g.quadraticCurveTo(W / 2 - dx, H / 2, (c2 + 1) / 2 * W - dx, (d + 1) / 2 * H); g.stroke(); } }
    if (st.spot) { // storm: Great Red Spot / Great Dark Spot
      for (const dx of [0, -W]) { g.fillStyle = st.spot; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(W * 0.62 + dx, H * 0.64, W * 0.06, H * 0.07, 0, 0, TAU); g.fill();
        g.strokeStyle = "rgba(255,240,220,0.35)"; g.lineWidth = 2; g.beginPath(); g.ellipse(W * 0.62 + dx, H * 0.64, W * 0.075, H * 0.09, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; }
    }
    if (st.clouds) { // Earth's cloud layer: its own texture, scrolled faster
      clouds = document.createElement("canvas"); clouds.width = W; clouds.height = H;
      const cg = clouds.getContext("2d"), ci = cg.createImageData(W, H), cp = ci.data, cn = noise2(style + "clouds", 6);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const t = cn(x / W, y / H * 0.6, 5), a = Math.max(0, Math.min(1, (t - 0.57) * 3.2)); const i = (y * W + x) * 4; cp[i] = cp[i + 1] = cp[i + 2] = 255; cp[i + 3] = a * 210; }
      cg.putImageData(ci, 0, 0);
    }
    let lights = null;
    if (st.land) { // city lights for the night side: small warm dots on land, more on coasts
      lights = document.createElement("canvas"); lights.width = W; lights.height = H;
      const lg = lights.getContext("2d"), lr = rng(style + "lights");
      for (let k = 0; k < 2600; k++) {
        const x = lr() * W, y = H * (0.12 + lr() * 0.76), h = land(x / W, y / H, 5) + (n(x / W, y / H, 3) - 0.5) * 0.12;
        if (h <= seaLevel || h > seaLevel + 0.12 + lr() * 0.1) continue;
        lg.fillStyle = lr() < 0.2 ? "rgba(255,240,200,0.95)" : "rgba(255,190,90,0.8)"; lg.fillRect(x, y, lr() < 0.15 ? 2 : 1, 1);
      }
    }
    if (st.swirl || st.haze) { // thick atmospheres (Venus, Titan): soften the ground
      g.fillStyle = st.swirl ? "rgba(255,236,190,0.35)" : "rgba(255,190,100,0.3)"; g.fillRect(0, 0, W, H);
    }
    return (texCache[style] = { tex: c, clouds, lights });
  }

  // Saturn's rings and Uranus's faint ring are drawn behind the planet (top-down view = circles).
  OD.BODY_STYLE = STYLE; // shared with the 3D view
  OD.drawBodyRings = function (ctx, style, x, y, r) {
    const st = STYLE[style];
    if (!st) return;
    if (st.rings) { // many fine ringlets with a Cassini gap
      const bands = [[1.42, 0.06, 0.32], [1.5, 0.1, 0.55], [1.62, 0.12, 0.7], [1.76, 0.05, 0.12], [1.86, 0.14, 0.62], [2.02, 0.1, 0.42], [2.14, 0.05, 0.25]];
      for (const [k, w, a] of bands) { ctx.strokeStyle = `rgba(228,206,156,${a})`; ctx.lineWidth = r * w; ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = "rgba(255,245,215,0.35)"; ctx.lineWidth = Math.max(1, r * 0.015);
      for (const k of [1.55, 1.68, 1.93, 2.08]) { ctx.beginPath(); ctx.arc(x, y, r * k, 0, TAU); ctx.stroke(); }
    }
    if (st.faintRing) {
      ctx.strokeStyle = "rgba(200,240,255,0.25)"; ctx.lineWidth = Math.max(1, r * 0.05);
      ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(200,240,255,0.12)"; ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.beginPath(); ctx.arc(x, y, r * 1.75, 0, TAU); ctx.stroke();
    }
  };

  const ATMO = { earth: "#7cc8ff", venus: "#ffe2a0", uranus: "#a8f4ff", neptune: "#6f9dff", jupiter: "#ffe6c0", saturn: "#ffeec0", titan: "#ffc070", mars: "#ff9a70" };
  // lightX/lightY: direction toward the light source.
  OD.drawBody = function (ctx, style, x, y, r, time, lightX = -0.7, lightY = -0.7) {
    if (style === "sun") return drawSun(ctx, x, y, r, time);
    const st = STYLE[style] || STYLE.luna, sf = surface(style);
    const ll = Math.hypot(lightX, lightY) || 1; lightX /= ll; lightY /= ll;
    ctx.save();
    ctx.translate(x, y);
    const atmo = ATMO[style];
    if (atmo && OD.fx2d && r > 6) { const ga = ctx.globalAlpha; OD.fx2d.glow(ctx, lightX * r * 0.08, lightY * r * 0.08, r * 1.45, atmo, 0.35 * ga); ctx.globalAlpha = ga; } // atmosphere glow
    ctx.beginPath();
    if (st.lumpy) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, rr = r * (0.85 + 0.15 * Math.sin(i * 2.7 + 1)); i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); }
    else ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = st.c[2]; ctx.fill();
    ctx.save(); ctx.clip();
    // the surface map scrolls: 4r wide, 2r tall, wrapped
    const spin = time * (r > 30 ? 0.05 : 0.12), w = r * 4, off = ((spin * r * 1.2) % w + w) % w;
    ctx.drawImage(sf.tex, -r - off, -r, w, 2 * r); ctx.drawImage(sf.tex, -r - off + w, -r, w, 2 * r);
    if (sf.clouds) { const co = ((spin * r * 2.2) % w + w) % w; ctx.globalAlpha = 0.85; ctx.drawImage(sf.clouds, -r - co, -r, w, 2 * r); ctx.drawImage(sf.clouds, -r - co + w, -r, w, 2 * r); ctx.globalAlpha = 1; }
    // sphere: limb darkening, then the night side
    const limb = ctx.createRadialGradient(lightX * r * 0.35, lightY * r * 0.35, r * 0.15, 0, 0, r * 1.02);
    limb.addColorStop(0, "rgba(255,255,255,0.14)"); limb.addColorStop(0.55, "rgba(0,0,0,0)"); limb.addColorStop(1, "rgba(0,0,12,0.55)");
    ctx.fillStyle = limb; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    const shade = ctx.createLinearGradient(lightX * r, lightY * r, -lightX * r, -lightY * r);
    shade.addColorStop(0, "rgba(0,0,0,0)"); shade.addColorStop(0.5, "rgba(0,0,10,0.08)"); shade.addColorStop(0.8, "rgba(0,0,14,0.6)"); shade.addColorStop(1, "rgba(0,0,18,0.82)");
    ctx.fillStyle = shade; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    if (sf.lights && r > 12) { // city lights, only on the night side
      const la = Math.atan2(lightY, lightX);
      ctx.save(); ctx.rotate(la + Math.PI); ctx.beginPath(); ctx.rect(r * 0.32, -r, r, 2 * r); ctx.clip(); ctx.rotate(-(la + Math.PI));
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.7;
      ctx.drawImage(sf.lights, -r - off, -r, w, 2 * r); ctx.drawImage(sf.lights, -r - off + w, -r, w, 2 * r);
      ctx.restore();
    }
    ctx.restore();
    // rim light on the sunlit edge
    if (r > 6) {
      ctx.strokeStyle = OD.rgba(atmo || st.c[0], atmo ? 0.45 : 0.3); ctx.lineWidth = Math.max(1, r * (atmo ? 0.04 : 0.03)); ctx.lineCap = "round";
      const la = Math.atan2(lightY, lightX);
      ctx.beginPath(); ctx.arc(0, 0, r - ctx.lineWidth * 0.5, la - 0.95, la + 0.95); ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,10,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  };

  // a soft nebula for the 2D background, tinted per map; made once per map
  const nebCache = {};
  OD.nebula = function (key, tint) {
    if (nebCache[key]) return nebCache[key];
    const N = 192, c = document.createElement("canvas"); c.width = N; c.height = N;
    const g = c.getContext("2d"), img = g.createImageData(N, N), px = img.data, n = noise2("neb" + key, 3), n2 = noise2("neb2" + key, 5);
    const a = hexRgb(tint), b = [120, 70, 200];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = n(x / N, y / N, 5), t2 = n2(x / N, y / N, 4), k = Math.max(0, t - 0.42) * 2.2, i = (y * N + x) * 4;
      const col = mix(a, b, Math.max(0, Math.min(1, (t2 - 0.4) * 2)));
      px[i] = Math.min(255, col[0] * 1.6); px[i + 1] = Math.min(255, col[1] * 1.6); px[i + 2] = Math.min(255, col[2] * 1.6); px[i + 3] = Math.min(255, k * k * 255);
    }
    g.putImageData(img, 0, 0);
    return (nebCache[key] = c);
  };

  function drawSun(ctx, x, y, r, time) {
    ctx.save(); ctx.translate(x, y);
    const pulse = 0.5 + 0.5 * Math.sin(time * 1.5), sf = surface("sun");
    if (OD.fx2d) { // layered corona
      const ga = ctx.globalAlpha, op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = "lighter";
      OD.fx2d.glow(ctx, 0, 0, r * 3.4, "#ff7a1a", (0.55 + pulse * 0.1) * ga); OD.fx2d.glow(ctx, 0, 0, r * 1.9, "#ffc24a", 0.7 * ga);
      ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
    }
    ctx.save(); ctx.rotate(time * 0.1); // flares
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, len = r * (1.2 + 0.22 * Math.sin(time * 2 + i * 1.7));
      ctx.fillStyle = i % 2 ? "rgba(255,170,60,0.35)" : "rgba(255,210,110,0.28)";
      ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.1) * r, Math.sin(a - 0.1) * r); ctx.quadraticCurveTo(Math.cos(a + 0.08) * len * 0.95, Math.sin(a + 0.08) * len * 0.95, Math.cos(a) * len, Math.sin(a) * len); ctx.lineTo(Math.cos(a + 0.1) * r, Math.sin(a + 0.1) * r); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.save(); ctx.clip();
    const w = r * 4, off = ((time * 0.04 * r) % w + w) % w; // boiling surface
    ctx.drawImage(sf.tex, -r - off, -r, w, 2 * r); ctx.drawImage(sf.tex, -r - off + w, -r, w, 2 * r);
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, "rgba(255,252,230,0.75)"); g.addColorStop(0.6, "rgba(255,220,120,0.15)"); g.addColorStop(1, "rgba(200,60,0,0.55)");
    ctx.fillStyle = g; ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
    ctx.restore();
  }
})(window.OD);
