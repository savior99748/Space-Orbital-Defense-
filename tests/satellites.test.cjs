// Part of the automated test suite. Run all with: npm test   (or one: npm test -- <name>)
const ROOT = require('path').resolve(__dirname, '..');
const { chromium, devices } = require('playwright');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  for (const [name, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['phone', devices['iPhone 13']]]) {
    const ctx = await b.newContext(opts); const pg = await ctx.newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => m.type() === 'error' && !/goat|zgo|TUNNEL/.test(m.text()) && errs.push(m.text()));
    await pg.addInitScript(() => { try { localStorage.setItem('od_tut_done', '1'); } catch {} }); // skip the brand-new-player tutorial
    await pg.goto('http://127.0.0.1:8769/index.html?view=3d');
    await pg.evaluate(() => { localStorage.setItem('od_tut_done','1'); localStorage.setItem('od_stats_off','1'); });
    await pg.reload(); await pg.waitForFunction(() => window.__view3d && window.__od, null, { timeout: 20000 });
    const T = ['laser','missile','tractor','rail','emp','miner','carrier'];
    // place every type twice (path A and B), check the model after every upgrade
    const res = await pg.evaluate(async T => {
      const od = window.__od, v = window.__view3d; od.begin('earth', 'medium'); const S = od.state(); S.money = 1e7; S.lives = 999;
      const frame = () => new Promise(r => requestAnimationFrame(() => r()));
      const models = () => { const m = new Map(); v.scene.children.forEach(c => { if (c.userData && c.userData.key) m.set(c, c.userData.key); }); return [...m.values()]; };
      const out = { keys: [], bad: [] }; let slot = 0;
      for (const t of T) for (const path of ['A', 'B']) {
        od.placeTower(slot, t); const tw = od.towerAt(slot); await frame(); await frame();
        for (let l = 0; l < 4; l++) {
          od.upgradeTower(tw, path); await frame(); await frame();
          const want = `${t}|${tw.level}|${tw.path}|0|0`; // type|level|path|overclock|ascension
          if (!models().includes(want)) out.bad.push(want);
        }
        out.keys.push(`${t}|${tw.level}|${tw.path}`);
        slot += 2;
      }
      out.count = S.towers.length; out.models = models().length;
      return out;
    }, T);
    ok(res.count === 14 && res.models === 14, `${name}: 14 satellites placed, 14 models in the scene (${res.models})`);
    ok(res.bad.length === 0, `${name}: model updates on every upgrade, all 7 types, both paths ${res.bad.join(' ')}`);
    // targeting + animation: start a wave, watch turret orientations and animated parts move
    const snap = () => pg.evaluate(() => { const v = window.__view3d, out = {}; v.scene.children.forEach(c => { const tur = c.userData && c.userData.key && c.getObjectByName('turret'); if (tur) out[c.userData.key] = tur.quaternion.toArray().map(x => x.toFixed(3)).join(','); }); return out; });
    const animSnap = () => pg.evaluate(() => { const v = window.__view3d; let s = ''; v.scene.children.forEach(c => { if (c.userData && c.userData.key) c.traverse(o => { if (o.userData.live) s += o.rotation.toArray().slice(0, 3).map(x => (+x).toFixed(2)) + o.scale.x.toFixed(2) + o.visible; }); }); return s; });
    await pg.evaluate(() => { const od = window.__od; od.state().wave = 4; od.startWave(); });
    const a1 = await animSnap(); const q1 = await snap();
    await pg.waitForTimeout(9000);
    const a2 = await animSnap(); const q2 = await snap();
    const aimed = ['laser', 'missile', 'rail'].filter(t => Object.keys(q1).some(k => k.startsWith(t) && q1[k] !== q2[k]));
    ok(aimed.length === 3, `${name}: turrets turn toward targets (laser, missile, rail: ${aimed.join(', ')})`);
    ok(a1 !== a2, `${name}: animated parts move (rings, flames, gatling, drill...)`);
    await pg.waitForFunction(() => window.__od.state().towers.reduce((a, t) => a + (t.kills || 0), 0) > 0, null, { timeout: 60000 }).catch(() => {});
    const kills = await pg.evaluate(() => window.__od.state().towers.reduce((a, t) => a + (t.kills || 0), 0)), gt = await pg.evaluate(() => window.__od.state().realTime.toFixed(1));
    ok(kills > 0, `${name}: satellites fire and destroy invaders (${kills} kills after ${gt}s of game time)`);
    await pg.screenshot({ path: `shots/sattest-${name}.png` });
    ok(errs.length === 0, `${name}: no console errors ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  await b.close();
})();
