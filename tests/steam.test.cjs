// Part of the automated test suite. Run all with: npm test   (or one: npm test -- steam)
// The Steam / desktop edition, running in real Electron: file saves (for Steam Cloud), fullscreen setting,
// Quit, ad-free premium bonuses, no CrazyGames code. Needs platforms/electron dependencies
// (npm ci --prefix platforms/electron); skipped with a note when Electron isn't installed.
const path = require('path'), fs = require('fs'), os = require('os');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const ROOT = path.resolve(__dirname, '..'), APP = path.join(ROOT, 'platforms/electron');
let electronBin;
try { electronBin = require(path.join(APP, 'node_modules/electron')); } catch { electronBin = null; }
if (!electronBin || !fs.existsSync(path.join(APP, 'app/index.html'))) { console.log('SKIP steam: Electron not installed (npm ci --prefix platforms/electron)'); process.exit(0); }
const { _electron } = require('playwright');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'od-steam-'));
const launch = () => _electron.launch({
  executablePath: electronBin,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', APP],
  env: { ...process.env, OD_USER_DATA: userData, OD_WINDOWED: '1' },
});
const readJson = f => { try { return JSON.parse(fs.readFileSync(path.join(userData, f), 'utf8')); } catch { return null; } };
(async () => {
  let app = await launch();
  let win = await app.firstWindow(); const errs = []; win.on('pageerror', e => errs.push(e.message));
  await win.waitForSelector('[data-act="start"]', { timeout: 60000 });
  ok(await win.title() === 'Ringwarden: Orbital Defense', `window title (${await win.title()})`);
  ok(await win.evaluate(() => OD.platform.name === 'electron' && OD.monetization.isPremium() && !window.CrazyGames && !document.querySelector('script[src*="crazygames"]')), 'Steam edition: premium, no CrazyGames code');
  ok(await win.$('[data-act="quit"]') !== null && await win.$('[data-act="display"]') !== null, 'menu has Quit and Fullscreen/Windowed buttons');
  // settings: fullscreen toggle from the menu reaches the real window and is remembered
  await win.click('[data-act="display"]'); await win.waitForTimeout(1500);
  ok(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), 'Fullscreen button switches the real window to fullscreen');
  ok(/Fullscreen/.test(await win.textContent('[data-act="display"]')), 'button label follows the window state');
  await win.click('[data-act="display"]'); await win.waitForTimeout(1500);
  ok(!(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen())), 'and back to windowed');
  // play: free bonus, then save
  await win.evaluate(() => { localStorage.setItem('od_tut_done', '1'); });
  const r = await win.evaluate(async () => {
    const od = window.__od; od.begin('earth', 'medium'); const S = od.state(); od.placeTower(od.EXP ? od.launchSlot(0) : 0, 'laser'); S.wave = 2; // Own Orbits: launched onto its own orbit S.waveActive = false;
    await new Promise(r => setTimeout(r, 400));
    const m0 = S.money; document.getElementById('adBtn').click(); await new Promise(r => setTimeout(r, 400));
    od.saveRun(); return { label: document.getElementById('adBtn').textContent, gained: S.money - m0 };
  });
  ok(r.gained > 0, `free 🎁 bonus credits on Steam (+${r.gained})`);
  await win.waitForTimeout(800);
  const saved = readJson('saves.json');
  const run = saved && (saved.od_run_exp || saved.od_run3d_exp || saved.od_run3d || saved.od_run); // Own Orbits runs: od_run_exp (2D, the default) / od_run3d_exp (3D)
  ok(run && JSON.parse(run).wave === 2, 'progress is written to saves.json (the file Steam Cloud syncs)');
  // quit from the menu, relaunch: the run is still there
  await win.evaluate(() => window.__od.mainMenu());
  await win.waitForSelector('[data-act="quit"]');
  const closed = new Promise(res => app.process().once('exit', res));
  await win.click('[data-act="quit"]');
  await Promise.race([closed, new Promise(r => setTimeout(r, 10000))]);
  ok(app.process().exitCode !== null || app.process().signalCode !== null, 'Quit closes the game');
  ok(readJson('settings.json') !== null, 'window settings saved on exit');
  app = await launch(); win = await app.firstWindow(); win.on('pageerror', e => errs.push(e.message));
  await win.waitForSelector('[data-act="continue"]', { timeout: 60000 }).catch(() => {});
  ok(await win.$('[data-act="continue"]') !== null, 'after restarting, Continue offers the saved run');
  await app.close();
  ok(errs.length === 0, 'no errors ' + errs.join(' | '));
  fs.rmSync(userData, { recursive: true, force: true });
})().catch(e => { console.log('FAIL ' + e.message); process.exit(1); });
