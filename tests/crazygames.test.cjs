// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const MOCK = `window.__cg=[];window.CrazyGames={SDK:{init:async()=>{__cg.push('init')},
 game:{loadingStart(){__cg.push('loadingStart')},loadingStop(){__cg.push('loadingStop')},gameplayStart(){__cg.push('gameplayStart')},gameplayStop(){__cg.push('gameplayStop')},happytime(){__cg.push('happytime')}},
 data:{_s:{},getItem(k){return this._s[k]??null},setItem(k,v){__cg.push('save:'+k);this._s[k]=String(v)},removeItem(k){delete this._s[k]}},
 ad:{requestAd(type,cb){__cg.push('ad:'+type);cb.adStarted&&cb.adStarted();setTimeout(()=>cb.adFinished&&cb.adFinished(),50)}}}};`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts);
    const ext = [];
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.includes('sdk.crazygames.com')) return r.fulfill({ contentType: 'text/javascript', body: MOCK }); if (!u.startsWith('http://127.0.0.1:8771')) { ext.push(u); return r.abort(); } r.continue(); });
    const pg = await ctx.newPage(); const errs = [];
    pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && errs.push(m.text()));
    await pg.goto('http://127.0.0.1:8771/index.html');
    await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
    await pg.waitForTimeout(800);
    ok(await pg.evaluate(() => window.OD.is3D), `${name}: 3D view loads from the zip`);
    ok(await pg.evaluate(() => __cg.includes('init') && __cg.includes('loadingStop')), `${name}: SDK init + loadingStop (${await pg.evaluate(() => __cg.join(','))})`);
    ok(await pg.evaluate(() => /v3\.1\.0 · crazygames/.test(document.body.innerText)), `${name}: menu shows v3.1.0 · crazygames`);
    // play
    await pg.evaluate(() => { localStorage.setItem('od_tut_done', '1'); });
    await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'medium'); od.placeTower(0, 'laser'); od.startWave(); });
    await pg.waitForTimeout(3000);
    const st = await pg.evaluate(() => ({ cg: __cg.join(','), enemies: window.__od.state().enemies.length, wave: window.__od.state().wave }));
    ok(st.cg.includes('gameplayStart'), `${name}: gameplayStart sent`);
    ok(st.wave === 1, `${name}: wave 1 running (${st.enemies} invaders on screen)`);
    const icons = await pg.evaluate(() => [...document.querySelectorAll('#shop canvas')].every(c => c.width >= 128));
    ok(icons, `${name}: 3D satellite icons in the shop`);
    ok(ext.filter(u => !/gc\.zgo|goatcounter/.test(u)).length === 0, `${name}: no requests outside the game files (${ext.join(' ')})`);
    ok(!ext.some(u => /gc\.zgo|goatcounter/.test(u)), `${name}: analytics off on CrazyGames`);
    await pg.screenshot({ path: `shots/cg-${name}.png` });
    ok(errs.length === 0, `${name}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
