// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
let lastStep;
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ROOT + '/index.html?view=2d');
  await pg.waitForFunction(() => window.__od && window.__od.tut(), null, { timeout: 15000 });
  const step = async () => { await pg.waitForTimeout(150); return pg.evaluate(() => window.__od.tut() ? window.__od.tut().i : null); };
  const tapWorld = async (x, y) => {
    const s = await pg.evaluate(([x, y]) => window.__od.toScreen(x, y), [x, y]);
    const box = await pg.locator('#game').boundingBox();
    await pg.touchscreen.tap(box.x + s.x, box.y + s.y);
  };
  // a brand-new player skips the menu and lands straight in the guided first game, at 3× speed
  ok(await step() === 0 && !(await pg.isVisible('[data-act="start"]')), 'brand-new player goes straight into the tutorial (step 1, no menu)');
  ok(await pg.evaluate(() => window.__od.state().speed === 3 && document.getElementById('speedBtn').textContent === '3×'), 'game starts at 3× speed');
  await pg.screenshot({ path: 't0.png' });
  const t00 = Date.now();
  // step 1: welcome + Laser Sat highlighted (no "Next" button to press)
  ok(!(await pg.isVisible('#coachNext')) && await pg.isVisible('#coachArrow'), 'step 1: welcome, arrow points at the Laser Sat');
  await pg.tap('[data-type="laser"]');
  ok(await step() === 1, 'step 2: tap a slot');
  await pg.screenshot({ path: 't1.png' });
  let tgt = await pg.evaluate(() => { const B = window.__od.board(); const sl = B.slots.find(x => x.ring === 0 && !window.__od.towerAt(x.id)); return window.__od.slotPos(sl.id); });
  await tapWorld(tgt.x, tgt.y);
  ok(await pg.evaluate(() => window.__od.state().towers.length) === 1, 'built the first satellite with a real tap');
  ok(await step() === 2 && /launches in/.test(await pg.textContent('#coachText')), 'step 3: countdown to Wave 1 (no second satellite, no Launch button)');
  ok(await pg.evaluate(() => window.__od.state().wave === 0 && !window.__od.state().waveActive), 'wave not launched yet during the countdown');
  // Wave 1 launches on its own
  await pg.waitForFunction(() => window.__od.state().waveActive, null, { timeout: 10000 });
  const secs = (Date.now() - t00) / 1000;
  ok(await step() === 3, `step 4: Wave 1 launched by itself (${secs.toFixed(1)}s after the welcome)`);
  await pg.waitForFunction(() => window.__od.state().enemies.length > 0, null, { timeout: 10000 });
  ok(true, 'invaders on screen');
  const m0 = await pg.evaluate(() => window.__od.state().money);
  await pg.evaluate(() => { window.__od.state().speed = 8; });
  await pg.waitForFunction(() => window.__od.tut() && window.__od.tut().i === 4, null, { timeout: 60000 });
  await pg.evaluate(() => { window.__od.state().speed = 1; });
  const m1 = await pg.evaluate(() => window.__od.state().money);
  ok(m1 > m0 && (await pg.textContent('#coachText')).includes('First victory'), `step 5: first victory, credits up (${m0} → ${m1})`);
  await pg.waitForTimeout(400);
  const m2 = await pg.evaluate(() => window.__od.state().money);
  ok(m2 === m1, 'wave reward and tutorial bonus paid once (no duplicates)');
  await pg.screenshot({ path: 't4.png' });
  const t1 = await pg.evaluate(() => { const t = window.__od.state().towers[0]; return { x: t.x, y: t.y }; });
  await tapWorld(t1.x, t1.y);
  await pg.waitForSelector('#info [data-up]', { timeout: 5000 });
  ok(await pg.evaluate(() => document.querySelector('#info [data-up]').classList.contains('coach-glow')), 'upgrade card highlighted');
  await pg.tap('#info [data-up]');
  await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => window.__od.state().towers[0].level === 1), 'first upgrade bought');
  ok(await pg.evaluate(() => window.__od.tut() === null && !!localStorage.getItem('od_tut_done')), 'tutorial completed after 5 steps and remembered');
  // normal play after the tutorial: waves only launch when the player asks
  await pg.waitForTimeout(2500);
  ok(await pg.evaluate(() => window.__od.state().wave === 1 && !window.__od.state().waveActive), 'after the tutorial, Wave 2 waits for the player (no auto-launch)');
  ok(await pg.evaluate(() => document.getElementById('waveBtn').classList.contains('ready')), 'Launch Wave button pulses while waiting');
  ok(/Reach wave 3/.test(await pg.textContent('#preview')), 'next goal shown: ' + (await pg.textContent('#preview .goal')));
  // Skip path: replay from menu, then skip
  await pg.evaluate(() => window.__od.mainMenu());
  await pg.tap('.btns [data-act="tutorial"]');
  ok(await step() === 0, 'replay tutorial from menu');
  await pg.tap('[data-tut="skip"]');
  ok(await pg.evaluate(() => window.__od.tut() === null) && !(await pg.isVisible('#coach')), 'skip button closes tutorial');
  // ---------- satellites unlock as waves are cleared; Railgun last ----------
  const unl = await pg.evaluate(async () => {
    const od = window.__od, wait = ms => new Promise(r => setTimeout(r, ms)); od.begin('earth', 'easy'); const S = od.state();
    const locked = () => [...document.querySelectorAll('.tower-btn.locked')].map(b => b.dataset.type);
    await wait(200); const at0 = locked();
    document.querySelector('[data-type="rail"]').click(); const railBlocked = S.selectedType === null;
    S.wave = 3; od.saveRun(); await wait(200); const at2 = locked();
    S.wave = 18; await wait(200); const at12 = locked();
    document.querySelector('[data-type="rail"]').click(); const railOk = S.selectedType === 'rail';
    return { order: [...document.querySelectorAll('.tower-btn')].map(b => b.dataset.type).join(','), at0, at2, at12, railBlocked, railOk };
  });
  ok(unl.order === 'laser,missile,silo,flak,tractor,emp,mines,miner,focus,carrier,rail', 'build bar order, Railgun last: ' + unl.order);
  ok(unl.at0.length === 10 && !unl.at0.includes('laser'), 'only the Laser Sat at the start (10 locked "?" cards)');
  ok(unl.railBlocked, 'a locked satellite cannot be selected');
  ok(!unl.at2.includes('missile') && unl.at2.includes('tractor'), 'Missile Pod unlocks after wave 3');
  ok(unl.at12.length === 0 && unl.railOk, 'everything, Railgun included, unlocked after wave 18');
  // ---------- zoom on the crowded Solar System map ----------
  await pg.evaluate(() => { const od = window.__od; od.begin('sol', 'easy'); const S = od.state(); S.money = 99999;
    const B = od.board(); const mercRing = B.rings.findIndex(r => B.bodies[r.body].name === 'Mercury');
    B.slots.filter(s => s.ring === mercRing).forEach((s, i) => od.placeTower(s.id, ['laser','rail','emp','missile'][i])); });
  await pg.tap('#zoomIn'); await pg.tap('#zoomIn'); await pg.tap('#zoomIn');
  ok((await pg.evaluate(() => window.__od.zoom().zoom)) === 3, 'zoom buttons reach 3×');
  await pg.tap('#zoomLabel');
  ok((await pg.evaluate(() => window.__od.zoom().zoom)) === 1, 'tap label resets to 1×');
  // real two-finger pinch via CDP
  const cdp = await ctx.newCDPSession(pg);
  const box = await pg.locator('#game').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const touch = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: cx - d, y: cy, id: 1 }, { x: cx + d, y: cy, id: 2 }] });
  await touch('touchStart', 30);
  for (let d = 40; d <= 120; d += 10) await touch('touchMove', d);
  await touch('touchEnd', 0);
  const zp = await pg.evaluate(() => window.__od.zoom().zoom);
  ok(zp > 2.5, 'pinch zoom works: ' + zp.toFixed(2) + '×');
  // pan with one finger drag
  const before = await pg.evaluate(() => window.__od.zoom());
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 3 }] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - i * 15, y: cy, id: 3 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await pg.evaluate(() => window.__od.zoom());
  ok(after.camX > before.camX + 10, `drag pans the view (camX ${before.camX.toFixed(0)} → ${after.camX.toFixed(0)})`);
  // zoom in on Mercury and tap each of its 4 crowded satellites individually
  await pg.evaluate(() => { const od = window.__od, S = od.state(); S.paused = true; const t = S.towers[0]; const s = od.toScreen(t.x, t.y); od.setZoom(3, s.x, s.y); });
  await pg.waitForTimeout(100);
  const picks = [];
  for (let i = 0; i < 4; i++) {
    await pg.evaluate(() => { window.__od.state().paused = false; });
    const p = await pg.evaluate(i => { const S = window.__od.state(); S.paused = true; const t = S.towers[i]; return { x: t.x, y: t.y, id: t.id }; }, i);
    await pg.evaluate(() => { window.__od.state().paused = false; window.__od.state().speed = 1; });
    // freeze the board by pausing via speed trick: tap quickly
    const s = await pg.evaluate(([x, y]) => window.__od.toScreen(x, y), [p.x, p.y]);
    await pg.touchscreen.tap(box.x + s.x, box.y + s.y);
    picks.push(await pg.evaluate(id => window.__od.state().selectedTower && window.__od.state().selectedTower.id === id, p.id));
  }
  ok(picks.filter(Boolean).length >= 3, `tapped individual satellites on tiny Mercury ring at 3× (${picks.filter(Boolean).length}/4 exact)`);
  await pg.screenshot({ path: 't-zoom.png' });
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close();
})();
