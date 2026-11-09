// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); 
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
  await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
  await pg.evaluate(() => { localStorage.removeItem('od_shake'); localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
  await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
  const label = () => pg.textContent('[data-act="shake"]');
  ok(/On/.test(await label()), 'shake button on the main menu, default On');
  await pg.click('[data-act="shake"]'); ok(/Low/.test(await label()), 'tap → Low');
  await pg.click('[data-act="shake"]'); ok(/Off/.test(await label()), 'tap → Off');
  await pg.reload(); await pg.waitForFunction(() => window.__od, null, { timeout: 20000 });
  ok(/Off/.test(await label()) && await pg.evaluate(() => window.OD.shake === 0), 'setting is remembered after reload');
  await pg.evaluate(() => window.__od.begin('earth', 'medium')); await pg.waitForTimeout(1000);
  const measure = () => pg.evaluate(() => new Promise(r => { const S = window.__od.state(), v = window.__view3d; requestAnimationFrame(() => { const p0 = v.camera.position.clone(); S.shake = 16; requestAnimationFrame(() => requestAnimationFrame(() => r(v.camera.position.distanceTo(p0)))); }); }));
  const m0 = await measure(); ok(m0 < 0.001, `Off: camera stays still during a big explosion (moved ${m0.toFixed(3)})`);
  await pg.evaluate(() => { window.OD.shake = 1; });
  const m1 = await measure(); ok(m1 > 0.01, `On: camera shakes (moved ${m1.toFixed(2)})`);
  // Graphics setting (3D): Auto → High → Low, applied to the renderer and remembered
  await pg.evaluate(() => window.__od.mainMenu()); await pg.waitForSelector('[data-act="gfx"]');
  ok(/Auto/.test(await pg.textContent('[data-act="gfx"]')), 'graphics setting on the menu, default Auto');
  await pg.click('[data-act="gfx"]');
  ok(/High/.test(await pg.textContent('[data-act="gfx"]')) && await pg.evaluate(() => window.__view3d.quality.level === 99), 'High: full detail, never stepped down');
  await pg.click('[data-act="gfx"]');
  ok(/Low/.test(await pg.textContent('[data-act="gfx"]')) && await pg.evaluate(() => window.__view3d.renderer.getPixelRatio() === 1), 'Low: lighter rendering');
  await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
  ok(await pg.evaluate(() => window.OD.gfx === 'low' && window.__view3d.renderer.getPixelRatio() === 1), 'graphics setting remembered after reload');
  await pg.evaluate(() => { localStorage.removeItem('od_gfx'); });
  ok(errs.length === 0, 'no errors ' + errs.join(' | '));
  await b.close();
})();
