// Part of the automated test suite. Run all with: npm test   (or one: npm test -- newsats)
// Flak Array, Mine Layer, Focus Array and the ground Missile Silo (LEO only).
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
      const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms)), until = async (f, ms = 15000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await wait(50); return f(); };
      od.begin('earth', 'medium'); const S = od.state(), B = od.board(); S.money = 1e7; S.lives = 1e6;
      const orbit = B.slots.filter(s => !s.surface).map(s => s.id), pads = B.slots.filter(s => s.surface);
      const out = { pads: pads.length, padBodies: pads.map(s => B.rings[s.ring].body).join(',') };
      // placement rules
      od.placeTower(pads[0].id, 'laser'); out.laserOnPad = !!od.towerAt(pads[0].id);
      od.placeTower(orbit[0], 'silo'); out.siloInOrbit = !!od.towerAt(orbit[0]);
      // Focus Array boosts a neighbour's damage
      od.placeTower(orbit[0], 'laser'); od.placeTower(orbit[1], 'focus');
      const laser = od.towerAt(orbit[0]); await until(() => laser.st && laser.focusMul > 1);
      out.focusMul = laser.focusMul; out.laserDmg = laser.st.dmg; out.laserBase = OD.TOWERS.laser.tiers[0].dmg;
      // a stationary, unkillable invader we can move around
      S.wave = 4; od.startWave(); await until(() => S.enemies.length > 0); S.queue = [];
      const dummy = S.enemies[0]; S.enemies = [dummy];
      dummy.def = Object.assign({}, dummy.def, { speed: 0, reward: 0 }); dummy.hp = dummy.maxHp = 1e12; dummy.shield = dummy.maxShield = 0;
      S.towers = S.towers.filter(t => t.type === 'silo'); // silo alone
      od.placeTower(pads[0].id, 'silo'); const silo = od.towerAt(pads[0].id);
      const root = B.bodies[0];
      const place = r => { dummy.x = root.x + r; dummy.y = root.y; dummy.z = 0; };
      place(root.leo * 1.6); await wait(1500); out.siloOutside = S.shots.length; out.siloDmgOutside = Math.round(silo.dmg || 0);
      place(root.leo * 0.85); S.speed = 4;
      // it fires (a missile in the air, or damage already dealt); on a slow machine a homing missile can overshoot a target that never moves
      let fired = 0; await until(() => (fired += S.shots.filter(m => m.tower === silo).length) > 0 || (silo.dmg || 0) > 0, 25000); S.speed = 1;
      out.siloDmgInside = Math.round(silo.dmg || 0); out.siloFiredInside = fired > 0 || out.siloDmgInside > 0; out.leo = Math.round(root.leo);
      // Flak: a burst hits several invaders at once
      S.towers = []; S.shots = [];
      od.placeTower(orbit[3], 'flak'); const flak = od.towerAt(orbit[3]); await until(() => flak.st);
      const clones = [0, 1, 2].map(i => Object.assign({}, dummy, { id: 990000 + i, hp: 1e12, maxHp: 1e12, x: flak.x + 20 + i * 6, y: flak.y + 10, z: flak.z || 0 }));
      S.enemies = clones; S.towers[0].targeting = 'close';
      await until(() => clones.every(e => e.hp < 1e12), 8000);
      out.flakHitAll = clones.every(e => e.hp < 1e12);
      // Mine Layer lays mines during a wave
      od.begin('earth', 'medium'); const S2 = od.state(); S2.money = 1e6; S2.lives = 1e6; S2.wave = 4; od.startWave(); // a fresh game
      od.placeTower(orbit[5], 'mines'); await until(() => S2.mines.length >= 2, 20000); out.mines = S2.mines.length;
      return out;
    });
    ok(r.pads === 4 && r.padBodies === '0,0,0,1', `${view}: Earth has 3 ground pads on the planet and 1 on the Moon (${r.padBodies})`);
    ok(!r.laserOnPad && !r.siloInOrbit, `${view}: satellites can't go on ground pads, silos can't go in orbit`);
    ok(r.focusMul > 1 && Math.abs(r.laserDmg - r.laserBase * r.focusMul) < 0.01, `${view}: Focus Array boosts a nearby laser (${r.laserBase} → ${r.laserDmg.toFixed(1)} damage)`);
    ok(r.siloDmgOutside === 0, `${view}: Missile Silo ignores invaders outside low orbit (LEO ${r.leo})`);
    ok(r.siloFiredInside, `${view}: Missile Silo fires at invaders inside low orbit (${r.siloDmgInside} damage so far)`);
    ok(r.flakHitAll, `${view}: one flak burst hits several invaders`);
    ok(r.mines >= 2, `${view}: Mine Layer lays mines during a wave (${r.mines})`);
    ok(errs.length === 0, `${view}: no page errors ${errs.slice(0, 3).join(' | ')}`);
  }
  await b.close();
})();
