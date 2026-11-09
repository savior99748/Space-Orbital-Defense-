// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  // ---------- A-C: web build with simulated ads ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
    await pg.goto('file://' + ROOT + '/dist/itch/index.html?view=2d&adtest=1');
    await pg.waitForSelector('[data-act="start"]');
    await pg.click('[data-map="earth"]'); await pg.evaluate(() => localStorage.setItem('od_tut_done','1')); await pg.click('[data-act="start"]');
    await pg.evaluate(() => { const od = window.__od; od.placeTower(0, 'laser'); od.placeTower(3, 'laser'); od.placeTower(9, 'missile'); od.state().speed = 10; od.startWave(); });
    await pg.waitForFunction(() => !window.__od.state().waveActive, null, { timeout: 60000 });
    ok(await pg.isVisible('#adBtn'), 'rewarded-ad button appears between waves');
    const m0 = await pg.evaluate(() => window.__od.state().money);
    await pg.click('#adBtn');
    ok(await pg.isVisible('.fake-ad'), 'test ad shows');
    await pg.waitForTimeout(2400);
    const m1 = await pg.evaluate(() => window.__od.state().money);
    ok(m1 > m0, `credits granted after ad (${m0} → ${m1})`);
    ok(!(await pg.isVisible('#adBtn')), 'ad button hidden after use this wave');
    const saved = await pg.evaluate(() => window.__od.loadRun());
    ok(saved && saved.wave === 1 && saved.towers.length === 3 && saved.money === m1, 'run saved after wave clear + ad');
    // Resume after reload
    await pg.reload(); await pg.waitForSelector('[data-act="continue"]');
    ok(true, 'Continue button shown after reload: ' + (await pg.textContent('[data-act="continue"]')).trim());
    await pg.click('[data-act="continue"]');
    const st = await pg.evaluate(() => { const S = window.__od.state(); return { w: S.wave, n: S.towers.length, m: S.money, map: S.mapKey }; });
    ok(st.w === 1 && st.n === 3 && st.m === m1 && st.map === 'earth', 'resumed run matches: ' + JSON.stringify(st));
    // Revive
    await pg.evaluate(() => { const S = window.__od.state(); S.lives = 0; });
    await pg.waitForSelector('[data-act="revive"]');
    await pg.click('[data-act="revive"]'); await pg.waitForTimeout(2400);
    const rv = await pg.evaluate(() => { const S = window.__od.state(); return { over: S.over, lives: S.lives }; });
    ok(!rv.over && rv.lives === 5, 'revive after ad: ' + JSON.stringify(rv));
    // Game over again: no revive second time, midgame ad on retry
    await pg.evaluate(() => { window.__od.state().lives = 0; });
    await pg.waitForSelector('[data-act="retry"]');
    ok(!(await pg.isVisible('[data-act="revive"]')), 'only one revive per game');
    await pg.click('[data-act="retry"]');
    ok(await pg.isVisible('.fake-ad'), 'midgame ad before retry');
    await pg.waitForTimeout(2400);
    ok(await pg.evaluate(() => window.__od.state().wave === 0 && !window.__od.state().over), 'new game started after midgame ad');
    const ach = await pg.evaluate(() => Object.keys(window.__od.getAch()));
    ok(ach.includes('first_wave'), 'achievement unlocked: ' + ach.join(','));
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  // ---------- D: CrazyGames build with a mock SDK ----------
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
    await ctx.route('https://sdk.crazygames.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: `
      window.__cg = [];
      const store = {};
      window.CrazyGames = { SDK: {
        init: async () => window.__cg.push('init'),
        game: { loadingStart: () => __cg.push('loadingStart'), loadingStop: () => __cg.push('loadingStop'),
                gameplayStart: () => __cg.push('gameplayStart'), gameplayStop: () => __cg.push('gameplayStop'), happytime: () => __cg.push('happytime') },
        ad: { requestAd: (type, cb) => { __cg.push('ad:' + type); cb.adStarted(); setTimeout(cb.adFinished, 300); } },
        data: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; __cg.push('set:' + k); }, removeItem: k => delete store[k] },
      } };` }));
    const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
    await pg.goto('file://' + ROOT + '/dist/crazygames/index.html?view=2d');
    await pg.waitForSelector('[data-act="start"]');
    await pg.evaluate(() => localStorage.setItem('od_tut_done','1')); await pg.click('[data-act="start"]');
    await pg.evaluate(() => { const od = window.__od; od.placeTower(0, 'laser'); od.placeTower(3, 'laser'); od.state().speed = 10; od.startWave(); });
    await pg.waitForFunction(() => !window.__od.state().waveActive, null, { timeout: 60000 });
    await pg.click('#adBtn'); await pg.waitForTimeout(600);
    const log = await pg.evaluate(() => window.__cg);
    const has = x => log.includes(x);
    ok(has('init') && has('loadingStop'), 'SDK init + loadingStop');
    ok(has('gameplayStart'), 'gameplayStart sent');
    ok(has('ad:rewarded'), 'rewarded ad requested through SDK');
    ok(log.some(x => x === 'set:od_run'), 'saves go to CrazyGames cloud data');
    ok(await pg.evaluate(() => OD.platform.name) === 'crazygames', 'platform detected as crazygames');
    ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
    await ctx.close();
  }
  // ---------- E: PWA offline ----------
  {
    const ctx = await b.newContext();
    const pg = await ctx.newPage();
    await pg.goto('http://127.0.0.1:8765/index.html?view=2d');
    await pg.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 10000 }).catch(() => {});
    await pg.evaluate(() => navigator.serviceWorker.ready);
    await pg.reload(); await pg.waitForTimeout(500);
    const man = await pg.evaluate(() => fetch('manifest.webmanifest').then(r => r.json()).then(j => j.name));
    ok(man === 'Ringwarden: Orbital Defense', 'manifest served');
    await ctx.setOffline(true);
    await pg.reload();
    await pg.waitForFunction(() => window.__od && (window.__od.tut() || document.querySelector('[data-act="start"]')), null, { timeout: 8000 }).then(() => ok(true, 'game loads offline from cache')).catch(() => ok(false, 'offline load'));
    await ctx.close();
  }
  await b.close();
})();
