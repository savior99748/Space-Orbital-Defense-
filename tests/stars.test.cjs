// Part of the automated test suite. Run all with: npm test   (or one: npm test -- stars)
// Progression: campaign stars, planet unlocks, challenges (rules + stars), the Daily Challenge, achievements.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); } catch {} });
  await pg.goto('http://127.0.0.1:8769/index.html?view=2d');
  await pg.waitForFunction(() => window.__od && window.OD.MAPS && document.querySelector('[data-map]'), null, { timeout: 30000 });
  const r = await pg.evaluate(async () => {
    const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
    const until = async (f, ms = 20000) => { const t0 = Date.now(); while (!f() && Date.now() - t0 < ms) await wait(30); return f(); };
    out.fresh = { total: od.totalStars(), earth: od.mapUnlocked('earth'), mars: od.mapUnlocked('mars'), sol: od.mapUnlocked('sol') };
    out.menu = { daily: !!document.querySelector('[data-act="daily"]'), locked: document.querySelectorAll('.map-card.locked-map').length, total: !!document.querySelector('.star-total') };
    const win = async (mapKey, ch) => { // jump to the last wave and clear it
      od.begin(mapKey, 'easy', false, false, ch); const S = od.state(); S.lives = S.diff.lives; S.wave = (S.winWave || 30) - 1; od.startWave(); S.queue = []; S.enemies = [];
      await until(() => S.won); return S;
    };
    let S = await win('earth');
    out.campaign = { won: S.won, stars: od.getStars().earth.s, total: od.totalStars(), mars: od.mapUnlocked('mars'), shown: /★★★/.test(document.getElementById('overlay').textContent) };
    // challenge rules
    od.begin('earth', 'easy', false, false, 'lasers'); S = od.state(); S.money = 1e6;
    od.placeTower(od.launchSlot(0), 'missile'); const missile = S.towers.length; od.placeTower(od.launchSlot(0), 'laser');
    out.lasers = { winWave: S.winWave, missileBlocked: missile === 0, laserOk: S.towers.length === 1 };
    od.begin('earth', 'easy', false, false, 'thrift'); out.thrift = od.state().money;
    od.begin('earth', 'easy'); out.normalMoney = od.state().money;
    od.begin('earth', 'easy', false, false, 'glass'); out.glass = od.state().lives;
    od.begin('earth', 'easy', false, false, 'nood'); await wait(300); out.nood = document.getElementById('odBtn').disabled;
    od.begin('earth', 'easy', false, false, 'leo'); S = od.state(); S.money = 1e6; S.launchBand = 2; od.placeTower(od.launchSlot(0), 'laser'); out.leo = S.towers[0] && S.towers[0].orbit;
    S = await win('earth', 'lasers');
    out.chWin = { won: S.won, c: !!(od.getStars().earth.c || {}).lasers, total: od.totalStars() };
    // the Daily Challenge from the menu
    od.mainMenu(); await wait(200);
    document.querySelector('[data-act="daily"]').click(); await wait(300);
    S = od.state(); const d = od.daily();
    out.daily = { on: !!S.daily, map: S.mapKey === d.map, ch: S.challenge === d.ch };
    S.wave = 19; S.lives = S.diff.lives; od.startWave(); S.queue = []; S.enemies = []; await until(() => S.won);
    out.dailyDone = JSON.parse(localStorage.getItem('od_daily') || '{}');
    out.ach = od.ACHIEVEMENTS().length; const got = od.getAch(); out.got = ['star_1', 'stars_3map', 'ch_first', 'daily_1'].filter(k => got[k]);
    return out;
  });
  ok(r.fresh.total === 0 && r.fresh.earth && !r.fresh.mars && !r.fresh.sol, 'new player: the first planets are open, later ones are locked');
  ok(r.menu.daily && r.menu.locked >= 5 && r.menu.total, `menu shows the Daily Challenge, star total and ${r.menu.locked} locked planets`);
  ok(r.campaign.won && r.campaign.stars === 3 && r.campaign.total === 3 && r.campaign.mars && r.campaign.shown, 'campaign win with full HP: ★★★, Mars unlocks at 3 stars');
  ok(r.lasers.winWave === 20 && r.lasers.missileBlocked && r.lasers.laserOk, 'Laser Focus: 20 waves, only Laser Sats can be built');
  ok(r.thrift === Math.round(r.normalMoney * 0.4), `Shoestring: 40% starting credits (${r.thrift} of ${r.normalMoney})`);
  ok(r.glass === 5 && r.nood && r.leo === 0, 'Glass Planet 5 HP, No Overdrive disables the button, Low Orbit keeps launches in LEO');
  ok(r.chWin.won && r.chWin.c && r.chWin.total === 4, 'winning a challenge earns its star');
  ok(r.daily.on && r.daily.map && r.daily.ch && r.dailyDone.streak === 1, 'Daily Challenge: today\'s map and rule, completion and streak saved');
  ok(r.ach >= 30 && r.got.length === 4, `${r.ach} achievements; unlocked here: ${r.got.join(', ')}`);
  ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
})();
