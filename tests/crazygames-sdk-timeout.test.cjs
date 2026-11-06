// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
// The CrazyGames SDK loads but its init() never resolves: the game must still reach its menu.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const HANG = `window.__cg=[];window.CrazyGames={SDK:{init:()=>new Promise(()=>{}),game:{loadingStart(){__cg.push('loadingStart')},loadingStop(){__cg.push('loadingStop')},gameplayStart(){__cg.push('gameplayStart')},gameplayStop(){}},data:{getItem(){throw new Error('not ready')},setItem(){throw new Error('not ready')},removeItem(){}},ad:{requestAd(t,cb){cb.adError&&cb.adError()}}}};`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const port of [8771, 8774]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.includes('sdk.crazygames.com')) return r.fulfill({ contentType: 'text/javascript', body: HANG }); if (!u.startsWith('http://127.0.0.1')) return r.abort(); r.continue(); });
    await ctx.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const t0 = Date.now(); await pg.goto(`http://127.0.0.1:${port}/index.html`);
    const shown = await pg.waitForSelector('[data-act="start"]', { timeout: 20000 }).then(() => true, () => false);
    ok(shown, `${port === 8774 ? 'flat' : 'regular'}: menu appears even though the SDK never answers (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    await pg.click('[data-act="start"]').catch(() => {});
    ok(await pg.waitForFunction(() => window.__od && window.__od.state(), null, { timeout: 10000 }).then(() => true, () => false), 'a game starts and saves fall back to the device');
    ok(errs.length === 0, 'no errors ' + errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();
