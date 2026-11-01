// Orbital Defense: game state, simulation, rendering and UI.
(function (OD) {
  "use strict";
  const TAU = Math.PI * 2;
  const { TOWERS, ENEMIES, DIFFICULTY, tierOf, rgba } = OD;
  const audio = OD.audio;
  const sfx = name => audio.play(name);

  // ---------- world geometry (recomputed on resize so phones in portrait get a full-size board) ----------
  const VIEW = 700;            // the board always fits at least this many world units in both directions
  const PLANET_R = 46;
  const SPIRAL_ZONE = 380;     // outside this radius enemies fly straight in
  let W = 1000, H = 700, CX = 500, CY = 350, SPAWN_R = 640, scale = 1;

  const RINGS = [
    { r: 120, slots: 8,  speed:  0.10 },
    { r: 200, slots: 12, speed: -0.07 },
    { r: 280, slots: 16, speed:  0.045 },
  ];
  const OVERDRIVE = { duration: 6, cooldown: 30, ringMul: 5, rateMul: 1.3 };
  const TARGET_MODES = ["first", "last", "strong", "close"];
  const TARGET_LABEL = { first: "First", last: "Last", strong: "Strong", close: "Close" };

  // ---------- DOM ----------
  const $ = id => document.getElementById(id);
  const canvas = $("game"), ctx = canvas.getContext("2d"), stage = $("stage");
  const ui = {
    wave: $("wave"), lives: $("lives"), money: $("money"), score: $("score"), diff: $("diffTag"),
    waveBtn: $("waveBtn"), speedBtn: $("speedBtn"), menuBtn: $("menuBtn"), autoBtn: $("autoBtn"), odBtn: $("odBtn"),
    shop: $("shop"), info: $("info"), overlay: $("overlay"), toast: $("toast"), preview: $("preview"),
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ---------- state ----------
  let S = null;
  let nextId = 1;
  function newState(diffKey) {
    const diff = DIFFICULTY[diffKey];
    return {
      diffKey, diff,
      wave: 0, lives: diff.lives, money: diff.money, score: 0,
      ringAngles: RINGS.map(() => 0),
      towers: [], enemies: [], shots: [], beams: [], rings: [], particles: [], floaters: [], crafts: [],
      queue: [], spawnTimer: 0, waveActive: false,
      selectedType: null, selectedTower: null, hover: null,
      speed: 1, paused: false, over: false, won: false, freeplay: false, started: true, auto: false,
      overdrive: 0, overdriveCd: 0, time: 0, shake: 0,
    };
  }

  let stars = [];
  function makeStars() {
    stars = Array.from({ length: Math.round(W * H / 3000) }, () => ({
      x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.2, tw: Math.random() * TAU,
    }));
  }

  // ---------- helpers ----------
  const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
  function slotPos(ring, slot) {
    const a = S.ringAngles[ring] + slot * TAU / RINGS[ring].slots;
    return { x: CX + Math.cos(a) * RINGS[ring].r, y: CY + Math.sin(a) * RINGS[ring].r, a };
  }
  const towerAt = (ring, slot) => S.towers.find(t => t.ring === ring && t.slot === slot);
  const baseStats = t => tierOf(t.type, t.level, t.path);

  function nearestSlot(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    RINGS.forEach((ring, ri) => {
      for (let si = 0; si < ring.slots; si++) {
        const p = slotPos(ri, si), d = dist2(x, y, p.x, p.y);
        if (d < bd) { bd = d; best = { ring: ri, slot: si }; }
      }
    });
    return best;
  }

  function toast(msg, ms = 1800) {
    ui.toast.textContent = msg;
    ui.toast.style.opacity = 1;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (ui.toast.style.opacity = 0), ms);
  }

  function burst(x, y, color, n = 12, spd = 120, life = 0.7) {
    if (S.particles.length > 900) n = Math.min(n, 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = Math.random() * spd;
      S.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, color });
    }
  }
  const floater = (x, y, text, color) => S.floaters.push({ x, y, text, color, life: 1.2 });
  const ringFx = (x, y, r, color, life = 0.35, inward = false) => S.rings.push({ x, y, r, color, life, max: life, inward });

  function pickTarget(x, y, range, mode, exclude) {
    let best = null, bestScore = -Infinity;
    const r2 = range * range;
    for (const e of S.enemies) {
      if (e.dead || e === exclude) continue;
      const d = dist2(x, y, e.x, e.y);
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
    const hpScale = OD.hpScale(S.wave, S.diff);
    const gapMul = Math.max(0.45, 1 - S.wave * 0.015);
    S.queue = [];
    groups.forEach((g, gi) => {
      for (let i = 0; i < g.count; i++) S.queue.push({ type: g.type, gap: (i === g.count - 1 && gi < groups.length - 1 ? 1.4 : g.gap * gapMul), hpScale });
    });
    S.spawnTimer = 0.3;
    S.waveActive = true;
    const boss = groups.some(g => ENEMIES[g.type].boss);
    if (boss) { toast(S.wave === 30 ? `Wave 30: THE DREADNOUGHT` : `Wave ${S.wave}: MOTHERSHIP INBOUND`, 2600); sfx("alarm"); }
    else { toast(`Wave ${S.wave}`); sfx("wave"); }
    updateUI(true);
  }

  function spawnEnemy(type, hpScale, at) {
    const def = ENEMIES[type];
    const scaleHp = def.boss ? 1 + (hpScale - 1) * 0.55 : hpScale;
    const hp = Math.round(def.hp * scaleHp);
    const e = {
      id: nextId++, type, def, hp, maxHp: hp, hpScale,
      shield: def.shield ? Math.round(def.shield * scaleHp) : 0,
      r: at ? at.r : SPAWN_R, theta: at ? at.theta + (Math.random() - 0.5) * 0.3 : Math.random() * TAU,
      dir: at ? at.dir : Math.random() < 0.5 ? 1 : -1,
      slow: 1, vuln: 1, stun: 0, frozen: 0, hit: 0, spin: Math.random() * TAU, seed: Math.random() * 10,
      x: 0, y: 0, shieldHitAt: -10, spawnTimer: def.spawn ? def.spawn.every : 0, burn: null,
    };
    e.maxShield = e.shield;
    if (at) e.r += Math.random() * 10;
    e.x = CX + Math.cos(e.theta) * e.r; e.y = CY + Math.sin(e.theta) * e.r;
    S.enemies.push(e);
    return e;
  }

  // ---------- damage ----------
  function damage(e, amount, src, opts = {}) {
    if (e.dead) return;
    const st = src && src.st;
    amount *= e.vuln;
    if (st && st.boss && e.def.boss) amount *= st.boss;
    if (e.shield > 0) {
      const mul = opts.rail ? 2 : 1;              // railguns tear through shields
      const absorbed = Math.min(e.shield, amount * mul);
      e.shield -= absorbed;
      amount -= absorbed / mul;
      e.shieldHitAt = S.time;
      if (absorbed > 0 && opts.flash !== false) sfx("shield");
    }
    if (amount <= 0) return;
    e.hp -= amount;
    if (opts.flash !== false) e.hit = 0.06;
    if (e.hp <= 0) kill(e, src);
  }

  function kill(e, src) {
    e.dead = true;
    if (src) src.kills = (src.kills || 0) + 1;
    const reward = Math.max(1, Math.round(e.def.reward * S.diff.reward));
    S.money += reward;
    S.score += reward * 10;
    const big = e.def.boss;
    burst(e.x, e.y, e.def.color, big ? 60 : 12, big ? 240 : 130, big ? 1.4 : 0.7);
    if (big) { burst(e.x, e.y, "#ffffff", 30, 300, 1); ringFx(e.x, e.y, e.def.size * 4, e.def.color, 0.8); S.shake = 12; sfx("nova"); }
    else sfx(e.type === "asteroid" ? "crunch" : "pop");
    if (e.def.split) for (let i = 0; i < e.def.split.n; i++) spawnEnemy(e.def.split.type, e.hpScale, e);
  }

  // ---------- update ----------
  function update(dt) {
    S.time += dt;
    const odActive = S.overdrive > 0;
    RINGS.forEach((ring, i) => { S.ringAngles[i] = (S.ringAngles[i] + ring.speed * dt * (odActive ? OVERDRIVE.ringMul : 1)) % TAU; });
    if (S.overdrive > 0) S.overdrive = Math.max(0, S.overdrive - dt);
    if (S.overdriveCd > 0) S.overdriveCd = Math.max(0, S.overdriveCd - dt);

    // spawning
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
      const p = slotPos(t.ring, t.slot);
      t.x = p.x; t.y = p.y; t.ringA = p.a;
      t.buffRate = 1; t.buffRange = 1;
    }
    for (const r of S.towers) {
      const rs = baseStats(r);
      if (!rs.buffRange) continue;
      for (const t of S.towers) {
        if (t === r || t.type === "miner") continue;
        if (dist2(r.x, r.y, t.x, t.y) <= rs.buffRange ** 2) {
          t.buffRate = Math.max(t.buffRate, rs.buffRate);
          t.buffRange = Math.max(t.buffRange, rs.buffRangeMul);
        }
      }
    }
    for (const t of S.towers) {
      const b = baseStats(t);
      const rateMul = t.buffRate * (odActive ? OVERDRIVE.rateMul : 1);
      t.st = Object.assign({}, b, {
        range: b.range ? b.range * t.buffRange : b.range,
        rate: b.rate ? b.rate * rateMul : b.rate,
        dps: b.dps ? b.dps * rateMul : b.dps,
      });
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
        if (e.dead || dist2(t.x, t.y, e.x, e.y) > r2) continue;
        any = true;
        e.slow = Math.min(e.slow, st.slow);
        if (st.vuln) e.vuln = Math.max(e.vuln, st.vuln);
        damage(e, st.dps * dt, t, { flash: false });
        if (doPush) e.r = Math.min(SPIRAL_ZONE, e.r + st.push * (e.def.boss ? 0.2 : 1));
        if (doFreeze) e.frozen = Math.max(e.frozen, st.freeze * (e.def.boss ? 0.3 : 1));
      }
      if (doPush) { t.timer = 0; if (any) { ringFx(t.x, t.y, st.range, TOWERS.tractor.paths.A.color, 0.5, true); sfx("push"); } }
      if (doFreeze) { t.timer = 0; if (any) { ringFx(t.x, t.y, st.range, "#dff8ff", 0.45); sfx("freeze"); } }
    }

    // enemies move along their spiral
    const spd = S.diff.speed;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const def = e.def;
      e.spin += dt * 2;
      if (e.hit > 0) e.hit -= dt;
      if (e.burn && e.burn.t > 0) { e.burn.t -= dt; damage(e, e.burn.dps * dt, e.burn.src, { flash: false }); if (e.dead) continue; }
      if (e.maxShield && e.shield < e.maxShield && S.time - e.shieldHitAt > 3) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.15 * dt);
      if (def.spawn) {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0 && e.r < SPIRAL_ZONE) { e.spawnTimer = def.spawn.every; spawnEnemy(def.spawn.type, e.hpScale * 0.8, e); }
      }
      if (e.frozen > 0) { e.frozen -= dt; continue; }
      if (e.stun > 0) { e.stun -= dt; continue; }
      const v = def.speed * spd * e.slow;
      const outside = e.r > SPIRAL_ZONE;
      const inward = outside ? 1 : Math.sqrt(1 - def.spiral * def.spiral);
      e.r -= v * inward * dt * (outside ? 1.6 : 1);
      if (!outside) e.theta += e.dir * (v * def.spiral / Math.max(e.r, 60)) * dt;
      e.x = CX + Math.cos(e.theta) * e.r;
      e.y = CY + Math.sin(e.theta) * e.r;
      if (e.r <= PLANET_R + def.size * 0.4) {
        e.dead = true;
        S.lives -= def.dmg;
        burst(e.x, e.y, "#ff5c7a", 18, 160);
        floater(e.x, e.y, `-${Math.min(def.dmg, Math.max(0, S.lives + def.dmg))}`, "#ff5c7a");
        S.shake = Math.max(S.shake, def.boss ? 16 : 8);
        sfx("leak");
      }
    }

    for (const t of S.towers) towerAct(t, dt);
    updateShots(dt);
    updateCrafts(dt);

    // effects
    for (const b of S.beams) b.life -= dt;
    for (const r of S.rings) r.life -= dt;
    for (const p of S.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; }
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

    // wave complete
    if (S.waveActive && !S.queue.length && !S.enemies.length) {
      S.waveActive = false;
      const bonus = Math.round((25 + S.wave * 4) * S.diff.reward);
      S.money += bonus;
      sfx("clear");
      if (S.wave === OD.WIN_WAVE && !S.won) return victory();
      toast(`Wave ${S.wave} cleared! +${bonus} credits`);
      if (S.auto) setTimeout(() => S && !S.paused && startWave(), 1200);
    }
  }

  function towerAct(t, dt) {
    const st = t.st, kind = TOWERS[t.type].kind;
    if (t.recoil > 0) t.recoil -= dt * 4;
    if (t.flash > 0) t.flash -= dt * 2;
    if (kind === "field") return;
    if (kind === "miner") {
      if (!S.waveActive) return;
      t.timer = (t.timer || 0) + dt;
      if (t.timer >= st.every) {
        t.timer = 0; t.flash = 1;
        S.money += st.income; t.earned = (t.earned || 0) + st.income;
        floater(t.x, t.y - 14, `+${st.income}`, "#ffd166");
        sfx("coin");
      }
      return;
    }
    if (kind === "carrier") return; // handled by crafts
    t.cd = Math.max(0, (t.cd || 0) - dt);

    if (kind === "emp") {
      if (st.arc) {
        if (t.cd > 0) return;
        const first = pickTarget(t.x, t.y, st.range, "close");
        if (!first) return;
        t.cd = 1 / st.rate;
        let prev = { x: t.x, y: t.y }, cur = first;
        const hit = new Set();
        for (let i = 0; i <= st.chains && cur; i++) {
          hit.add(cur);
          S.beams.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y, life: 0.12, color: "#cfe0ff", w: 2, bolt: true });
          cur.stun = Math.max(cur.stun, st.stun);
          const from = cur;
          damage(cur, st.dmg, t);
          prev = from;
          let next = null, nd = 110 * 110;
          for (const e of S.enemies) {
            if (e.dead || hit.has(e)) continue;
            const d = dist2(from.x, from.y, e.x, e.y);
            if (d < nd) { nd = d; next = e; }
          }
          cur = next;
        }
        sfx("zap");
        return;
      }
      if (t.cd > 0) return;
      const r2 = st.range * st.range;
      const targets = S.enemies.filter(e => !e.dead && dist2(t.x, t.y, e.x, e.y) <= r2);
      if (!targets.length) return;
      t.cd = 1 / st.rate;
      for (const e of targets) { e.stun = Math.max(e.stun, st.stun * (e.def.boss ? 0.3 : 1)); damage(e, st.dmg, t); }
      ringFx(t.x, t.y, st.range, t.path === "A" ? TOWERS.emp.paths.A.color : TOWERS.emp.color, 0.4);
      sfx("emp");
      return;
    }

    const target = pickTarget(t.x, t.y, st.range, t.targeting);
    if (target) t.aim = Math.atan2(target.y - t.y, target.x - t.x);

    if (kind === "laser" && st.dps) { // Solar Lance: continuous ramping beam
      if (!target) { t.heat = 0; t.beamTarget = null; return; }
      if (t.beamTarget === target) t.heat = Math.min(2, (t.heat || 0) + dt); else { t.heat = 0; t.beamTarget = target; }
      const mul = 1 + Math.min(1, t.heat / 2) * (st.ramp - 1);
      damage(target, st.dps * mul * dt, t, { flash: false });
      S.beams.push({ x1: t.x + Math.cos(t.aim) * 26, y1: t.y + Math.sin(t.aim) * 26, x2: target.x, y2: target.y, life: dt * 1.5, color: TOWERS.laser.paths.B.color, w: 2 + t.heat * 2.5, core: true });
      if (Math.random() < 0.3) burst(target.x, target.y, "#ffd27a", 1, 60, 0.3);
      sfx("lance");
      return;
    }

    if (t.spin != null || t.path === "B") t.spin = (t.spin || 0) + dt * (target ? 12 : 2);
    if (!target || t.cd > 0) return;
    t.cd = 1 / st.rate;

    if (kind === "laser") {
      t.alt = !t.alt;
      const off = t.level >= 1 ? (t.alt ? 4 : -4) : 0;
      const nx = -Math.sin(t.aim), ny = Math.cos(t.aim);
      const ox = t.x + Math.cos(t.aim) * 15 + nx * off, oy = t.y + Math.sin(t.aim) * 15 + ny * off;
      damage(target, st.dmg, t, { flash: false });
      S.beams.push({ x1: ox, y1: oy, x2: target.x, y2: target.y, life: 0.07, color: t.path === "A" ? "#ffffff" : TOWERS.laser.color, w: 2 });
      if (st.chain) {
        const hues = ["#ff5c7a", "#ffd166", "#7dff9a", "#6cf0ff", "#c18cff"];
        const others = S.enemies.filter(e => !e.dead && e !== target && dist2(e.x, e.y, target.x, target.y) < 130 * 130)
          .sort((a, b) => dist2(a.x, a.y, target.x, target.y) - dist2(b.x, b.y, target.x, target.y)).slice(0, st.chain);
        others.forEach((e, i) => {
          S.beams.push({ x1: target.x, y1: target.y, x2: e.x, y2: e.y, life: 0.08, color: hues[i % hues.length], w: 1.5 });
          damage(e, st.dmg * 0.6, t, { flash: false });
        });
        sfx("prism");
      } else sfx("laser");
    } else if (kind === "missile") {
      for (let i = 0; i < st.count; i++) {
        const spread = (i - (st.count - 1) / 2) * 0.35;
        const a = t.aim + spread;
        S.shots.push({
          kind: "missile", x: t.x + Math.cos(a) * 12, y: t.y + Math.sin(a) * 12, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150,
          target, dmg: st.dmg, splash: st.splash, cluster: st.cluster, clusterDmg: st.clusterDmg, burn: st.burn,
          nova: t.path === "B", life: 4, tower: t,
        });
      }
      sfx("missile");
    } else if (kind === "rail") {
      t.recoil = 1;
      const ex = t.x + Math.cos(t.aim) * st.range, ey = t.y + Math.sin(t.aim) * st.range;
      const color = t.path ? TOWERS.rail.paths[t.path].color : TOWERS.rail.color;
      if (st.pierce) {
        for (const e of S.enemies) {
          if (!e.dead && segDist2(t.x, t.y, ex, ey, e.x, e.y) <= (e.def.size + 5) ** 2) damage(e, st.dmg, t, { rail: true });
        }
        S.beams.push({ x1: t.x, y1: t.y, x2: ex, y2: ey, life: t.path === "B" ? 0.08 : 0.25, color, w: t.path === "A" ? 6 : t.path === "B" ? 2 : 4, core: true });
      } else {
        damage(target, st.dmg, t, { rail: true });
        S.beams.push({ x1: t.x, y1: t.y, x2: target.x, y2: target.y, life: 0.25, color, w: 4, core: true });
      }
      burst(target.x, target.y, color, t.path === "B" ? 3 : 8, 90);
      sfx(t.path === "B" ? "coil" : "rail");
    }
  }

  function segDist2(x1, y1, x2, y2, px, py) {
    const dx = x2 - x1, dy = y2 - y1, len = dx * dx + dy * dy;
    let k = len ? ((px - x1) * dx + (py - y1) * dy) / len : 0;
    k = Math.max(0, Math.min(1, k));
    return dist2(px, py, x1 + dx * k, y1 + dy * k);
  }

  function explode(x, y, radius, dmg, src, opts = {}) {
    for (const e of S.enemies) if (!e.dead && dist2(x, y, e.x, e.y) < (radius + e.def.size) ** 2) {
      damage(e, dmg, src);
      if (opts.burn) e.burn = { dps: opts.burn, t: 3, src };
    }
  }

  function updateShots(dt) {
    for (const m of S.shots) {
      m.life -= dt;
      if (m.kind === "bomblet") {
        m.x += m.vx * dt; m.y += m.vy * dt; m.vx *= 0.9; m.vy *= 0.9;
        if (m.life <= 0) { m.dead = true; explode(m.x, m.y, 32, m.dmg, m.tower); burst(m.x, m.y, "#ffd166", 5, 70, 0.4); sfx("boom"); }
        continue;
      }
      if (!m.target || m.target.dead) m.target = pickTarget(m.x, m.y, 400, "close");
      if (m.target) {
        const a = Math.atan2(m.target.y - m.y, m.target.x - m.x);
        m.vx += Math.cos(a) * 1000 * dt; m.vy += Math.sin(a) * 1000 * dt;
      }
      const sp = Math.hypot(m.vx, m.vy), max = m.nova ? 260 : 360;
      if (sp > max) { m.vx *= max / sp; m.vy *= max / sp; }
      m.x += m.vx * dt; m.y += m.vy * dt;
      if (Math.random() < 0.7) S.particles.push({ x: m.x, y: m.y, vx: 0, vy: 0, life: m.nova ? 0.5 : 0.3, max: 0.5, color: m.nova ? "#ff8a5c" : "#ffcf8a" });
      const hit = m.target && dist2(m.x, m.y, m.target.x, m.target.y) < (m.target.def.size + 5) ** 2;
      if (hit || m.life <= 0) {
        m.dead = true;
        explode(m.x, m.y, m.splash, m.dmg, m.tower, { burn: m.burn });
        if (m.nova) {
          burst(m.x, m.y, "#ffb347", 40, 220, 0.9); burst(m.x, m.y, "#fff3c0", 15, 120, 0.6);
          ringFx(m.x, m.y, m.splash, "#ff5c5c", 0.5); S.shake = Math.max(S.shake, 6); sfx("nova");
        } else {
          burst(m.x, m.y, TOWERS.missile.color, 14, 140);
          ringFx(m.x, m.y, m.splash, TOWERS.missile.color, 0.2); sfx("boom");
        }
        for (let i = 0; i < (m.cluster || 0); i++) {
          const a = Math.random() * TAU, v = 120 + Math.random() * 120;
          S.shots.push({ kind: "bomblet", x: m.x, y: m.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.2, dmg: m.clusterDmg, tower: m.tower });
        }
      }
    }
  }

  function updateCrafts(dt) {
    for (const t of S.towers) {
      if (t.type !== "carrier") continue;
      const st = t.st, bomber = !!st.bomb;
      t.crafts = t.crafts || [];
      // replace fleet if switching to bombers, then top up
      if (t.crafts.length && t.crafts[0].bomber !== bomber) t.crafts = [];
      while (t.crafts.length < st.craft) t.crafts.push({ x: t.x, y: t.y, vx: 0, vy: 0, angle: 0, cd: Math.random(), bomber, orbit: Math.random() * TAU });
      const target = pickTarget(t.x, t.y, st.range, t.targeting);
      t.crafts.forEach((f, i) => {
        f.cd -= dt; f.orbit += dt * (bomber ? 1.5 : 3);
        let tx, ty;
        const tgt = target && !target.dead ? target : null;
        if (tgt) {
          const rad = bomber ? 6 : 34;
          tx = tgt.x + Math.cos(f.orbit + i) * rad; ty = tgt.y + Math.sin(f.orbit + i) * rad;
        } else {
          tx = t.x + Math.cos(f.orbit + i * TAU / st.craft) * 30; ty = t.y + Math.sin(f.orbit + i * TAU / st.craft) * 30;
        }
        const max = bomber ? 200 : 300, acc = bomber ? 500 : 900;
        const a = Math.atan2(ty - f.y, tx - f.x);
        f.vx += Math.cos(a) * acc * dt; f.vy += Math.sin(a) * acc * dt;
        const sp = Math.hypot(f.vx, f.vy);
        if (sp > max) { f.vx *= max / sp; f.vy *= max / sp; }
        f.vx *= 0.985; f.vy *= 0.985;
        f.x += f.vx * dt; f.y += f.vy * dt;
        f.angle = Math.atan2(f.vy, f.vx);
        if (!tgt || f.cd > 0) return;
        const d2 = dist2(f.x, f.y, tgt.x, tgt.y);
        if (bomber && d2 < 40 * 40) {
          f.cd = 1 / st.rate;
          explode(tgt.x, tgt.y, st.splash, st.dmg, t);
          burst(tgt.x, tgt.y, "#ff6b8b", 14, 120); ringFx(tgt.x, tgt.y, st.splash, "#ff6b8b", 0.25); sfx("bomb");
        } else if (!bomber && d2 < 110 * 110) {
          f.cd = 1 / st.rate;
          damage(tgt, st.dmg, t, { flash: false });
          S.beams.push({ x1: f.x, y1: f.y, x2: tgt.x, y2: tgt.y, life: 0.05, color: "#ffc4ee", w: 1.2 });
          sfx("pew");
        }
      });
    }
  }

  // ---------- end states ----------
  function bestKey() { return `od_best_${S.diffKey}`; }
  function saveBest() {
    let best = {};
    try { best = JSON.parse(store.get(bestKey()) || "{}"); } catch { /* ignore */ }
    const rec = { wave: Math.max(best.wave || 0, S.wave), score: Math.max(best.score || 0, S.score), won: best.won || S.won };
    store.set(bestKey(), JSON.stringify(rec));
    return rec;
  }

  function gameOver() {
    S.over = true; S.lives = 0;
    audio.setIntensity(0);
    const rec = saveBest();
    sfx("lose");
    showOverlay(`
      <h1 style="color:var(--danger)">PLANET LOST</h1>
      <p>You held out until <b>wave ${S.wave}</b> on <b>${S.diff.name}</b> with a score of <b>${S.score.toLocaleString()}</b>.</p>
      <p class="muted">Best on ${S.diff.name}: wave ${rec.wave} · ${rec.score.toLocaleString()} pts</p>
      <div class="btns"><button class="primary" data-act="retry">Try Again</button><button data-act="menu">Main Menu</button></div>`);
    updateUI(true);
  }

  function victory() {
    S.won = true; S.paused = true;
    const rec = saveBest();
    sfx("win");
    showOverlay(`
      <h1 style="color:var(--good)">PLANET SAVED</h1>
      <p>You destroyed the Dreadnought and survived all ${OD.WIN_WAVE} waves on <b>${S.diff.name}</b>!</p>
      <p>Score: <b>${S.score.toLocaleString()}</b> · Planet HP left: <b>${S.lives}</b></p>
      <p class="muted">Keep going in Freeplay: waves get harder forever.</p>
      <div class="btns"><button class="primary" data-act="freeplay">Freeplay ▶</button><button data-act="menu">Main Menu</button></div>`);
    void rec;
  }

  // ---------- render ----------
  function render() {
    ctx.save();
    ctx.fillStyle = "#05060f";
    ctx.fillRect(0, 0, W, H);
    const time = S ? S.time : performance.now() / 1000;
    if (S && S.shake) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);

    for (const s of stars) {
      const a = 0.5 + 0.5 * Math.sin(time * 1.5 + s.tw);
      ctx.fillStyle = `rgba(200,210,255,${0.25 + a * 0.6})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, 420);
    g.addColorStop(0, "rgba(60,90,200,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    if (!S) { drawPlanet(time); ctx.restore(); return; }

    const odActive = S.overdrive > 0;
    RINGS.forEach((ring, ri) => {
      ctx.strokeStyle = odActive ? "rgba(255,209,102,0.4)" : "rgba(108,240,255,0.18)";
      ctx.lineWidth = odActive ? 2.5 : 1.5;
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -S.ringAngles[ri] * ring.r;
      ctx.beginPath(); ctx.arc(CX, CY, ring.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      for (let si = 0; si < ring.slots; si++) {
        if (towerAt(ri, si)) continue;
        const p = slotPos(ri, si);
        const isHover = S.hover && S.hover.ring === ri && S.hover.slot === si;
        ctx.fillStyle = S.selectedType ? (isHover ? "rgba(255,209,102,0.95)" : "rgba(108,240,255,0.6)") : "rgba(108,240,255,0.2)";
        ctx.beginPath(); ctx.arc(p.x, p.y, isHover ? 8 : S.selectedType ? 5 : 4, 0, TAU); ctx.fill();
      }
    });

    drawPlanet(time);

    // range preview
    const showRange = (x, y, r, color) => {
      ctx.fillStyle = rgba(color, 0.08); ctx.strokeStyle = rgba(color, 0.45); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
    };
    if (S.selectedTower) {
      const t = S.selectedTower, st = t.st || baseStats(t);
      const r = st.buffRange || st.range;
      if (r) showRange(t.x, t.y, r, t.path ? TOWERS[t.type].paths[t.path].color : TOWERS[t.type].color);
      ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(t.x, t.y, 24, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    } else if (S.selectedType && S.hover && !towerAt(S.hover.ring, S.hover.slot)) {
      const p = slotPos(S.hover.ring, S.hover.slot), def = TOWERS[S.selectedType];
      if (def.tiers[0].range) showRange(p.x, p.y, def.tiers[0].range, def.color);
    }

    // field pulses
    for (const t of S.towers) {
      if (TOWERS[t.type].kind !== "field" || !t.st) continue;
      const pulse = (time * 0.8) % 1, col = t.path ? TOWERS.tractor.paths[t.path].color : TOWERS.tractor.color;
      ctx.strokeStyle = rgba(col, 0.35 * (1 - pulse)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.st.range * (t.path === "A" ? 1 - pulse : pulse), 0, TAU); ctx.stroke();
    }

    for (const e of S.enemies) OD.drawEnemy(ctx, e, time, CX, CY);
    for (const t of S.towers) OD.drawTower(ctx, t, t.x ?? slotPos(t.ring, t.slot).x, t.y ?? slotPos(t.ring, t.slot).y, t.ringA ?? slotPos(t.ring, t.slot).a, time);
    for (const t of S.towers) if (t.crafts) for (const f of t.crafts) OD.drawCraft(ctx, f, t, time);

    if (S.selectedType && S.hover && !towerAt(S.hover.ring, S.hover.slot)) {
      const p = slotPos(S.hover.ring, S.hover.slot);
      ctx.globalAlpha = 0.55;
      OD.drawTower(ctx, { type: S.selectedType, level: 0, aim: p.a }, p.x, p.y, p.a, time);
      ctx.globalAlpha = 1;
    }

    // projectiles
    for (const m of S.shots) {
      if (m.kind === "bomblet") { ctx.fillStyle = "#ffd166"; ctx.fillRect(m.x - 1.5, m.y - 1.5, 3, 3); continue; }
      ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.atan2(m.vy, m.vx));
      ctx.fillStyle = m.nova ? "#ffd0a0" : "#ffe0b0";
      if (m.nova) { ctx.fillRect(-6, -3, 12, 6); ctx.fillStyle = "#ff5c5c"; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(10, 0); ctx.lineTo(6, 3); ctx.fill(); }
      else ctx.fillRect(-4, -1.5, 8, 3);
      ctx.restore();
    }

    // beams
    for (const b of S.beams) {
      ctx.globalAlpha = Math.min(1, b.life * 10);
      ctx.strokeStyle = b.color; ctx.lineWidth = b.w; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(b.x1, b.y1);
      if (b.bolt) {
        const n = 6;
        for (let i = 1; i < n; i++) ctx.lineTo(b.x1 + (b.x2 - b.x1) * i / n + (Math.random() - 0.5) * 14, b.y1 + (b.y2 - b.y1) * i / n + (Math.random() - 0.5) * 14);
      }
      ctx.lineTo(b.x2, b.y2); ctx.stroke();
      if (b.core) { ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = Math.max(1, b.w * 0.35); ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;

    for (const r of S.rings) {
      const k = 1 - r.life / r.max;
      ctx.strokeStyle = rgba(r.color.length === 7 ? r.color : "#ffffff", 1 - k); ctx.lineWidth = 3 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r * (r.inward ? 1 - k * 0.8 : 0.3 + k * 0.7)), 0, TAU); ctx.stroke();
    }

    for (const p of S.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    ctx.globalAlpha = 1;

    ctx.font = "bold 13px system-ui, sans-serif"; ctx.textAlign = "center";
    for (const f of S.floaters) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawPlanet(time) {
    const pg = ctx.createRadialGradient(CX - 15, CY - 15, 5, CX, CY, PLANET_R);
    pg.addColorStop(0, "#7fd1ff"); pg.addColorStop(0.6, "#2a6fd6"); pg.addColorStop(1, "#0d2a66");
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.arc(CX, CY, PLANET_R, 0, TAU); ctx.fill();
    const hurt = S && S.lives / S.diff.lives < 0.3;
    ctx.strokeStyle = hurt ? `rgba(255,92,122,${0.4 + 0.3 * Math.sin(time * 6)})` : `rgba(127,209,255,${0.3 + 0.2 * Math.sin(time * 2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(CX, CY, PLANET_R + 5, 0, TAU); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, PLANET_R, 0, TAU); ctx.clip();
    ctx.fillStyle = "rgba(90,200,120,0.55)";
    for (let i = 0; i < 5; i++) {
      const x = CX - PLANET_R * 1.5 + ((time * 6 + i * 37) % (PLANET_R * 3)), y = CY + Math.sin(i * 2.1) * 22;
      ctx.beginPath(); ctx.ellipse(x, y, 10 + i * 2, 6 + i, i, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // ---------- UI ----------
  function buildShop() {
    ui.shop.innerHTML = "";
    for (const [type, def] of Object.entries(TOWERS)) {
      const b = document.createElement("button");
      b.className = "tower-btn";
      b.dataset.type = type;
      b.innerHTML = `<canvas width="72" height="72"></canvas><span class="tb-text"><b style="color:${def.color}">${def.name}</b><small>${def.desc}</small><span class="cost">${def.tiers[0].cost} cr</span></span><kbd>${def.key}</kbd>`;
      b.addEventListener("click", () => { sfx("click"); selectType(type); });
      ui.shop.appendChild(b);
      const c = b.querySelector("canvas").getContext("2d");
      c.setTransform(1.6, 0, 0, 1.6, 36, 36);
      OD.drawTower(c, { type, level: 0, aim: -Math.PI / 4 }, 0, -2, -Math.PI / 2, 0);
    }
  }

  function selectType(type) {
    if (!S || S.over) return;
    S.selectedTower = null;
    S.selectedType = S.selectedType === type ? null : type;
    if (S.selectedType) toast(`Tap a glowing slot to build ${TOWERS[type].name}`, 1400);
    renderInfo(); updateUI(true);
  }

  function statRows(t, st, next) {
    const rows = [];
    const row = (k, v, nv) => rows.push(`<div class="row"><span>${k}</span><b>${v}${nv !== undefined && nv !== null && String(nv) !== String(v) ? ` <em>→ ${nv}</em>` : ""}</b></div>`);
    const n = next || {};
    const fmt = x => (x == null ? x : Math.round(x * 10) / 10);
    switch (TOWERS[t.type].kind) {
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
        row(st.arc ? "Bolts/s" : "Pulses/s", fmt(st.rate), fmt(n.rate));
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
    if (TOWERS[t.type].kind !== "miner") row("Kills", t.kills || 0);
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
    const def = TOWERS[t.type], st = baseStats(t);
    const pathDef = t.path ? def.paths[t.path] : null;
    const color = pathDef ? pathDef.color : def.color;
    let upHtml = "", next = null;
    if (t.level < 2) { next = tierOf(t.type, t.level + 1); upHtml = upgradeCard(t, t.level + 1); }
    else if (t.level === 2) {
      upHtml = `<div class="choose">Choose a specialization (permanent):</div>
        ${["A", "B"].map(p => `<div class="path-desc" style="color:${def.paths[p].color}">${def.paths[p].name}: <span>${def.paths[p].desc}</span></div>${upgradeCard(t, 3, p)}`).join("")}`;
    } else if (t.level === 3) { next = tierOf(t.type, 4, t.path); upHtml = upgradeCard(t, 4, t.path); }
    else upHtml = `<div class="maxed" style="color:${color}">★ Fully upgraded</div>`;

    const targetBtn = def.targets ? `<button class="small" data-act="target">Target: <b>${TARGET_LABEL[t.targeting]}</b></button>` : "";
    ui.info.innerHTML = `
      <div class="info-head">
        <canvas width="64" height="64" data-preview="${t.type}|${t.level}|${t.path || ""}"></canvas>
        <div><h3 style="color:${color}">${st.name}</h3>
        <div class="sub">${def.name} · Tier ${t.level + 1}/5${pathDef ? ` · ${pathDef.name}` : ""}</div></div>
        <button class="close" data-act="close" aria-label="Close">✕</button>
      </div>
      <div class="stats">${statRows(t, st, next)}</div>
      <div class="ups">${upHtml}</div>
      <div class="actions">${targetBtn}<button class="small danger" data-act="sell">Sell +${sellValue(t)}</button></div>`;
    ui.info.classList.add("open");
    ui.info.querySelectorAll("canvas[data-preview]").forEach(c => {
      const [type, lvl, path] = c.dataset.preview.split("|");
      const g = c.getContext("2d"), s = c.width / 64;
      g.setTransform(1.15 * s, 0, 0, 1.15 * s, c.width / 2, c.height / 2);
      OD.drawTower(g, { type, level: +lvl, path: path || null, aim: -Math.PI / 4, cd: 0, st: tierOf(type, +lvl, path || null) }, 0, -3, -Math.PI / 2, S.time);
    });
  }

  ui.info.addEventListener("click", ev => {
    const t = S && S.selectedTower;
    if (!t) return;
    const up = ev.target.closest("[data-up]");
    const act = ev.target.closest("[data-act]");
    if (up && !up.disabled) upgradeTower(t, up.dataset.up || null);
    else if (act) {
      const a = act.dataset.act;
      if (a === "close") { S.selectedTower = null; renderInfo(); }
      else if (a === "sell") sellTower(t);
      else if (a === "target") { t.targeting = TARGET_MODES[(TARGET_MODES.indexOf(t.targeting) + 1) % TARGET_MODES.length]; sfx("click"); renderInfo(); }
    }
  });

  const sellValue = t => Math.floor(t.spent * 0.7);

  function upgradeTower(t, path) {
    if (t.level >= 4) return;
    const nextLevel = t.level + 1;
    const usePath = nextLevel === 3 ? path : t.path;
    if (nextLevel === 3 && !usePath) return;
    const tier = tierOf(t.type, nextLevel, usePath);
    if (S.money < tier.cost) { sfx("deny"); return; }
    S.money -= tier.cost; t.spent += tier.cost;
    t.level = nextLevel; t.path = usePath;
    burst(t.x, t.y, nextLevel >= 3 ? TOWERS[t.type].paths[usePath].color : "#ffd166", 22, 110);
    ringFx(t.x, t.y, 30, "#ffd166", 0.4);
    sfx(nextLevel === 3 ? "path" : "upgrade");
    if (nextLevel >= 3) toast(`${tier.name}!`);
    renderInfo(); updateUI(true);
  }

  function sellTower(t) {
    S.money += sellValue(t);
    S.towers = S.towers.filter(x => x !== t);
    burst(t.x, t.y, "#ffd166", 10, 80);
    sfx("sell");
    S.selectedTower = null;
    renderInfo(); updateUI(true);
  }

  function placeTower(slot) {
    const def = TOWERS[S.selectedType];
    const cost = def.tiers[0].cost;
    if (S.money < cost) { toast("Not enough credits"); sfx("deny"); return; }
    S.money -= cost;
    const p = slotPos(slot.ring, slot.slot);
    S.towers.push({ id: nextId++, type: S.selectedType, ring: slot.ring, slot: slot.slot, level: 0, path: null, spent: cost,
      cd: 0, aim: p.a, kills: 0, targeting: "first", x: p.x, y: p.y, ringA: p.a });
    burst(p.x, p.y, def.color, 12, 90);
    sfx("place");
    if (S.money < cost) S.selectedType = null;
    updateUI(true);
  }

  let lastUI = "", lastPreview = -1;
  function updateUI(force) {
    if (!S) return;
    const odState = S.overdrive > 0 ? "on" : S.overdriveCd > 0 ? Math.ceil(S.overdriveCd) : "ready";
    const key = [S.wave, S.lives, S.money, S.score, S.waveActive, S.selectedType, S.speed, S.paused, S.auto, odState, S.over].join("|");
    if (key === lastUI && !force) return;
    lastUI = key;
    ui.wave.textContent = S.won && !S.freeplay ? `${S.wave}` : S.freeplay ? `${S.wave}` : `${S.wave}/${OD.WIN_WAVE}`;
    ui.lives.textContent = Math.max(0, S.lives);
    ui.lives.classList.toggle("danger", S.lives / S.diff.lives < 0.3);
    ui.money.textContent = S.money.toLocaleString();
    ui.score.textContent = S.score.toLocaleString();
    ui.diff.textContent = S.diff.name; ui.diff.style.color = S.diff.color;
    ui.waveBtn.disabled = S.waveActive || S.over;
    ui.waveBtn.innerHTML = S.waveActive ? `Wave ${S.wave}…` : `Launch Wave ${S.wave + 1} ▶`;
    ui.speedBtn.textContent = `${S.speed}×`;
    ui.autoBtn.classList.toggle("on", S.auto);
    ui.odBtn.disabled = S.overdriveCd > 0 || S.over;
    ui.odBtn.classList.toggle("on", S.overdrive > 0);
    ui.odBtn.innerHTML = S.overdrive > 0 ? "⚡ Overdrive!" : S.overdriveCd > 0 ? `⚡ ${Math.ceil(S.overdriveCd)}s` : "⚡ Overdrive";
    for (const b of ui.shop.children) {
      const def = TOWERS[b.dataset.type];
      b.classList.toggle("selected", S.selectedType === b.dataset.type);
      b.classList.toggle("poor", S.money < def.tiers[0].cost);
    }
    const pv = S.waveActive ? S.wave : S.wave + 1;
    if (pv !== lastPreview) {
      lastPreview = pv;
      ui.preview.innerHTML = `<span class="pv-label">${S.waveActive ? "This wave" : "Next wave"}:</span>${previewText(pv)}`;
    }
    if (S.selectedTower) {
      // refresh affordability of upgrade buttons without rebuilding every frame
      ui.info.querySelectorAll("[data-up]").forEach(b => {
        const lvl = S.selectedTower.level + 1;
        const tier = tierOf(S.selectedTower.type, lvl, lvl === 3 ? b.dataset.up : S.selectedTower.path);
        b.disabled = S.money < tier.cost;
      });
    }
  }

  // ---------- overlays / menus ----------
  function showOverlay(html) {
    ui.overlay.innerHTML = `<div class="card">${html}</div>`;
    ui.overlay.classList.remove("hidden");
  }
  const hideOverlay = () => ui.overlay.classList.add("hidden");

  function soundButtons() {
    return `<div class="btns sound"><button data-act="music">${audio.music ? "♫ Music: On" : "♫ Music: Off"}</button><button data-act="sfx">${audio.sfx ? "🔊 Sound: On" : "🔇 Sound: Off"}</button></div>`;
  }

  function mainMenu() {
    S = null;
    audio.setIntensity(0);
    ui.info.classList.remove("open");
    const best = k => { try { const b = JSON.parse(store.get(`od_best_${k}`) || "{}"); return b.wave ? `${b.won ? "★ " : ""}Best: wave ${b.wave}` : "Not played yet"; } catch { return ""; } };
    showOverlay(`
      <h1>ORBITAL DEFENSE</h1>
      <p>Hostiles spiral toward your homeworld. Build satellites on the <b>three rotating orbit rings</b> and survive <b>${OD.WIN_WAVE} waves</b>.</p>
      <div class="diffs">
        ${Object.entries(DIFFICULTY).map(([k, d]) => `
          <button class="diff" data-diff="${k}" style="--c:${d.color}">
            <b>${d.name}</b><small>${d.desc}</small><small class="muted">${best(k)}</small>
          </button>`).join("")}
      </div>
      ${soundButtons()}
      <details><summary>How to play</summary>
        <ul>
          <li>Pick a satellite at the bottom, then tap a glowing slot on a ring.</li>
          <li>Tap a satellite to upgrade it. At tier 3 choose one of <b>two specializations</b>.</li>
          <li><b>⚡ Overdrive</b> spins the rings 5× faster and boosts fire rate for a few seconds.</li>
          <li>Mining Sats earn credits during waves. Shields regenerate: railguns break them fastest.</li>
          <li>Keys: <b>1–7</b> satellites · <b>Space</b> wave · <b>Q</b> overdrive · <b>F</b> speed · <b>P</b> pause · <b>Esc</b> cancel</li>
        </ul>
      </details>`);
  }

  function pauseMenu() {
    if (!S || S.over) return;
    S.paused = true;
    showOverlay(`
      <h1>PAUSED</h1>
      <p class="muted">Wave ${S.wave} · ${S.diff.name}</p>
      <div class="btns"><button class="primary" data-act="resume">Resume</button></div>
      ${soundButtons()}
      <div class="btns"><button data-act="retry">Restart</button><button data-act="menu">Main Menu</button></div>`);
    updateUI(true);
  }

  ui.overlay.addEventListener("click", ev => {
    audio.init();
    const d = ev.target.closest("[data-diff]");
    if (d) return begin(d.dataset.diff);
    const a = ev.target.closest("[data-act]");
    if (!a) return;
    sfx("click");
    switch (a.dataset.act) {
      case "resume": S.paused = false; hideOverlay(); updateUI(true); break;
      case "retry": begin(S.diffKey); break;
      case "menu": mainMenu(); break;
      case "freeplay": S.freeplay = true; S.paused = false; hideOverlay(); updateUI(true); break;
      case "music": audio.toggleMusic(); a.textContent = audio.music ? "♫ Music: On" : "♫ Music: Off"; break;
      case "sfx": audio.toggleSfx(); a.textContent = audio.sfx ? "🔊 Sound: On" : "🔇 Sound: Off"; break;
    }
  });

  function begin(diffKey) {
    audio.init();
    S = newState(diffKey);
    lastUI = ""; lastPreview = -1;
    hideOverlay();
    renderInfo();
    updateUI(true);
    sfx("wave");
  }

  // ---------- input ----------
  function canvasPoint(ev) {
    const rect = canvas.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) / scale, y: (ev.clientY - rect.top) / scale };
  }

  canvas.addEventListener("pointermove", ev => {
    if (!S || ev.pointerType === "touch") return;
    const p = canvasPoint(ev);
    S.hover = nearestSlot(p.x, p.y, 26);
    canvas.style.cursor = S.hover ? "pointer" : "default";
  });
  canvas.addEventListener("pointerleave", () => { if (S) S.hover = null; });
  canvas.addEventListener("pointerdown", ev => {
    audio.init();
    if (!S || S.over || S.paused) return;
    const p = canvasPoint(ev);
    const touch = ev.pointerType !== "mouse";
    const slot = nearestSlot(p.x, p.y, touch ? 36 : 26);
    if (!slot) { S.selectedTower = null; S.selectedType = null; S.hover = null; renderInfo(); updateUI(true); return; }
    const existing = towerAt(slot.ring, slot.slot);
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
  });

  window.addEventListener("keydown", ev => {
    if (ev.target.tagName === "INPUT") return;
    const k = ev.key.toLowerCase();
    if (!S || (S.won && !S.freeplay)) return;
    if (k === "escape") {
      if (S.selectedType || S.selectedTower) { S.selectedType = null; S.selectedTower = null; renderInfo(); updateUI(true); }
      else if (S.paused && !S.won) { S.paused = false; hideOverlay(); updateUI(true); }
      else pauseMenu();
      return;
    }
    if (S.paused || S.over) return;
    if (k === " ") { ev.preventDefault(); startWave(); }
    else if (k === "f") toggleSpeed();
    else if (k === "p") pauseMenu();
    else if (k === "q") activateOverdrive();
    else for (const [type, def] of Object.entries(TOWERS)) if (def.key === k) selectType(type);
  });

  function toggleSpeed() { if (!S) return; S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 3 : 1; sfx("click"); updateUI(true); }
  function activateOverdrive() {
    if (!S || S.overdriveCd > 0 || S.over) return;
    S.overdrive = OVERDRIVE.duration; S.overdriveCd = OVERDRIVE.cooldown;
    sfx("overdrive"); toast("⚡ OVERDRIVE: rings spinning, fire rate +30%");
    updateUI(true);
  }
  ui.waveBtn.onclick = () => { audio.init(); startWave(); };
  ui.speedBtn.onclick = toggleSpeed;
  ui.menuBtn.onclick = pauseMenu;
  ui.odBtn.onclick = activateOverdrive;
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
    if (!r.width || !r.height) return;
    scale = Math.min(r.width, r.height) / VIEW;
    W = r.width / scale; H = r.height / scale;
    CX = W / 2; CY = H / 2;
    SPAWN_R = Math.hypot(W, H) / 2 + 30;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    makeStars();
  }
  window.addEventListener("resize", resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  // ---------- loop ----------
  let last = performance.now(), uiTimer = 0;
  function frame(now) {
    const raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S && !S.paused && !S.over) {
      const steps = S.speed;
      for (let i = 0; i < steps && !S.over; i++) update(raw);
      uiTimer += raw;
      if (uiTimer > 0.1) { uiTimer = 0; updateUI(); }
    }
    render();
    requestAnimationFrame(frame);
  }

  // Test hook (used by automated playtests).
  window.__od = { state: () => S, begin, startWave, slotPos, towerAt, RINGS, TOWERS, upgradeTower, placeTower: (slot, type) => { S.selectedType = type; placeTower(slot); } };

  buildShop();
  resize();
  mainMenu();
  requestAnimationFrame(frame);
})(window.OD);
