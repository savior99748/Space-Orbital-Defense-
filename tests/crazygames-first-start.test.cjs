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
    await pg.click('[data-act="start"]', { timeout: 30000 });
    await pg.click(`[data-act="${choice}"]`, { timeout: 10000 });
    await pg.waitForTimeout(800);
    const cg = await pg.evaluate(() => __cg);
    ok(cg.includes('gameplayStart') && cg.lastIndexOf('gameplayStart') > cg.indexOf('loadingStop'), `brand-new player, ${choice === 'tutorial' ? 'Play tutorial' : 'Skip'}: Gameplay Start sent (${cg.join(' → ')})`);
    await ctx.close();
  }
  await b.close();
})();
