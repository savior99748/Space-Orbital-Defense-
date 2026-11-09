// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext(devices['iPhone 13']); const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
  await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
  await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
  await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
  await pg.evaluate(() => window.__od.begin('saturn', 'hard'));
  const check = async (label) => {
    const r = await pg.evaluate(() => { const h = document.getElementById('hud').getBoundingClientRect(), s = document.getElementById('shop').getBoundingClientRect(); return { hudTop: h.top, shopBottom: s.bottom, vh: innerHeight, vw: innerWidth }; });
    ok(r.hudTop >= 0 && Math.abs(r.shopBottom - r.vh) < 2, `${label}: top bar visible (top ${r.hudTop}) and build bar at the bottom (${r.shopBottom}/${r.vh}), ${r.vw}x${r.vh}`);
  };
  await check('portrait');
  await pg.setViewportSize({ width: 844, height: 390 });
  await pg.evaluate(() => { window.scrollTo(0, 200); document.documentElement.scrollTop = 200; window.dispatchEvent(new Event('orientationchange')); });
  await pg.waitForTimeout(500); await check('landscape');
  await pg.evaluate(() => { window.scrollTo(0, 200); document.documentElement.scrollTop = 200; });
  await pg.setViewportSize({ width: 390, height: 664 });
  await pg.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await pg.waitForTimeout(1000); await check('back to portrait');
  await pg.screenshot({ path: 'shots/rotate-back.png' });
  ok(errs.length === 0, 'no errors ' + errs.join(' | '));
  await b.close();
})();
