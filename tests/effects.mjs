// Driftspuren und Reifenqualm im laufenden Spiel
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? 'effects.png';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__game);
const fails = [];
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };
const fx = () => page.evaluate(() => { const e = window.__game.effects; return { marks: e.marksPlaced, smoke: e.smokeActive, skid: e.skidding }; });
const teleport = (i, v) => page.evaluate(([i, v]) => {
  const { car, track } = window.__game;
  const p = track.points[i], t = track.tangents[i];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z);
  car.vx = t.x * v; car.vz = t.z * v; car.lastIndex = undefined;
}, [i, v]);

// 1) Geradeaus: keine Spuren
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(1500);
const a = await fx();
check('Geradeaus keine Spuren', a.marks === 0 && !a.skid, a);

// 2) Driften: Spuren und Qualm
await teleport(10, 40);
await page.keyboard.down('ArrowLeft');
await page.waitForFunction(() => window.__game.effects.marksPlaced > 0 && window.__game.effects.smokeActive > 0, null, { timeout: 8000 }).catch(() => {});
const b = await fx();
check('Driften setzt Spuren', b.marks > 0, b);
check('Driften erzeugt Qualm', b.smoke > 0, b);
await page.screenshot({ path: shot });
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');

// 3) Hartes Bremsen
await page.keyboard.press('KeyR');
await page.waitForTimeout(200);
const afterReset = await fx();
check('R löscht Spuren', afterReset.marks === 0 && afterReset.smoke === 0, afterReset);
await teleport(10, 45);
await page.keyboard.down('ArrowDown');
await page.waitForFunction(() => window.__game.effects.marksPlaced > 0, null, { timeout: 8000 }).catch(() => {});
const c = await fx();
check('Bremsen setzt Spuren', c.marks > 0, c);
await page.keyboard.up('ArrowDown');

// 4) Handbremse
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__game.car.speed === 0); // Reset wurde verarbeitet
await page.waitForTimeout(200);
await teleport(10, 30);
await page.keyboard.down('Space');
await page.keyboard.down('ArrowLeft');
await page.waitForFunction(() => window.__game.effects.marksPlaced > 0, null, { timeout: 8000 }).catch(() => {});
const d = await fx();
check('Handbremse setzt Spuren', d.marks > 0, d);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
