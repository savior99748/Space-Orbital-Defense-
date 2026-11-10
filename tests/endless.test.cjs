// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 820 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
  await pg.goto('file://' + ROOT + '/index.html?view=2d');
  await pg.evaluate(() => localStorage.setItem('od_tut_done', '1'));
  await pg.reload(); await pg.waitForSelector('[data-mode="endless"]');
  ok(true, 'mode selector on menu');
  await pg.click('[data-mode="endless"]');
  ok((await pg.textContent('[data-act="start"]')).includes('Endless'), 'start button switches to Endless');
  ok(await pg.isVisible('.milestones'), 'milestone badges shown');
  await pg.click('[data-act="start"]');
  const st = await pg.evaluate(() => ({ e: window.__od.state().endless, w: document.getElementById('wave').textContent }));
  ok(st.e && st.w.includes('∞'), 'Endless game started, HUD shows ∞: ' + st.w);
  // Jump to wave 39 with a strong defense, clear wave 40 → milestone
  await pg.evaluate(() => { const od = window.__od, S = od.state(), B = od.board(); S.money = 1e7;
    B.slots.filter(sl => !sl.surface).forEach((sl, i) => { od.placeTower(sl.id, ['laser', 'rail', 'missile', 'emp'][i % 4]); const t = od.towerAt(sl.id); while (t.level < 4) od.upgradeTower(t, i % 2 ? 'A' : 'B'); });
    S.money = 1000; S.wave = 39; S.lives = 9999; });
  await pg.waitForTimeout(300);
  ok((await pg.textContent('#preview')).includes('Wave 40'), 'next-milestone chip shows wave 40');
  const m0 = await pg.evaluate(() => window.__od.state().money);
  await pg.evaluate(() => { const S = window.__od.state(); S.speed = 10; window.__od.startWave(); });
  await pg.waitForFunction(() => !window.__od.state().waveActive, null, { timeout: 180000 });
  const m1 = await pg.evaluate(() => ({ money: window.__od.state().money, ms: window.__od.state().stats.milestones, over: window.__od.state().over }));
  ok(m1.ms === 1 && m1.money - m0 >= 500, `milestone at wave 40 paid out (+${m1.money - m0} incl. kills/bonus), over=${m1.over}`);
  ok(await pg.evaluate(() => document.getElementById('overlay').classList.contains('hidden')), 'no campaign victory overlay in Endless');
  ok(await pg.evaluate(() => window.__od.loadRun().endless === true), 'saved run remembers Endless');
  // Game over → leaderboard
  await pg.evaluate(() => { window.__od.state().lives = 0; });
  await pg.waitForSelector('table.lb');
  ok((await pg.textContent('#overlay')).includes('New personal best'), 'first run is personal best');
  ok(await pg.isVisible('#nickInput'), 'asks for a leaderboard name');
  const sp0 = await pg.evaluate(() => window.__od.state().speed);
  await pg.fill('#nickInput', 'Brandon<b>');
  await pg.press('#nickInput', 'f');
  await pg.press('#nickInput', 'Enter');
  await pg.waitForTimeout(300);
  const name = await pg.textContent('table.lb tr.me');
  ok(name.includes('Brandonbf') && !name.includes('<'), 'name saved and cleaned: ' + name.trim().replace(/\s+/g, ' '));
  ok(await pg.evaluate(s0 => window.__od.state().speed === s0, sp0), 'typing "f" did not change game speed');
  // Second worse run → rank 2
  await pg.evaluate(() => { window.__od.begin('earth', 'easy', false, true); const S = window.__od.state(); S.wave = 12; S.score = 5000; S.lives = 0; });
  await pg.waitForSelector('table.lb');
  ok((await pg.textContent('#overlay')).includes('#2 on your'), 'second run ranked #2');
  ok(!(await pg.isVisible('#nickInput')), 'no name prompt once a name is saved');
  // Revive does not duplicate
  const n0 = await pg.evaluate(() => window.__od.LB.top('earth', 'easy').length);
  await pg.evaluate(() => { const S = window.__od.state(); S.over = false; S.revived = true; document.getElementById('overlay').classList.add('hidden'); S.wave = 15; S.lives = 0; });
  await pg.waitForTimeout(500);
  const n1 = await pg.evaluate(() => window.__od.LB.top('earth', 'easy').length);
  ok(n1 === n0, `revived run replaces its own entry (${n0} → ${n1})`);
  // Leaderboard screen from menu
  await pg.evaluate(() => window.__od.mainMenu());
  ok((await pg.textContent('.map-card[data-map="earth"] .eb')).includes('∞'), 'map card shows best Endless wave');
  await pg.click('[data-act="leaderboards"]');
  ok((await pg.$$('table.lb tbody tr')).length === 2, 'leaderboard screen lists runs');
  await pg.click('[data-lbmap="mars"]');
  ok((await pg.textContent('#overlay')).includes('No Endless runs yet'), 'empty board message for Mars');
  await pg.click('[data-lbmap="earth"]');
  await pg.screenshot({ path: 'lb-earth.png' });
  await pg.click('[data-act="lb-play"]');
  ok(await pg.evaluate(() => window.__od.state().endless && window.__od.state().mapKey === 'earth'), 'Play Endless from leaderboard screen');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
