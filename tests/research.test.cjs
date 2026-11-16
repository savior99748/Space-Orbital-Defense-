// Part of the automated test suite. Run all with: npm test   (or one: npm test -- research)
// Research Lab: Salvage earned at the end of every run (win or lose), spent on permanent upgrades.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); localStorage.setItem('od_all_maps', '1'); } catch {} });
  await pg.goto('http://127.0.0.1:8769/index.html');
  await pg.waitForFunction(() => window.__od && window.OD.MAPS && document.querySelector('[data-map]'), null, { timeout: 30000 });
  const r = await pg.evaluate(async () => {
    const od = window.__od, R = od.research, o = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    o.menuBtn = !!document.querySelector('[data-act="research"]');
    // a baseline run with no research
    od.begin('earth', 'easy'); let S = od.state();
    o.money0 = S.money; o.lives0 = S.lives;
    od.placeTower(od.launchSlot(0), 'laser'); await wait(150); o.dmg0 = S.towers[0].st.dmg;
    // lose at wave 9 with 1 boss: 8 waves × 3 + 12 = 36 Salvage (Earth = beginner ×1)
    S.wave = 9; S.waveActive = true; S.stats.bosses = 1; S.lives = 1; S.enemies = [];
    o.before = R.salvage();
    S.lives = 0; // the planet falls: the game ends the run and pays out
    for (let i = 0; i < 40 && !S.over; i++) await wait(50);
    o.over = S.over; o.after = R.salvage(); o.paid = S.salvageNow;
    o.line = !!document.querySelector('.salvage-line');
    o.again = R.award(false); // already paid: nothing more
    // a win on a harder planet pays more (Neptune = hard ×1.5): 30 waves × 3 + 40 win = 130 × 1.5 = 195
    od.begin('neptune', 'hard'); S = od.state(); S.wave = 30; S.stats.bosses = 0; o.win = R.award(true);
    // buy research: weapons costs 50, then 75 (×1.55, rounded to 5)
    localStorage.setItem('od_salvage', '1000');
    o.cost1 = R.cost('weapons'); o.buy1 = R.buy('weapons'); o.cost2 = R.cost('weapons'); o.lvl = R.level('weapons');
    o.salvageLeft = R.salvage();
    for (const id of ['funding', 'shields']) R.buy(id);
    localStorage.setItem('od_salvage', '0'); o.broke = R.buy('bounty') === false && R.level('bounty') === 0;
    // the effects apply in the next run
    od.begin('earth', 'easy'); S = od.state();
    o.money1 = S.money; o.lives1 = S.lives; o.maxLives = S.diff.lives;
    od.placeTower(od.launchSlot(0), 'laser'); await wait(150); o.dmg1 = S.towers[0].st.dmg;
    // the Research Lab screen: 8 tracks, buy button state, back to the menu
    od.state().paused = true; R.show('menu'); await wait(50);
    o.cards = document.querySelectorAll('.res-card').length;
    o.disabledWhenBroke = [...document.querySelectorAll('[data-research]')].every(b => b.disabled);
    localStorage.setItem('od_salvage', '500'); R.show(); await wait(50);
    document.querySelector('[data-research="bounty"]').click(); await wait(50);
    o.clickBuy = R.level('bounty') === 1 && R.salvage() === 455;
    o.saved = JSON.parse(localStorage.getItem('od_research'));
    return o;
  });
  ok(r.menuBtn, 'main menu has a 🔬 Research Lab button');
  ok(r.over && r.paid === 36 && r.after - r.before === 36 && r.again === 0 && r.line, `losing at wave 9 with a boss pays 36 Salvage once, shown on the game-over screen (${r.paid}, again ${r.again})`);
  ok(r.win === 195, `a win on a harder planet pays more (${r.win})`);
  ok(r.cost1 === 50 && r.buy1 && r.lvl === 1 && r.cost2 === 80 && r.salvageLeft === 950, `buying research spends Salvage and raises the cost (${r.cost1} → ${r.cost2}, left ${r.salvageLeft})`);
  ok(r.broke, 'research can\'t be bought without enough Salvage');
  ok(r.money1 === Math.round(r.money0 * 1.06) && r.lives1 === Math.round(r.lives0 * 1.05) && r.maxLives === r.lives1, `Seed Funding and Planetary Shields apply at the start of a run (credits ${r.money0} → ${r.money1}, HP ${r.lives0} → ${r.lives1})`);
  ok(Math.abs(r.dmg1 / r.dmg0 - 1.03) < 0.001, `Weapons Research: +3% satellite damage (${r.dmg0} → ${r.dmg1})`);
  ok(r.cards === 8 && r.disabledWhenBroke && r.clickBuy, 'Research Lab screen: 8 tracks, buttons disabled without Salvage, clicking buys');
  ok(r.saved && r.saved.weapons === 1 && r.saved.bounty === 1, 'research is saved');
  ok(!errs.length, `no page errors (${errs.join(' | ')})`);
  await b.close();
})();
