// Part of the automated test suite. Run all with: npm test   (or one: npm test -- moons)
// Moons pull invaders in but can never trap them: every invader of a few waves reaches the planet in time
// (regression: invaders used to get pinned against Neptune's Triton for good). Runs on a virtual clock.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const view of ['2d', '3d']) {
    const pg = await (await b.newContext({ viewport: { width: 1000, height: 700 } })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.addInitScript(() => { let now = 0; const q = []; performance.now = () => now; window.requestAnimationFrame = cb => { q.push(cb); return 1; }; window.__step = ms => { now += ms; for (const cb of q.splice(0)) cb(now); };
      try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); localStorage.setItem('od_all_maps', '1'); } catch {} });
    await pg.goto(`http://127.0.0.1:8769/index.html?view=${view}${view === '3d' ? '&headless=1' : ''}`);
    for (let i = 0; i < 300 && !(await pg.evaluate(() => !!(window.__od && window.OD.MAPS && (window.OD.view === '2d' || window.__view3d)))); i++) { await pg.evaluate(() => window.__step(16)); await pg.waitForTimeout(20); }
    const r = await pg.evaluate(() => {
      const out = {};
      for (const map of ['neptune', 'earth', 'saturn']) {
        const od = window.__od; od.begin(map, 'medium'); const S = od.state(); S.lives = 1e6;
        let worst = 0, stuck = 0; const born = new Map();
        for (const w of [4, 9]) {
          S.wave = w - 1; od.startWave();
          for (let t = 0; t < 120000; t += 16) {
            window.__step(16); S.lives = 1e6;
            for (const e of S.enemies) if (!born.has(e)) { born.set(e, t); e.hp = e.maxHp = 1e12; e.shield = e.maxShield = 0; }
            for (const [e, t0] of born) if (e.dead || !S.enemies.includes(e)) { worst = Math.max(worst, (t - t0) / 1000); born.delete(e); }
            if (!S.waveActive) break;
          }
          stuck += born.size; born.clear(); S.enemies = []; S.queue = []; S.waveActive = false;
        }
        out[map] = { worst: Math.round(worst), stuck };
      }
      return out;
    });
    for (const [map, x] of Object.entries(r)) ok(x.stuck === 0 && x.worst < 45, `${view} ${map}: every invader reaches the planet (slowest ${x.worst}s)`);
    ok(errs.length === 0, `${view}: no page errors ${errs.slice(0, 3).join(' | ')}`);
    await pg.context().close();
  }
  await b.close();
})();
