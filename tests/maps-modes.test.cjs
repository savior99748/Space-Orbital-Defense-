// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
// Phase 8 sweep: every map in 3D and 2D, campaign + endless, pause/restart/game-over, saves, 2D/3D switch.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const MAPS = ['mercury','venus','earth','mars','jupiter','saturn','uranus','neptune','sol'];
  for (const view of ['3d', '2d']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/goat|zgo|TUNNEL/.test(m.text()) && errs.push(m.text()));
    const missing = []; pg.on('response', r => { if (r.status() >= 400 && r.url().includes('127.0.0.1')) missing.push(r.url()); });
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_orbits', 'classic'); } catch {} }); // skip the brand-new-player tutorial
    await pg.goto(`http://127.0.0.1:8769/index.html?view=${view}`);
    await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
    await pg.reload(); await pg.waitForFunction(v => window.__od && (v === '2d' || window.__view3d), view, { timeout: 20000 });
    for (const m of MAPS) {
      const r = await pg.evaluate(async m => {
        const od = window.__od; od.begin(m, 'medium'); const S = od.state(); S.money = 1e6;
        const T = ['laser','missile','rail','emp','tractor','carrier','miner']; let k = 0;
        for (let i = 0; i < od.board().slots.length && k < 7; i += 3, k++) od.placeTower(i, T[k]);
        od.startWave();
        const t0 = performance.now(); while (performance.now() - t0 < 2500) await new Promise(r => requestAnimationFrame(r));
        return { towers: S.towers.length, wave: S.wave, enemies: S.enemies.length + S.queue.length, lives: S.lives };
      }, m);
      ok(r.towers === 7 && r.wave === 1 && r.enemies > 0, `${view} ${m}: 7 satellites built, wave 1 running (${r.enemies} invaders)`);
    }
    // endless + milestone hook, pause, save/continue, game over, restart
    const flow = await pg.evaluate(async () => {
      const od = window.__od, out = {};
      od.begin('earth', 'hard', false, true); let S = od.state(); out.endless = !!S.endless;
      od.placeTower(0, 'laser'); S.wave = 3; od.saveRun(); const saved = od.loadRun(); out.saved = saved && saved.endless && saved.wave === 3 && saved.towers.length === 1;
      document.getElementById('menuBtn').click(); out.paused = od.state().paused;
      document.querySelector('[data-act="resume"]').click(); out.resumed = !od.state().paused;
      S = od.state(); S.towers.length = 0; S.lives = 1; S.wave = 5; od.startWave();
      const C = od.center(); // pull each invader onto the planet as it spawns, so the planet falls
      const t0 = performance.now(); while (!od.state().over && performance.now() - t0 < 15000) { S.enemies.forEach(e => { e.x = C.x + 1; e.y = C.y; e.z = 0; e.r = 1; }); await new Promise(r => requestAnimationFrame(r)); }
      out.over = od.state().over;
      const retry = document.querySelector('[data-act="retry"]'); out.retryBtn = !!retry; if (retry) retry.click();
      await new Promise(r => setTimeout(r, 600));
      out.restarted = od.state() && !od.state().over && od.state().wave === 0;
      return out;
    });
    ok(flow.endless && flow.saved, `${view}: endless run saves and loads (wave, towers)`);
    ok(flow.paused && flow.resumed, `${view}: pause and resume`);
    ok(flow.over && flow.retryBtn && flow.restarted, `${view}: game over, then Try Again restarts`);
    ok(missing.length === 0, `${view}: no missing files ${missing.join(' ')}`);
    ok(errs.length === 0, `${view}: no console errors ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
