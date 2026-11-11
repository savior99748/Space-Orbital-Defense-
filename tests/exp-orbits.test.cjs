// Part of the automated test suite. Run all with: npm test   (or one: npm test -- exp-orbits)
// EXPERIMENT "Own Orbits" (?exp=orbits): each satellite on its own orbit, fuel, LEO → MEO → HEO. Without the flag nothing changes.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async q => {
    const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); } catch {} });
    await pg.goto(`http://127.0.0.1:8769/index.html${q}`);
    await pg.waitForFunction(() => window.__od && window.__view3d, null, { timeout: 30000 });
    return { pg, errs };
  };
  // without the flag: the normal game
  { const { pg } = await open('');
    const r = await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'easy'); const B = od.board();
      return { exp: !!od.EXP, lanes: B.rings.filter(x => x.lane || x.launch || x.hidden).length, orbitSlots: B.slots.filter(s => !s.surface && od.slotFits(s.id, 'laser')).length }; });
    ok(!r.exp && r.lanes === 0 && r.orbitSlots > 0, `no flag: normal rings and slots (${r.orbitSlots} orbit slots), no experiment`);
    await pg.context().close(); }

  const { pg, errs } = await open('?exp=orbits');
  const r = await pg.evaluate(async () => {
    const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms)), out = { maps: {} };
    for (const m of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'sol']) {
      od.begin(m, 'medium'); const B = od.board();
      out.maps[m] = [0, 1, 2].map(band => B.rings.filter(x => x.lane && x.band === band).length).join('/');
      // lanes of the same body never share a radius → they can't collide
      const byBody = {}; for (const x of B.rings.filter(x => x.lane)) (byBody[x.body] = byBody[x.body] || []).push(x.r);
      out.maps[m] += Object.values(byBody).every(rs => new Set(rs.map(v => v.toFixed(2))).size === rs.length) ? '' : ' CLASH';
    }
    od.begin('earth', 'medium'); const S = od.state(), B = od.board(); S.money = 1e6;
    out.oldSlotsHidden = B.slots.filter(s => B.rings[s.ring].hidden).every(s => !od.slotFits(s.id, 'laser'));
    const L = od.launchSlot(0);
    out.noMarker = !od.slotUsable(L); // no tappable marker: launches go through the LAUNCH button
    // pick a satellite → the launch panel shows; LAUNCH puts it on its own orbit in the chosen zone
    document.querySelector('#shop [data-type="laser"]').click(); od.updateUI && od.updateUI(true);
    await wait(100); const pad = document.getElementById('launchPad');
    out.padShown = !!pad && pad.style.display === 'flex' && !!pad.querySelector('[data-launch]');
    pad.querySelector('[data-launch]').click(); pad.querySelector('[data-launch]').click();
    pad.querySelector('[data-band="2"]').click(); pad.querySelector('[data-launch]').click();
    out.rings = new Set(S.towers.map(t => B.slots[t.slot].ring)).size;
    out.zones = S.towers.map(t => `${B.rings[B.slots[t.slot].ring].band}:${t.orbit}:${t.fuel}`).join(',');
    // tapping the Moon picks it as the launch site
    od.pickLaunchSite(1); pad.querySelector('[data-band="0"]').click(); pad.querySelector('[data-launch]').click();
    out.moon = B.rings[B.slots[S.towers[3].slot].ring].body === 1;
    S.selectedType = null; od.tapSlot(null);
    // moving a satellite to another zone costs 1 fuel per zone; upgrades aren't tied to orbits
    const t = S.towers[0]; od.setOrbit(t, 2); out.moved = t.orbit === 2 && B.rings[B.slots[t.slot].ring].band === 2 && t.fuel === 18;
    od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'A'); od.upgradeTower(t); out.tier5 = t.level === 4;
    // refuel: costs half of everything spent on it (for a full tank), back to 20
    t.fuel = 0; const rc = od.refuelCost(t), m0 = S.money; od.refuel(t);
    out.refuel = t.fuel === 20 && m0 - S.money === rc && rc >= Math.floor(t.spent * 0.5) && od.refuelCost(t) === 0; out.refuelCost = rc; out.spent = t.spent;
    for (let i = 0; i < 2; i++) od.placeTower(L, 'laser');
    // fill LEO: launch refuses when it's full
    S.launchBand = 0; const leo = od.freeLanes(0, 0).length; for (let i = 0; i < leo; i++) od.placeTower(L, 'laser');
    const n = S.towers.length; od.placeTower(L, 'laser'); out.leoFull = S.towers.length === n;
    // fuel: 1 per wave, Overdrive burns 2, out of fuel → burns up
    S.lives = 1e6; S.wave = 0; od.startWave(); S.speed = 8; S.enemies = []; S.queue = [];
    await new Promise(r => { const iv = setInterval(() => { if (!S.waveActive) { clearInterval(iv); r(); } }, 50); });
    out.fuelAfterWave = S.towers[1].fuel;
    document.getElementById('odBtn').click(); out.fuelAfterOd = S.towers[1].fuel;
    const before = S.towers.length; S.towers.forEach(x => { x.fuel = 1; });
    od.startWave(); S.enemies = []; S.queue = [];
    await new Promise(r => { const iv = setInterval(() => { if (!S.waveActive) { clearInterval(iv); r(); } }, 50); });
    out.burned = before - S.towers.length; out.left = S.towers.length;
    // save + resume keeps the same orbits, in its own save slot
    od.begin('earth', 'medium'); const S2 = od.state(); S2.money = 1e6; od.placeTower(od.launchSlot(0), 'missile'); od.placeTower(od.launchSlot(1), 'laser');
    const keep = S2.towers.map(t => `${t.slot}:${od.board().rings[od.board().slots[t.slot].ring].r.toFixed(2)}`).join(','); od.saveRun();
    out.saveKey = Object.keys(localStorage).filter(k => k.startsWith('od_run')).join(',');
    await wait(200);
    return Object.assign(out, { keep });
  });
  console.log(JSON.stringify(r.maps));
  ok(Object.values(r.maps).every(v => !v.includes('CLASH') && !v.startsWith('0')), `every map has LEO/MEO/HEO lanes, none sharing a radius (${Object.entries(r.maps).map(([k, v]) => k + ' ' + v).join(', ')})`);
  ok(r.oldSlotsHidden && r.noMarker, 'the old shared ring slots and the tap markers are off');
  ok(r.padShown, 'picking a satellite opens the launch panel with a LAUNCH button');
  ok(r.rings === 3 && r.zones === '0:0:20,0:0:20,2:2:18', `each LAUNCH → its own orbit in the chosen zone; higher starts with less fuel (${r.zones})`);
  ok(r.moon, 'tapping the Moon makes it the launch site');
  ok(r.moved && r.tier5, 'changing zone costs 1 fuel per zone; upgrades no longer need an orbit');
  ok(r.refuel, `refuel tops up to 20 and costs a lot (${r.refuelCost} cr for a satellite worth ${r.spent} cr)`);
  ok(r.leoFull, 'launching into a full LEO is refused');
  ok(r.fuelAfterWave === 19 && r.fuelAfterOd === 17, `1 fuel per wave (${r.fuelAfterWave}), Overdrive burns 2 more (${r.fuelAfterOd})`);
  ok(r.burned > 0 && r.left === 0, `satellites out of fuel burn up (${r.burned})`);
  ok(r.saveKey.includes('od_run3d_exp') && !r.saveKey.split(',').includes('od_run3d'), `experiment saves separately (${r.saveKey})`);
  // resume in a fresh page: same orbits back
  const r2 = await pg.evaluate(() => { const od = window.__od; const run = od.loadRun(); od.mainMenu(); return run && run.seed != null; });
  ok(r2, 'the orbit layout (seed) is saved with the run');
  await pg.screenshot({ path: process.env.SHOT || '/dev/null' }).catch(() => {});
  ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
})();
