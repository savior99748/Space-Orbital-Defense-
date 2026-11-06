// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const MOCK = `window.__cg=[];window.CrazyGames={SDK:{init:async()=>{__cg.push('init')},
 game:{loadingStart(){__cg.push('loadingStart')},loadingStop(){__cg.push('loadingStop')},gameplayStart(){__cg.push('gameplayStart')},gameplayStop(){__cg.push('gameplayStop')},happytime(){}},
 data:{_s:{},getItem(k){return this._s[k]??null},setItem(k,v){__cg.push('save');this._s[k]=String(v)},removeItem(k){delete this._s[k]}},
 ad:{requestAd(type,cb){__cg.push('AD:'+type);cb.adFinished&&cb.adFinished()}}}};`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 720 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts);
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.includes('sdk.crazygames.com')) return r.fulfill({ contentType: 'text/javascript', body: MOCK }); if (!u.startsWith('http://127.0.0.1')) return r.abort(); r.continue(); });
    await ctx.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('http://127.0.0.1:8775/index.html');
    await pg.waitForSelector('[data-act="start"]', { timeout: 30000 });
    await pg.click('[data-act="start"]');
    await pg.waitForFunction(() => window.__od.state(), null, { timeout: 15000 });
    await pg.evaluate(() => { const od = window.__od; od.placeTower(0, 'laser'); od.state().wave = 1; });
    await pg.waitForTimeout(500);
    ok(await pg.evaluate(() => document.getElementById('adBtn').classList.contains('hidden')), `${name}: no "watch an ad" button between waves`);
    // lose, check there is no revive-by-ad offer, then leave the end screen (where a midgame ad would play)
    await pg.evaluate(async () => { const od = window.__od, S = od.state(), C = od.center(); S.towers.length = 0; S.lives = 1; od.startWave();
      const t0 = performance.now(); while (!od.state().over && performance.now() - t0 < 20000) { S.enemies.forEach(e => { e.x = C.x + 1; e.y = C.y; e.z = 0; e.r = 1; }); await new Promise(r => requestAnimationFrame(r)); } });
    ok(await pg.evaluate(() => window.__od.state().over), `${name}: game over reached`);
    ok(!(await pg.$('[data-act="revive"]')), `${name}: no "watch ad to revive" button`);
    await pg.click('[data-act="retry"]'); await pg.waitForTimeout(800);
    const cg = await pg.evaluate(() => __cg);
    ok(!cg.some(x => x.startsWith('AD:')), `${name}: no ad ever requested (${cg.filter((x, i, a) => a.indexOf(x) === i).join(', ')})`);
    ok(cg.includes('gameplayStart') && cg.includes('loadingStop') && cg.includes('save'), `${name}: loading, gameplay and save events still sent`);
    ok(await pg.evaluate(() => window.__od.state() && !window.__od.state().over), `${name}: Try Again restarts straight away`);
    ok(errs.length === 0, `${name}: no errors ${errs.join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
