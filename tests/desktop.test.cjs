// Part of the automated test suite. Run all with: npm test   (or one: npm test -- desktop)
// Desktop comfort: hotkeys on the selected satellite, rebindable keys (Controls screen), hover tooltips, key hints.
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch();
  const pg = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); localStorage.setItem('od_stats_off', '1'); localStorage.setItem('od_all_maps', '1'); } catch {} });
  await pg.goto('http://127.0.0.1:8769/index.html?view=2d');
  await pg.waitForFunction(() => window.__od && window.OD.MAPS && document.querySelector('[data-map]'), null, { timeout: 30000 });
  // Controls screen: rebind Upgrade to K; giving K to Speed afterwards swaps Speed's old key onto Upgrade
  await pg.click('[data-act="controls"]'); await pg.waitForSelector('[data-rebind="upgrade"]');
  await pg.click('[data-rebind="upgrade"]'); await pg.keyboard.press('k');
  const k1 = await pg.evaluate(() => JSON.parse(localStorage.getItem('od_keys') || '{}').upgrade);
  await pg.click('[data-rebind="speed"]'); await pg.keyboard.press('k');
  const k2 = await pg.evaluate(() => JSON.parse(localStorage.getItem('od_keys')));
  await pg.click('[data-act="keys-reset"]');
  const k3 = await pg.evaluate(() => JSON.parse(localStorage.getItem('od_keys')).upgrade);
  ok(k1 === 'k' && k2.speed === 'k' && k2.upgrade === 'f' && k3 === 'u', `rebinding works, a taken key swaps (upgrade=${k1}; then speed=${k2.speed}, upgrade=${k2.upgrade}; reset → ${k3})`);
  await pg.click('[data-act="controls-back"]');
  // hotkeys on the selected satellite
  await pg.evaluate(() => { const od = window.__od; od.begin('earth', 'easy'); const S = od.state(); S.money = 1e7; od.placeTower(od.launchSlot(0), 'laser'); od.tapSlot(S.towers[0].slot); });
  await pg.waitForTimeout(200);
  const hints = await pg.evaluate(() => document.querySelectorAll('#info kbd.hk').length);
  const st = async () => pg.evaluate(() => { const t = window.__od.state().towers[0]; return t ? { level: t.level, path: t.path, targeting: t.targeting, fuel: t.fuel, orbit: t.orbit } : null; });
  await pg.keyboard.press('u'); await pg.keyboard.press('u'); const a = await st();
  await pg.keyboard.press('u'); const fork = await st(); // tier 3 needs a specialization: U does nothing, shows a hint
  await pg.keyboard.press('z'); const b2 = await st();
  await pg.keyboard.press('t'); const c = await st();
  await pg.evaluate(() => { window.__od.state().towers[0].fuel = 6; }); await pg.keyboard.press('v'); const d = await st();
  await pg.keyboard.press('o'); const e = await st();
  ok(hints >= 3, `key hints on the satellite panel (${hints})`);
  ok(a.level === 2 && fork.level === 2 && b2.level === 3 && b2.path === 'A', 'U upgrades, Z picks specialization A');
  ok(c.targeting !== 'first' && d.fuel === 20 && e.orbit !== 0, `T targeting (${c.targeting}), V refuels (${d.fuel}), O changes orbit (${e.orbit})`);
  await pg.keyboard.press('Delete'); const sold = await pg.evaluate(() => window.__od.state().towers.length);
  ok(sold === 0, 'Delete sells the selected satellite');
  // tooltips
  await pg.hover('#shop [data-type="laser"]'); await pg.waitForTimeout(150);
  const tip = await pg.evaluate(() => { const t = document.getElementById('hoverTip'); return t.classList.contains('show') ? t.textContent : ''; });
  ok(/Laser Sat/.test(tip) && /Cost/.test(tip), 'hovering a shop button shows its stats');
  ok(errs.length === 0, `no page errors ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
})();
