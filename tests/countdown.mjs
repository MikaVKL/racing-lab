// Countdown, GO!, Pause und Neustart (ohne Testhook – so wie es Spieler erleben)
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? 'countdown.png';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fails = [];
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };
// sichtbarer Bannertext ('' wenn ausgeblendet)
const banner = () => page.evaluate(() => { const b = document.querySelector('#h-banner'); return b.style.opacity === '0' ? '' : b.textContent; });
const st = () => page.evaluate(() => { const g = window.__game; return { cd: +g.state().countdownLeft.toFixed(2), paused: g.state().paused, run: g.laps.running, v: +g.car.speed.toFixed(1), x: +g.car.x.toFixed(2), t: +g.laps.currentLap.toFixed(2) }; });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.goto(url);
await page.waitForFunction(() => window.__game);

// Countdown: Auto steht, Gas wird ignoriert
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(300);
const a = await st();
check('Countdown läuft, Zeit läuft noch nicht', a.cd > 0 && !a.run, a);
check('Banner zeigt eine Zahl', /^[123]$/.test(await banner()), await banner());
await page.screenshot({ path: shot });
await page.waitForTimeout(1200);
const b = await st();
check('Auto steht trotz Gas während des Countdowns', b.v === 0 && b.x === a.x, b);

// Ende des Countdowns: GO! und das Auto fährt los
await page.waitForFunction(() => window.__game.laps.running, null, { timeout: 10000 });
check('GO! wird angezeigt', (await banner()) === 'GO!', await banner());
await page.waitForTimeout(1500);
const c = await st();
check('Nach GO! fährt das Auto, Zeit läuft', c.v > 5 && c.run && c.t > 0.5, c);

// Pause: alles friert ein
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
const p1 = await st();
check('P pausiert', p1.paused && /PAUSE/.test(await banner()), p1);
await page.waitForTimeout(800);
const p2 = await st();
check('Während der Pause bewegt sich nichts, Zeit steht', p2.x === p1.x && p2.t === p1.t, [p1, p2]);
await page.keyboard.press('KeyR'); // R in der Pause darf nichts auslösen
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const p3 = await st();
check('Esc setzt fort, R aus der Pause wurde verworfen', !p3.paused && p3.x !== p1.x && p3.cd <= 0, p3);
check('Pause-Banner verschwindet', !/PAUSE/.test(await banner()), await banner());

// Neustart startet den Countdown erneut
await page.keyboard.up('ArrowUp');
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__game.state().countdownLeft > 0);
const r = await st();
check('R startet den Countdown neu, Auto steht am Start', r.v === 0 && !r.run && r.cd > 0, r);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
