// Part of the automated test suite. Run all with: npm test   (or one: npm test -- monetization)
// The shared money system (js/monetization.js): rewarded bonuses, premium (ad-free) claims, no double pays.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const prep = async (pg, url) => {
  await pg.goto(url);
  await pg.waitForFunction(() => window.__od && window.OD.monetization, null, { timeout: 30000 });
  await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'medium'); const S = od.state(); S.wave = 3; S.waveActive = false; S.money = 100; });
  await pg.waitForTimeout(300);
};
const money = pg => pg.evaluate(() => window.__od.state().money);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); } catch {} });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));

  // 1. plain web: no ads, no bonus
  await prep(pg, 'http://127.0.0.1:8769/index.html?view=2d');
  ok(await pg.evaluate(() => OD.monetization.offer('credits').method === 'none'), 'web: no bonus offered');
  ok(await pg.evaluate(() => document.getElementById('adBtn').classList.contains('hidden')), 'web: bonus button hidden');

  // 2. rewarded ad flow (simulated ads): grants once per wave, a double tap pays once
  await prep(pg, 'http://127.0.0.1:8769/index.html?view=2d&adtest=1');
  ok(await pg.evaluate(() => OD.monetization.offer('credits').method === 'ad'), 'ads: bonus offered as an ad');
  ok(await pg.evaluate(() => !document.getElementById('adBtn').classList.contains('hidden') && document.getElementById('adBtn').textContent.startsWith('📺')), 'ads: 📺 bonus button shown');
  const m0 = await money(pg);
  await pg.evaluate(() => { const btn = document.getElementById('adBtn'); btn.disabled = false; btn.click(); btn.disabled = false; btn.click(); }); // double tap
  // the simulated ad lasts 2 s: wait for the payout (slow CI machines), then a little longer to catch any second payout
  await pg.waitForFunction(m0 => window.__od.state().money > m0, m0, { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  const m1 = await money(pg);
  ok(m1 > m0 && m1 - m0 === await pg.evaluate(() => Math.round((60 + 3 * 12) * window.__od.state().diff.reward * OD.ECON)), `ads: double tap pays exactly one bonus (+${m1 - m0})`);
  const again = await pg.evaluate(() => OD.monetization.claim('credits', { done: () => window.__od.state().adWave === window.__od.state().wave, mark() {} }));
  ok(again === false && await money(pg) === m1, 'ads: a second claim in the same wave pays nothing');
  // a run that already used its bonus this wave, saved and reloaded, still can't claim again
  ok(await pg.evaluate(() => { const od = window.__od; od.saveRun(); const r = od.loadRun(); return r.adWave === r.wave; }), 'ads: the grant record is saved with the run');

  // 3. premium (ad-free): same bonus, same limits, no ad
  await prep(pg, 'http://127.0.0.1:8769/index.html?view=2d&adtest=1');
  await pg.evaluate(() => { OD.platform.premium = { owned: () => true }; });
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => OD.monetization.offer('credits').method === 'premium' && OD.monetization.isPremium()), 'premium: bonus offered without an ad');
  // the top bar redraws on the next frame once premium is on (can take a moment on a slow machine)
  await pg.waitForFunction(() => document.getElementById('adBtn').textContent.startsWith('🎁'), null, { timeout: 8000 }).catch(() => {});
  ok(await pg.evaluate(() => document.getElementById('adBtn').textContent.startsWith('🎁')), 'premium: 🎁 claim button instead of 📺');
  const p0 = await money(pg);
  await pg.evaluate(() => document.getElementById('adBtn').click());
  await pg.waitForTimeout(300);
  ok(await pg.$('.fake-ad') === null, 'premium: no ad shown');
  const p1 = await money(pg);
  ok(p1 > p0, `premium: bonus credits granted (+${p1 - p0})`);
  await pg.evaluate(() => document.getElementById('adBtn').click()); await pg.waitForTimeout(300);
  ok(await money(pg) === p1, 'premium: still once per wave');
  ok(await pg.evaluate(async () => { const t = performance.now(); await OD.monetization.breakAd(); return performance.now() - t < 200; }) && await pg.$('.fake-ad') === null, 'premium: no ad between games');
  // revive: offered free, once per run
  const rv = await pg.evaluate(async () => {
    const od = window.__od, S = od.state(), C = od.center(); S.towers.length = 0; S.lives = 1; od.startWave();
    const t0 = performance.now(); while (!od.state().over && performance.now() - t0 < 20000) { S.enemies.forEach(e => { e.x = C.x + 1; e.y = C.y; e.z = 0; e.r = 1; }); await new Promise(r => requestAnimationFrame(r)); }
    const btn = document.querySelector('[data-act="revive"]'); const label = btn && btn.textContent; if (btn) btn.click();
    await new Promise(r => setTimeout(r, 400));
    return { label, revived: od.state().revived, over: od.state().over, lives: od.state().lives };
  });
  ok(rv.label && rv.label.includes('Revive') && !rv.label.includes('ad'), `premium: free revive offered ("${rv.label}")`);
  ok(rv.revived && !rv.over && rv.lives === 5, 'premium: revive works, planet back to 5 HP');
  ok(await pg.evaluate(async () => await OD.monetization.claim('revive', { done: () => window.__od.state().revived, mark() {} })) === false, 'premium: revive is once per run');

  // 4. the Steam (desktop) build: premium by default, no ad code shipped
  await prep(pg, 'http://127.0.0.1:8776/index.html?view=2d');
  ok(await pg.evaluate(() => OD.platform.name === 'electron' && OD.monetization.isPremium() && OD.monetization.offer('credits').method === 'premium'), 'steam build: ad-free premium, bonus claimable');
  ok(await pg.evaluate(() => !document.querySelector('script[src*="crazygames"]') && !window.CrazyGames), 'steam build: no CrazyGames code');
  ok(errs.length === 0, 'no errors ' + errs.join(' | '));
  await b.close();
})();
