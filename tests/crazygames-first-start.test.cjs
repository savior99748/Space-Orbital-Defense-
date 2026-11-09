// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const MOCK = `window.__cg=[];window.CrazyGames={SDK:{init:async()=>{},game:{loadingStart(){__cg.push('loadingStart')},loadingStop(){__cg.push('loadingStop')},gameplayStart(){__cg.push('gameplayStart')},gameplayStop(){__cg.push('gameplayStop')},happytime(){}},data:{_s:{},getItem(k){return this._s[k]??null},setItem(k,v){this._s[k]=String(v)},removeItem(){}},ad:{requestAd(t,cb){cb.adError&&cb.adError()}}}};`;
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const choice of ['tutorial', 'skiptut']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.includes('sdk.crazygames.com')) return r.fulfill({ contentType: 'text/javascript', body: MOCK }); if (!u.startsWith('http://127.0.0.1')) return r.abort(); r.continue(); });
    const pg = await ctx.newPage();
    await pg.goto('http://127.0.0.1:8775/index.html');
    // brand-new player: no menu, the guided first game starts by itself
    await pg.waitForSelector('#coach:not(.hidden)', { timeout: 30000 });
    if (choice === 'skiptut') await pg.click('[data-tut="skip"]');
    else await pg.click('#coachNext');
    await pg.waitForTimeout(800);
    const cg = await pg.evaluate(() => __cg);
    ok(await pg.evaluate(() => !!window.__od.state() && !document.body.classList.contains('in-menu')), `brand-new player, tutorial ${choice === 'tutorial' ? 'played' : 'skipped'}: still in the game, not the menu`);
    ok(cg.includes('gameplayStart') && cg.lastIndexOf('gameplayStart') > cg.indexOf('loadingStop'), `brand-new player, tutorial ${choice === 'tutorial' ? 'played' : 'skipped'}: Gameplay Start sent (${cg.join(' → ')})`);
    await ctx.close();
  }
  await b.close();
})();
