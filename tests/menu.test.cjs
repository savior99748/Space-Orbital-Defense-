// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['desk', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 13']], ['reduced', { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }]]) {
    const ctx = await b.newContext(opts); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/goat|zgo|TUNNEL/.test(m.text()) && errs.push(m.text()));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
    await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
    await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
    await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
    await pg.waitForTimeout(3000);
    const yaw0 = await pg.evaluate(() => window.__view3d.cam.yaw); await pg.waitForTimeout(1500); const yaw1 = await pg.evaluate(() => window.__view3d.cam.yaw);
    if (name === 'reduced') ok(yaw0 === yaw1, `${name}: reduced motion keeps the menu camera still`);
    else ok(yaw1 !== yaw0, `${name}: menu camera orbits`);
    await pg.screenshot({ path: `shots/menuvo-${name}.png` });
    // the menu still works: pick Mars (an Intermediate map), start, confirm the game began on those settings with no menu extras left
    await pg.click('[data-map="mars"]'); await pg.click('[data-act="start"]');
    await pg.waitForFunction(() => window.__od.state(), null, { timeout: 10000 });
    const st = await pg.evaluate(() => { const S = window.__od.state(); let vis = 0; window.__view3d.scene.traverse(o => { if (o.isGroup && o.children.length > 8 && o.visible && o.parent === window.__view3d.scene && !o.getObjectByName('turret') && o.children.some(c => c.getObjectByName && c.getObjectByName('turret'))) vis++; }); return { map: S.mapKey, diff: S.diffKey, towers: S.towers.length, menuSats: vis }; });
    ok(st.map === 'mars' && st.diff === 'medium' && st.towers === 0, `${name}: menu buttons work (started ${st.map} / ${st.diff})`);
    ok(st.menuSats === 0, `${name}: menu backdrop hidden once the game starts`);
    ok(errs.length === 0, `${name}: no errors ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
