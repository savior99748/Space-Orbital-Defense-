// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 } });
  await ctx.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.OD=window.OD||{};OD.CONFIG={goatcounter:"testsite",statsOnPortals:false};' }));
  await ctx.route('https://gc.zgo.at/count.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    window.__ev = window.__ev || [];
    window.goatcounter = Object.assign(window.goatcounter || {}, { count: v => window.__ev.push(v.path + (v.event ? '' : ' (NOT EVENT)')) });` }));
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('http://127.0.0.1:8766/index.html?view=2d&orbits=classic');
  await pg.waitForFunction(() => window.__od && window.__od.tut()); // a brand-new player starts in the tutorial
  await pg.waitForTimeout(300);
  let ev = await pg.evaluate(() => window.__ev || []);
  ok(ev.includes('new-player') && ev.includes('session/web/2d'), 'first visit: ' + ev.join(', '));
  // Come back "the next day"
  await pg.evaluate(() => localStorage.setItem('od_first_day', String(Math.floor(Date.now() / 86400000) - 1)));
  await pg.reload(); await pg.waitForSelector('[data-act="start"]'); await pg.waitForTimeout(300);
  ev = await pg.evaluate(() => window.__ev || []);
  ok(ev.includes('return/d1') && !ev.includes('new-player'), 'day-1 return counted: ' + ev.join(', '));
  await pg.reload(); await pg.waitForSelector('[data-act="start"]'); await pg.waitForTimeout(300);
  ev = await pg.evaluate(() => window.__ev || []);
  ok(!ev.includes('return/d1'), 'day-1 return only counted once');
  // Tutorial, game start, wave, path, quit, game over
  await pg.click('.btns [data-act="tutorial"]');
  await pg.click('[data-type="laser"]');
  await pg.click('[data-tut="skip"]');
  await pg.evaluate(() => { const od = window.__od, S = od.state(); S.money = 5000; od.placeTower(0, 'laser'); od.placeTower(3, 'laser');
    const t = S.towers[0]; od.upgradeTower(t); od.upgradeTower(t); od.upgradeTower(t, 'B'); S.speed = 10; od.startWave(); });
  await pg.waitForFunction(() => !window.__od.state().waveActive, null, { timeout: 60000 });
  await pg.evaluate(() => window.__od.mainMenu());
  await pg.evaluate(() => { window.__od.begin('mars', 'hard'); window.__od.state().lives = 0; });
  await pg.waitForTimeout(400);
  ev = await pg.evaluate(() => window.__ev || []);
  const want = ['tutorial/start', 'tutorial/skip-at-step-2', 'game-start/earth/easy', 'path/laser/solar-lance', 'wave/earth/1', 'quit/earth/w1-4', 'game-start/mars/hard', 'game-over/mars/hard/w1-4', 'first/build', 'first/upgrade', 'first/wave-start', 'first/wave-clear'];
  for (const w of want) ok(ev.includes(w), 'event ' + w);
  ok(!ev.some(e => e.includes('NOT EVENT')), 'all sent as events (no page views)');
  // Opt out
  await pg.evaluate(() => window.__od.mainMenu());
  await pg.click('[data-act="stats-toggle"]');
  ok((await pg.textContent('[data-act="stats-toggle"]')).includes('Off'), 'stats toggle shows Off');
  const n = (await pg.evaluate(() => window.__ev.length));
  await pg.evaluate(() => { window.__od.begin('earth', 'easy'); });
  await pg.waitForTimeout(200);
  ok((await pg.evaluate(() => window.__ev.length)) === n, 'no events sent after opting out');
  // privacy page
  const pp = await ctx.newPage(); await pp.goto('http://127.0.0.1:8766/privacy.html');
  ok((await pp.textContent('h1')) === 'Privacy Policy', 'privacy page served');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  // Unconfigured default: nothing loaded
  const ctx2 = await b.newContext(); let hit = false;
  await ctx2.route('**/js/config.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.OD=window.OD||{};OD.CONFIG={goatcounter:"",statsOnPortals:false};' }));
  await ctx2.route('https://gc.zgo.at/**', r => { hit = true; r.abort(); });
  const p2 = await ctx2.newPage(); await p2.goto('http://127.0.0.1:8766/index.html?view=2d&orbits=classic'); await p2.waitForFunction(() => window.__od && window.__od.tut()); await p2.waitForTimeout(500);
  ok(!hit && !(await p2.isVisible('[data-act="stats-toggle"]')), 'with no site code: no stats script loaded, no toggle shown');
  await b.close();
})();
