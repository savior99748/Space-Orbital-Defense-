// Ringwarden: Orbital Defense: board (bodies/rings/slots), simulation, rendering, menus and stats.
(function (OD) {
  "use strict";
  const TAU = Math.PI * 2;
  const { TOWERS, ENEMIES, DIFFICULTY, MAPS, MAP_ORDER, TIERS, tierOf, rgba } = OD;
  const FX = OD.fx2d; // 2D effects (js/fx2d.js)
  // each map has its own difficulty tier (Beginner / Intermediate / Hard / Expert), like Bloons tracks
  const mapTier = k => TIERS[MAPS[k].tier];
  const diffOf = k => mapTier(k).diff;
  const audio = OD.audio;
  const sfx = name => audio.play(name);

  const OVERDRIVE = { duration: 6, cooldown: 30, ringMul: 5, rateMul: 1.3 };
  // Own Orbits (the 3D game; see js/mode.js): every satellite launches onto its own orbit (a lane) in LEO;
  // lanes never cross (each has its own radius), so satellites can't collide. Satellites carry fuel for FUEL_MAX waves
  // and burn up when it runs out; Overdrive burns OD_FUEL extra. Picking a satellite opens a launch panel: choose the
  // zone (LEO / MEO / HEO) and the body to launch from, then LAUNCH. A satellite can change zone later for 1 fuel per zone.
  const EXP = !!OD.EXP;
  const FUEL_MAX = 20, OD_FUEL = 2, BAND = ["LEO", "MEO", "HEO"], EXP_SPEED = 0.8; // invaders 20% slower in the test
  const TARGET_MODES = ["first", "last", "strong", "close"];
  const TARGET_LABEL = { first: "First", last: "Last", strong: "Strong", close: "Close" };

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $("game"), ctx = canvas.getContext("2d"), stage = $("stage");
  const ui = {
    wave: $("wave"), lives: $("lives"), livesLabel: $("livesLabel"), money: $("money"), score: $("score"), diff: $("diffTag"),
    waveBtn: $("waveBtn"), speedBtn: $("speedBtn"), menuBtn: $("menuBtn"), autoBtn: $("autoBtn"), odBtn: $("odBtn"), adBtn: $("adBtn"),
    shop: $("shop"), info: $("info"), overlay: $("overlay"), toast: $("toast"), preview: $("preview"),
    zoomCtl: $("zoomCtl"), zoomIn: $("zoomIn"), zoomOut: $("zoomOut"), zoomLabel: $("zoomLabel"),
    coach: $("coach"), coachText: $("coachText"), coachNext: $("coachNext"), coachStep: $("coachStep"), coachArrow: $("coachArrow"),
  };
  const P = OD.platform;
  const stats = OD.analytics;
  // Saves go through the platform layer (localStorage, or cloud saves on portals that offer them).
  const store = { get: k => P.save.get(k), set: (k, v) => P.save.set(k, v), remove: k => P.save.remove(k) };
  let adPause = false; // true while an ad is playing

  // ---------- board: the map's bodies, turret rings and slots ----------
  let W = 1000, H = 700, CX = 500, CY = 350, SPAWN_R = 640, scale = 1;
  let MAP_KEY = MAP_ORDER.includes(store.get("od_map")) ? store.get("od_map") : "earth";
  let DIFF_KEY = "medium"; // follows the selected map (see diffOf)
  let MODE = store.get("od_mode") === "endless" ? "endless" : "campaign";
  const LB = OD.leaderboard;
  let lbView = null; // { map, diff } while the leaderboard screen is open
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  // Endless milestones: bonus credits + score at waves 40, 50, 75, 100, then every 25.
  const isMilestone = w => [40, 50, 75, 100].includes(w) || (w > 100 && w % 25 === 0);
  const milestoneReward = w => (w >= 100 ? 3000 : w >= 75 ? 1500 : w >= 50 ? 800 : 500) * OD.ECON;
  const nextMilestone = w => { for (let m = w + 1; ; m++) if (isMilestone(m)) return m; };
  let MAP = MAPS[MAP_KEY];
  let B = null;

  function buildBoard(key, seed = 1) {
    MAP_KEY = key; MAP = MAPS[key];
    const root = { name: MAP.name, style: MAP.body.style, r: MAP.body.r, belt: MAP.body.belt, root: true, x: CX, y: CY };
    const bodies = [root];
    const rings = MAP.rings.map(r => ({ body: 0, r: r.r, slots: r.slots, speed: r.speed, angle: 0, incl: r.incl || 0, node: r.node || 0 }));
    for (const m of MAP.moons) {
      const bi = bodies.push({
        name: m.name, style: m.style, r: m.r, orbit: m.orbit, speed: m.speed, angle: m.phase,
        gravity: m.gravity, gravR: m.gravR || m.r * 4.5 + 38, x: 0, y: 0,
      }) - 1;
      rings.push({ body: bi, r: m.ring.r, slots: m.ring.slots, speed: m.ring.speed, angle: m.phase * 2, incl: m.ring.incl || 0, node: m.ring.node || 0 });
    }
    // ground pads for Missile Silos: 3 on the planet, 1 on each moon (none on the Sun). Added after the orbit rings
    // so slot ids of saved games don't change. Each body's LEO = its lowest orbit ring: the silos' reach.
    bodies.forEach((b, bi) => { const own = rings.filter(r => r.body === bi); b.leo = own.length ? Math.min(...own.map(r => r.r)) * 1.12 : b.r * 3; });
    const nOrbit = rings.length;
    if (!MAP.final) rings.push({ body: 0, r: root.r + 2, slots: 3, speed: 0.05, angle: 0.4, incl: 0, node: 0, surface: true, lat: 0.62 });
    for (let bi = 1; bi < bodies.length; bi++) rings.push({ body: bi, r: bodies[bi].r + 1.5, slots: 1, speed: 0.08, angle: bi, incl: 0, node: 0, surface: true, lat: 0.62 });
    if (EXP) { rings.slice(0, nOrbit).forEach(r => { r.hidden = true; }); addLanes(rings, bodies, nOrbit, seed); }
    const slots = [];
    rings.forEach((ring, ri) => { for (let i = 0; i < ring.slots; i++) slots.push({ id: slots.length, ring: ri, i, surface: !!ring.surface }); });
    let extent = 0;
    for (const r of rings.slice(0, nOrbit)) extent = Math.max(extent, (bodies[r.body].orbit || 0) + r.r);
    B = { bodies, rings, slots, extent, spiral: Math.max(extent + 25, MAP.view / 2 - 15), time: 0, view: Math.max(MAP.view, (extent + 34) * 2) };
    resize();
  }

  // Own Orbits: three bands (LEO / MEO / HEO) of single-satellite lanes around every body that had turret rings,
  // plus one launch marker per body. Lanes in a band sit LANE apart; inclination, node and phase are random (seeded,
  // so a saved run gets the same orbits back). Kepler-ish: higher lanes turn slower.
  function addLanes(rings, bodies, nOrbit, seed) {
    let a = seed >>> 0;
    const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const flat = !OD.is3D; // Classic 2D: flat orbits, spaced for the bigger 2D satellite art
    const LANE = (flat ? 16 : 10) * Math.max(0.33, MAP.satScale || 1);
    bodies.forEach((b, bi) => {
      const own = rings.slice(0, nOrbit).filter(r => r.body === bi).sort((x, y) => x.r - y.r);
      if (!own.length) return;
      const lo = own[0].r * (flat && own.length > 1 ? 0.85 : 1), hi = own[own.length - 1].r * (flat && own.length > 1 ? 1.25 : 1);
      const centers = own.length > 1 ? [lo, (lo + hi) / 2, hi] : [lo * 0.8, lo * 1.15, lo * 1.5];
      const n = Math.max(1, Math.floor((centers[1] - centers[0]) * 0.8 / LANE) + 1);
      const w0 = Math.abs(own[0].speed) || 0.1, dir = Math.sign(own[0].speed) || 1;
      centers.forEach((c, band) => {
        for (let k = 0; k < n; k++) {
          const r = c + (k - (n - 1) / 2) * LANE;
          rings.push({ body: bi, r, slots: 1, speed: dir * w0 * (centers[0] / r) ** 1.5, angle: rnd() * TAU, incl: flat ? 0 : rnd() * 0.9, node: rnd() * TAU, lane: true, band });
        }
      });
      rings.push({ body: bi, r: 0, slots: 1, speed: 0, angle: 0, incl: 0, node: 0, launch: true });
    });
  }
  const freeLanes = (bi, band) => B.slots.filter(s => { const r = B.rings[s.ring]; return r.lane && r.body === bi && r.band === band && !towerAt(s.id); });
  const freeLane = (bi, band) => { const f = freeLanes(bi, band); return f.length ? f[Math.floor(Math.random() * f.length)].id : null; };
  const launchSlot = bi => { const s = B.slots.find(x => B.rings[x.ring].launch && B.rings[x.ring].body === bi); return s ? s.id : null; };

  function positionBodies() {
    for (const b of B.bodies) {
      if (b.root) { b.x = CX; b.y = CY; continue; }
      b.x = CX + Math.cos(b.angle) * b.orbit;
      b.y = CY + Math.sin(b.angle) * b.orbit;
    }
  }

  function advanceBoard(dt, ringMul = 1) {
    B.time += dt;
    for (const b of B.bodies) if (!b.root) b.angle += b.speed * dt;
    for (const r of B.rings) r.angle = (r.angle + r.speed * dt * ringMul) % TAU;
    positionBodies();
  }

  // Position of a slot on its ring. Rings can be tilted (incl) around a line through their body at
  // angle `node`, which lifts slots above/below the orbital plane (z). Flat rings give z = 0.
  function ringPoint(ring, a) {
    const b = B.bodies[ring.body];
    if (ring.launch) return { x: b.x, y: b.y, z: b.r * 1.25 + 10 * (MAP.satScale || 1) }; // launch marker above the body
    if (ring.surface) { const rr = ring.r * Math.cos(ring.lat); return { x: b.x + Math.cos(a) * rr, y: b.y + Math.sin(a) * rr, z: ring.r * Math.sin(ring.lat) }; } // on the near hemisphere
    if (!ring.incl) return { x: b.x + Math.cos(a) * ring.r, y: b.y + Math.sin(a) * ring.r, z: 0 };
    const u = a - ring.node, lx = Math.cos(u) * ring.r, ly = Math.sin(u) * ring.r;
    const ci = Math.cos(ring.incl), cn = Math.cos(ring.node), sn = Math.sin(ring.node);
    return { x: b.x + lx * cn - ly * ci * sn, y: b.y + lx * sn + ly * ci * cn, z: ly * Math.sin(ring.incl) };
  }
  function slotPos(id) {
    const s = B.slots[id], ring = B.rings[s.ring];
    const a = ring.angle + s.i * TAU / ring.slots;
    const p = ringPoint(ring, a); p.a = a;
    return p;
  }

  // ---------- state ----------
  let S = null;
  let nextId = 1;
  function newState(diffKey) {
    const diff = DIFFICULTY[diffKey];
    return {
      diffKey, diff, mapKey: MAP_KEY,
      wave: 0, lives: diff.lives, money: diff.money, score: 0,
      towers: [], retired: [], enemies: [], shots: [], beams: [], rings: [], particles: [], floaters: [], mines: [],
      queue: [], spawnTimer: 0, waveActive: false,
      selectedType: null, selectedTower: null, hover: null,
      speed: 3, paused: false, over: false, won: false, freeplay: false, auto: false,
      overdrive: 0, overdriveCd: 0, time: 0, realTime: 0, shake: 0,
      stats: { killed: 0, leaked: 0, bosses: 0, earnedKills: 0, earnedBonus: 0, earnedMining: 0, spent: 0, overdrives: 0, hpLost: 0 },
    };
  }

  let stars = [];
  const MUZZLE2D = { laser: "#bff8ff", missile: "#ffb347", rail: "#c9ffb0", flak: "#ffe08a" };
  const STAR_TINTS = ["#cfd8ff", "#ffffff", "#ffe9c8", "#c8e0ff", "#ffffff", "#ffd2d2", "#dcd0ff"];
  function makeStars() {
    stars = Array.from({ length: Math.round(W * H / 3000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.2, tw: Math.random() * TAU,
    }));
  }

  // ---------- helpers ----------
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
  // 3D squared distance between two things with x, y and (optional) z
  const d3 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z || 0) - (b.z || 0)) ** 2;
  const towerAt = id => S && S.towers.find(t => t.slot === id);
  // Overclock (Endless and Freeplay): fully upgraded satellites keep getting stronger, at a rising price.
  const OC_MUL = 1.25, OC_KEYS = ["dmg", "dps", "clusterDmg", "burn", "income"];
  // Ascension (Endless and Freeplay): three very expensive tiers after tier 5, for the late game. Each one:
  // ×1.6 damage (or income), ×1.12 fire rate, ×1.06 range (and buff range), +1 fighter for carriers.
  const ASC = [{ name: "Ascension I", cost: 50000 }, { name: "Ascension II", cost: 125000 }, { name: "Ascension III", cost: 250000 }];
  const ASC_DMG = 1.6, ASC_RATE = 1.12, ASC_RANGE = 1.06;
  // available in every mode: a long-term goal to save up for, even in the 30-wave campaign
  const canAscend = t => t.level >= 4 && (t.asc || 0) < ASC.length && !!S;
  function applyAsc(st, asc) {
    const m = ASC_DMG ** asc;
    for (const k of OC_KEYS) if (st[k]) st[k] = k === "income" ? Math.round(st[k] * m) : Math.round(st[k] * m * 10) / 10;
    if (st.rate) st.rate = Math.round(st.rate * ASC_RATE ** asc * 100) / 100;
    if (st.range) st.range = Math.round(st.range * ASC_RANGE ** asc);
    if (st.buffRange) st.buffRange = Math.round(st.buffRange * ASC_RANGE ** asc);
    if (st.craft) st.craft += asc;
    return st;
  }
  const baseStats = t => (t.asc ? applyAsc({ ...tierOf(t.type, t.level, t.path) }, t.asc) : tierOf(t.type, t.level, t.path));
  // Fleet Link (Command Relay / Fleet Uplink): every relay in range adds its own fire-rate bonus (+20% / +35%),
  // stacking additively up to +140%. Range bonuses don't stack (the best one applies).
  const LINK_CAP = 1.4;
  const canOverclock = t => t.level >= 4 && S && (S.endless || S.freeplay);
  const applyOc = (st, oc) => { const m = OC_MUL ** oc; for (const k of OC_KEYS) if (st[k]) st[k] = k === "income" ? Math.round(st[k] * m) : Math.round(st[k] * m * 10) / 10; return st; };
  const ocCost = t => Math.round(tierOf(t.type, 4, t.path).cost * 0.6 * 1.6 ** (t.oc || 0) / 10) * 10;
  const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "k" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : Math.round(n).toString();

  // satellites go on orbit slots, Missile Silos on the ground pads
  const slotFits = (slotId, type) => {
    const s = B.slots[slotId], r = B.rings[s.ring], ground = !!(TOWERS[type] && TOWERS[type].ground);
    if (r.launch) return !ground; // Own Orbits: satellites launch from the marker, never straight onto a lane
    if (r.lane || r.hidden) return false;
    return !!s.surface === ground;
  };
  const slotUsable = id => {
    const r = B.rings[B.slots[id].ring];
    if (r.hidden) return false;
    if (r.lane) return !!towerAt(id);
    if (r.launch) return false; // Own Orbits: launches go through the LAUNCH button
    return !S || !S.selectedType || !!towerAt(id) || slotFits(id, S.selectedType);
  };
  function nearestSlot(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const s of B.slots) {
      if (!slotUsable(s.id)) continue;
      const p = slotPos(s.id), d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = s.id; }
    }
    return best;
  }

  function toast(msg, ms = 1800) {
    ui.toast.textContent = msg;
    ui.toast.style.opacity = 1;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (ui.toast.style.opacity = 0), ms);
  }

  // ---------- first-session help: one-time tips, a next objective, early-wave celebrations ----------
  // A tip shows once per device, never during the tutorial, as a normal toast (no pop-up, no pause).
  function tip(key, text, delay = 1600, ms = 4500) {
    if (tut || store.get("od_tip_" + key)) return;
    store.set("od_tip_" + key, "1");
    setTimeout(() => { if (S && !S.over && !tut) toast(`💡 ${text}`, ms); }, delay);
  }
  const GOALS = [3, 5, 10, 15, 20, 25, 30];
  // the short-term goal shown in the wave bar
  function objective() {
    if (!S || S.over || tut) return "";
    if (!S.towers.length) return "Build a satellite";
    if (S.wave >= 1 && !S.towers.some(t => t.level >= 1)) return "Upgrade a satellite (tap it)";
    if (S.endless || S.won) return "";
    const g = GOALS.find(w => w > S.wave);
    return g ? `Reach wave ${g}${g === 10 ? " (Mothership)" : g === 30 ? " (Dreadnought)" : ""}` : "";
  }
  function flashMoney() { ui.money.classList.remove("flash"); void ui.money.offsetWidth; ui.money.classList.add("flash"); }

  function burst(x, y, color, n = 12, spd = 120, life = 0.7, z = 0) {
    if (S.particles.length > 900) n = Math.min(n, 3);
    const up = MAP.threeD ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = Math.random() * spd, vz = up * (Math.random() - 0.5) * spd;
      S.particles.push({ x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz, life: life * (0.6 + Math.random() * 0.6), max: life, color });
    }
  }
  const floater = (x, y, text, color) => S.floaters.push({ x, y, text, color, life: 1.2 });
  const ringFx = (x, y, r, color, life = 0.35, inward = false, z = 0) => S.rings.push({ x, y, z, r, color, life, max: life, inward });

  // p: the shooter ({x, y, z}); distances are 3D
  function pickTarget(p, range, mode, exclude, only) {
    let best = null, bestScore = -Infinity;
    const r2 = range * range;
    for (const e of S.enemies) {
      if (e.dead || e === exclude || e.cloaked || (only && !only(e))) continue;
      const d = d3(p, e);
      if (d > r2) continue;
      const score = mode === "last" ? e.r : mode === "strong" ? e.hp + (e.shield || 0) : mode === "close" ? -d : -e.r;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  // ---------- waves ----------
  function previewText(n) {
    const counts = {};
    for (const g of OD.buildWave(n)) counts[g.type] = (counts[g.type] || 0) + g.count;
    return Object.entries(counts).map(([type, c]) => {
      const d = ENEMIES[type];
      return `<span class="chip"><i style="background:${d.color}"></i>${c > 1 ? c + "× " : ""}${d.name}${c > 1 && !d.boss ? "s" : ""}</span>`;
    }).join("");
  }

  function startWave() {
    if (!S || S.waveActive || S.over || (S.won && !S.freeplay)) return;
    S.wave++;
    const groups = OD.buildWave(S.wave);
    const hpScale = OD.hpScale(S.wave, S.diff) * (MAP.hp || 1);
    const gapMul = Math.max(0.45, 1 - S.wave * 0.015);
    S.queue = [];
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.count; i++) S.queue.push({ type: g.type, gap: (i === g.count - 1 && gi < groups.length - 1 ? 1.4 : g.gap * gapMul), hpScale });
    });
    S.spawnTimer = 0.3;
    S.waveActive = true;
    const boss = groups.some(g => ENEMIES[g.type].boss);
    const big = ["titan", "dread", "mother"].find(k => groups.some(g => g.type === k));
    if (boss) { toast(S.wave === 30 ? `Wave 30: THE DREADNOUGHT` : `Wave ${S.wave}: ${ENEMIES[big].name.toUpperCase()} INBOUND`, 2600); sfx("alarm"); }
    else { toast(`Wave ${S.wave}`); sfx("wave"); }
    if (S.wave === 1) stats.once("first/wave-start");
    if (S.wave === 2 && MAP.moons.length && !MAP.final) tip("moons", `${MAP.moons[0].name}'s gravity pulls invaders in, so satellites on its ring see lots of action.`);
    if (S.wave === 3) tip("overdrive", "⚡ Overdrive spins the rings fast for a few seconds. Save it for a big wave.");
    if (S.wave === 4) tip("camera", OD.is3D ? "Drag to rotate the view; pinch or + / − to zoom." : "Pinch or + / − to zoom in; drag to look around.");
    updateUI(true);
  }

  function spawnEnemy(type, hpScale, at) {
    const def = ENEMIES[type];
    const scaleHp = def.boss ? 1 + (hpScale - 1) * 0.55 : hpScale;
    const hp = Math.round(def.hp * scaleHp);
    const theta = Math.random() * TAU;
    // 3D maps: invaders come from any height (elevation up to ±55°)
    const phi = MAP.threeD && !at ? (Math.random() * 2 - 1) * 0.96 : 0;
    const e = {
      id: nextId++, type, def, hp, maxHp: hp, hpScale,
      shield: def.shield ? Math.round(def.shield * scaleHp) : 0,
      x: at ? at.x + (Math.random() - 0.5) * 16 : CX + Math.cos(theta) * Math.cos(phi) * SPAWN_R,
      y: at ? at.y + (Math.random() - 0.5) * 16 : CY + Math.sin(theta) * Math.cos(phi) * SPAWN_R,
      z: at ? (at.z || 0) + (MAP.threeD ? (Math.random() - 0.5) * 16 : 0) : Math.sin(phi) * SPAWN_R,
      dir: at ? at.dir : Math.random() < 0.5 ? 1 : -1,
      slow: 1, vuln: 1, stun: 0, frozen: 0, hit: 0, spin: Math.random() * TAU, seed: Math.random() * 10,
      shieldHitAt: -10, spawnTimer: def.spawn ? def.spawn.every : 0, burn: null,
    };
    e.maxShield = e.shield;
    // Solar System: about half the invaders go for a random planet that's still standing, the rest for the Sun
    if (at) e.tb = at.tb || 0;
    else if (S.bodyHp) { const alive = S.bodyHp.map((h, i) => (i && h > 0 ? i : 0)).filter(Boolean); e.tb = alive.length && Math.random() < 0.5 ? alive[Math.floor(Math.random() * alive.length)] : 0; }
    e.r = Math.hypot(e.x - CX, e.y - CY, e.z);
    S.enemies.push(e);
    return e;
  }

  // ---------- damage ----------
  function damage(e, amount, src, opts = {}) {
    if (e.dead) return;
    const st = src && src.st;
    amount *= e.vuln;
    if (st && st.boss && e.def.boss) amount *= st.boss;
    if (e.def.armor && !opts.pierceArmor) amount *= 1 - e.def.armor * (opts.rail ? 0.5 : 1); // armored hulls: railguns punch half way through
    let dealt = 0;
    if (e.shield > 0) {
      const mul = opts.rail ? 2 : 1; // railguns tear through shields
      const absorbed = Math.min(e.shield, amount * mul);
      e.shield -= absorbed;
      amount -= absorbed / mul;
      dealt += absorbed;
      e.shieldHitAt = S.time;
      if (absorbed > 0 && opts.flash !== false) sfx("shield");
    }
    if (amount > 0) {
      dealt += Math.min(amount, Math.max(0, e.hp));
      e.hp -= amount;
      if (opts.flash !== false) e.hit = 0.06;
    }
    if (src) src.dmg = (src.dmg || 0) + dealt;
    if (e.hp <= 0) kill(e, src);
  }

  function kill(e, src) {
    e.dead = true;
    if (src) src.kills = (src.kills || 0) + 1;
    const reward = Math.max(1, Math.round(e.def.reward * S.diff.reward));
    S.money += reward;
    S.score += reward * 10;
    S.stats.killed++; S.stats.earnedKills += reward;
    const big = e.def.boss;
    burst(e.x, e.y, e.def.color, big ? 60 : 12, big ? 240 : 130, big ? 1.4 : 0.7, e.z);
    if (!OD.is3D && OD.fx2d) OD.fx2d.kill(e.x, e.y, e.def.color, e.def.size, big, B.time); // 2D flash + shards (visual only)
    if (big) { S.stats.bosses++; unlock("first_boss"); burst(e.x, e.y, "#ffffff", 30, 300, 1, e.z); ringFx(e.x, e.y, e.def.size * 4, e.def.color, 0.8, false, e.z); S.shake = 12; sfx("nova"); }
    else sfx(e.type === "asteroid" ? "crunch" : "pop");
    if (e.def.split) for (let i = 0; i < e.def.split.n; i++) spawnEnemy(e.def.split.type, e.hpScale, e);
  }

  // ---------- update ----------
  function update(dt) {
    S.time += dt;
    const odActive = S.overdrive > 0;
    advanceBoard(dt, odActive ? OVERDRIVE.ringMul : 1);
    if (S.overdrive > 0) S.overdrive = Math.max(0, S.overdrive - dt);
    if (S.overdriveCd > 0) S.overdriveCd = Math.max(0, S.overdriveCd - dt);

    if (S.waveActive && S.queue.length) {
      S.spawnTimer -= dt;
      while (S.spawnTimer <= 0 && S.queue.length) {
        const q = S.queue.shift();
        spawnEnemy(q.type, q.hpScale);
        S.spawnTimer += q.gap;
      }
    }

    // tower positions + stats (with Command Relay buffs and overdrive)
    for (const t of S.towers) {
      const p = slotPos(t.slot);
      t.x = p.x; t.y = p.y; t.z = p.z; t.ringA = p.a;
      t.linkBonus = 0; t.links = 0; t.buffRange = 1;
    }
    for (const r of S.towers) {
      const rs = baseStats(r);
      if (!rs.buffRange) continue;
      for (const t of S.towers) {
        if (t === r || t.type === "miner") continue; // relays never buff themselves (or other mining sats)
        if (d3(r, t) <= rs.buffRange ** 2) {
          t.linkBonus += rs.buffRate - 1; t.links++;
          t.buffRange = Math.max(t.buffRange, rs.buffRangeMul);
        }
      }
    }
    // recomputed from scratch every frame (never added onto last frame's value), so a link built, upgraded,
    // sold or carried out of range by the rotating rings changes the bonus at once
    for (const t of S.towers) t.buffRate = 1 + Math.min(LINK_CAP, t.linkBonus);
    // Focus Array: +damage to nearby satellites (the strongest Focus in range applies; they don't stack)
    for (const t of S.towers) t.focusMul = 1;
    for (const f of S.towers) {
      if (f.type !== "focus") continue;
      const fs = baseStats(f);
      for (const t of S.towers) if (t !== f && t.type !== "miner" && t.type !== "focus" && d3(f, t) <= fs.focusRange ** 2) t.focusMul = Math.max(t.focusMul, fs.focusDmg);
    }
    for (const t of S.towers) {
      const b = baseStats(t);
      const rateMul = t.buffRate * (odActive ? OVERDRIVE.rateMul : 1);
      t.st = Object.assign({}, b, {
        // 3D maps give extra range: satellites cover a volume instead of a flat disk
        range: b.range ? b.range * t.buffRange * (MAP.rangeMul || 1) : b.range,
        rate: b.rate ? b.rate * rateMul : b.rate,
        dps: b.dps ? b.dps * rateMul : b.dps,
      });
      if (t.oc) applyOc(t.st, t.oc);
      if (t.focusMul > 1) for (const k of ["dmg", "dps", "clusterDmg", "burn"]) if (t.st[k]) t.st[k] *= t.focusMul;
    }

    // fields (tractor) apply slow / vulnerability / pulses
    for (const e of S.enemies) { e.slow = 1; e.vuln = 1; }
    for (const t of S.towers) {
      if (TOWERS[t.type].kind !== "field") continue;
      const st = t.st, r2 = st.range * st.range;
      t.timer = (t.timer || 0) + dt;
      const doPush = st.pushEvery && t.timer >= st.pushEvery;
      const doFreeze = st.freezeEvery && t.timer >= st.freezeEvery;
      let any = false;
      for (const e of S.enemies) {
        if (e.dead || d3(t, e) > r2) continue;
        any = true;
        e.slow = Math.min(e.slow, st.slow);
        if (st.vuln) e.vuln = Math.max(e.vuln, st.vuln);
        damage(e, st.dps * dt, t, { flash: false });
        if (doPush) pushOut(e, st.push * (e.def.boss ? 0.2 : 1));
        if (doFreeze) e.frozen = Math.max(e.frozen, st.freeze * (e.def.boss ? 0.3 : 1));
      }
      if (doPush) { t.timer = 0; if (any) { ringFx(t.x, t.y, st.range, TOWERS.tractor.paths.A.color, 0.5, true, t.z); S.rings[S.rings.length - 1].fx = "push"; sfx("push"); } }
      if (doFreeze) { t.timer = 0; if (any) { ringFx(t.x, t.y, st.range, "#dff8ff", 0.45, false, t.z); S.rings[S.rings.length - 1].fx = "freeze"; sfx("freeze"); } }
    }

    // Weak-Point Scanner (Focus Array path B): invaders in range take more damage
    for (const f of S.towers) if (f.type === "focus" && f.st.mark) {
      const r2 = f.st.focusRange ** 2;
      for (const e of S.enemies) if (!e.dead && d3(f, e) <= r2) e.vuln = Math.max(e.vuln, f.st.mark);
    }
    updateMines(dt);

    // invaders speed up a little each wave after wave 10 (up to +25%)
    const spd = S.diff.speed * (MAP.enemySpeed || 1) * (EXP ? EXP_SPEED : 1) * (1 + Math.min(0.25, Math.max(0, S.wave - 10) * 0.012));
    const rootR = B.bodies[0].r;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const def = e.def;
      e.spin += dt * 2;
      if (e.hit > 0) e.hit -= dt;
      if (e.burn && e.burn.t > 0) { e.burn.t -= dt; damage(e, e.burn.dps * dt, e.burn.src, { flash: false }); if (e.dead) continue; }
      if (e.maxShield && e.shield < e.maxShield && S.time - e.shieldHitAt > (def.regenDelay || 3)) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * (def.regen || 0.15) * dt);
      if (def.cloak) { // phases in and out: can't be targeted while cloaked (fields and blasts still hit it)
        e.cloakT = (e.cloakT ?? Math.random() * def.cloak.off) + dt;
        const cyc = def.cloak.on + def.cloak.off;
        e.cloaked = e.r < SPAWN_R * 0.95 && e.cloakT % cyc > def.cloak.off;
      }
      if (def.heal && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.heal * dt);
      if (def.spawn) {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0 && e.r < B.spiral) { e.spawnTimer = def.spawn.every; spawnEnemy(def.spawn.type, e.hpScale * 0.8, e); }
      }
      if (e.frozen > 0) { e.frozen -= dt; continue; }
      if (e.stun > 0) { e.stun -= dt; continue; }
      moveEnemy(e, def.speed * spd * e.slow, dt);
      if (e.tb && e.r <= B.bodies[e.tb].r + def.size * 0.4) { // hit its planet
        e.dead = true;
        S.bodyHp[e.tb] = Math.max(0, S.bodyHp[e.tb] - def.dmg);
        S.stats.leaked++;
        burst(e.x, e.y, "#ff5c7a", 14, 140, 0.6, e.z); floater(e.x, e.y, `-${def.dmg}`, "#ff9a8a");
        S.shake = Math.max(S.shake, def.boss ? 12 : 5); sfx("leak");
        if (S.bodyHp[e.tb] <= 0) knockOut(e.tb);
        updateUI(true);
      } else if (!e.tb && e.r <= rootR + def.size * 0.4) {
        e.dead = true;
        const lost = Math.min(def.dmg, Math.max(0, S.lives));
        S.lives -= def.dmg;
        S.stats.leaked++; S.stats.hpLost += lost;
        burst(e.x, e.y, "#ff5c7a", 18, 160, 0.7, e.z);
        floater(e.x, e.y, `-${lost}`, "#ff5c7a");
        S.shake = Math.max(S.shake, def.boss ? 16 : 8);
        sfx("leak");
      }
    }

    for (const t of S.towers) towerAct(t, dt);
    updateShots(dt);
    updateCrafts(dt);

    for (const b of S.beams) b.life -= dt;
    for (const r of S.rings) r.life -= dt;
    for (const p of S.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz || 0) * dt; p.vx *= 0.96; p.vy *= 0.96; p.vz = (p.vz || 0) * 0.96; }
    for (const f of S.floaters) { f.life -= dt; f.y -= 22 * dt; }
    S.enemies = S.enemies.filter(e => !e.dead);
    S.shots = S.shots.filter(m => !m.dead);
    S.beams = S.beams.filter(b => b.life > 0);
    S.rings = S.rings.filter(r => r.life > 0);
    S.particles = S.particles.filter(p => p.life > 0);
    S.floaters = S.floaters.filter(f => f.life > 0);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);

    audio.setIntensity(S.enemies.some(e => e.def.boss) ? 1 : 0);

    if (S.lives <= 0 && !S.over) return gameOver();

    if (S.waveActive && !S.queue.length && !S.enemies.length) {
      S.waveActive = false;
      const bonus = Math.round((25 + S.wave * 4) * S.diff.reward * OD.ECON);
      S.money += bonus; S.stats.earnedBonus += bonus;
      sfx("clear");
      unlock("first_wave");
      if ([1, 3, 5, 10, 15, 20, 25, 30].includes(S.wave) || (S.wave > 30 && S.wave % 10 === 0)) stats.track(`wave/${S.mapKey}/${S.wave}`);
      if (S.wave === OD.WIN_WAVE && !S.won && !S.endless) return victory();
      announceUnlocks();
      if (S.wave === 1) stats.once("first/wave-clear");
      if (S.wave === 3) stats.once("first/wave-3");
      if (S.wave === 5) stats.once("first/wave-5");
      flashMoney(); floater(CX, CY - B.bodies[0].r - 14, `+${bonus}`, "#ffd166");
      if (S.endless && isMilestone(S.wave)) endlessMilestone();
      else if (S.wave === 1 && !tut) { toast(`🎉 First wave cleared! +${bonus} credits${S.towers.some(t => t.level >= 1) ? "" : " · Tap a satellite to upgrade it"}`, 3200); ringFx(CX, CY, B.bodies[0].r * 2.2, "#ffd166", 0.8); }
      else if (S.wave === 3 || S.wave === 5) { toast(`⭐ Wave ${S.wave} cleared! +${bonus} credits · Next goal: wave ${S.wave === 3 ? 5 : "10, the Mothership"}`, 3200); ringFx(CX, CY, B.bodies[0].r * 2.2, "#ffd166", 0.8); }
      else toast(`Wave ${S.wave} cleared! +${bonus} credits`);
      if (EXP) burnFuel();
      if (S.wave >= 1 && !tut) tip("saved", "Your progress is saved after every wave. Leave anytime and press Continue.", 3400);
      saveRun();
      updateUI(true);
      if (S.auto) setTimeout(() => S && !S.paused && startWave(), 1200);
    }
  }

  // Own Orbits: every satellite burns 1 fuel per wave; at 0 it burns up re-entering the atmosphere.
  function burnFuel() {
    const gone = [], low = [];
    for (const t of S.towers) {
      if (t.fuel == null) continue;
      t.fuel = Math.max(0, t.fuel - 1);
      if (t.fuel <= 0) gone.push(t); else if (t.fuel === 3) low.push(t);
    }
    for (const t of gone) deorbit(t);
    const msg = gone.length ? `🔥 ${gone.length === 1 ? `${TOWERS[gone[0].type].name} ran` : `${gone.length} satellites ran`} out of fuel and burned up`
      : low.length ? `⛽ ${low.length === 1 ? `${TOWERS[low[0].type].name} has` : `${low.length} satellites have`} 3 waves of fuel left: tap to refuel` : "";
    if (msg) setTimeout(() => S && toast(msg, 3000), 1900);
    if (S.selectedTower) renderInfo();
  }
  function deorbit(t) {
    S.towers = S.towers.filter(x => x !== t);
    t.sold = true; t.crafts = null; t.burned = true;
    S.retired.push(t);
    burst(t.x, t.y, "#ff9a4a", 20, 120, 0.9, t.z); burst(t.x, t.y, "#ffd166", 10, 70, 0.6, t.z);
    if (S.selectedTower === t) S.selectedTower = null;
    sfx("sell");
  }
  // Move a satellite to another zone around the same body (like Target: First / Last / ...). 1 fuel per zone moved.
  function setOrbit(t, band) {
    if (!EXP || t.fuel == null || band === (t.orbit || 0) || band < 0 || band > 2) return;
    const bi = B.rings[B.slots[t.slot].ring].body, burn = Math.abs(band - (t.orbit || 0));
    if (t.fuel <= burn) { toast("Not enough fuel to change orbit"); sfx("deny"); return; }
    const lane = freeLane(bi, band);
    if (lane == null) { toast(`${BAND[band]} around ${B.bodies[bi].name} is full`); sfx("deny"); return; }
    t.fuel -= burn; t.slot = lane; t.orbit = band;
    const p = slotPos(lane);
    burst(p.x, p.y, "#7fd8ff", 18, 100, 0.7, p.z);
    sfx("click"); toast(`🚀 Moved to ${BAND[band]} (−${burn} fuel)`);
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }
  // Refuel back to a full tank. Costs a lot: a full tank = half of everything spent on the satellite (at least its
  // price), charged for the fuel missing, so keeping a big late-game satellite flying is a real upkeep cost.
  const refuelCost = t => t.fuel == null || t.fuel >= FUEL_MAX ? 0 : Math.ceil(Math.max(TOWERS[t.type].tiers[0].cost, t.spent * 0.5) * (FUEL_MAX - t.fuel) / FUEL_MAX / 10) * 10;
  function refuel(t) {
    const cost = refuelCost(t);
    if (!EXP || !cost) return;
    if (S.money < cost) { toast("Not enough credits to refuel"); sfx("deny"); return; }
    S.money -= cost; S.stats.spent += cost; t.fuel = FUEL_MAX; // upkeep: not added to the sell value
    burst(t.x, t.y, "#7dff9a", 14, 80, 0.6, t.z);
    sfx("upgrade"); toast(`⛽ Refueled: ${FUEL_MAX} waves`);
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }
  const nextOrbit = t => { const bi = B.rings[B.slots[t.slot].ring].body; for (let k = 1; k <= 2; k++) { const b = ((t.orbit || 0) + k) % 3; if (freeLanes(bi, b).length) return b; } return null; };

  // Launch panel: shown while a satellite is picked. Zone + launch site + LAUNCH.
  const launchSites = () => B.bodies.map((b, i) => i).filter(i => launchSlot(i) != null && !(S.bodyHp && i && S.bodyHp[i] <= 0));
  let padEl = null, padKey = "";
  function renderLaunchPad() {
    if (!EXP) return;
    if (!padEl) {
      padEl = document.createElement("div"); padEl.id = "launchPad";
      padEl.style.cssText = "position:absolute;left:50%;transform:translateX(-50%);bottom:52px;z-index:6;display:none;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;padding:8px 10px;border-radius:14px;background:rgba(7,24,42,.94);border:1px solid #386782;color:#dfefff;font:600 13px system-ui,sans-serif;max-width:calc(100% - 16px)";
      stage.appendChild(padEl);
      padEl.addEventListener("click", ev => {
        const z = ev.target.closest("[data-band]"), go = ev.target.closest("[data-launch]");
        if (z) { S.launchBand = +z.dataset.band; sfx("click"); renderLaunchPad(); }
        if (go) launchNow();
      });
      padEl.addEventListener("change", ev => { if (ev.target.matches("select")) { S.launchFrom = +ev.target.value; sfx("click"); renderLaunchPad(); } });
    }
    const type = S && !S.over && S.selectedType, def = type && TOWERS[type];
    if (!def || def.ground) { padEl.style.display = "none"; padKey = ""; return; }
    const sites = launchSites();
    if (!sites.includes(S.launchFrom)) S.launchFrom = sites[0];
    const band = S.launchBand || 0, from = S.launchFrom, free = from == null ? 0 : freeLanes(from, band).length, cost = def.tiers[0].cost;
    const narrow = stage.clientWidth < 620;
    const key = [type, band, from, free, S.money >= cost, sites.join(), narrow].join("|");
    if (key === padKey) return; padKey = key;
    padEl.style.bottom = narrow ? "6px" : "52px"; padEl.style.width = narrow ? "calc(100% - 12px)" : ""; padEl.style.gap = narrow ? "6px" : "8px"; padEl.style.padding = narrow ? "6px" : "8px 10px";
    const zb = i => `<button data-band="${i}" style="${narrow ? "flex:1;" : ""}padding:6px 11px;border-radius:9px;border:1px solid #7fd8ff;font:inherit;cursor:pointer;${band === i ? "background:#7fd8ff;color:#07182a" : "background:transparent;color:#bfefff"}">${BAND[i]}</button>`;
    padEl.innerHTML = `${narrow ? "" : "<span>🛰 Orbit</span>"}${[0, 1, 2].map(zb).join("")}
      ${narrow ? "" : `<span style="margin-left:4px">from</span>`}<select style="${narrow ? "flex:1.6;min-width:0;" : ""}font:inherit;padding:5px;border-radius:8px;background:#0c2238;color:#dfefff;border:1px solid #386782">${sites.map(i => `<option value="${i}" ${i === from ? "selected" : ""}>${B.bodies[i].name} ${narrow ? `· ${freeLanes(i, band).length}` : `(${freeLanes(i, band).length} free)`}</option>`).join("")}</select>
      <button data-launch="1" ${free && S.money >= cost ? "" : "disabled"} style="${narrow ? "width:100%;" : ""}padding:8px 16px;border-radius:10px;border:0;font:800 14px system-ui,sans-serif;letter-spacing:.04em;cursor:pointer;background:${free && S.money >= cost ? "#ffb347" : "#555"};color:#1a0d00">🚀 LAUNCH · ${cost} cr</button>`;
    padEl.style.display = "flex";
  }
  function launchNow() {
    if (!S || !S.selectedType || S.launchFrom == null) return;
    placeTower(launchSlot(S.launchFrom));
    renderLaunchPad();
  }
  // Orbit lines on/off (top bar button, key L). Remembered on this device.
  OD.orbitLines = store.get("od_exp_lines") !== "0";
  function toggleOrbitLines() {
    OD.orbitLines = !OD.orbitLines; store.set("od_exp_lines", OD.orbitLines ? "1" : "0");
    if (linesBtn) { linesBtn.textContent = OD.orbitLines ? "Orbits: On" : "Orbits: Off"; linesBtn.classList.toggle("on", OD.orbitLines); }
    sfx("click"); toast(OD.orbitLines ? "Orbit lines on" : "Orbit lines off");
  }
  let linesBtn = null;
  if (EXP) {
    linesBtn = document.createElement("button"); linesBtn.id = "linesBtn"; linesBtn.title = "Show / hide orbit lines (L)";
    linesBtn.textContent = OD.orbitLines ? "Orbits: On" : "Orbits: Off"; linesBtn.classList.toggle("on", OD.orbitLines);
    linesBtn.onclick = toggleOrbitLines; ui.autoBtn.parentNode.insertBefore(linesBtn, ui.autoBtn);
    window.addEventListener("keydown", ev => { if ((ev.key === "l" || ev.key === "L") && S && !(ev.target.closest && ev.target.closest("input,select"))) toggleOrbitLines(); });
  }
  const pickLaunchSite = bi => { if (!EXP || !S || !S.selectedType || !launchSites().includes(bi)) return false; S.launchFrom = bi; sfx("click"); renderLaunchPad(); return true; };

  // Invaders spiral toward the centre; moons/planets bend their path with gravity.
  // Works in 3D (z = height); on flat maps z stays 0 and this is the classic 2D spiral.
  function moveEnemy(e, v, dt) {
    if (e.tb && !(S.bodyHp && S.bodyHp[e.tb] > 0)) e.tb = 0; // its planet has fallen: head for the Sun
    if (e.tb) return movePlanetward(e, v, dt);
    const dx = e.x - CX, dy = e.y - CY, dz = e.z || 0, r = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / r, uy = dy / r, uz = dz / r;
    let vx, vy, vz;
    if (r > B.spiral) {
      vx = -ux * v * 1.6; vy = -uy * v * 1.6; vz = -uz * v * 1.6;
    } else {
      const sp = e.def.spiral, inward = Math.sqrt(1 - sp * sp), tang = sp * Math.min(1, r / 60);
      const hl = Math.hypot(ux, uy) || 1; // horizontal circling direction
      const tx = (-uy / hl) * e.dir, ty = (ux / hl) * e.dir;
      vx = (-ux * inward + tx * tang) * v;
      vy = (-uy * inward + ty * tang) * v;
      vz = -uz * inward * v;
      const belt = B.bodies[0].belt, hr = Math.hypot(dx, dy);
      if (belt && hr > belt.inner && hr < belt.outer && Math.abs(dz) < 25) { vx *= belt.slow; vy *= belt.slow; vz *= belt.slow; }
      for (const b of B.bodies) {
        if (b.root || !b.gravity) continue;
        const bx = b.x - e.x, by = b.y - e.y, bz = -dz, d = Math.hypot(bx, by, bz) || 1;
        if (d < b.gravR) {
          const k = Math.min(0.9, b.gravity * 1.4 * (1 - d / b.gravR)) * v;
          vx += (bx / d) * k; vy += (by / d) * k; vz += (bz / d) * k;
        }
      }
    }
    e.x += vx * dt; e.y += vy * dt; e.z = dz + vz * dt;
    // invaders can't fly through moons: slide around them
    for (const b of B.bodies) {
      if (b.root || (S.bodyHp && S.bodyHp[B.bodies.indexOf(b)] <= 0)) continue;
      const bx = e.x - b.x, by = e.y - b.y, bz = e.z, d = Math.hypot(bx, by, bz) || 1, min = b.r + e.def.size * 0.6;
      if (d < min) {
        const nx = bx / d, ny = by / d, nz = bz / d;
        e.x = b.x + nx * min - ny * e.dir * v * dt; e.y = b.y + ny * min + nx * e.dir * v * dt; e.z = nz * min;
      }
    }
    e.vx = vx; e.vy = vy; e.vz = vz;
    e.r = Math.hypot(e.x - CX, e.y - CY, e.z);
  }

  // Solar System invaders aimed at a planet: fly at it (it keeps orbiting), circling a little as they close in
  function movePlanetward(e, v, dt) {
    const b = B.bodies[e.tb], dx = b.x - e.x, dy = b.y - e.y, dz = -(e.z || 0), d = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / d, uy = dy / d, uz = dz / d, sp = e.def.spiral * Math.min(1, d / 160) * 0.6, inward = Math.sqrt(1 - sp * sp);
    const hl = Math.hypot(ux, uy) || 1, tx = (-uy / hl) * e.dir, ty = (ux / hl) * e.dir, fast = 1;
    const vx = (ux * inward + tx * sp) * v * fast, vy = (uy * inward + ty * sp) * v * fast, vz = uz * inward * v * fast;
    e.x += vx * dt; e.y += vy * dt; e.z = (e.z || 0) + vz * dt;
    e.vx = vx; e.vy = vy; e.vz = vz;
    e.r = Math.hypot(b.x - e.x, b.y - e.y, e.z); // distance to its target ("First" targeting = closest to hitting it)
  }
  // a planet at 0 HP is knocked out: it goes dark and its satellites go offline for the rest of the game
  function knockOut(bi) {
    const b = B.bodies[bi];
    S.bodyHp[bi] = 0;
    for (const t of S.towers) if (B.rings[B.slots[t.slot].ring].body === bi) t.offline = true;
    for (const e of S.enemies) if (e.tb === bi) e.tb = 0; // its attackers turn on the Sun
    burst(b.x, b.y, "#ff5c7a", 40, 200, 1, 0); ringFx(b.x, b.y, b.r * 3, "#ff5c7a", 0.8);
    S.shake = Math.max(S.shake, 14); sfx("nova");
    toast(`🪐 ${b.name} has fallen! Its satellites are offline.`, 3200);
  }

  function pushOut(e, amount) {
    const dx = e.x - CX, dy = e.y - CY, dz = e.z || 0, r = Math.hypot(dx, dy, dz) || 1;
    const nr = Math.min(B.spiral, r + amount);
    e.x = CX + (dx / r) * nr; e.y = CY + (dy / r) * nr; e.z = (dz / r) * nr; e.r = nr;
  }

  function towerAct(t, dt) {
    if (t.offline) return; // on a fallen planet
    const st = t.st, kind = TOWERS[t.type].kind;
    if (t.recoil > 0) t.recoil -= dt * 4;
    if (t.flash > 0) t.flash -= dt * 2;
    if (kind === "field") return;
    if (kind === "miner") {
      if (!S.waveActive) return;
      t.timer = (t.timer || 0) + dt;
      if (t.timer >= st.every) {
        t.timer = 0; t.flash = 1;
        S.money += st.income; t.earned = (t.earned || 0) + st.income; S.stats.earnedMining += st.income;
        if (S.stats.earnedMining >= 2000 * OD.ECON) unlock("tycoon");
        floater(t.x, t.y - 14, `+${st.income}`, "#ffd166");
        sfx("coin");
      }
      return;
    }
    if (kind === "carrier" || kind === "focus") return;
    if (kind === "mines") { // drops a mine where it is on its orbit, up to `max` at a time, during waves
      if (!S.waveActive) return;
      t.timer = (t.timer || 0) + dt;
      if (t.timer >= st.every && S.mines.filter(m => m.tower === t).length < st.max) {
        t.timer = 0; t.flash = 1;
        S.mines.push({ x: t.x, y: t.y, z: t.z || 0, tower: t, dmg: st.dmg, splash: st.splash, trigger: st.range, arm: 0.6, life: 40, nuke: t.path === "B", seed: Math.random() * 10 });
        sfx("pew");
      }
      return;
    }
    t.cd = Math.max(0, (t.cd || 0) - dt);

    if (kind === "emp") {
      if (st.arc) {
        if (t.cd > 0) return;
        const first = pickTarget(t, st.range, "close");
        if (!first) return;
        t.cd = 1 / st.rate;
        let prev = { x: t.x, y: t.y, z: t.z }, cur = first;
        const hit = new Set();
        for (let i = 0; i <= st.chains && cur; i++) {
          hit.add(cur);
          S.beams.push({ x1: prev.x, y1: prev.y, z1: prev.z || 0, x2: cur.x, y2: cur.y, z2: cur.z || 0, life: 0.12, color: "#cfe0ff", w: 2, bolt: true, fx: "arc" });
          cur.stun = Math.max(cur.stun, st.stun);
          const from = cur;
          damage(cur, st.dmg, t);
          prev = from;
          let next = null, nd = 110 * 110;
          for (const e of S.enemies) {
            if (e.dead || hit.has(e)) continue;
            const d = d3(from, e);
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        sfx("zap");
        return;
      }
      if (t.cd > 0) return;
      const r2 = st.range * st.range;
      const targets = S.enemies.filter(e => !e.dead && d3(t, e) <= r2);
      if (!targets.length) return;
      t.cd = 1 / st.rate;
      for (const e of targets) { e.stun = Math.max(e.stun, st.stun * (e.def.boss ? 0.3 : 1)); damage(e, st.dmg, t); }
      ringFx(t.x, t.y, st.range, t.path === "A" ? TOWERS.emp.paths.A.color : TOWERS.emp.color, 0.4, false, t.z); S.rings[S.rings.length - 1].fx = "emp"; // fx: cosmetic tag
      sfx("emp");
      return;
    }

    let target;
    if (kind === "silo") { // ground launcher: only invaders inside its planet's / moon's low orbit
      const body = B.bodies[B.rings[B.slots[t.slot].ring].body], leo2 = body.leo * body.leo;
      target = pickTarget(t, 1e5, t.targeting, null, e => (e.x - body.x) ** 2 + (e.y - body.y) ** 2 + (e.z || 0) ** 2 <= leo2);
    } else target = pickTarget(t, st.range, t.targeting);
    if (target) {
      t.aim = Math.atan2(target.y - t.y, target.x - t.x);
      t.aimP = Math.atan2((target.z || 0) - (t.z || 0), Math.hypot(target.x - t.x, target.y - t.y)); // 3D: barrel pitch
    }

    if (kind === "laser" && st.dps) {
      if (!target) { t.heat = 0; t.beamTarget = null; return; }
      if (t.beamTarget === target) t.heat = Math.min(2, (t.heat || 0) + dt); else { t.heat = 0; t.beamTarget = target; }
      const mul = 1 + Math.min(1, t.heat / 2) * (st.ramp - 1);
      damage(target, st.dps * mul * dt, t, { flash: false });
      S.beams.push({ x1: t.x + Math.cos(t.aim) * 26, y1: t.y + Math.sin(t.aim) * 26, z1: t.z, x2: target.x, y2: target.y, z2: target.z || 0, life: dt * 1.5, color: TOWERS.laser.paths.B.color, w: 2 + t.heat * 2.5, core: true, fx: "lance" });
      if (Math.random() < 0.3) burst(target.x, target.y, "#ffd27a", 1, 60, 0.3, target.z);
      sfx("lance");
      return;
    }

    if (t.type === "rail" && t.path === "B") t.spin = (t.spin || 0) + dt * (target ? 12 : 2);
    if (!target || t.cd > 0) return;
    t.cd = 1 / st.rate;

    if (kind === "laser") {
      t.alt = !t.alt;
      const off = t.level >= 1 ? (t.alt ? 4 : -4) : 0;
      const nx = -Math.sin(t.aim), ny = Math.cos(t.aim);
      const ox = t.x + Math.cos(t.aim) * 15 + nx * off, oy = t.y + Math.sin(t.aim) * 15 + ny * off;
      damage(target, st.dmg, t, { flash: false });
      S.beams.push({ x1: ox, y1: oy, z1: t.z, x2: target.x, y2: target.y, z2: target.z || 0, life: 0.07, color: t.path === "A" ? "#ffffff" : TOWERS.laser.color, w: 2, fx: "laser" });
      if (st.chain) {
        const hues = ["#ff5c7a", "#ffd166", "#7dff9a", "#6cf0ff", "#c18cff"];
        const others = S.enemies.filter(e => !e.dead && e !== target && d3(e, target) < 130 * 130)
          .sort((a, b) => d3(a, target) - d3(b, target)).slice(0, st.chain);
        others.forEach((e, i) => {
          S.beams.push({ x1: target.x, y1: target.y, z1: target.z || 0, x2: e.x, y2: e.y, z2: e.z || 0, life: 0.08, color: hues[i % hues.length], w: 1.5, fx: "prism" });
          damage(e, st.dmg * 0.6, t, { flash: false });
        });
        sfx("prism");
      } else sfx("laser");
    } else if (kind === "flak") { // a burst that hits the nearest `hits` invaders in range at once
      const r2 = st.range * st.range;
      const hits = S.enemies.filter(e => !e.dead && !e.cloaked && d3(t, e) <= r2).sort((a, b) => d3(t, a) - d3(t, b)).slice(0, st.hits);
      const col = t.path ? TOWERS.flak.paths[t.path].color : TOWERS.flak.color;
      for (const e of hits) {
        damage(e, st.dmg, t, { flash: false, pierceArmor: !!st.pierceArmor });
        S.beams.push({ x1: t.x, y1: t.y, z1: t.z || 0, x2: e.x, y2: e.y, z2: e.z || 0, life: 0.06, color: col, w: 1.5, bolt: true, fx: "bolt" });
        burst(e.x, e.y, col, 2, 70, 0.25, e.z);
      }
      sfx("pew");
    } else if (kind === "missile" || kind === "silo") {
      for (let i = 0; i < st.count; i++) {
        const a = t.aim + (i - (st.count - 1) / 2) * 0.35;
        S.shots.push({
          kind: "missile", x: t.x + Math.cos(a) * 12, y: t.y + Math.sin(a) * 12, z: t.z, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, vz: 0,
          target, dmg: st.dmg, splash: st.splash, cluster: st.cluster, clusterDmg: st.clusterDmg, burn: st.burn,
          nova: t.path === "B", life: 4, tower: t,
        });
      }
      sfx("missile");
    } else if (kind === "rail") {
      t.recoil = 1;
      // fire along the 3D line toward the target, out to full range
      const ddx = target.x - t.x, ddy = target.y - t.y, ddz = (target.z || 0) - (t.z || 0), dl = Math.hypot(ddx, ddy, ddz) || 1;
      const ex = t.x + ddx / dl * st.range, ey = t.y + ddy / dl * st.range, ez = (t.z || 0) + ddz / dl * st.range;
      const color = t.path ? TOWERS.rail.paths[t.path].color : TOWERS.rail.color;
      if (st.pierce) {
        for (const e of S.enemies) {
          if (!e.dead && segDist3(t, { x: ex, y: ey, z: ez }, e) <= (e.def.size + 5) ** 2) damage(e, st.dmg, t, { rail: true });
        }
        S.beams.push({ x1: t.x, y1: t.y, z1: t.z, x2: ex, y2: ey, z2: ez, life: t.path === "B" ? 0.08 : 0.25, color, w: t.path === "A" ? 6 : t.path === "B" ? 2 : 4, core: true, fx: t.path === "B" ? "railB" : "rail" });
      } else {
        damage(target, st.dmg, t, { rail: true });
        S.beams.push({ x1: t.x, y1: t.y, z1: t.z, x2: target.x, y2: target.y, z2: target.z || 0, life: 0.25, color, w: 4, core: true, fx: "rail" });
      }
      burst(target.x, target.y, color, t.path === "B" ? 3 : 8, 90, 0.7, target.z);
      sfx(t.path === "B" ? "coil" : "rail");
    }
  }

  // squared distance from point p to the segment a→b (3D)
  function segDist3(a, b, p) {
    const az = a.z || 0, bz = b.z || 0, pz = p.z || 0;
    const dx = b.x - a.x, dy = b.y - a.y, dz = bz - az, len = dx * dx + dy * dy + dz * dz;
    let k = len ? ((p.x - a.x) * dx + (p.y - a.y) * dy + (pz - az) * dz) / len : 0;
    k = Math.max(0, Math.min(1, k));
    return (p.x - a.x - dx * k) ** 2 + (p.y - a.y - dy * k) ** 2 + (pz - az - dz * k) ** 2;
  }

  // p: blast centre ({x, y, z})
  function explode(p, radius, dmg, src, opts = {}) {
    for (const e of S.enemies) if (!e.dead && d3(p, e) < (radius + e.def.size) ** 2) {
      damage(e, dmg, src);
      if (opts.burn) e.burn = { dps: opts.burn, t: 3, src };
    }
  }

  // Mine Layer mines: arm after a moment, blow up when an invader comes close, fade after a while
  function updateMines(dt) {
    if (!S.mines.length) return;
    for (const m of S.mines) {
      m.arm -= dt; m.life -= dt;
      if (m.life <= 0 || !S.towers.includes(m.tower)) { m.dead = true; continue; }
      if (m.arm > 0) continue;
      const hit = S.enemies.some(e => !e.dead && d3(m, e) < (m.trigger + e.def.size) ** 2);
      if (!hit) continue;
      m.dead = true;
      explode(m, m.splash, m.dmg, m.tower);
      const col = m.nuke ? "#ff4a4a" : TOWERS.mines.color;
      burst(m.x, m.y, col, m.nuke ? 30 : 14, m.nuke ? 200 : 130, m.nuke ? 0.9 : 0.6, m.z);
      ringFx(m.x, m.y, m.splash, col, m.nuke ? 0.5 : 0.3, false, m.z);
      if (m.nuke) { S.shake = Math.max(S.shake, 6); sfx("nova"); } else sfx("boom");
    }
    S.mines = S.mines.filter(m => !m.dead);
  }

  function updateShots(dt) {
    for (const m of S.shots) {
      m.life -= dt;
      if (m.kind === "bomblet") {
        m.x += m.vx * dt; m.y += m.vy * dt; m.z += (m.vz || 0) * dt; m.vx *= 0.9; m.vy *= 0.9; m.vz = (m.vz || 0) * 0.9;
        if (m.life <= 0) { m.dead = true; explode(m, 32, m.dmg, m.tower); burst(m.x, m.y, "#ffd166", 5, 70, 0.4, m.z); sfx("boom"); }
        continue;
      }
      if (!m.target || m.target.dead) m.target = pickTarget(m, 400, "close");
      if (m.target) { // home in (3D)
        const hx = m.target.x - m.x, hy = m.target.y - m.y, hz = (m.target.z || 0) - (m.z || 0), hl = Math.hypot(hx, hy, hz) || 1;
        m.vx += hx / hl * 1000 * dt; m.vy += hy / hl * 1000 * dt; m.vz = (m.vz || 0) + hz / hl * 1000 * dt;
      }
      const sp = Math.hypot(m.vx, m.vy, m.vz || 0), max = m.nova ? 260 : 360;
      if (sp > max) { m.vx *= max / sp; m.vy *= max / sp; m.vz = (m.vz || 0) * max / sp; }
      m.x += m.vx * dt; m.y += m.vy * dt; m.z = (m.z || 0) + (m.vz || 0) * dt;
      if (Math.random() < 0.7) S.particles.push({ x: m.x, y: m.y, z: m.z, vx: 0, vy: 0, vz: 0, life: m.nova ? 0.5 : 0.3, max: 0.5, color: m.nova ? "#ff8a5c" : "#ffcf8a" });
      const hit = m.target && d3(m, m.target) < (m.target.def.size + 5) ** 2;
      if (hit || m.life <= 0) {
        m.dead = true;
        explode(m, m.splash, m.dmg, m.tower, { burn: m.burn });
        if (m.nova) {
          burst(m.x, m.y, "#ffb347", 40, 220, 0.9, m.z); burst(m.x, m.y, "#fff3c0", 15, 120, 0.6, m.z);
          ringFx(m.x, m.y, m.splash, "#ff5c5c", 0.5, false, m.z); S.shake = Math.max(S.shake, 6); sfx("nova");
        } else {
          burst(m.x, m.y, TOWERS.missile.color, 14, 140, 0.7, m.z);
          ringFx(m.x, m.y, m.splash, TOWERS.missile.color, 0.2, false, m.z); sfx("boom");
        }
        for (let i = 0; i < (m.cluster || 0); i++) {
          const a = Math.random() * TAU, v = 120 + Math.random() * 120, vz = MAP.threeD ? (Math.random() - 0.5) * 160 : 0;
          S.shots.push({ kind: "bomblet", x: m.x, y: m.y, z: m.z, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz, life: 0.35 + Math.random() * 0.2, dmg: m.clusterDmg, tower: m.tower });
        }
      }
    }
  }

  function updateCrafts(dt) {
    for (const t of S.towers) {
      if (t.type !== "carrier") continue;
      const st = t.st, bomber = !!st.bomb;
      t.crafts = t.crafts || [];
      if (t.crafts.length && t.crafts[0].bomber !== bomber) t.crafts = [];
      while (t.crafts.length < st.craft) t.crafts.push({ x: t.x, y: t.y, z: t.z || 0, vx: 0, vy: 0, vz: 0, angle: 0, cd: Math.random(), bomber, orbit: Math.random() * TAU });
      const target = pickTarget(t, st.range, t.targeting);
      t.crafts.forEach((f, i) => {
        f.cd -= dt; f.orbit += dt * (bomber ? 1.5 : 3);
        let tx, ty, tz;
        const tgt = target && !target.dead ? target : null;
        if (tgt) {
          const rad = bomber ? 6 : 34;
          tx = tgt.x + Math.cos(f.orbit + i) * rad; ty = tgt.y + Math.sin(f.orbit + i) * rad; tz = tgt.z || 0;
        } else {
          tx = t.x + Math.cos(f.orbit + i * TAU / st.craft) * 30; ty = t.y + Math.sin(f.orbit + i * TAU / st.craft) * 30; tz = t.z || 0;
        }
        const max = bomber ? 200 : 300, acc = bomber ? 500 : 900;
        const sx = tx - f.x, sy = ty - f.y, sz = tz - (f.z || 0), sl = Math.hypot(sx, sy, sz) || 1;
        f.vx += sx / sl * acc * dt; f.vy += sy / sl * acc * dt; f.vz = (f.vz || 0) + sz / sl * acc * dt;
        const sp = Math.hypot(f.vx, f.vy, f.vz);
        if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; f.vz *= max / sp; }
        f.vx *= 0.985; f.vy *= 0.985; f.vz *= 0.985;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z = (f.z || 0) + f.vz * dt;
        f.angle = Math.atan2(f.vy, f.vx);
        if (!tgt || f.cd > 0) return;
        const d2 = d3(f, tgt);
        if (bomber && d2 < 40 * 40) {
          f.cd = 1 / st.rate;
          explode(tgt, st.splash, st.dmg, t);
          burst(tgt.x, tgt.y, "#ff6b8b", 14, 120, 0.7, tgt.z); ringFx(tgt.x, tgt.y, st.splash, "#ff6b8b", 0.25, false, tgt.z); sfx("bomb");
        } else if (!bomber && d2 < 110 * 110) {
          f.cd = 1 / st.rate;
          damage(tgt, st.dmg, t, { flash: false });
          S.beams.push({ x1: f.x, y1: f.y, z1: f.z, x2: tgt.x, y2: tgt.y, z2: tgt.z || 0, life: 0.05, color: "#ffc4ee", w: 1.2, fx: "fighter" });
          sfx("pew");
        }
      });
    }
  }

  // ---------- records ----------
  // 3D and Classic 2D play differently, so each view keeps its own records, saved game and leaderboards.
  const VIEW_TAG = OD.is3D ? "3d" : "";
  const recKey = (map, diff) => `od_rec${VIEW_TAG}_${map}_${diff}`;
  function getRec(map, diff) { try { return JSON.parse(store.get(recKey(map, diff)) || "null"); } catch { return null; } }
  function saveRec() {
    const old = getRec(S.mapKey, S.diffKey) || {};
    const rec = { wave: Math.max(old.wave || 0, S.wave), score: Math.max(old.score || 0, S.score), won: !!(old.won || S.won) };
    store.set(recKey(S.mapKey, S.diffKey), JSON.stringify(rec));
    return { rec, newBest: S.score > (old.score || 0) };
  }

  // ---------- saved game (resume) ----------
  // The run is saved between waves (never mid-wave), so Continue restarts at the last cleared wave.
  const RUN_KEY = `od_run${VIEW_TAG}${EXP ? "_exp" : ""}`; // Own Orbits runs: saves from the old slot rules don't load into it
  const packTower = t => ({ type: t.type, slot: t.slot, level: t.level, path: t.path, spent: t.spent, targeting: t.targeting,
    dmg: Math.round(t.dmg || 0), kills: t.kills || 0, earned: t.earned || 0, sold: !!t.sold, oc: t.oc || 0, asc: t.asc || 0, fuel: t.fuel, orbit: t.orbit });
  function saveRun() {
    if (!S || S.over || S.waveActive || (S.won && !S.freeplay)) return;
    store.set(RUN_KEY, JSON.stringify({
      v: 1, map: S.mapKey, diff: S.diffKey, seed: S.seed, wave: S.wave, lives: S.lives, money: S.money, score: S.score,
      stats: S.stats, realTime: S.realTime, bodyHp: S.bodyHp, won: S.won, freeplay: S.freeplay, revived: !!S.revived, adWave: S.adWave, endless: !!S.endless,
      towers: S.towers.map(packTower), retired: S.retired.map(packTower),
      board: { time: B.time, rings: B.rings.map(r => r.angle), bodies: B.bodies.map(b => b.angle || 0) }, savedAt: Date.now(),
    }));
  }
  function loadRun() {
    try { const r = JSON.parse(store.get(RUN_KEY) || "null"); if (r && r.v === 1 && MAPS[r.map] && DIFFICULTY[r.diff]) return r; } catch { /* corrupt save */ }
    return null;
  }
  const clearRun = () => store.remove(RUN_KEY);
  function resumeRun(r) {
    MAP_KEY = r.map; DIFF_KEY = r.diff; pendingSeed = r.seed;
    begin(r.map, r.diff, true, !!r.endless);
    Object.assign(S, { wave: r.wave, lives: r.lives, money: r.money, score: r.score, realTime: r.realTime || 0,
      won: !!r.won, freeplay: !!r.freeplay, revived: !!r.revived, adWave: r.adWave });
    Object.assign(S.stats, r.stats || {});
    B.time = r.board.time || 0;
    r.board.rings.forEach((a, i) => { if (B.rings[i]) B.rings[i].angle = a; });
    r.board.bodies.forEach((a, i) => { if (B.bodies[i] && !B.bodies[i].root) B.bodies[i].angle = a; });
    positionBodies();
    S.towers = r.towers.filter(t => B.slots[t.slot] && TOWERS[t.type]).map(t => {
      const p = slotPos(t.slot);
      return Object.assign({ id: nextId++, cd: 0, aim: p.a, x: p.x, y: p.y, z: p.z, ringA: p.a }, t);
    });
    S.retired = (r.retired || []).filter(t => TOWERS[t.type]).map(t => Object.assign({ id: nextId++ }, t));
    if (S.bodyHp && Array.isArray(r.bodyHp) && r.bodyHp.length === S.bodyHp.length) {
      S.bodyHp = r.bodyHp.slice();
      for (const t of S.towers) if (S.bodyHp[B.rings[B.slots[t.slot].ring].body] <= 0 && B.rings[B.slots[t.slot].ring].body) t.offline = true;
    }
    lastPreview = -1;
    updateUI(true);
    toast(`Welcome back! ${MAP.name}, wave ${S.wave} cleared`, 2500);
  }

  // ---------- achievements ----------
  const ACHIEVEMENTS = [
    { id: "first_wave", name: "First Contact", desc: "Clear your first wave." },
    { id: "first_boss", name: "Giant Slayer", desc: "Destroy a Mothership or the Dreadnought." },
    { id: "tier5", name: "Fully Armed", desc: "Upgrade a satellite to tier 5." },
    { id: "armada", name: "Orbital Armada", desc: "Have 20 satellites in orbit at once." },
    { id: "tycoon", name: "Space Tycoon", desc: "Mine 10,000 credits in one game." },
    { id: "first_win", name: "Defender", desc: "Win any map." },
    { id: "perfect", name: "Untouchable", desc: "Win a map without a single leak." },
    { id: "win_hard", name: "Hardened", desc: "Win a Hard or Expert map." },
    { id: "grand_tour", name: "Grand Tour", desc: "Win on all eight planets." },
    { id: "win_sol", name: "Guardian of the Sun", desc: "Win the Solar System map." },
    { id: "endless_50", name: "Deep Space", desc: "Reach wave 50 in Endless mode." },
    { id: "endless_100", name: "Centurion", desc: "Reach wave 100 in Endless mode." },
  ];
  function getAch() { try { return JSON.parse(store.get("od_ach") || "{}"); } catch { return {}; } }
  function unlock(id) {
    const got = getAch();
    if (got[id]) return;
    const a = ACHIEVEMENTS.find(x => x.id === id);
    if (!a) return;
    got[id] = Date.now();
    store.set("od_ach", JSON.stringify(got));
    P.achievement(id);
    setTimeout(() => toast(`🏆 Achievement unlocked: ${a.name}`, 2600), 900);
  }

  // ---------- rewarded bonuses (through js/monetization.js: an ad, or free for ad-free players) ----------
  const M = OD.monetization;
  const adReward = () => Math.round((60 + S.wave * 12) * S.diff.reward * OD.ECON);
  // The run itself records each grant (S.adWave, S.revived), so the limits survive saves and never pay twice.
  const creditsOnce = () => ({ done: () => !S || S.adWave === S.wave, mark: () => { S.adWave = S.wave; } });
  const reviveOnce = () => ({ done: () => !S || !!S.revived, mark: () => { S.revived = true; } });
  function claimCredits() {
    if (!S || S.waveActive || S.adWave === S.wave || !M.offer("credits").available) return;
    const amount = adReward(), method = M.offer("credits").method, run = S;
    ui.adBtn.disabled = true;
    M.claim("credits", creditsOnce()).then(ok => {
      ui.adBtn.disabled = false;
      if (!ok || S !== run) return;
      S.money += amount; S.stats.adCredits = (S.stats.adCredits || 0) + amount;
      stats.track(method === "ad" ? "ad/credits" : "premium/credits");
      toast(method === "ad" ? `+${amount} credits. Thanks for watching!` : `+${amount} bonus credits!`); sfx("coin");
      saveRun(); updateUI(true);
    });
  }
  P.onAdStart = () => { adPause = true; audio.setMuted(true); };
  P.onAdEnd = () => { adPause = false; audio.setMuted(false); };

  // ---------- endless milestones ----------
  function endlessMilestone() {
    const w = S.wave, reward = Math.round(milestoneReward(w) * S.diff.reward);
    S.money += reward; S.stats.earnedBonus += reward;
    S.score += w * 100;
    S.stats.milestones = (S.stats.milestones || 0) + 1;
    toast(`🏁 Endless milestone: wave ${w}! +${reward} credits`, 3200);
    sfx("win");
    const root = B.bodies[0];
    burst(root.x, root.y, "#ffd166", 70, 280, 1.3);
    ringFx(root.x, root.y, root.r * 3, "#ffd166", 0.9);
    S.shake = Math.max(S.shake, 6);
    stats.track(`endless/milestone-${w}`);
    if (w >= 50) unlock("endless_50");
    if (w >= 100) unlock("endless_100");
  }

  // ---------- end states + stats screen ----------
  function gameOver() {
    S.over = true; S.lives = 0;
    audio.setIntensity(0);
    P.gameplayStop();
    clearRun();
    sfx("lose");
    if (S.endless) {
      stats.track(`endless-over/${S.mapKey}/${S.diffKey}/w${stats.bucket(S.wave)}`);
      S.lastLb = LB.submit(S.mapKey, S.diffKey, { wave: S.wave, score: S.score }, S.lastLb && S.lastLb.entry.id);
      showStats("over", null, false, S.lastLb);
    } else {
      stats.track(`game-over/${S.mapKey}/${S.diffKey}/w${stats.bucket(S.wave)}`);
      const { rec, newBest } = saveRec();
      showStats("over", rec, newBest);
    }
    updateUI(true);
  }

  function lbTable(entries, highlightId) {
    if (!entries.length) return `<p class="muted">No Endless runs yet. Choose <b>∞ Endless</b> on the menu and see how far you get!</p>`;
    const medal = i => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1);
    return `<table class="lb"><thead><tr><th>#</th><th>Name</th><th>Wave</th><th>Score</th><th>Date</th></tr></thead><tbody>
      ${entries.map((e, i) => `<tr class="${e.id === highlightId ? "me" : ""}"><td>${medal(i)}</td><td>${esc(e.name || "You")}</td><td><b>${e.wave}</b></td><td>${e.score.toLocaleString()}</td><td>${esc(e.date)}</td></tr>`).join("")}
      </tbody></table>`;
  }

  function victory() {
    S.won = true; S.paused = true;
    P.gameplayStop(); P.happy();
    clearRun();
    stats.track(`win/${S.mapKey}/${S.diffKey}`);
    const { rec, newBest } = saveRec();
    sfx("win");
    unlock("first_win");
    if (!S.stats.leaked) unlock("perfect");
    if (S.diffKey === "hard") unlock("win_hard");
    if (MAP.final) unlock("win_sol");
    if (MAP_ORDER.filter(k => !MAPS[k].final).every(k => Object.keys(DIFFICULTY).some(d => (getRec(k, d) || {}).won))) unlock("grand_tour");
    showStats("won", rec, newBest);
  }

  function showStats(mode, rec, newBest, lb) {
    const st = S.stats;
    const all = [...S.towers, ...S.retired].filter(t => (t.dmg || 0) > 0 || (t.earned || 0) > 0 || mode === "pause");
    all.sort((a, b) => (b.dmg || 0) - (a.dmg || 0) || (b.earned || 0) - (a.earned || 0));
    const maxDmg = Math.max(1, ...all.map(t => t.dmg || 0));
    const mins = Math.floor(S.realTime / 60), secs = Math.floor(S.realTime % 60);
    const tile = (label, value, color) => `<div class="tile"><b${color ? ` style="color:${color}"` : ""}>${value}</b><span>${label}</span></div>`;
    const lifeName = MAP.lifeName || MAP.name;
    const head = mode === "won"
      ? `<h1 style="color:var(--good)">${MAP.final ? "SOLAR SYSTEM SAVED" : `${MAP.name.toUpperCase()} SAVED`}</h1><p>You destroyed the Dreadnought and survived all ${OD.WIN_WAVE} waves!</p>`
      : mode === "over" && S.endless
        ? `<h1 style="color:var(--gold)">ENDLESS RUN OVER</h1><p>You reached <b>wave ${S.wave}</b> with <b>${S.score.toLocaleString()}</b> points.</p>`
      : mode === "over"
        ? `<h1 style="color:var(--danger)">${MAP.final ? "THE SUN HAS FALLEN" : `${MAP.name.toUpperCase()} LOST`}</h1><p>You held out until <b>wave ${S.wave}</b>.</p>`
        : `<h1>MISSION STATS</h1><p class="muted">Wave ${S.wave} in progress</p>`;
    const rows = all.slice(0, 14).map((t, i) => {
      const def = TOWERS[t.type], tier = baseStats(t);
      const col = t.path ? def.paths[t.path].color : def.color;
      const metric = t.type === "miner" && !(t.dmg > 0)
        ? `<span>${fmt(t.earned || 0)} credits mined</span>`
        : `<span>${fmt(t.dmg || 0)} dmg · ${t.kills || 0} kills</span>`;
      const pct = t.type === "miner" && !(t.dmg > 0) ? 0 : (100 * (t.dmg || 0) / maxDmg);
      return `<div class="rep-row">
        <canvas width="40" height="40" data-preview="${t.type}|${t.level}|${t.path || ""}"></canvas>
        <div class="rep-name"><b style="color:${col}">${i === 0 && mode !== "pause" && (t.dmg || 0) > 0 ? "★ " : ""}${tier.name}</b><small>${def.name} · Tier ${t.level + 1}${t.sold ? " · sold" : ""}</small></div>
        <div class="rep-bar"><i style="width:${pct.toFixed(1)}%;background:${col}"></i>${metric}</div>
      </div>`;
    }).join("");
    const nextKey = MAP_ORDER[MAP_ORDER.indexOf(S.mapKey) + 1];
    const btns = mode === "won"
      ? `<button class="primary" data-act="freeplay">Freeplay ▶</button>${nextKey ? `<button class="primary" data-act="next">Next: ${MAPS[nextKey].name} →</button>` : ""}<button data-act="menu">Main Menu</button>`
      : mode === "over"
        ? `${!S.revived && M.offer("revive").available ? `<button class="primary ad" data-act="revive">${M.offer("revive").method === "ad" ? "📺 Watch ad: revive with 5 HP" : "🛡 Revive with 5 HP"}</button>` : ""}<button class="primary" data-act="retry">Try Again</button><button data-act="menu">Main Menu</button>`
        : `<button class="primary" data-act="pause">← Back</button>`;
    showOverlay(`
      ${head}
      <p class="muted">${MAP.name} · <span style="color:${S.diff.color}">${S.diff.name}</span>${rec ? ` · Best: wave ${rec.wave}, ${rec.score.toLocaleString()} pts` : ""}</p>
      ${newBest ? `<p class="newbest">★ New high score! ★</p>` : ""}
      ${lb ? `
        <p class="${lb.rank === 1 ? "newbest" : "muted"}">${lb.rank === 1 ? "★ New personal best! ★" : lb.rank ? `#${lb.rank} on your ${MAP.name} · ${S.diff.name} leaderboard` : "Not in your top 10 this time. One more run?"}</p>
        ${lb.rank && !LB.nickname() ? `<div class="nick"><input id="nickInput" maxlength="16" placeholder="Name for the leaderboard" autocomplete="off"><button class="primary" data-act="save-nick">Save</button></div>` : ""}
        ${lbTable(lb.entries, lb.entry.id)}` : ""}
      <div class="tiles">
        ${tile("Score", S.score.toLocaleString(), "var(--accent)")}
        ${tile("Waves", S.wave)}
        ${tile("Destroyed", st.killed)}
        ${tile("Leaked", st.leaked, st.leaked ? "var(--danger)" : "var(--good)")}
        ${tile("Bosses", st.bosses)}
        ${tile(`${lifeName} HP lost`, st.hpLost, st.hpLost ? "var(--danger)" : "var(--good)")}
        ${tile("Credits earned", fmt(st.earnedKills + st.earnedBonus + st.earnedMining), "var(--gold)")}
        ${tile("Credits spent", fmt(st.spent), "var(--gold)")}
        ${tile("Time", `${mins}:${String(secs).padStart(2, "0")}`)}
        ${S.endless ? tile("Milestones", S.stats.milestones || 0, "var(--gold)") : ""}
      </div>
      <h3 class="rep-title">Satellite report</h3>
      <div class="report">${rows || `<p class="muted">No satellites built.</p>`}${all.length > 14 ? `<p class="muted">…and ${all.length - 14} more</p>` : ""}</div>
      <p class="muted small">Earned: ${fmt(st.earnedKills)} from kills · ${fmt(st.earnedBonus)} wave bonuses · ${fmt(st.earnedMining)} mining${st.overdrives ? ` · ⚡ ${st.overdrives} overdrives` : ""}</p>
      <div class="btns">${btns}</div>`, true);
    ui.overlay.querySelectorAll("canvas[data-preview]").forEach(c => {
      if (paint3D(c)) return;
      const [type, lvl, path] = c.dataset.preview.split("|");
      const g = c.getContext("2d");
      g.setTransform(0.75, 0, 0, 0.75, 20, 20);
      OD.drawTower(g, { type, level: +lvl, path: path || null, aim: -Math.PI / 4, cd: 0, st: tierOf(type, +lvl, path || null) }, 0, -3, -Math.PI / 2, 0);
    });
  }

  // ---------- render ----------
  // the static background (world coordinates 0..W × 0..H) at screen resolution
  let bd = null, bdKey = "";
  function backdrop() {
    const key = `${MAP_KEY}|${Math.round(W)}|${Math.round(H)}|${canvas.width}|${canvas.height}`;
    if (bd && bdKey === key) return bd;
    bdKey = key; bd = bd || document.createElement("canvas");
    const s = Math.min(2, Math.max(canvas.width / W, canvas.height / H)); // pixels per world unit (at zoom 1)
    bd.width = Math.max(1, Math.round(W * s)); bd.height = Math.max(1, Math.round(H * s));
    const g = bd.getContext("2d"); g.setTransform(s, 0, 0, s, 0, 0);
    g.fillStyle = "#05060f"; g.fillRect(0, 0, W, H);
    const neb = g.createRadialGradient(CX, CY, 20, CX, CY, MAP.view * 0.75);
    neb.addColorStop(0, rgba(MAP.bg, 0.55)); neb.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = neb; g.fillRect(0, 0, W, H);
    if (OD.nebula) { g.globalAlpha = 0.32; g.drawImage(OD.nebula(MAP_KEY, MAP.bg), -W * 0.1, -H * 0.1, W * 1.2, H * 1.2); g.globalAlpha = 1; }
    if (!MAP.final) {
      const idx = MAP_ORDER.indexOf(MAP_KEY), glare = 0.55 - idx * 0.06;
      const gx = CX - 0.7 * W * 0.7, gy = CY - 0.7 * H * 0.9;
      const sg = g.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.6);
      sg.addColorStop(0, `rgba(255,220,150,${glare})`); sg.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = sg; g.fillRect(0, 0, W, H);
    }
    return bd;
  }
  function render() {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = scale * zoom * dpr;
    ctx.setTransform(k, 0, 0, k, dpr * (cssW / 2 - camX * scale * zoom), dpr * (cssH / 2 - camY * scale * zoom));
    const time = B.time;
    if (S && S.shake && OD.shake) ctx.translate((Math.random() - 0.5) * S.shake * OD.shake, (Math.random() - 0.5) * S.shake * OD.shake);

    // map-tinted glow, nebula and distant sunlight: pre-rendered once per map and screen size, one copy per frame
    ctx.drawImage(backdrop(), 0, 0, W, H);
    // stars: mostly faint and still, a few tinted, the brightest twinkle with a soft glow
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i], h = (i * 2654435761) >>> 0, tint = STAR_TINTS[h % 7];
      if (h % 23 === 0 && !FX.low()) { // bright star
        const a = 0.55 + 0.45 * Math.sin(time * 1.5 + s.tw);
        FX.glow(ctx, s.x, s.y, 4 + s.s * 2, tint, 0.35 * a);
        ctx.globalAlpha = 1; ctx.fillStyle = "#ffffff"; ctx.fillRect(s.x - 0.6, s.y - 0.6, 1.2 + s.s * 0.5, 1.2 + s.s * 0.5);
        continue;
      }
      ctx.globalAlpha = 0.25 + (h % 5 === 0 ? 0.3 + 0.3 * Math.sin(time * 1.5 + s.tw) : 0.35 * (s.s / 1.8));
      ctx.fillStyle = tint; ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;
    // orbits of moons / planets
    ctx.lineWidth = 1;
    for (const b of B.bodies) {
      if (b.root) continue;
      ctx.strokeStyle = "rgba(160,170,220,0.12)";
      ctx.beginPath(); ctx.arc(CX, CY, b.orbit, 0, TAU); ctx.stroke();
    }
    // Saturn's icy belt slows invaders
    const belt = B.bodies[0].belt;
    if (belt) {
      ctx.fillStyle = "rgba(220,230,255,0.05)";
      ctx.beginPath(); ctx.arc(CX, CY, belt.outer, 0, TAU); ctx.arc(CX, CY, belt.inner, 0, TAU, true); ctx.fill();
    }
    // gravity wells
    for (const b of B.bodies) {
      if (b.root || !b.gravity) continue;
      const g = ctx.createRadialGradient(b.x, b.y, b.r, b.x, b.y, b.gravR);
      g.addColorStop(0, `rgba(150,130,255,${0.12 * b.gravity})`); g.addColorStop(1, "rgba(150,130,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.gravR, 0, TAU); ctx.fill();
      const k = (time * 0.5 + b.orbit * 0.01) % 1;
      ctx.strokeStyle = `rgba(170,150,255,${0.18 * k * b.gravity})`;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + (b.gravR - b.r) * k, 0, TAU); ctx.stroke();
    }

    // turret rings + empty slots
    const odActive = S && S.overdrive > 0;
    const hoverSlot = S && S.hover;
    const usedLanes = EXP && S ? new Set(S.towers.map(t => B.slots[t.slot].ring)) : null;
    B.rings.forEach((ring, ri) => {
      if (ring.surface || ring.hidden || ring.launch) return;
      if (ring.lane && (!usedLanes || !usedLanes.has(ri) || OD.orbitLines === false)) return; // Own Orbits: only orbits in use
      const b = B.bodies[ring.body];
      ctx.strokeStyle = odActive ? "rgba(255,209,102,0.4)" : ring.lane ? ["rgba(108,240,255,0.3)", "rgba(125,255,154,0.3)", "rgba(193,140,255,0.3)"][ring.band] : "rgba(108,240,255,0.18)";
      ctx.lineWidth = odActive ? 2.5 : 1.5;
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -ring.angle * ring.r;
      ctx.beginPath(); ctx.arc(b.x, b.y, ring.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
    });
    const drawSlot = s => {
      if (towerAt(s.id) || !slotUsable(s.id)) return;
      const p = slotPos(s.id);
      const isHover = hoverSlot === s.id;
      ctx.fillStyle = S && S.selectedType ? (isHover ? "rgba(255,209,102,0.95)" : "rgba(108,240,255,0.6)") : "rgba(108,240,255,0.22)";
      if (s.surface) { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, isHover ? 8 : 5, 0, TAU); ctx.stroke(); return; } // ground pad: a ring
      ctx.beginPath(); ctx.arc(p.x, p.y, isHover ? 8 : S && S.selectedType ? 5 : 4, 0, TAU); ctx.fill();
    };
    for (const s of B.slots) if (!s.surface) drawSlot(s);

    // bodies
    for (const b of B.bodies) OD.drawBodyRings(ctx, b.style, b.x, b.y, b.r);
    const sunLight = MAP.final;
    for (const b of B.bodies) {
      let lx = -0.7, ly = -0.7;
      if (sunLight && !b.root) { const d = Math.hypot(CX - b.x, CY - b.y) || 1; lx = (CX - b.x) / d; ly = (CY - b.y) / d; }
      OD.drawBody(ctx, b.style, b.x, b.y, b.r, time, lx, ly);
    }
    if (S && !MAP.final) {
      const root = B.bodies[0];
      const hurt = S.lives / S.diff.lives < 0.3;
      if (hurt) { ctx.strokeStyle = `rgba(255,92,122,${0.4 + 0.3 * Math.sin(time * 6)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(root.x, root.y, root.r + 6, 0, TAU); ctx.stroke(); }
    }
    for (const s of B.slots) if (s.surface) drawSlot(s); // ground pads sit on top of the planets
    if (S) for (const m of S.mines) FX.mine(ctx, m, time, TOWERS.mines.color); // Mine Layer mines: spiked, blinking
    // body labels (small)
    if (B.bodies.length > 1) {
      ctx.font = "10px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.fillStyle = "rgba(200,210,255,0.45)";
      for (const b of B.bodies) if (!b.root) {
        const bi = B.bodies.indexOf(b), hp = S && S.bodyHp ? S.bodyHp[bi] : null;
        ctx.fillStyle = hp === 0 ? "rgba(255,92,122,0.7)" : "rgba(200,210,255,0.45)";
        ctx.fillText(hp == null ? b.name : hp > 0 ? `${b.name} ♥${hp}` : `${b.name} ✖`, b.x, b.y + b.r + (B.rings.find(r => B.bodies[r.body] === b)?.r || 0) - b.r + 14);
      }
    }

    if (!S) { ctx.restore(); return; }

    const showRange = (x, y, r, color) => {
      ctx.fillStyle = rgba(color, 0.08); ctx.strokeStyle = rgba(color, 0.45); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    };
    if (S.selectedTower) {
      const t = S.selectedTower, st = t.st || baseStats(t);
      const r = st.buffRange || st.focusRange || st.range, col = t.path ? TOWERS[t.type].paths[t.path].color : TOWERS[t.type].color;
      if (t.type === "silo") { const b = B.bodies[B.rings[B.slots[t.slot].ring].body]; showRange(b.x, b.y, b.leo, col); } // its reach: the low orbit around its body
      else if (r) showRange(t.x, t.y, r, col);
      ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(t.x, t.y, 24, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else if (S.selectedType && S.hover != null && !towerAt(S.hover)) {
      const p = slotPos(S.hover), def = TOWERS[S.selectedType];
      if (def.tiers[0].range) showRange(p.x, p.y, def.tiers[0].range, def.color);
    }

    for (const t of S.towers) {
      if (TOWERS[t.type].kind !== "field" || !t.st) continue;
      const pulse = (time * 0.8) % 1, col = t.path ? TOWERS.tractor.paths[t.path].color : TOWERS.tractor.color;
      ctx.strokeStyle = rgba(col, 0.35 * (1 - pulse)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.st.range * (t.path === "A" ? 1 - pulse : pulse), 0, TAU); ctx.stroke();
    }

    FX.now = S.time; // shield-hit ripples read the game clock
    for (const e of S.enemies) OD.drawEnemy(ctx, e, time, CX, CY);
    FX.settle(S.towers); // satellites already in orbit when a game starts or resumes don't launch
    for (const t of S.towers) {
      const p0 = t.x == null ? slotPos(t.slot) : { x: t.x, y: t.y, a: t.ringA };
      const ring = B.rings[B.slots[t.slot].ring], p = FX.flight(ctx, t, p0, B.bodies[ring.body], !!TOWERS[t.type].ground); // launch / orbit change (drawing only)
      if (p.sc && p.sc < 1) { ctx.save(); ctx.translate(p.x, p.y); ctx.scale(p.sc, p.sc); ctx.translate(-p.x, -p.y); drawTowerAt(t, p, time); ctx.restore(); }
      else drawTowerAt(t, p, time);
      const mz = MUZZLE2D[t.type], st = t.st; // muzzle flash right after each shot (read from the cooldown)
      if (mz && st && st.rate && !st.dps && t.aim != null && p === p0) {
        const since = 1 / st.rate - (t.cd || 0);
        if (since >= 0 && since < 0.09) { const sc = MAP.satScale ? MAP.satScale + 0.15 : ring.r < 35 ? 0.75 : 1, L = (t.type === "rail" ? 27 : t.type === "flak" ? 17 : 18) * sc;
          ctx.globalCompositeOperation = "lighter"; FX.glow(ctx, p.x + Math.cos(t.aim) * L, p.y + Math.sin(t.aim) * L, 9 * sc, mz, 1 - since / 0.09, "core"); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; }
      }
      if (t.fuel != null && t.fuel <= 3) { ctx.strokeStyle = `rgba(255,92,92,${0.45 + 0.4 * Math.sin(time * 6)})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, TAU); ctx.stroke(); } // low on fuel
    }
    for (const t of S.towers) if (t.crafts) for (const f of t.crafts) OD.drawCraft(ctx, f, t, time);
    const tw = tutWorldTarget();
    if (tw) {
      const pulse = (performance.now() / 700) % 1;
      ctx.strokeStyle = `rgba(255,209,102,${1 - pulse})`; ctx.lineWidth = 3 / zoom;
      ctx.beginPath(); ctx.arc(tw.x, tw.y, (tw.r || 16) + 6 + pulse * 18, 0, TAU); ctx.stroke();
    }

    if (S.selectedType && S.hover != null && !towerAt(S.hover)) {
      const p = slotPos(S.hover);
      ctx.globalAlpha = 0.55;
      drawTowerAt({ type: S.selectedType, level: 0, aim: p.a, slot: S.hover }, p, time);
      ctx.globalAlpha = 1;
    }

    // combat effects (js/fx2d.js): additive light for beams, blasts and sparks
    ctx.globalCompositeOperation = "lighter";
    for (const r of S.rings) FX.ring(ctx, r);
    for (const b of S.beams) FX.beam(ctx, b);
    for (const m of S.shots) FX.shot(ctx, m, time);
    FX.particles(ctx, S.particles);
    ctx.globalCompositeOperation = "source-over";
    FX.drawKills(ctx, time);
    ctx.globalAlpha = 1;
    ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(5,6,15,0.85)"; ctx.lineJoin = "round";
    for (const f of S.floaters) { // outlined so they read over planets and explosions
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Satellites on tiny rings (small moons / planets) are drawn smaller so they don't crowd.
  function drawTowerAt(t, p, time) {
    if (t.offline) { ctx.save(); ctx.globalAlpha = 0.35; drawTowerAt2(t, p, time); ctx.restore(); return; } // on a fallen planet
    drawTowerAt2(t, p, time);
  }
  function drawTowerAt2(t, p, time) {
    const ring = B.rings[B.slots[t.slot].ring];
    const s = MAP.satScale ? MAP.satScale + 0.15 : ring.r < 35 ? 0.75 : 1;
    for (let i = 0; i < (t.asc || 0); i++) { // Ascension halos (Classic 2D)
      ctx.strokeStyle = i === 2 ? "rgba(255,255,255,0.8)" : "rgba(193,140,255,0.75)"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, (13 + i * 3) * s, (6 + i * 1.5) * s, time * (0.8 + i * 0.5) * (i % 2 ? -1 : 1), 0, Math.PI * 2); ctx.stroke();
    }
    if (s === 1) return OD.drawTower(ctx, t, p.x, p.y, p.a, time);
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(s, s);
    OD.drawTower(ctx, t, 0, 0, p.a, time);
    ctx.restore();
  }

  // ---------- UI ----------
  // Satellite icons: 3D renders when the 3D view is on (view3d.js provides OD.satThumb), else the 2D art.
  function paint3D(c) {
    const [type, lvl, path] = c.dataset.preview.split("|");
    const img = OD.is3D && OD.satThumb && OD.satThumb(type, +lvl, path || null);
    if (!img) return false;
    const px = Math.max(128, Math.round((c.clientWidth || 48) * Math.min(3, window.devicePixelRatio || 1)));
    if (c.width !== px) { c.width = px; c.height = px; }
    const g = c.getContext("2d"); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, px, px);
    g.drawImage(img, 0, 0, px, px);
    return true;
  }
  function repaintIcons() {
    // the 3D module loads after the first menu is drawn: redraw the menu so it gains the 3D planet art
    if (!S && document.body.classList.contains("in-menu") && ui.overlay.querySelector("[data-map]")) mainMenu();
    ui.overlay.querySelectorAll("canvas[data-map-preview]").forEach(c => drawMapPreview(c, c.dataset.mapPreview));
    if (ui.shop.children.length) buildShop();
    if (S && S.selectedTower) renderInfo();
  }

  // satellites unlock as waves are cleared (OD.UNLOCK_WAVE); built from the game's own wave count, so saved games,
  // Endless and Freeplay all follow the same schedule and nothing extra is saved
  const wavesCleared = () => (S ? (S.waveActive ? S.wave - 1 : S.wave) : 0);
  const unlockWave = type => OD.UNLOCK_WAVE[type] || 0;
  const isUnlocked = type => wavesCleared() >= unlockWave(type);
  function announceUnlocks() {
    const fresh = Object.keys(TOWERS).filter(t => unlockWave(t) && unlockWave(t) === S.wave);
    if (!fresh.length) return;
    for (const t of fresh) { const b = ui.shop.querySelector(`[data-type="${t}"]`); if (b) b.classList.add("new"); }
    setTimeout(() => { if (S && !S.over) { toast(`🔓 New satellite unlocked: ${fresh.map(t => TOWERS[t].name).join(" & ")}!`, 3200); sfx("path"); } }, tut ? 0 : 2200);
  }

  function buildShop() {
    ui.shop.innerHTML = "";
    for (const [type, def] of Object.entries(TOWERS)) {
      const b = document.createElement("button");
      b.className = "tower-btn";
      b.dataset.type = type;
      b.innerHTML = `<canvas width="72" height="72" data-preview="${type}|0|"></canvas><span class="tb-text"><b style="color:${def.color}">${def.name}</b><small>${def.desc}</small><span class="cost">${def.tiers[0].cost} cr</span></span><kbd>${def.key}</kbd>${unlockWave(type) ? `<span class="lock"><b>?</b><small>Wave ${unlockWave(type)}</small></span>` : ""}`;
      b.addEventListener("click", () => { sfx("click"); selectType(type); });
      ui.shop.appendChild(b);
      if (paint3D(b.querySelector("canvas"))) continue;
      const c = b.querySelector("canvas").getContext("2d");
      c.setTransform(1.6, 0, 0, 1.6, 36, 36);
      OD.drawTower(c, { type, level: 0, aim: -Math.PI / 4 }, 0, -2, -Math.PI / 2, 0);
    }
  }

  function selectType(type) {
    if (!S || S.over) return;
    if (!isUnlocked(type)) { toast(`🔒 Unlocks after wave ${unlockWave(type)}`, 1600); sfx("deny"); return; }
    const nb = ui.shop.querySelector(`[data-type="${type}"]`); if (nb) nb.classList.remove("new");
    S.selectedTower = null;
    S.selectedType = S.selectedType === type ? null : type;
    if (S.selectedType) toast(EXP && !TOWERS[type].ground ? `Choose an orbit, then 🚀 LAUNCH ${TOWERS[type].name}` : `Tap a glowing slot to build ${TOWERS[type].name}`, 1400);
    renderInfo(); updateUI(true);
  }

  const fleetText = t => (t.links ? `+${Math.round((t.buffRate - 1) * 100)}% fire rate (${t.links} link${t.links > 1 ? "s" : ""}${t.linkBonus > LINK_CAP + 1e-9 ? ", max" : ""})` : "none in range");
  function statRows(t, st, next) {
    const rows = [];
    const row = (k, v, nv) => rows.push(`<div class="row"><span>${k}</span><b>${v}${nv !== undefined && nv !== null && String(nv) !== String(v) ? ` <em>→ ${nv}</em>` : ""}</b></div>`);
    const n = next || {};
    const r1 = x => (x == null ? x : Math.round(x * 10) / 10);
    switch (TOWERS[t.type].kind) {
      case "flak":
        row("Damage", st.dmg, n.dmg); row("Targets per burst", st.hits, n.hits); row("Bursts/s", r1(st.rate), r1(n.rate));
        if (st.pierceArmor || n.pierceArmor) row("Armor piercing", st.pierceArmor ? "Yes" : "No", n.pierceArmor !== undefined ? (n.pierceArmor ? "Yes" : "No") : undefined);
        row("Range", st.range, n.range); break;
      case "mines":
        row("Mine damage", st.dmg, n.dmg); row("Blast radius", st.splash, n.splash); row("New mine every", `${st.every}s`, n.every && `${n.every}s`); row("Mines at once", st.max, n.max); break;
      case "focus":
        row("Ally damage", `+${Math.round((st.focusDmg - 1) * 100)}%`, n.focusDmg && `+${Math.round((n.focusDmg - 1) * 100)}%`);
        if (st.mark || n.mark) row("Invaders take", `+${Math.round(((st.mark || 1) - 1) * 100)}%`, n.mark && `+${Math.round((n.mark - 1) * 100)}%`);
        row("Range", st.focusRange, n.focusRange); break;
      case "silo":
        row("Damage", st.dmg, n.dmg); row("Missiles", st.count, n.count); row("Launches/s", r1(st.rate), r1(n.rate)); row("Blast radius", st.splash, n.splash);
        row("Reach", "Low orbit (LEO)"); break;
      case "laser":
        if (st.dps) row("Beam DPS", `${st.dps}–${st.dps * st.ramp}`, n.dps && `${n.dps}–${n.dps * n.ramp}`);
        else { row("Damage", st.dmg, n.dmg); row("Shots/s", st.rate, n.rate); if (st.chain || n.chain) row("Extra targets", st.chain || 0, n.chain); }
        row("Range", st.range, n.range); break;
      case "missile":
        row("Damage", st.dmg, n.dmg); row("Missiles", st.count, n.count); row("Blast radius", st.splash, n.splash);
        if (st.cluster || n.cluster) row("Bomblets", st.cluster || 0, n.cluster);
        if (st.burn || n.burn) row("Burn/s", st.burn || 0, n.burn);
        row("Range", st.range, n.range); break;
      case "field":
        row("Slow", `${Math.round((1 - st.slow) * 100)}%`, n.slow && `${Math.round((1 - n.slow) * 100)}%`);
        row("Drain/s", st.dps, n.dps);
        if (st.push || n.push) row("Pushback", st.push || 0, n.push);
        if (st.freeze || n.freeze) row("Freeze", `${st.freeze || 0}s`, n.freeze && `${n.freeze}s`);
        if (st.vuln || n.vuln) row("Damage taken", `+${Math.round(((st.vuln || 1) - 1) * 100)}%`, n.vuln && `+${Math.round((n.vuln - 1) * 100)}%`);
        row("Range", st.range, n.range); break;
      case "rail":
        row("Damage", st.dmg, n.dmg); row("Shots/s", st.rate, n.rate); row("Pierce", st.pierce ? "Yes" : "No", n.pierce !== undefined ? (n.pierce ? "Yes" : "No") : undefined);
        if (st.boss || n.boss) row("Vs bosses", `×${st.boss || 1}`, n.boss && `×${n.boss}`);
        row("Range", st.range, n.range); break;
      case "emp":
        row("Damage", st.dmg, n.dmg);
        row(st.arc ? "Bolts/s" : "Pulses/s", r1(st.rate), r1(n.rate));
        if (st.chains || n.chains) row("Chain jumps", st.chains || 0, n.chains);
        row("Stun", `${st.stun}s`, n.stun && `${n.stun}s`); row("Range", st.range, n.range); break;
      case "miner":
        row("Credits / 8s", st.income, n.income);
        if (st.buffRate || n.buffRate) row("Ally fire rate", `+${Math.round(((st.buffRate || 1) - 1) * 100)}%`, n.buffRate && `+${Math.round((n.buffRate - 1) * 100)}%`);
        row("Earned", t.earned || 0); break;
      case "carrier":
        row(st.bomb ? "Bombers" : "Fighters", st.craft, n.craft); row("Damage", st.dmg, n.dmg); row("Attacks/s", st.rate, n.rate);
        if (st.splash || n.splash) row("Blast radius", st.splash || 0, n.splash);
        row("Patrol range", st.range, n.range); break;
    }
    if (TOWERS[t.type].kind !== "miner") {
      rows.push(`<div class="row"><span>Fleet Link</span><b data-fleet>${fleetText(t)}</b></div>`);
      if (t.focusMul > 1) row("Focus Array", `+${Math.round((t.focusMul - 1) * 100)}% damage`);
      row("Damage dealt", fmt(t.dmg || 0)); row("Kills", t.kills || 0);
    }
    return rows.join("");
  }

  function upgradeCard(t, level, path) {
    const tier = tierOf(t.type, level, path);
    const can = S.money >= tier.cost;
    const pathDef = path ? TOWERS[t.type].paths[path] : null;
    const col = pathDef ? pathDef.color : "#ffd166";
    return `<button class="up-card" data-up="${path || ""}" ${can ? "" : "disabled"} style="--c:${col}">
      <canvas width="56" height="56" data-preview="${t.type}|${level}|${path || ""}"></canvas>
      <span><b>${tier.name}</b><small>${tier.desc || ""}</small><span class="cost">${tier.cost} cr</span></span></button>`;
  }

  function renderInfo() {
    const t = S && S.selectedTower;
    if (!t) { ui.info.classList.remove("open"); ui.info.innerHTML = ""; return; }
    const def = TOWERS[t.type], st = t.oc ? applyOc({ ...baseStats(t) }, t.oc) : baseStats(t);
    const pathDef = t.path ? def.paths[t.path] : null;
    const color = pathDef ? pathDef.color : def.color;
    let upHtml = "", next = null;
    const bi = B.rings[B.slots[t.slot].ring].body, sat = EXP && t.fuel != null;
    if (t.level < 2) { next = tierOf(t.type, t.level + 1); upHtml = upgradeCard(t, t.level + 1); }
    else if (t.level === 2) {
      upHtml = `<div class="choose">Choose a specialization (permanent):</div>
        ${["A", "B"].map(p => `<div class="path-desc" style="color:${def.paths[p].color}">${def.paths[p].name}: <span>${def.paths[p].desc}</span></div>${upgradeCard(t, 3, p)}`).join("")}`;
    } else if (t.level === 3) { next = tierOf(t.type, 4, t.path); upHtml = upgradeCard(t, 4, t.path); }
    else if (t.level >= 4 && (canAscend(t) || canOverclock(t) || t.asc)) {
      const oc = t.oc || 0, cost = ocCost(t), isMiner = def.kind === "miner", asc = t.asc || 0;
      if (canAscend(t)) {
        const a = ASC[asc];
        upHtml += `<button class="up-card asc-card" data-asc="1" ${S.money >= a.cost ? "" : "disabled"} style="--c:#c18cff">
          <span class="oc-icon">✦${asc + 1}</span>
          <span><b>${a.name}</b><small>×${ASC_DMG} ${isMiner ? "income" : "damage"}, +12% fire rate, +6% range${def.kind === "carrier" ? ", +1 fighter" : ""}. ${asc + 1} of 3.</small><span class="cost">${fmt(a.cost)} cr</span></span></button>`;
      } else upHtml += `<div class="maxed" style="color:#c18cff">✦ Ascension III</div>`;
      if (canOverclock(t)) upHtml += `${oc ? `<div class="maxed" style="color:${color}">⚡ Overclock ${oc}: ×${(OC_MUL ** oc).toFixed(2)} ${isMiner ? "income" : "damage"}</div>` : ""}
        <button class="up-card oc-card" data-oc="1" ${S.money >= cost ? "" : "disabled"} style="--c:#ffd166">
        <span class="oc-icon">⚡${oc + 1}</span>
        <span><b>Overclock ${oc + 1}</b><small>+25% ${isMiner ? "income" : "damage"} (×${(OC_MUL ** (oc + 1)).toFixed(2)} total). No limit, each level costs more.</small><span class="cost">${cost} cr</span></span></button>`;
    }
    else upHtml = `<div class="maxed" style="color:${color}">★ Fully upgraded</div>`;

    const body = B.bodies[B.rings[B.slots[t.slot].ring].body];
    const targetBtn = def.targets ? `<button class="small" data-act="target">Target: <b>${TARGET_LABEL[t.targeting]}</b></button>` : "";
    ui.info.innerHTML = `
      <div class="info-head">
        <canvas width="64" height="64" data-preview="${t.type}|${t.level}|${t.path || ""}"></canvas>
        <div><h3 style="color:${color}">${st.name}</h3>
        <div class="sub">${def.name} · Tier ${t.level + 1}/5${t.asc ? ` ✦${t.asc}` : ""}${t.oc ? ` ⚡${t.oc}` : ""}${pathDef ? ` · ${pathDef.name}` : ""} · ${body.name} ${sat ? BAND[t.orbit || 0] : "orbit"}</div></div>
        <button class="close" data-act="close" aria-label="Close">✕</button>
      </div>
      ${sat ? `<div class="fuel" style="display:flex;align-items:center;gap:8px;margin:2px 0 6px;font-size:13px">⛽ Fuel
        <span style="flex:1;height:7px;border-radius:4px;background:#ffffff1f;overflow:hidden"><i style="display:block;height:100%;width:${t.fuel / FUEL_MAX * 100}%;background:${t.fuel <= 3 ? "#ff6b6b" : t.fuel <= 8 ? "#ffd166" : "#7dff9a"}"></i></span>
        <b>${t.fuel} / ${FUEL_MAX} waves</b></div>` : ""}
      <div class="stats">${statRows(t, st, next)}</div>
      <div class="ups">${upHtml}</div>
      <div class="actions">${sat && refuelCost(t) ? `<button class="small" data-act="refuel" ${S.money >= refuelCost(t) ? "" : "disabled"} title="Top up to ${FUEL_MAX} waves of fuel">⛽ Refuel <b>${fmt(refuelCost(t))}</b></button>` : ""}${sat ? `<button class="small" data-act="orbit" title="Move to another zone: 1 fuel per zone">Orbit: <b>${BAND[t.orbit || 0]}</b></button>` : ""}${targetBtn}<button class="small danger" data-act="sell">Sell +${sellValue(t)}</button></div>`;
    ui.info.classList.add("open");
    ui.info.querySelectorAll("canvas[data-preview]").forEach(c => {
      if (paint3D(c)) return;
      const [type, lvl, path] = c.dataset.preview.split("|");
      const g = c.getContext("2d"), s = c.width / 64;
      g.setTransform(1.15 * s, 0, 0, 1.15 * s, c.width / 2, c.height / 2);
      OD.drawTower(g, { type, level: +lvl, path: path || null, aim: -Math.PI / 4, cd: 0, st: tierOf(type, +lvl, path || null) }, 0, -3, -Math.PI / 2, B.time);
    });
  }

  ui.info.addEventListener("click", ev => {
    const t = S && S.selectedTower;
    if (!t) return;
    if (ev.target.closest("[data-oc]") && !ev.target.closest("[data-oc]").disabled) return overclockTower(t);
    if (ev.target.closest("[data-asc]") && !ev.target.closest("[data-asc]").disabled) return ascendTower(t);
    const up = ev.target.closest("[data-up]");
    const act = ev.target.closest("[data-act]");
    if (up && !up.disabled) upgradeTower(t, up.dataset.up || null);
    else if (act) {
      const a = act.dataset.act;
      if (a === "close") { S.selectedTower = null; renderInfo(); }
      else if (a === "sell") sellTower(t);
      else if (a === "refuel") refuel(t);
      else if (a === "orbit") { const nb = nextOrbit(t); if (nb == null) { toast("Every other zone is full"); sfx("deny"); } else setOrbit(t, nb); }
      else if (a === "target") { t.targeting = TARGET_MODES[(TARGET_MODES.indexOf(t.targeting) + 1) % TARGET_MODES.length]; sfx("click"); renderInfo(); }
    }
  });

  const sellValue = t => Math.floor(t.spent * 0.7 * (t.fuel != null ? Math.max(0.2, t.fuel / FUEL_MAX) : 1)); // Own Orbits: worth less as fuel runs low

  function upgradeTower(t, path) {
    if (t.level >= 4) return;
    const nextLevel = t.level + 1;
    const usePath = nextLevel === 3 ? path : t.path;
    if (nextLevel === 3 && !usePath) return;
    const tier = tierOf(t.type, nextLevel, usePath);
    if (S.money < tier.cost) { sfx("deny"); return; }
    S.money -= tier.cost; t.spent += tier.cost; S.stats.spent += tier.cost;
    t.level = nextLevel; t.path = usePath;
    const p = slotPos(t.slot);
    burst(p.x, p.y, nextLevel >= 3 ? TOWERS[t.type].paths[usePath].color : "#ffd166", 22, 110, 0.7, p.z);
    ringFx(p.x, p.y, 30, "#ffd166", 0.4, false, p.z);
    sfx(nextLevel === 3 ? "path" : "upgrade");
    if (nextLevel >= 3) toast(`${tier.name}!`);
    stats.once("first/upgrade");
    if (nextLevel === 2) tip("paths", "The next upgrade picks one of two specializations. The choice is permanent!", 600);
    if (nextLevel === 4) { unlock("tier5"); toast(S.endless || S.freeplay ? "Fully upgraded! Tap it again to ✦ Ascend or ⚡ Overclock for even more power." : "Fully upgraded! Save up to ✦ Ascend it for even more power.", 3000); }
    if (nextLevel === 3) stats.track(`path/${t.type}/${TOWERS[t.type].paths[usePath].name.toLowerCase().replace(/ /g, "-")}`);
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }

  function ascendTower(t) {
    if (!canAscend(t)) return;
    const a = ASC[t.asc || 0];
    if (S.money < a.cost) { sfx("deny"); return; }
    S.money -= a.cost; t.spent += a.cost; S.stats.spent += a.cost;
    t.asc = (t.asc || 0) + 1;
    const p = slotPos(t.slot);
    burst(p.x, p.y, "#c18cff", 40, 170, 1, p.z); burst(p.x, p.y, "#ffffff", 16, 120, 0.7, p.z);
    ringFx(p.x, p.y, 48, "#c18cff", 0.6, false, p.z);
    sfx("path");
    toast(`✦ ${a.name}!`);
    stats.track(`ascend/${t.type}/${t.asc}`);
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }

  function overclockTower(t) {
    if (!canOverclock(t)) return;
    const cost = ocCost(t);
    if (S.money < cost) { sfx("deny"); return; }
    S.money -= cost; t.spent += cost; S.stats.spent += cost;
    t.oc = (t.oc || 0) + 1;
    S.stats.overclocks = (S.stats.overclocks || 0) + 1;
    const p = slotPos(t.slot);
    burst(p.x, p.y, "#ffd166", 26, 130, 0.8, p.z);
    ringFx(p.x, p.y, 36, "#ffd166", 0.5, false, p.z);
    sfx("upgrade");
    toast(`⚡ Overclock ${t.oc}!`);
    if (t.oc === 1) stats.track(`overclock/${t.type}`);
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }

  function sellTower(t) {
    const v = sellValue(t);
    S.money += v; S.stats.spent -= v;
    S.towers = S.towers.filter(x => x !== t);
    t.sold = true; t.crafts = null;
    S.retired.push(t);
    burst(t.x, t.y, "#ffd166", 10, 80, 0.7, t.z);
    sfx("sell");
    S.selectedTower = null;
    if (!S.waveActive) saveRun();
    renderInfo(); updateUI(true);
  }

  function placeTower(slotId) {
    const def = TOWERS[S.selectedType];
    const cost = def.tiers[0].cost;
    if (S.bodyHp && S.bodyHp[B.rings[B.slots[slotId].ring].body] <= 0 && B.rings[B.slots[slotId].ring].body) { toast("That planet has fallen"); sfx("deny"); return; }
    if (!slotFits(slotId, S.selectedType)) { toast(def.ground ? "Missile Silos go on the ground pads on planets and moons" : "Ground pads are for Missile Silos"); sfx("deny"); return; }
    if (S.money < cost) { toast("Not enough credits"); sfx("deny"); return; }
    if (B.rings[B.slots[slotId].ring].launch) { // Own Orbits: launch onto a free LEO lane around that body
      const bi = B.rings[B.slots[slotId].ring].body, lane = freeLane(bi, S.launchBand || 0);
      if (lane == null) { toast(`${BAND[S.launchBand || 0]} around ${B.bodies[bi].name} is full: pick another zone or launch site`, 2800); sfx("deny"); return; }
      slotId = lane;
    }
    S.money -= cost; S.stats.spent += cost;
    const p = slotPos(slotId);
    S.towers.push(Object.assign({ id: nextId++, type: S.selectedType, slot: slotId, level: 0, path: null, spent: cost,
      cd: 0, aim: p.a, kills: 0, dmg: 0, targeting: "first", x: p.x, y: p.y, z: p.z, ringA: p.a }, EXP && !def.ground ? { fuel: FUEL_MAX - (S.launchBand || 0), orbit: S.launchBand || 0 } : {}));
    if (EXP && !def.ground) tip("fuel", `⛽ Each satellite has fuel for ${FUEL_MAX} waves, then burns up. Refuel it (tap it) before it runs dry; changing orbit costs 1 fuel per zone.`, 900, 6000);
    burst(p.x, p.y, def.color, 12, 90, 0.7, p.z);
    sfx("place");
    if (S.money < cost) S.selectedType = null;
    if (S.towers.length >= 20) unlock("armada");
    stats.once("first/build");
    if (!S.waveActive) saveRun();
    updateUI(true);
  }

  let lastUI = "", lastPreview = -1;
  function updateUI(force) {
    if (EXP) renderLaunchPad();
    if (!S) return;
    const odState = S.overdrive > 0 ? "on" : S.overdriveCd > 0 ? Math.ceil(S.overdriveCd) : "ready";
    const key = [S.wave, S.lives, S.money, S.score, S.waveActive, S.selectedType, S.speed, S.paused, S.auto, odState, S.over, M.isPremium()].join("|");
    if (key === lastUI && !force) return;
    lastUI = key;
    ui.wave.textContent = S.endless ? `${S.wave} ∞` : S.won || S.freeplay ? `${S.wave}` : `${S.wave}/${OD.WIN_WAVE}`;
    ui.livesLabel.textContent = MAP.lifeName || MAP.name;
    ui.lives.textContent = Math.max(0, S.lives);
    ui.lives.classList.toggle("danger", S.lives / S.diff.lives < 0.3);
    ui.money.textContent = S.money.toLocaleString();
    ui.score.textContent = S.score.toLocaleString();
    ui.diff.textContent = S.diff.name; ui.diff.style.color = S.diff.color;
    ui.waveBtn.disabled = S.waveActive || S.over;
    ui.waveBtn.innerHTML = S.waveActive ? `Wave ${S.wave}…` : `Launch Wave ${S.wave + 1} ▶`;
    // early waves: the launch button pulses while it's waiting for the player (never auto-launches)
    ui.waveBtn.classList.toggle("ready", !S.waveActive && !S.over && !S.auto && !tut && S.towers.length > 0 && S.wave < 5);
    ui.speedBtn.textContent = `${S.speed}×`;
    ui.autoBtn.classList.toggle("on", S.auto);
    ui.odBtn.disabled = S.overdriveCd > 0 || S.over;
    ui.odBtn.classList.toggle("on", S.overdrive > 0);
    const bonus = M.offer("credits");
    const adOk = bonus.available && !S.waveActive && !S.over && S.wave >= 1 && S.adWave !== S.wave;
    ui.adBtn.classList.toggle("hidden", !adOk);
    if (adOk) { ui.adBtn.textContent = `${bonus.method === "ad" ? "📺" : "🎁"} +${adReward()}`; ui.adBtn.title = bonus.method === "ad" ? "Watch a short ad for bonus credits" : "Claim your bonus credits"; }
    ui.odBtn.innerHTML = S.overdrive > 0 ? "⚡ Overdrive!" : S.overdriveCd > 0 ? `⚡ ${Math.ceil(S.overdriveCd)}s` : "⚡ Overdrive";
    for (const b of ui.shop.children) {
      const def = TOWERS[b.dataset.type];
      b.classList.toggle("selected", S.selectedType === b.dataset.type);
      b.classList.toggle("poor", S.money < def.tiers[0].cost);
      const locked = !isUnlocked(b.dataset.type);
      b.classList.toggle("locked", locked);
      b.title = locked ? `Unlocks after wave ${unlockWave(b.dataset.type)}` : "";
      if (locked) b.classList.remove("new");
    }
    const pv = S.waveActive ? S.wave : S.wave + 1;
    const obj = objective();
    const pvKey = `${pv}|${S.waveActive}|${obj}`;
    if (pvKey !== lastPreview) {
      lastPreview = pvKey;
      const nm = S.endless ? nextMilestone(S.wave) : 0;
      ui.preview.innerHTML = `<span class="pv-label">${S.waveActive ? "This wave" : "Next wave"}:</span>${obj ? `<span class="chip goal">🎯 ${obj}</span>` : ""}${previewText(pv)}${S.endless ? `<span class="chip milestone">🏁 Wave ${nm}: +${Math.round(milestoneReward(nm) * S.diff.reward)}</span>` : ""}`;
    }
    if (S.selectedTower) {
      ui.info.querySelectorAll("[data-up]").forEach(b => {
        const lvl = S.selectedTower.level + 1;
        const tier = tierOf(S.selectedTower.type, lvl, lvl === 3 ? b.dataset.up : S.selectedTower.path);
        b.disabled = S.money < tier.cost;
      });
      const oc = ui.info.querySelector("[data-oc]");
      if (oc) oc.disabled = S.money < ocCost(S.selectedTower);
      const asc = ui.info.querySelector("[data-asc]");
      if (asc) asc.disabled = !canAscend(S.selectedTower) || S.money < ASC[S.selectedTower.asc || 0].cost;
      const fl = ui.info.querySelector("[data-fleet]");
      if (fl) fl.textContent = fleetText(S.selectedTower);
    }
  }

  // ---------- overlays / menus ----------
  function showOverlay(html, wide) {
    ui.overlay.innerHTML = `<div class="card${wide ? " wide" : ""}">${html}</div>`;
    ui.overlay.classList.remove("hidden");
    ui.overlay.scrollTop = 0;
  }
  const hideOverlay = () => ui.overlay.classList.add("hidden");

  // camera shake setting (visual only): 1 = on, 0.4 = reduced, 0 = off; reduced-motion users start at reduced
  const SHAKE_STEPS = [1, 0.4, 0];
  OD.shake = (() => { const v = parseFloat(store.get("od_shake")); if (SHAKE_STEPS.includes(v)) return v; return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches ? 0.4 : 1; })();
  const shakeLabel = () => `📳 Shake: ${OD.shake === 1 ? "On" : OD.shake ? "Low" : "Off"}`;
  // graphics quality (3D view): High (the default) never steps down; Low starts at the light setting; Auto steps
  // down on slow devices
  const GFX_STEPS = ["high", "low", "auto"];
  OD.gfx = GFX_STEPS.includes(store.get("od_gfx")) ? store.get("od_gfx") : "high";
  const gfxLabel = () => `🎨 Graphics: ${OD.gfx === "auto" ? "Auto" : OD.gfx === "high" ? "High" : "Low"}`;
  // desktop (Steam) only: fullscreen / windowed
  const displayBtn = () => (P.display ? `<button data-act="display" title="F11 or Alt+Enter">${P.display.get().fullscreen ? "🖥 Fullscreen" : "🗗 Windowed"}</button>` : "");
  function soundButtons() {
    const statBtn = stats.configured ? `<button data-act="stats-toggle" title="Anonymous gameplay stats, no personal data">${stats.enabled ? "📊 Stats: On" : "📊 Stats: Off"}</button>` : "";
    return `<div class="btns sound"><button data-act="music">${audio.music ? "♫ Music: On" : "♫ Music: Off"}</button><button data-act="sfx">${audio.sfx ? "🔊 Sound: On" : "🔇 Sound: Off"}</button><button data-act="shake" title="Camera shake on big explosions">${shakeLabel()}</button><button data-act="gfx" title="${OD.is3D ? "Auto lowers detail on slow devices" : "Low: fewer, simpler effects for slow devices"}">${gfxLabel()}</button>${displayBtn()}${statBtn}</div>`;
  }

  function mapCard(key) {
    const m = MAPS[key];
    const t = mapTier(key), r = getRec(key, t.diff);
    const medals = `<span class="tier-tag" style="--c:${t.color}" title="${r ? `Best wave ${r.wave}` : t.name}">${r && r.won ? "★ " : ""}${t.name}</span>`;
    return `<button class="map-card${key === MAP_KEY ? " selected" : ""}${m.final ? " final" : ""}" data-map="${key}">
      <canvas width="140" height="100" data-map-preview="${key}"></canvas>
      <b>${m.name}</b><small>${m.moons.length ? `${m.moons.length} ${m.final ? "planets" : m.moons.length === 1 ? "moon" : "moons"}` : "No moons"}</small>
      <span class="medals">${medals}</span>${LB.bestMap(key) ? `<span class="eb" title="Best Endless wave">∞ ${LB.bestMap(key)}</span>` : ""}</button>`;
  }

  function drawMapPreview(c, key) {
    if (OD.is3D && OD.planetThumb && c.width < 280) { c.width = 280; c.height = 200; } // sharper for 3D portraits
    const m = MAPS[key], g = c.getContext("2d"), w = c.width, h = c.height;
    g.clearRect(0, 0, w, h);
    const s = (h * 0.92) / m.view;
    g.save(); g.translate(w / 2, h / 2);
    for (const moon of m.moons) { g.strokeStyle = "rgba(160,170,220,0.25)"; g.lineWidth = 1; g.beginPath(); g.arc(0, 0, moon.orbit * s, 0, Math.PI * 2); g.stroke(); }
    for (const r of m.rings) { g.strokeStyle = "rgba(108,240,255,0.25)"; g.setLineDash([2, 3]); g.beginPath(); g.arc(0, 0, r.r * s, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); }
    const rootR = Math.max(m.final ? 9 : 7, m.body.r * s * 1.4);
    // 3D view: planet portraits rendered by the 3D engine (same look as the battlefield)
    const portrait = (style, x, y, r) => {
      const p = OD.is3D && OD.planetThumb && OD.planetThumb(style);
      if (!p) return false;
      const d = r * 2 * p.extent * 1.04; g.drawImage(p.canvas, x - d / 2, y - d / 2, d, d); return true;
    };
    if (!portrait(m.body.style, 0, 0, rootR * (m.final ? 1.25 : 1.7))) { OD.drawBodyRings(g, m.body.style, 0, 0, rootR); OD.drawBody(g, m.body.style, 0, 0, rootR, 0); }
    for (const moon of m.moons) {
      const x = Math.cos(moon.phase) * moon.orbit * s, y = Math.sin(moon.phase) * moon.orbit * s;
      const r = Math.max(2.2, moon.r * s * 1.6);
      if (!portrait(moon.style, x, y, r * 1.15)) { OD.drawBodyRings(g, moon.style, x, y, r); OD.drawBody(g, moon.style, x, y, r, 0, -x || -1, -y || -1); }
    }
    g.restore();
  }

  function mainMenu() {
    if (S && !S.over && !(S.won && !S.freeplay)) stats.track(`quit/${S.mapKey}/w${stats.bucket(Math.max(1, S.wave))}`);
    abandonTutorial();
    if (S && !S.over) saveRun();
    S = null;
    P.gameplayStop();
    audio.setIntensity(0);
    ui.info.classList.remove("open");
    ui.preview.innerHTML = "";
    document.body.classList.add("in-menu");
    if (!B || B.key !== MAP_KEY) { buildBoard(MAP_KEY); B.key = MAP_KEY; }
    resetCamera();
    DIFF_KEY = diffOf(MAP_KEY);
    const m = MAPS[MAP_KEY], rec = getRec(MAP_KEY, DIFF_KEY), run = loadRun(), tier = mapTier(MAP_KEY);
    const got = getAch();
    showOverlay(`
      <div class="rw-eyebrow">SOLAR SYSTEM DEFENSE COMMAND</div><h1>RINGWARDEN</h1><div class="subtitle">ORBITAL DEFENSE</div>
      <p class="muted">Invaders are coming for our Solar System. Choose a world to defend.</p>
      ${run ? `<div class="resume"><button class="primary big" data-act="continue">▶ Continue: ${MAPS[run.map].name} · <span style="color:${DIFFICULTY[run.diff].color}">${DIFFICULTY[run.diff].name}</span> · wave ${run.wave} saved${run.endless ? " · ∞ Endless" : run.freeplay ? " (freeplay)" : ""}</button><button class="small" data-act="discard" title="Discard saved game">✕</button></div>` : ""}
      <div class="view-row">
        <button class="chip-btn${OD.is3D ? " selected" : ""}" data-view="3d"${OD.webgl ? "" : ' disabled title="3D needs WebGL, which this device does not support"'}>🌐 3D</button>
        <button class="chip-btn${OD.is3D ? "" : " selected"}" data-view="2d">▦ Classic 2D</button>
      </div>
      <div class="maps">${MAP_ORDER.map(mapCard).join("")}</div>
      <div class="map-detail">
        ${OD.is3D && OD.planetThumb ? `<canvas class="map-globe" width="220" height="220" data-globe="${m.body.style}" aria-hidden="true"></canvas>` : ""}
        <h2>${m.name} <span class="muted">· ${m.sub}</span> <span class="tier-tag big" style="--c:${tier.color}">${tier.name}</span></h2>
        <p>${m.desc}</p>
        <p class="feature">✦ ${m.feature}</p>
      </div>
      <div class="mode-row">
        <button class="mode-btn${MODE === "campaign" ? " selected" : ""}" data-mode="campaign"><b>Campaign</b><small>Survive 30 waves</small></button>
        <button class="mode-btn${MODE === "endless" ? " selected" : ""}" data-mode="endless"><b>∞ Endless</b><small>How far can you go?</small></button>
      </div>
      ${MODE === "endless" ? (() => {
        const lbTop = LB.top(MAP_KEY, DIFF_KEY)[0], bestAll = LB.bestAll();
        return `<p class="muted small"><b style="color:${tier.color}">${tier.name}:</b> ${DIFFICULTY[DIFF_KEY].desc} Waves never stop. ${lbTop ? `Your best here: <b>wave ${lbTop.wave}</b>.` : "No run here yet."}</p>
          <div class="milestones">🏁 Milestones: ${[40, 50, 75, 100].map(w => `<span class="ms${bestAll >= w ? " got" : ""}">${w}</span>`).join("")}</div>`;
      })() : `<p class="muted small"><b style="color:${tier.color}">${tier.name}:</b> ${DIFFICULTY[DIFF_KEY].desc}${rec ? ` · Best here: wave ${rec.wave}${rec.won ? " ★ won" : ""}` : ""}</p>`}
      <div class="btns"><button class="primary big" data-act="start">${MODE === "endless" ? "Start Endless ∞" : "Launch Mission ▶"}</button><button data-act="leaderboards">🏆 Leaderboards</button><button data-act="tutorial">🎓 Tutorial</button>${P.quit ? `<button data-act="quit">⏻ Quit</button>` : ""}</div>
      ${soundButtons()}
      <details><summary>How to play</summary>
        <ul>
          <li>Pick a satellite at the bottom, then tap a glowing slot on a ring. Moons carry their own rings.</li>
          <li>Moons pull invaders toward them with gravity, so moon turrets see lots of action.</li>
          <li>Tap a satellite to upgrade it. At tier 3 choose one of <b>two specializations</b>.</li>
          <li><b>⚡ Overdrive</b> spins the rings 5× faster and boosts fire rate for a few seconds.</li>
          <li>Mining Sats earn credits during waves. Shields regenerate; railguns break them fastest.</li>
          <li>Keys: <b>1–7</b> satellites · <b>Space</b> wave · <b>Q</b> overdrive · <b>F</b> speed · <b>P</b> pause · <b>Esc</b> cancel</li>
          <li>Your game saves automatically between waves; use <b>Continue</b> to pick up where you left off.</li>
          <li><b>∞ Endless</b>: waves never stop. Reach milestones at waves 40, 50, 75 and 100 for bonus credits, and climb your leaderboard.</li>
        </ul>
      </details>
      <details><summary>🏆 Achievements (${ACHIEVEMENTS.filter(a => got[a.id]).length}/${ACHIEVEMENTS.length})</summary>
        <ul class="ach">${ACHIEVEMENTS.map(a => `<li class="${got[a.id] ? "got" : ""}"><b>${got[a.id] ? "🏆" : "🔒"} ${a.name}</b> <span>${a.desc}</span></li>`).join("")}</ul>
      </details>
      <p class="muted small version">v${P.version}${P.name !== "web" ? ` · ${P.name}` : ""} · <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>`, true);
    ui.overlay.querySelectorAll("canvas[data-map-preview]").forEach(c => drawMapPreview(c, c.dataset.mapPreview));
    spinGlobe();
  }
  // mission panel: a large planet that turns slowly (3D view only; reduced motion keeps it still)
  let globeRaf = 0;
  function spinGlobe() {
    cancelAnimationFrame(globeRaf);
    const c = ui.overlay.querySelector("canvas[data-globe]");
    if (!c || !OD.planetThumb) return;
    const still = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    let last = 0;
    const tick = now => {
      if (!c.isConnected) return;
      if (now - last > 66) { last = now; const img = OD.planetThumb(c.dataset.globe, still ? 0 : now / 1000 * 0.35); if (img) { const g = c.getContext("2d"); g.clearRect(0, 0, c.width, c.height); g.drawImage(img.canvas, 0, 0, c.width, c.height); } }
      if (!still) globeRaf = requestAnimationFrame(tick);
    };
    globeRaf = requestAnimationFrame(tick);
  }

  function showLeaderboards() {
    lbView = lbView || { map: MAP_KEY };
    const map = lbView.map, diff = diffOf(map), tier = mapTier(map);
    showOverlay(`
      <h1>🏆 LEADERBOARDS</h1>
      <p class="muted">Endless mode · your best runs on this device</p>
      <div class="lb-maps">${MAP_ORDER.map(k => `<button class="chip-btn${k === map ? " selected" : ""}" data-lbmap="${k}">${MAPS[k].name}${LB.bestMap(k) ? ` <small>∞${LB.bestMap(k)}</small>` : ""}</button>`).join("")}</div>
      <p class="muted small">${MAPS[map].name} · <span class="tier-tag" style="--c:${tier.color}">${tier.name}</span></p>
      ${lbTable(LB.top(map, diff))}
      <p class="muted small">🌍 Worldwide leaderboards are coming soon.</p>
      <div class="btns"><button class="primary" data-act="lb-play">Play Endless here ∞</button><button data-act="menu">← Back</button></div>`, true);
  }

  function pauseMenu() {
    if (!S || S.over) return;
    S.paused = true;
    P.gameplayStop();
    showOverlay(`
      <h1>PAUSED</h1>
      <p class="muted">${MAP.name} · Wave ${S.wave}${S.endless ? " · ∞ Endless" : ""} · <span style="color:${S.diff.color}">${S.diff.name}</span></p>
      <div class="btns"><button class="primary" data-act="resume">Resume</button><button data-act="stats">📊 Stats</button></div>
      ${soundButtons()}
      <div class="btns"><button data-act="retry">Restart</button><button data-act="menu">Main Menu</button></div>`);
    updateUI(true);
  }

  ui.overlay.addEventListener("click", ev => {
    audio.init();
    const vw = ev.target.closest("[data-view]");
    if (vw) { if ((vw.dataset.view === "3d") !== !!OD.is3D) { sfx("click"); OD.setView(vw.dataset.view); } return; }
    const lm = ev.target.closest("[data-lbmap]"), md = ev.target.closest("[data-mode]");
    if (lm) { lbView.map = lm.dataset.lbmap; sfx("click"); return showLeaderboards(); }

    if (md) { MODE = md.dataset.mode; store.set("od_mode", MODE); sfx("click"); return mainMenu(); }
    const mc = ev.target.closest("[data-map]");
    if (mc) { MAP_KEY = mc.dataset.map; store.set("od_map", MAP_KEY); sfx("click"); return mainMenu(); }

    const a = ev.target.closest("[data-act]");
    if (!a) return;
    sfx("click");
    const act = a.dataset.act;
    // A short ad at natural breaks only: leaving an end-of-game screen.
    if (S && (S.over || (S.won && !S.freeplay)) && ["retry", "menu", "next"].includes(act) && !a.dataset.adDone) {
      a.dataset.adDone = "1";
      ui.overlay.querySelectorAll("button").forEach(b => (b.disabled = true));
      M.breakAd().then(() => { a.disabled = false; a.click(); });
      return;
    }
    switch (act) {
      case "start":
        if (!tutDone()) {
          showOverlay(`<h1>FIRST MISSION?</h1>
            <p>Take a quick guided game on Earth to learn the basics. It takes about 2 minutes.</p>
            <div class="btns"><button class="primary big" data-act="tutorial">🎓 Play tutorial</button></div>
            <div class="btns"><button data-act="skiptut">Skip, I know how to play</button></div>`);
        } else begin(MAP_KEY, DIFF_KEY, false, MODE === "endless");
        break;
      case "tutorial": startTutorial(); break;
      case "skiptut": store.set(TUT_KEY, "1"); begin(MAP_KEY, DIFF_KEY, false, MODE === "endless"); break;
      case "leaderboards": lbView = { map: MAP_KEY }; showLeaderboards(); break;
      case "lb-play": MAP_KEY = lbView.map; DIFF_KEY = diffOf(MAP_KEY); MODE = "endless"; store.set("od_map", MAP_KEY); store.set("od_mode", MODE); begin(MAP_KEY, DIFF_KEY, false, true); break;
      case "save-nick": {
        const input = document.getElementById("nickInput");
        const name = LB.setNickname(input ? input.value : "");
        if (!name) { if (input) input.focus(); break; }
        S.lastLb.entries = LB.top(S.mapKey, S.diffKey);
        showStats("over", null, false, S.lastLb);
        toast(`Saved as ${name}`);
        break;
      }
      case "continue": { const r = loadRun(); if (r) resumeRun(r); break; }
      case "discard": clearRun(); mainMenu(); break;
      case "revive": {
        a.disabled = true;
        const method = M.offer("revive").method, run = S;
        M.claim("revive", reviveOnce()).then(ok => {
          if (!ok) { if (S === run && !S.revived) a.textContent = "Ad unavailable"; return; }
          if (S !== run) return;
          S.over = false; S.lives = Math.min(5, S.diff.lives);
          stats.track(method === "ad" ? "ad/revive" : "premium/revive");
          S.enemies = []; S.shots = [];
          hideOverlay(); P.gameplayStart(); saveRun();
          toast("Revived! The planet holds on with 5 HP"); updateUI(true);
        });
        break;
      }
      case "resume": S.paused = false; hideOverlay(); P.gameplayStart(); updateUI(true); break;
      case "pause": pauseMenu(); break;
      case "stats": showStats("pause"); break;
      case "retry": begin(S.mapKey, S.diffKey, false, !!S.endless); break;
      case "next": { const n = MAP_ORDER[MAP_ORDER.indexOf(S.mapKey) + 1]; MAP_KEY = n; store.set("od_map", n); begin(n, diffOf(n)); break; }
      case "menu": mainMenu(); break;
      case "freeplay": S.freeplay = true; S.paused = false; hideOverlay(); P.gameplayStart(); saveRun(); updateUI(true); break;
      case "music": audio.toggleMusic(); a.textContent = audio.music ? "♫ Music: On" : "♫ Music: Off"; break;
      case "sfx": audio.toggleSfx(); a.textContent = audio.sfx ? "🔊 Sound: On" : "🔇 Sound: Off"; break;
      case "gfx": OD.gfx = GFX_STEPS[(GFX_STEPS.indexOf(OD.gfx) + 1) % GFX_STEPS.length]; store.set("od_gfx", OD.gfx); a.textContent = gfxLabel(); if (OD.applyGfx) OD.applyGfx(OD.gfx); break;
      case "display": P.display.setFullscreen(!P.display.get().fullscreen); break;
      case "quit": if (P.quit) { saveRun(); P.quit(); } break;
      case "shake": OD.shake = SHAKE_STEPS[(SHAKE_STEPS.indexOf(OD.shake) + 1) % SHAKE_STEPS.length]; store.set("od_shake", String(OD.shake)); a.textContent = shakeLabel(); break;
      case "stats-toggle": stats.setEnabled(!stats.enabled); a.textContent = stats.enabled ? "📊 Stats: On" : "📊 Stats: Off"; break;
    }
  });

  let pendingSeed = null; // the orbit layout of a resumed Own Orbits run
  function begin(mapKey, diffKey, resuming, endless) {
    audio.init();
    abandonTutorial();
    const seed = pendingSeed != null ? pendingSeed : (Math.random() * 2 ** 31) | 0; pendingSeed = null;
    buildBoard(mapKey, seed); B.key = mapKey;
    if (OD.fx2d) OD.fx2d.reset();
    homeCamera();
    S = newState(diffKey); S.seed = seed;
    // Solar System: every planet has its own HP (the Sun is still the game)
    S.bodyHp = MAP.planetHp ? B.bodies.map(b => (b.root ? 0 : MAP.planetHp)) : null;
    const tier = mapTier(mapKey);
    if (diffKey === tier.diff) S.diff = Object.assign({}, S.diff, { name: tier.name, color: tier.color }); // saved games from before keep their old difficulty
    S.endless = !!endless;
    P.gameplayStart();
    document.body.classList.remove("in-menu");
    lastUI = ""; lastPreview = -1;
    hideOverlay();
    renderInfo();
    updateUI(true);
    if (resuming) { stats.track(`game-resume/${mapKey}`); return; }
    stats.track(`game-start/${mapKey}/${diffKey}${S.endless ? "/endless" : ""}`);
    clearRun(); saveRun();
    if (EXP) tip("launch", "🛰 Pick a satellite, choose its orbit (LEO / MEO / HEO), then 🚀 LAUNCH. Every satellite gets its own orbit.", 3800, 5500);
    toast(S.endless ? `∞ Endless on ${MAP.name}: how far can you go? First milestone at wave 40.` : `${MAP.name}: ${MAP.feature}`, 3500);
    sfx("wave");
  }

  // ---------- tutorial ----------
  // A guided first game on Earth (Easy). Each step waits for the player to do something, points at
  // it, then moves on. Players can skip at any time, and replay it from the main menu.
  const TUT_KEY = "od_tut_done";
  let tut = null; // { i: step index }
  const tutDone = () => !!store.get(TUT_KEY);

  // Suggest an empty inner-ring slot (the second suggestion goes opposite the first satellite).
  function tutSlot() {
    if (EXP) return launchSlot(0);
    const inner = B.slots.filter(sl => sl.ring === 0 && !towerAt(sl.id));
    if (!inner.length) return null;
    const first = S.towers[0];
    if (!first) return inner[0].id;
    let best = inner[0], bd = -1;
    for (const sl of inner) { const p = slotPos(sl.id), d = dist2(p.x, p.y, first.x, first.y); if (d > bd) { bd = d; best = sl; } }
    return best.id;
  }
  const slotTarget = () => { const id = tutSlot(); if (id == null) return null; const p = slotPos(id); return { x: p.x, y: p.y, z: p.z, r: 10 }; };
  const laserBtn = () => ui.shop.querySelector('[data-type="laser"]');

  // Five short steps: pick a satellite, place it, Wave 1 launches by itself, clear it, first upgrade. Everything
  // else (moons, specializations, Overdrive, camera) comes later as one-time tips during play (see `tip`).
  const TUT_COUNTDOWN = 2500; // ms between placing the first satellite and Wave 1 launching on its own
  const tutTower = () => S.towers[0] && { x: S.towers[0].x, y: S.towers[0].y, z: S.towers[0].z, r: 14 };
  const TUT_STEPS = [
    { text: "<b>Welcome, Commander!</b> Aliens are coming for Earth. Tap the <b>Laser Sat</b> below.",
      el: laserBtn, done: () => S.selectedType === "laser" || S.towers.length > 0 },
    EXP ? { text: "Press <b>🚀 LAUNCH</b> to send it into orbit.", el: () => document.querySelector("#launchPad [data-launch]"), done: () => S.towers.length > 0 }
      : { text: "Tap a <b>glowing slot</b> to launch it into orbit.", world: slotTarget, done: () => S.towers.length > 0 },
    { text: "", countdown: true, enter: () => { tut.launchAt = performance.now() + TUT_COUNTDOWN; },
      done: () => S.waveActive || S.wave > 0 },
    { text: "Your satellite fires on its own. <b>Clear the wave!</b>", done: () => S.wave >= 1 && !S.waveActive },
    { text: "<b>First victory!</b> +500 bonus credits. Tap your satellite, then its <b>upgrade card</b>.",
      enter: () => { S.money += 100 * OD.ECON; updateUI(true); sfx("coin"); },
      el: () => ui.info.querySelector("[data-up]"), world: () => (ui.info.querySelector("[data-up]") ? null : tutTower()),
      done: () => S.towers.some(t => t.level >= 1) || !S.towers.length },
  ];

  function startTutorial() {
    MAP_KEY = "earth"; DIFF_KEY = "easy";
    begin("earth", "easy");
    tut = { i: -1 };
    stats.track("tutorial/start");
    document.body.classList.add("tutorial");
    ui.coach.classList.remove("hidden");
    tutGo(0);
  }
  function tutGo(i) {
    document.querySelectorAll(".coach-glow").forEach(e => e.classList.remove("coach-glow"));
    if (i >= TUT_STEPS.length) return endTutorial(false);
    tut.i = i;
    if (i > 0) stats.track(`tutorial/step-${i + 1}`);
    const step = TUT_STEPS[i];
    if (step.enter) step.enter();
    ui.coachText.innerHTML = step.text;
    ui.coachNext.textContent = step.next || "";
    ui.coachNext.classList.toggle("hidden", !step.next);
    ui.coachStep.textContent = `${i + 1} / ${TUT_STEPS.length}`;
    if (i > 0) sfx("click");
  }
  function endTutorial(skipped) {
    if (!tut) return;
    stats.track(skipped ? `tutorial/skip-at-step-${tut.i + 1}` : "tutorial/done");
    tut = null;
    store.set(TUT_KEY, "1");
    document.querySelectorAll(".coach-glow").forEach(e => e.classList.remove("coach-glow"));
    ui.coach.classList.add("hidden");
    ui.coachArrow.classList.add("hidden");
    document.body.classList.remove("tutorial");
    updateUI(true); // the launch button and next-goal chip come back once the tutorial is out of the way
    if (skipped) toast("Tutorial skipped. You can replay it from the main menu.", 2600);
    else { toast(`Tutorial complete! 🎓 Next: launch Wave ${S ? S.wave + 1 : 2} when you're ready`, 3200); sfx("clear"); }
  }
  // Leaving the game mid-tutorial just stops it (it will be offered again next time).
  function abandonTutorial() {
    if (!tut) return;
    tut = null;
    document.querySelectorAll(".coach-glow").forEach(e => e.classList.remove("coach-glow"));
    ui.coach.classList.add("hidden"); ui.coachArrow.classList.add("hidden");
    document.body.classList.remove("tutorial");
  }
  function tutWorldTarget() {
    if (!tut || !S) return null;
    const step = TUT_STEPS[tut.i];
    return step && step.world ? step.world() : null;
  }
  // Called every frame: advance when the step is done, and keep the pointer arrow on its target.
  function tutTick() {
    if (!tut || !S) return;
    const step = TUT_STEPS[tut.i];
    if (step.done && step.done()) return tutGo(tut.i + 1);
    if (step.countdown) { // Wave 1 launches by itself a moment after the first satellite is placed
      const now = performance.now();
      if (S.paused) tut.launchAt = Math.max(tut.launchAt, now + 500);
      const left = Math.ceil((tut.launchAt - now) / 1000);
      const txt = `Satellite in orbit! <b>Wave 1</b> launches in <b>${Math.max(1, left)}…</b>`;
      if (ui.coachText.innerHTML !== txt) ui.coachText.innerHTML = txt;
      if (now >= tut.launchAt && !S.paused) { startWave(); return tutGo(tut.i + 1); }
    }
    const el = step.el ? step.el() : null;
    document.querySelectorAll(".coach-glow").forEach(e => { if (e !== el) e.classList.remove("coach-glow"); });
    let x = null, y = null, up = false;
    if (el && el.offsetParent !== null) {
      el.classList.add("coach-glow");
      const r = el.getBoundingClientRect();
      x = r.left + r.width / 2;
      if (r.top < 140) { y = r.bottom + 6; up = true; } else y = r.top - 6;
    } else {
      const w = step.world ? step.world() : null;
      if (w) {
        const sr = stage.getBoundingClientRect();
        if (OD.is3D && window.__view3d) { const p = window.__view3d.project(w.x, w.y, w.z || 0); x = sr.left + p.x; y = sr.top + p.y - 18; }
        else { const p = toScreen(w.x, w.y); x = sr.left + p.x; y = sr.top + p.y - ((w.r || 12) * scale * zoom) - 10; }
      }
    }
    const arrow = ui.coachArrow;
    if (x == null) { arrow.classList.add("hidden"); return; }
    arrow.classList.remove("hidden");
    arrow.classList.toggle("up", up);
    arrow.style.left = `${x}px`;
    arrow.style.top = `${y}px`;
  }
  ui.coach.addEventListener("click", ev => {
    const b = ev.target.closest("[data-tut]");
    if (!b || !tut) return;
    if (b.dataset.tut === "skip") endTutorial(true);
    else if (b.dataset.tut === "next") tutGo(tut.i + 1);
  });

  // ---------- camera: zoom + pan ----------
  const ZOOM_MAX = 3, ZOOM_STEPS = [1, 1.5, 2, 3];
  let zoom = 1, camX = 0, camY = 0, cssW = 0, cssH = 0, dpr = 1;
  function clampCam() {
    const hw = W / (2 * zoom), hh = H / (2 * zoom);
    camX = Math.min(W - hw, Math.max(hw, camX));
    camY = Math.min(H - hh, Math.max(hh, camY));
  }
  const toWorld = (sx, sy) => ({ x: camX + (sx - cssW / 2) / (scale * zoom), y: camY + (sy - cssH / 2) / (scale * zoom) });
  const toScreen = (x, y) => ({ x: (x - camX) * scale * zoom + cssW / 2, y: (y - camY) * scale * zoom + cssH / 2 });
  function setZoom(z, sx = cssW / 2, sy = cssH / 2) {
    const anchor = toWorld(sx, sy);
    zoom = Math.max(1, Math.min(ZOOM_MAX, z));
    camX = anchor.x - (sx - cssW / 2) / (scale * zoom);
    camY = anchor.y - (sy - cssH / 2) / (scale * zoom);
    clampCam(); updateZoomUI();
  }
  function resetCamera() { zoom = 1; camX = CX; camY = CY; updateZoomUI(); }
  // where a game starts: 1.5× on the planet (1× felt far away); the Solar System starts at 1× so every planet is in view
  function homeCamera() { zoom = MAP.final ? 1 : 1.5; camX = CX; camY = CY; clampCam(); updateZoomUI(); }
  // +/- buttons: step through 1×, 1.5×, 2×, 3×, zooming toward the selected satellite if there is one
  function zoomStep(dir) {
    let sx = cssW / 2, sy = cssH / 2;
    if (dir > 0 && S && S.selectedTower) { const p = toScreen(S.selectedTower.x, S.selectedTower.y); sx = p.x; sy = p.y; }
    const target = dir > 0 ? (ZOOM_STEPS.find(z => z > zoom + 0.01) || ZOOM_MAX) : ([...ZOOM_STEPS].reverse().find(z => z < zoom - 0.01) || 1);
    setZoom(target, sx, sy);
    if (target === 1) resetCamera();
    sfx("click");
  }
  function updateZoomUI() {
    ui.zoomLabel.textContent = `${Math.round(zoom * 10) / 10}×`;
    ui.zoomOut.disabled = zoom <= 1.001;
    ui.zoomIn.disabled = zoom >= ZOOM_MAX - 0.001;
  }
  ui.zoomIn.onclick = () => zoomStep(1);
  ui.zoomOut.onclick = () => zoomStep(-1);
  ui.zoomLabel.onclick = () => { resetCamera(); sfx("click"); };

  // ---------- input: tap to build/select, drag to pan, pinch / wheel to zoom ----------
  const pointers = new Map();
  let gesture = null;
  const local = ev => { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
  // tap tolerance is in screen pixels, so it stays finger-sized at every zoom level
  const hitRadius = touch => Math.min(40, (touch ? 26 : 16) / (scale * zoom));

  function handleTap(sx, sy, touch) {
    if (!S || S.over || S.paused) return;
    const w = toWorld(sx, sy);
    const slot = nearestSlot(w.x, w.y, hitRadius(touch));
    if (slot == null && EXP && S.selectedType) { // Own Orbits: tapping a planet or moon picks where to launch from
      const bi = B.bodies.findIndex(b => dist2(w.x, w.y, b.x, b.y) <= Math.max(b.r + 8, hitRadius(touch)) ** 2);
      if (bi >= 0 && pickLaunchSite(bi)) return;
    }
    tapSlot(slot, touch);
  }
  // Act on a tapped slot (or empty space when slot is null). Also used by the 3D view.
  function tapSlot(slot, touch) {
    if (!S || S.over || S.paused) return;
    if (slot == null) { S.selectedTower = null; S.selectedType = null; S.hover = null; renderInfo(); updateUI(true); return; }
    const existing = towerAt(slot);
    if (existing) {
      S.selectedType = null; S.selectedTower = existing; S.hover = null;
      sfx("click"); renderInfo(); updateUI(true);
      return;
    }
    if (S.selectedType) {
      S.hover = slot;
      placeTower(slot);
      if (touch) S.hover = null;
    } else { S.selectedTower = null; renderInfo(); }
  }

  canvas.addEventListener("pointerdown", ev => {
    audio.init();
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* ignore */ }
    const p = local(ev);
    pointers.set(ev.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y });
    if (pointers.size === 1) gesture = { moved: false, pinched: false };
    if (pointers.size === 2 && gesture) {
      const [a, b] = [...pointers.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      gesture.pinched = true;
      gesture.pinch = { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z: zoom, world: toWorld(mx, my) };
    }
  });
  canvas.addEventListener("pointermove", ev => {
    const p = local(ev);
    const ptr = pointers.get(ev.pointerId);
    if (!ptr) { // plain mouse hover
      if (S && ev.pointerType === "mouse") {
        const w = toWorld(p.x, p.y);
        S.hover = nearestSlot(w.x, w.y, hitRadius(false));
        canvas.style.cursor = S.hover != null ? "pointer" : zoom > 1 ? "grab" : "default";
      }
      return;
    }
    const dx = p.x - ptr.x, dy = p.y - ptr.y;
    ptr.x = p.x; ptr.y = p.y;
    if (pointers.size >= 2 && gesture && gesture.pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      zoom = Math.max(1, Math.min(ZOOM_MAX, gesture.pinch.z * d / gesture.pinch.d));
      camX = gesture.pinch.world.x - (mx - cssW / 2) / (scale * zoom);
      camY = gesture.pinch.world.y - (my - cssH / 2) / (scale * zoom);
      clampCam(); updateZoomUI();
      return;
    }
    if (gesture && Math.hypot(p.x - ptr.sx, p.y - ptr.sy) > 8) gesture.moved = true;
    if (gesture && gesture.moved && zoom > 1) {
      camX -= dx / (scale * zoom); camY -= dy / (scale * zoom); clampCam();
      canvas.style.cursor = "grabbing";
    }
  });
  function endPointer(ev) {
    const ptr = pointers.get(ev.pointerId);
    if (!ptr) return;
    pointers.delete(ev.pointerId);
    if (ev.type === "pointerup" && pointers.size === 0 && gesture && !gesture.moved && !gesture.pinched) handleTap(ptr.x, ptr.y, ev.pointerType !== "mouse");
    if (pointers.size === 0) gesture = null;
  }
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => { if (S && !pointers.size) S.hover = null; });
  canvas.addEventListener("wheel", ev => {
    ev.preventDefault();
    const p = local(ev);
    setZoom(zoom * Math.exp(-ev.deltaY * 0.0015), p.x, p.y);
  }, { passive: false });

  window.addEventListener("keydown", ev => {
    if (ev.target && (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA")) {
      if (ev.key === "Enter" && ev.target.id === "nickInput") { const b = ui.overlay.querySelector('[data-act="save-nick"]'); if (b) b.click(); }
      return;
    }
    const k = ev.key.toLowerCase();
    if (!S || (S.won && !S.freeplay) || S.over) return;
    if (k === "escape") {
      if (S.selectedType || S.selectedTower) { S.selectedType = null; S.selectedTower = null; renderInfo(); updateUI(true); }
      else if (S.paused) { S.paused = false; hideOverlay(); P.gameplayStart(); updateUI(true); }
      else pauseMenu();
      return;
    }
    if (S.paused) return;
    if (k === " ") { ev.preventDefault(); startWave(); }
    else if (k === "f") toggleSpeed();
    else if (k === "p") pauseMenu();
    else if (k === "q") activateOverdrive();
    else if (k === "+" || k === "=") zoomStep(1);
    else if (k === "-" || k === "_") zoomStep(-1);
    else if (k === "0") { resetCamera(); }
    else for (const [type, def] of Object.entries(TOWERS)) if (def.key === k) selectType(type);
  });

  function toggleSpeed() { if (!S) return; S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; sfx("click"); updateUI(true); }
  function activateOverdrive() {
    if (!S || S.overdriveCd > 0 || S.over) return;
    S.overdrive = OVERDRIVE.duration; S.overdriveCd = OVERDRIVE.cooldown; S.stats.overdrives++;
    if (EXP) for (const t of S.towers) if (t.fuel != null) t.fuel = Math.max(0, t.fuel - OD_FUEL);
    sfx("overdrive"); toast(EXP ? `⚡ OVERDRIVE: fire rate +30% · −${OD_FUEL} fuel on every satellite` : "⚡ OVERDRIVE: rings spinning, fire rate +30%");
    if (EXP && S.selectedTower) renderInfo();
    updateUI(true);
  }
  ui.waveBtn.onclick = () => { audio.init(); startWave(); };
  ui.speedBtn.onclick = toggleSpeed;
  ui.menuBtn.onclick = pauseMenu;
  ui.odBtn.onclick = activateOverdrive;
  ui.adBtn.onclick = claimCredits;
  ui.autoBtn.onclick = () => {
    if (!S) return;
    S.auto = !S.auto; sfx("click");
    toast(S.auto ? "Auto-start waves: ON" : "Auto-start waves: OFF");
    if (S.auto && !S.waveActive) startWave();
    updateUI(true);
  };

  // ---------- layout ----------
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height || !B) return;
    scale = Math.min(r.width, r.height) / B.view;
    W = r.width / scale; H = r.height / scale;
    CX = W / 2; CY = H / 2;
    SPAWN_R = Math.hypot(W, H) / 2 + 30;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    cssW = r.width; cssH = r.height;
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    if (zoom <= 1.001) { camX = CX; camY = CY; }
    clampCam();
    positionBodies();
    makeStars();
  }
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => { if (document.hidden && S && !S.waveActive) saveRun(); });
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  // ---------- loop ----------
  let last = performance.now(), uiTimer = 0;
  function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S && !S.paused && !S.over && !adPause) {
      S.realTime += raw;
      for (let i = 0; i < S.speed && !S.over; i++) update(raw);
      uiTimer += raw;
      if (uiTimer > 0.1) { uiTimer = 0; updateUI(); }
    } else if (!S) advanceBoard(raw); // menu: let the planets turn in the background
    if (!window.OD_NO2D) render(); // the 3D view draws instead when OD_NO2D is set
    tutTick();
    requestAnimationFrame(frame);
  }

  // Test hook (used by automated playtests).
  window.__od = {
    state: () => S, board: () => B, begin, startWave, LB, isMilestone, tapSlot, center: () => ({ x: CX, y: CY }), map: () => MAP, ringPoint, startTutorial, tut: () => tut, zoom: () => ({ zoom, camX, camY }), setZoom, toScreen,
    bodyHp: () => S && S.bodyHp, knockOut, setCamera: (z, x, y) => { zoom = Math.max(1, Math.min(ZOOM_MAX, z)); camX = x; camY = y; clampCam(); updateZoomUI(); }, slotPos, towerAt, TOWERS, upgradeTower, overclockTower, ascendTower, repaintIcons, mainMenu, saveRun, loadRun, getAch,
    placeTower: (slot, type) => { S.selectedType = type; placeTower(slot); S.selectedType = null; }, slotFits, slotUsable,
    EXP, launchSlot, freeLanes, setOrbit, FUEL_MAX, launchNow, pickLaunchSite, refuel, refuelCost,
  };

  // desktop: keep the Fullscreen / Windowed label right when F11 or Alt+Enter switches it
  if (P.display && P.display.onChange) P.display.onChange(d => document.querySelectorAll('[data-act="display"]').forEach(b => { b.textContent = d.fullscreen ? "🖥 Fullscreen" : "🗗 Windowed"; }));
  // iOS Safari can keep a scroll offset after the phone is rotated: snap back to the top.
  const unscroll = () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0; };
  window.addEventListener("orientationchange", () => { unscroll(); setTimeout(unscroll, 300); setTimeout(unscroll, 800); });
  window.addEventListener("resize", unscroll);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", unscroll);

  buildBoard(MAP_KEY); B.key = MAP_KEY;
  buildShop();
  requestAnimationFrame(frame);
  // Load platform SDKs / cloud saves, then show the menu with the saved preferences.
  P.init().finally(() => {
    if (MAP_ORDER.includes(store.get("od_map"))) MAP_KEY = store.get("od_map");
    DIFF_KEY = diffOf(MAP_KEY);
    P.loadingDone();
    stats.sessionStart();
    // A brand-new player goes straight into the guided first game (aliens within seconds) instead of the
    // menu; everyone else, and editions that open on a title screen (desktop), gets the menu.
    if (!P.titleFirst && !tutDone() && !loadRun()) startTutorial();
    else mainMenu();
  });
})(window.OD);
