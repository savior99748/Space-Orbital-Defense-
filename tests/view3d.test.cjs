// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const BASE = 'http://127.0.0.1:8769/';
(async () => {
  const b = await chromium.launch({ args: GL });
  const ign = t => /gc\.zgo|ERR_TUNNEL|goatcounter/.test(t);
  // ---------- default view is 3D; menu switch works; records are per view ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (m.type() === 'error' && !ign(m.text())) errs.push(m.text()); });
    await pg.goto(BASE + 'index.html');
    await pg.evaluate(() => { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); });
    await pg.reload(); await pg.waitForSelector('[data-view="3d"]');
    await pg.waitForFunction(() => window.__view3d, null, { timeout: 15000 });
    ok(await pg.evaluate(() => OD.is3D && !!document.getElementById('game3d')), 'default view is 3D with the 3D canvas');
    ok(await pg.evaluate(() => OD.MAPS.earth.rings[2].name === 'HEO' && OD.MAPS.earth.threeD), '3D map layouts applied');
    await pg.screenshot({ path: 'v3-menu.png' });
    // record a 3D leaderboard entry, then switch to 2D
    await pg.evaluate(() => { window.__od.LB.submit('earth', 'medium', { wave: 33, score: 999 }); });
    await Promise.all([pg.waitForNavigation(), pg.click('[data-view="2d"]')]);
    await pg.waitForSelector('[data-view="2d"].selected');
    ok(await pg.evaluate(() => !OD.is3D && !document.getElementById('game3d') && OD.MAPS.earth.rings.length === 2), 'Classic 2D: v2 maps, no 3D canvas');
    ok(await pg.evaluate(() => window.__od.LB.top('earth', 'medium').length === 0), 'Classic 2D has its own leaderboard');
    await pg.screenshot({ path: 'v3-menu-2d.png' });
    await Promise.all([pg.waitForNavigation(), pg.click('[data-view="3d"]')]);
    await pg.waitForFunction(() => window.__view3d, null, { timeout: 15000 });
    ok(await pg.evaluate(() => OD.is3D && window.__od.LB.top('earth', 'medium')[0].wave === 33), 'back in 3D, the 3D leaderboard is intact');
    // ---------- tour all maps in 3D ----------
    for (const map of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'sol']) {
      await pg.evaluate(m => { const od = window.__od; od.begin(m, 'medium');
        const S = od.state(), B = od.board(); S.money = 1e6;
        const types = ['laser', 'missile', 'rail', 'emp', 'tractor', 'carrier', 'miner'];
        B.slots.forEach((s, i) => { if (i % 2) return; od.placeTower(s.id, types[i % 7]); const t = od.towerAt(s.id); while (t.level < (i % 5)) od.upgradeTower(t, i % 4 < 2 ? 'A' : 'B'); });
        S.wave = 11; S.lives = 999; od.startWave(); S.speed = 2; }, map);
      await pg.waitForTimeout(3500);
      await pg.screenshot({ path: `v3-map-${map}.png` });
      const info = await pg.evaluate(() => { const S = window.__od.state(); return { killed: S.stats.killed, enemiesZ: S.enemies.some(e => Math.abs(e.z) > 5), towersZ: S.towers.some(t => Math.abs(t.z) > 5) }; });
      ok(info.towersZ && info.enemiesZ, `${map}: tilted orbits + invaders at height (kills so far ${info.killed})`);
    }
    ok(errs.length === 0, 'desktop 3D: no errors ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------- 3D tutorial on a phone with real taps ----------
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    await pg.goto(BASE + 'index.html');
    await pg.evaluate(() => { localStorage.clear(); localStorage.setItem('od_stats_off', '1'); });
    await pg.reload(); await pg.waitForSelector('[data-act="start"]');
    await pg.waitForFunction(() => window.__view3d, null, { timeout: 15000 });
    // the tutorial advances on the next rendered frame; on a slow software renderer that can take a moment
    const step = async (want) => { if (want != null) await pg.waitForFunction(w => window.__od.tut() && window.__od.tut().i === w, want, { timeout: 4000 }).catch(() => {}); else await pg.waitForTimeout(200); return pg.evaluate(() => window.__od.tut() ? window.__od.tut().i : null); };
    const tapWorld = async p => {
      const s = await pg.evaluate(p => window.__view3d.project(p.x, p.y, p.z || 0), p);
      const box = await pg.locator('#game3d').boundingBox();
      await pg.touchscreen.tap(box.x + s.x, box.y + s.y);
    };
    await pg.tap('[data-act="start"]');
    await pg.tap('.card [data-act="tutorial"]');
    await pg.waitForFunction(() => window.__view3d && window.__od.tut(), null, { timeout: 15000 });
    ok(await step(0) === 0, '3D tutorial starts');
    await pg.tap('#coachNext');
    await pg.tap('[data-type="laser"]');
    ok(await step(2) === 2, 'tutorial: select laser');
    ok(await pg.isVisible('#coachArrow'), 'arrow shows over the 3D slot');
    await pg.screenshot({ path: 'v3-tut-slot.png' });
    // tap exactly where the arrow points (the suggested slot)
    let tgt = await pg.evaluate(() => { const od = window.__od, B = od.board(); const sl = B.slots.find(x => x.ring === 0 && !od.towerAt(x.id)); return od.slotPos(sl.id); });
    await tapWorld(tgt);
    ok(await pg.evaluate(() => window.__od.state().towers.length === 1), 'tutorial: built first satellite with a 3D tap');
    ok(await step(3) === 3, 'tutorial: second satellite step');
    tgt = await pg.evaluate(() => { const od = window.__od, B = od.board(), S = od.state(), f = S.towers[0]; let best, bd = -1; for (const sl of B.slots) { if (sl.ring || od.towerAt(sl.id)) continue; const p = od.slotPos(sl.id); const d = (p.x - f.x) ** 2 + (p.y - f.y) ** 2 + ((p.z || 0) - (f.z || 0)) ** 2; if (d > bd) { bd = d; best = p; } } return best; });
    if (!(await pg.evaluate(() => window.__od.state().selectedType === 'laser'))) await pg.tap('[data-type="laser"]');
    await tapWorld(tgt);
    ok(await step(4) === 4, 'tutorial: launch wave step');
    await pg.tap('#waveBtn');
    await pg.evaluate(() => { window.__od.state().speed = 8; });
    await pg.waitForFunction(() => window.__od.tut() && window.__od.tut().i === 6, null, { timeout: 120000 });
    await pg.evaluate(() => { window.__od.state().speed = 1; });
    const t0 = await pg.evaluate(() => { const t = window.__od.state().towers[0]; return { x: t.x, y: t.y, z: t.z }; });
    await tapWorld(t0);
    ok(await step(7) === 7, 'tutorial: tap satellite opens upgrades (3D)');
    await pg.tap('#info [data-up]');
    for (let i = 0; i < 3; i++) await pg.tap('#coachNext');
    ok(await step(11) === 11, 'tutorial: final step');
    ok((await pg.textContent('#coachText')).length > 10, 'tutorial text present');
    await pg.screenshot({ path: 'v3-phone-tut.png' });
    await pg.tap('#coachNext');
    ok(await pg.evaluate(() => window.__od.tut() === null), 'tutorial completed in 3D');
    ok(errs.length === 0, 'phone 3D: no errors ' + errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
  // ---------- opened as a local file: 3D can't load modules → falls back to Classic 2D ----------
  {
    const ctx = await b.newContext();
    const pg = await ctx.newPage();
    await pg.goto('file://' + ROOT + '/index.html');
    await pg.waitForFunction(() => window.OD && OD.view === '2d', null, { timeout: 15000 }).then(() => ok(true, 'file:// falls back to Classic 2D')).catch(() => ok(false, 'file:// fallback'));
    await ctx.close();
  }
  await b.close();
})();
