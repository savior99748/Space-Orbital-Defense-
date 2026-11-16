// Part of the automated test suite. Run all with: npm test   (or one: npm test -- feats)
// One mode: bonus challenges pop up during a normal game (waves 6, 12, 18, 24); end-of-run report; boss health bar.
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
    const od = window.__od, o = {}, wait = ms => new Promise(r => setTimeout(r, ms));
    const clear = async () => { const S = od.state(); S.queue = []; S.enemies.forEach(e => { e.dead = true; }); for (let i = 0; i < 40 && S.waveActive; i++) await wait(50); };
    o.feats = od.mapFeats('earth').map(f => `${f.id}@${f.wave}`).join(',');
    // a run on Earth: wave 6 brings the first bonus challenge (Flawless); clear it without losing HP
    od.begin('earth', 'easy'); let S = od.state(); S.money = 1e6; S.lives = 1e4;
    od.placeTower(od.launchSlot(0), 'laser');
    S.wave = 5; od.startWave(); await wait(100);
    o.started = S.feat && S.feat.id; o.chip = (document.querySelector('#preview .chip.feat') || {}).textContent || '';
    const stars0 = od.totalStars(), m0 = S.money, sv0 = od.research.salvage();
    await clear();
    o.starGain = od.totalStars() - stars0; o.salvageGain = od.research.salvage() - sv0; o.creditGain = S.money - m0; o.won = (S.featsWon || []).join();
    // wave 12: Steady Hands spans waves 12-14; using Overdrive fails it
    S.wave = 11; od.startWave(); await wait(50);
    o.span = S.feat && `${S.feat.id}:${S.feat.wave}-${S.feat.end}`;
    S.stats.overdrives++; await wait(400);
    o.failChip = ((document.querySelector('#preview .chip.feat') || {}).textContent || '').includes('missed');
    await clear(); o.stillOn = !!S.feat; // still running until wave 14
    for (const w of [13, 14]) { od.startWave(); await wait(30); await clear(); }
    o.noStar = !(od.getStars().earth.c || {}).nood && !S.feat;
    // the menu lists the planet's challenges with the earned one ticked
    od.mainMenu(); await wait(100);
    o.menuList = [...document.querySelectorAll('.ch-list .ch-btn')].map(x => (x.classList.contains('got') ? '✓' : '·')).join('');
    // boss bar: a Mothership arrives
    od.begin('earth', 'easy'); S = od.state(); S.lives = 1e4; S.wave = 10;
    od.spawnEnemy('mother', 1); await wait(250);
    const bar = document.getElementById('bossBar');
    o.boss = bar && bar.classList.contains('show') && bar.textContent.includes('MOTHERSHIP') && bar.textContent.includes('×2');
    const m = S.enemies.find(e => e.type === 'mother'); m.hp = m.maxHp * 0.3; await wait(250);
    o.bossLayer = bar.textContent.includes('×1');
    m.dead = true; await wait(250); o.bossGone = !bar.classList.contains('show');
    // end-of-run report: what finished the planet off, and a tip
    S.hitBy = { cruiser: 12, drone: 3 }; S.lastHit = 'drone'; S.lives = 0;
    for (let i = 0; i < 40 && !S.over; i++) await wait(50);
    o.killed = (document.querySelector('.killed') || {}).textContent || ''; o.tip = (document.querySelector('.run-tip') || {}).textContent || '';
    return o;
  });
  ok(r.feats === 'glass@6,nood@12,swift@18,leo@24', `Earth's bonus challenges (${r.feats})`);
  ok(r.started === 'glass' && /Flawless/.test(r.chip), `wave 6 starts the Flawless challenge, shown in the wave bar (${r.chip})`);
  ok(r.starGain === 1 && r.salvageGain === 15 && r.creditGain > 0 && r.won === 'glass', `completing it: +1 ★, +15 Salvage, credits (${r.starGain}, ${r.salvageGain}, ${r.creditGain})`);
  ok(r.span === 'nood:12-14' && r.failChip && r.stillOn && r.noStar, `Steady Hands spans waves 12–14; Overdrive fails it (no star) ${JSON.stringify([r.span, r.failChip, r.stillOn, r.noStar])}`);
  ok(r.menuList === '✓···', `menu lists the 4 challenges, earned one ticked (${r.menuList})`);
  ok(r.boss && r.bossLayer && r.bossGone, 'boss bar: name, layered health (×2 → ×1), hides when the boss dies');
  ok(/Drone/.test(r.killed) && /Shield Cruiser/.test(r.killed) && /Railgun/.test(r.tip), `game-over report: ${r.killed} | ${r.tip}`);
  ok(!errs.length, `no page errors (${errs.join(' | ')})`);
  await b.close();
})();
