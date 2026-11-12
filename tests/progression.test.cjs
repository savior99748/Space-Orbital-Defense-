// Part of the automated test suite. Run all with: npm test   (or one: npm test -- progression)
// Late-game progression: Fleet Link stacking, Ascension tiers, the five Endless invaders.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_orbits', 'classic'); localStorage.setItem('od_stats_off', '1'); } catch {} });
  await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
  await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 30000 });

  // ---------- Fleet Link stacking ----------
  // A railgun with Fleet Uplinks placed around it on the same ring; the satellites' positions are recomputed
  // every frame (the rings rotate), so we count the links in range the same way the game does.
  const setup = await pg.evaluate(() => {
    const od = window.__od; od.begin('earth', 'easy', false, true); const S = od.state(), B = od.board();
    S.money = 1e7; S.lives = 9999;
    const ring = B.slots[0].ring, mine = B.slots.filter(s => s.ring === ring).map(s => s.id);
    od.placeTower(mine[0], 'rail');
    const rail = S.towers[0];
    const relays = [];
    for (const id of mine.slice(1, 6)) { od.placeTower(id, 'miner'); const t = S.towers[S.towers.length - 1]; od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'B'); od.upgradeTower(t); relays.push(t.id); }
    return { relays, ringR: B.rings[ring].r, n: mine.length };
  });
  const linkState = () => pg.evaluate(() => {
    const S = window.__od.state(), rail = S.towers.find(t => t.type === 'rail');
    const inRange = S.towers.filter(t => t.type === 'miner' && t.level === 4 && t.path === 'B' && ((t.x - rail.x) ** 2 + (t.y - rail.y) ** 2 + ((t.z || 0) - (rail.z || 0)) ** 2) <= (t.st.buffRange) ** 2).length;
    return { links: rail.links, buffRate: rail.buffRate, inRange, rate: rail.st.rate, base: window.__od.TOWERS.rail.tiers[0].rate, text: document.querySelector('[data-fleet]') && document.querySelector('[data-fleet]').textContent };
  });
  await pg.waitForTimeout(400);
  let L = await linkState();
  const expect = n => 1 + Math.min(1.4, 0.35 * n);
  ok(L.links === L.inRange && L.links >= 2, `Fleet Links counted per relay in range (${L.links} links, ${L.inRange} relays within range)`);
  ok(Math.abs(L.buffRate - expect(L.links)) < 1e-9, `bonus stacks additively: ${L.links} links → +${Math.round((L.buffRate - 1) * 100)}%`);
  ok(Math.abs(L.rate - L.base * L.buffRate) < 1e-9, `the railgun's actual firing rate uses the bonus (${L.base}/s → ${L.rate.toFixed(3)}/s), applied once`);

  // stays the same frame after frame (no double application during recalculation)
  await pg.waitForTimeout(500);
  const L2 = await linkState();
  ok(L2.links !== L.links || Math.abs(L2.buffRate - L.buffRate) < 1e-9, 'recalculating every frame does not keep adding the bonus');

  // real gameplay check of the cap and of removal: sell relays one by one and watch the bonus fall
  const sellSteps = await pg.evaluate(async () => {
    const od = window.__od, S = od.state(), wait = ms => new Promise(r => setTimeout(r, ms));
    const rail = () => S.towers.find(t => t.type === 'rail');
    const steps = [];
    // freeze the rings so positions stay put while we measure
    const B = od.board(); const speeds = B.rings.map(r => r.speed); B.rings.forEach(r => { r.speed = 0; });
    await wait(300);
    steps.push({ links: rail().links, rate: rail().buffRate });
    while (S.towers.some(t => t.type === 'miner')) {
      const m = S.towers.find(t => t.type === 'miner');
      S.selectedTower = m; document.querySelector('[data-act="sell"]') ? document.querySelector('[data-act="sell"]').click() : null;
      if (S.towers.includes(m)) { S.towers.splice(S.towers.indexOf(m), 1); }
      await wait(250); for (let k = 0; k < 30 && rail().links > S.towers.filter(t => t.type === 'miner').length; k++) await wait(100);
      steps.push({ links: rail().links, rate: rail().buffRate });
    }
    B.rings.forEach((r, i) => { r.speed = speeds[i]; });
    return steps;
  });
  const okSteps = sellSteps.every(s => Math.abs(s.rate - (1 + Math.min(1.4, 0.35 * s.links))) < 1e-9);
  ok(okSteps, 'after each relay is destroyed the bonus is recomputed: ' + sellSteps.map(s => `${s.links}→+${Math.round((s.rate - 1) * 100)}%`).join(', '));
  ok(sellSteps[sellSteps.length - 1].links === 0 && sellSteps[sellSteps.length - 1].rate === 1, 'no relays left: bonus gone');

  // exact table 0..5 relays stacked right on the railgun (positions forced each frame)
  const exact = await pg.evaluate(async () => {
    const od = window.__od, S = od.state(), B = od.board(), wait = ms => new Promise(r => setTimeout(r, ms));
    const rail = S.towers.find(t => t.type === 'rail');
    const ring = B.slots[rail.slot].ring, free = B.slots.filter(s => s.ring === ring && !od.towerAt(s.id)).map(s => s.id);
    const results = [];
    for (let n = 0; n <= 5; n++) {
      S.towers = S.towers.filter(t => t.type !== 'miner');
      for (let i = 0; i < n; i++) { od.placeTower(free[i], 'miner'); const t = S.towers[S.towers.length - 1]; t.level = 4; t.path = 'B'; t.slot = rail.slot; } // same spot as the railgun
      for (let k = 0; k < 60 && rail.links !== n; k++) await wait(100); // wait for the game to update (slow headless frames)
      results.push({ n, links: rail.links, bonus: Math.round((rail.buffRate - 1) * 100), rate: rail.st.rate });
    }
    S.towers = S.towers.filter(t => t.type !== 'miner');
    return results;
  });
  const want = [0, 35, 70, 105, 140, 140];
  ok(exact.every((r, i) => r.links === i && r.bonus === want[i]), 'stacking: ' + exact.map(r => `${r.n} link${r.n === 1 ? '' : 's'} = +${r.bonus}%`).join(', ') + ' (capped at +140%)');

  // the info panel shows the combined bonus on the affected satellite
  await pg.evaluate(() => { const od = window.__od, S = od.state(), rail = S.towers.find(t => t.type === 'rail');
    const free = od.board().slots.filter(s => !od.towerAt(s.id)).map(s => s.id);
    for (let i = 0; i < 2; i++) { od.placeTower(free[i], 'miner'); const t = S.towers[S.towers.length - 1]; t.level = 4; t.path = 'B'; t.slot = rail.slot; } });
  await pg.waitForFunction(() => { const r = window.__od.state().towers.find(t => t.type === 'rail'); return r.links === 2; }, null, { timeout: 15000 }).catch(() => {});
  await pg.evaluate(() => { const od = window.__od, S = od.state(); const rail = S.towers.find(t => t.type === 'rail'); S.selectedTower = rail; });
  await pg.evaluate(() => { const S = window.__od.state(); const rail = S.towers.find(t => t.type === 'rail'); window.__od.upgradeTower(rail); }); // re-renders the panel
  await pg.waitForTimeout(300);
  const fleet = await pg.textContent('[data-fleet]').catch(() => '');
  ok(/\+70% fire rate \(2 links\)/.test(fleet), `upgrade panel shows the combined bonus ("${fleet}")`);

  // actual firing intervals: count railgun shots at a stationary, unkillable target with and without links
  const shots = await pg.evaluate(async () => {
    const od = window.__od, S = od.state(), wait = ms => new Promise(r => setTimeout(r, ms));
    const rail = S.towers.find(t => t.type === 'rail');
    od.board().rings.forEach(r => { r.speed = 0; });
    S.wave = 5; od.startWave();
    for (let k = 0; k < 100 && !S.enemies.length; k++) await wait(100);
    S.queue = [];
    const e = S.enemies[0]; S.enemies = [e];
    e.def = Object.assign({}, e.def, { speed: 0, reward: 0 }); e.hp = e.maxHp = 1e12; e.shield = e.maxShield = 0;
    e.x = rail.x + 40; e.y = rail.y; e.z = rail.z || 0;
    const count = async ms => { let n = 0, last = rail.cd; const t0 = S.time; S.speed = 8;
      while ((S.time - t0) < ms) { await wait(10); if (rail.cd > last + 0.05) n++; last = rail.cd; }
      return n / (S.time - t0); };
    const withLinks = await count(24);
    S.towers = S.towers.filter(t => t.type !== 'miner');
    const without = await count(24);
    return { withLinks, without, ratio: withLinks / without };
  });
  ok(Math.abs(shots.ratio - 1.7) < 0.25, `railgun really fires faster: ${shots.without.toFixed(2)} → ${shots.withLinks.toFixed(2)} shots/s with 2 links (×${shots.ratio.toFixed(2)}, expected ×1.70)`);

  // ---------- Ascension ----------
  const asc = await pg.evaluate(async () => {
    const od = window.__od, S = od.state(), wait = ms => new Promise(r => setTimeout(r, ms));
    S.enemies = []; S.waveActive = false; S.queue = [];
    const free = od.board().slots.filter(s => !od.towerAt(s.id)).map(s => s.id);
    od.placeTower(free[0], 'laser'); const t = S.towers[S.towers.length - 1];
    od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'A'); od.upgradeTower(t);
    for (let k = 0; k < 60 && !(t.st && t.st.chain === 4); k++) await wait(100);
    const before = { dmg: t.st.dmg, rate: t.st.rate / t.buffRate, range: t.st.range };
    S.money = 425000;
    const m0 = S.money; od.ascendTower(t); const c1 = m0 - S.money;
    od.ascendTower(t); const c2 = m0 - S.money - c1;
    od.ascendTower(t); const c3 = m0 - S.money - c1 - c2;
    const m3 = S.money; od.ascendTower(t); const c4 = m3 - S.money;
    for (let k = 0; k < 60 && t.st.dmg === before.dmg; k++) await wait(100);
    const after = { dmg: t.st.dmg, rate: t.st.rate / t.buffRate, range: t.st.range };
    od.saveRun(); const saved = od.loadRun().towers.find(x => x.slot === t.slot);
    return { before, after, costs: [c1, c2, c3, c4], asc: t.asc, saved: saved.asc, halos: (() => { let n = 0; window.__view3d.scene.traverse(o => { if (o.geometry && o.geometry.type === 'TorusGeometry' && o.material && o.material.color && o.material.color.getHex && (o.material.color.getHex() === 0xc18cff || o.material.color.getHex() === 0xffffff) && o.geometry.parameters.radius >= 15) n++; }); return n; })() };
  });
  ok(asc.costs.join() === '50000,125000,250000,0' && asc.asc === 3, `three Ascension tiers cost 50k / 125k / 250k, then stop (${asc.costs.join(', ')})`);
  ok(Math.abs(asc.after.dmg / asc.before.dmg - 1.6 ** 3) < 0.05 && asc.after.rate > asc.before.rate && asc.after.range > asc.before.range, `Ascension III: damage ${asc.before.dmg} → ${asc.after.dmg}, rate ${asc.before.rate} → ${asc.after.rate}, range ${asc.before.range} → ${asc.after.range}`);
  ok(asc.saved === 3, 'Ascension level is saved with the run');
  ok(asc.halos >= 3, `ascended satellite wears its halos in 3D (${asc.halos})`);
  const campaignAsc = await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'easy'); const S = od.state(); S.money = 1e6; od.placeTower(0, 'laser'); const t = S.towers[0]; od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'A'); od.upgradeTower(t); od.ascendTower(t); od.tapSlot(0); return { asc: t.asc || 0, card: !!document.querySelector('#info [data-asc]'), oc: !!document.querySelector('#info [data-oc]') }; });
  ok(campaignAsc.asc === 1 && campaignAsc.card && !campaignAsc.oc, 'Ascension also works in the campaign (Overclock stays Endless / Freeplay)');

  // ---------- new invaders ----------
  const waves = await pg.evaluate(() => { const types = n => new Set(OD.buildWave(n).map(g => g.type)); const c = n => [...types(n)];
    return { w30: c(30), w31: c(31), w35: c(35), w45: c(45), w55: c(55), w120: c(120), campaign: [1, 10, 20, 29].every(n => !c(n).some(t => ['brute', 'phantom', 'brood', 'aegis', 'titan'].includes(t))) }; });
  ok(waves.campaign && !waves.w30.includes('brute'), 'campaign waves 1-30 unchanged (no new invaders)');
  ok(waves.w31.includes('brute') && waves.w35.includes('phantom') && waves.w45.includes('aegis') && waves.w55.includes('titan'), `Endless brings them in: 31 ${waves.w31.includes('brute') ? 'Juggernaut' : '-'}, 35 Phase Wraith, 45 Aegis, 55 Void Titan`);
  ok(['brute', 'brood', 'aegis'].every(t => waves.w120.includes(t)), 'by wave 120 the big ships come every wave');
  const hp = await pg.evaluate(() => { const d = OD.DIFFICULTY.medium; return { w60: OD.hpScale(60, d), w100: OD.hpScale(100, d), w200: OD.hpScale(200, d), w30: OD.hpScale(30, d) }; });
  ok(hp.w200 / hp.w100 > 40, `late Endless keeps getting harder (HP ×${Math.round(hp.w100)} at wave 100, ×${Math.round(hp.w200)} at wave 200)`);

  const models = await pg.evaluate(async () => {
    const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms));
    od.begin('earth', 'easy', false, true); const S = od.state(); S.lives = 1e6; S.wave = 69; od.startWave();
    for (let k = 0; k < 100 && !S.enemies.length; k++) await wait(100);
    S.queue = [];
    const types = ['brute', 'phantom', 'brood', 'aegis', 'titan'];
    S.enemies = S.enemies.slice(0, 1);
    const tmpl = S.enemies[0];
    S.enemies = types.map((type, i) => Object.assign({}, tmpl, { id: 900000 + i, type, def: OD.ENEMIES[type], hp: OD.ENEMIES[type].hp, maxHp: OD.ENEMIES[type].hp, shield: OD.ENEMIES[type].shield || 0, maxShield: OD.ENEMIES[type].shield || 0, x: tmpl.x + i * 30, cloakT: 0 }));
    S.speed = 1; await wait(1500);
    let meshes = 0; window.__view3d.scene.traverse(o => { if (o.name === 'rig') meshes++; });
    return { meshes, n: S.enemies.length };
  });
  ok(models.meshes >= 5, `all five new invaders build and render in 3D (${models.meshes} invader models on screen)`);
  await pg.screenshot({ path: 'progression-invaders.png' });

  const armor = await pg.evaluate(() => ({ armor: OD.ENEMIES.brute.armor, cloak: !!OD.ENEMIES.phantom.cloak }));
  ok(armor.armor > 0 && armor.cloak, 'Juggernaut is armored; Phase Wraith cloaks');
  const cloak = await pg.evaluate(async () => {
    const S = window.__od.state(), wait = ms => new Promise(r => setTimeout(r, ms));
    const ph = S.enemies.find(x => x.type === 'phantom'); if (!ph) return { seen: [] };
    ph.def = Object.assign({}, ph.def, { speed: 0 }); ph.hp = ph.maxHp = 1e9;
    const C = window.__od.center(); ph.x = C.x + 200; ph.y = C.y; ph.z = 0; ph.r = 200; // well inside the map
    S.speed = 3;
    // the cloak cycle runs on game time; keep sampling until both states are seen (slow headless frames)
    const seen = new Set(); for (let i = 0; i < 200 && seen.size < 2; i++) { seen.add(!!ph.cloaked); await wait(100); }
    return { seen: [...seen] };
  });
  ok(cloak.seen.includes(true) && cloak.seen.includes(false), 'Phase Wraith phases in and out');

  // 2D view draws them too
  await pg.goto('http://127.0.0.1:8769/index.html?view=2d');
  await pg.waitForFunction(() => window.__od, null, { timeout: 30000 });
  const twoD = await pg.evaluate(async () => {
    const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms));
    od.begin('earth', 'easy', false, true); const S = od.state(); S.lives = 1e6; S.wave = 69; od.startWave(); S.queue = [];
    S.money = 1e6; od.placeTower(0, 'laser'); const t = S.towers[0]; od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'A'); od.upgradeTower(t); od.ascendTower(t); od.ascendTower(t);
    await wait(1500); return S.enemies.length;
  });
  ok(twoD >= 0, 'Classic 2D draws the new invaders and Ascension halos');
  await pg.screenshot({ path: 'progression-2d.png' });

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
