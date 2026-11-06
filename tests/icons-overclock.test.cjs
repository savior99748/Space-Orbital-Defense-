// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type()==='error' && !/goat|zgo|TUNNEL/.test(m.text()) && errs.push(m.text()));
    await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
    await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
    await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
    await pg.evaluate(() => window.__od.begin('neptune', 'hard', false, true));
    await pg.waitForTimeout(800);
    const painted = await pg.evaluate(() => [...document.querySelectorAll('#shop canvas')].map(c => c.width));
    ok(painted.length === 7 && painted.every(w => w >= 96), `${name}: 7 shop icons rendered in 3D (${painted.join(',')})`);
    await pg.screenshot({ path: `shots/icons-${name}.png` });
    // endless: max a laser then overclock
    const r = await pg.evaluate(() => {
      const od = window.__od, S = od.state(); S.money = 1e6;
      od.placeTower(0, 'laser'); const t = od.towerAt(0);
      for (let i = 0; i < 4; i++) od.upgradeTower(t, 'B');
      S.selectedTower = t; od.tapSlot && 0;
      return { lvl: t.level };
    });
    ok(r.lvl === 4, `${name}: laser maxed`);
    await pg.evaluate(() => { const od = window.__od, t = od.towerAt(0); od.state().selectedTower = null; od.tapSlot(0); });
    await pg.waitForTimeout(500);
    const hasOc = await pg.evaluate(() => !!document.querySelector('#info [data-oc]'));
    ok(hasOc, `${name}: Overclock card shown on a maxed satellite in Endless`);
    const before = await pg.evaluate(() => window.__od.towerAt(0).st.dps);
    await pg.click('#info [data-oc]'); await pg.click('#info [data-oc]');
    await pg.waitForTimeout(400);
    const after = await pg.evaluate(() => ({ dps: window.__od.towerAt(0).st.dps, oc: window.__od.towerAt(0).oc }));
    ok(after.oc === 2 && Math.abs(after.dps / before - 1.5625) < 0.01, `${name}: overclock x2 → dps ×1.5625 (${before} → ${after.dps})`);
    await pg.screenshot({ path: `shots/oc-${name}.png` });
    ok(errs.length === 0, `${name}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  // campaign: no overclock
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage();
  await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
  await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
  await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
  const camp = await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'medium', false, false); const S = od.state(); S.money = 1e6; od.placeTower(0, 'rail'); const t = od.towerAt(0); for (let i = 0; i < 4; i++) od.upgradeTower(t, 'A'); od.tapSlot(0); return !!document.querySelector('#info [data-oc]'); });
  ok(!camp, 'campaign: no Overclock before winning');
  // save/load keeps overclock
  const kept = await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'medium', false, true); const S = od.state(); S.money = 1e6; od.placeTower(0, 'rail'); const t = od.towerAt(0); for (let i = 0; i < 4; i++) od.upgradeTower(t, 'A'); od.overclockTower(t); od.overclockTower(t); od.overclockTower(t); od.saveRun(); return od.loadRun().towers[0].oc; });
  ok(kept === 3, `save keeps overclock level (${kept})`);
  await b.close();
})();
