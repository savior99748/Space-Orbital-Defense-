// Part of the automated test suite. Run all with: npm test   (or one: npm test -- solar)
// Solar System map: every planet has HP, invaders pick the Sun or a planet, fallen planets take their satellites offline.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const view of ['3d', '2d']) {
    const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); } catch {} });
    await pg.goto(`http://127.0.0.1:8769/index.html?view=${view}`);
    await pg.waitForFunction(() => window.__od && (window.OD.view === '2d' || window.__view3d), null, { timeout: 30000 });
    const r = await pg.evaluate(async () => {
      const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms));
      od.begin('sol', 'hard'); const S = od.state(), B = od.board(); S.money = 1e7; S.lives = 1e6;
      const out = { hp: S.bodyHp.slice() };
      // targets: spawn a big wave and count where invaders are headed
      S.wave = 20; od.startWave(); S.speed = 8;
      const seen = new Map(); const t0 = Date.now();
      while (Date.now() - t0 < 40000 && seen.size < 30) { for (const e of S.enemies) seen.set(e, e.tb || 0); S.lives = 1e6; await wait(100); } // slow headless frames: sample enough spawns
      const tbs = [...seen.values()]; out.toSun = tbs.filter(x => x === 0).length; out.toPlanets = tbs.filter(x => x > 0).length; out.distinct = new Set(tbs.filter(x => x > 0)).size;
      // knock Earth out: its satellites go offline, nothing new can be built there, invaders retarget
      const earth = B.bodies.findIndex(x => x.name === 'Earth');
      const earthSlot = B.slots.find(s => !s.surface && B.rings[s.ring].body === earth).id, marsSlot = B.slots.find(s => !s.surface && B.rings[s.ring].body !== earth && B.rings[s.ring].body !== 0).id;
      od.placeTower(earthSlot, 'laser'); od.placeTower(marsSlot, 'laser');
      od.knockOut(earth); await wait(300);
      out.earthOffline = od.towerAt(earthSlot).offline === true; out.marsOnline = !od.towerAt(marsSlot).offline;
      const other = B.slots.find(s => !s.surface && B.rings[s.ring].body === earth && !od.towerAt(s.id)).id;
      od.placeTower(other, 'laser'); out.builtOnFallen = !!od.towerAt(other);
      out.headingToEarth = S.enemies.filter(e => e.tb === earth).length;
      // saved and resumed
      S.waveActive = false; S.over = false; od.saveRun(); const saved = od.loadRun();
      out.savedHp = saved.bodyHp && saved.bodyHp[earth];
      return out;
    });
    ok(r.hp.length === 9 && r.hp.slice(1).every(h => h === 15) && r.hp[0] === 0, `${view}: 8 planets with 15 HP each (the Sun uses the main HP)`);
    ok(r.toSun > 0 && r.toPlanets > 0 && r.distinct >= 3, `${view}: invaders split between the Sun (${r.toSun}) and planets (${r.toPlanets}, ${r.distinct} different planets)`);
    ok(r.earthOffline && r.marsOnline, `${view}: a fallen planet's satellites go offline; others keep fighting`);
    ok(!r.builtOnFallen, `${view}: nothing can be built on a fallen planet`);
    ok(r.headingToEarth === 0, `${view}: invaders headed for a fallen planet turn toward the Sun`);
    ok(r.savedHp === 0, `${view}: planet HP is saved with the run`);
    ok(errs.length === 0, `${view}: no page errors ${errs.slice(0, 3).join(' | ')}`);
  }
  await b.close();
})();
