// Warnung "Falsche Richtung" und Minikarte
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? 'hud-extras.png';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fails = [];
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };
await page.goto(url);
await page.waitForFunction(() => window.__game);

const place = (i, dir, v) => page.evaluate(([i, dir, v]) => {
  const { car, track } = window.__game; const p = track.points[i], t = track.tangents[i];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x * dir, t.z * dir);
  car.vx = t.x * dir * v; car.vz = t.z * dir * v; car.lastIndex = undefined;
}, [i, dir, v]);
const mapStats = () => page.evaluate(() => {
  const c = document.querySelector('#minimap'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0, mag = 0, hash = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) n++; if (d[i] > 200 && d[i + 1] < 90 && d[i + 2] > 150) mag++; hash = (hash * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7) | 0; }
  return { w: c.width, n, mag, hash };
});

// Minikarte
await page.waitForTimeout(500);
const m1 = await mapStats();
check('Minikarte ist vorhanden und gezeichnet', m1.w >= 150 && m1.n > 500, m1);
check('Auto-Markierung (magenta) ist sichtbar', m1.mag > 20, m1);
await place(400, 1, 0);
await page.waitForTimeout(400);
const m2 = await mapStats();
check('Minikarte folgt dem Auto', m2.hash !== m1.hash, [m1.hash, m2.hash]);

// Richtige Richtung: keine Warnung
await page.keyboard.down('ArrowUp');
await place(100, 1, 25);
await page.waitForTimeout(1500);
check('Normale Fahrt: keine Warnung', !(await page.evaluate(() => window.__game.state().wrongWay)));

// Falsche Richtung (rückwärts entlang der Strecke gefahren, Auto zeigt gegen die Strecke)
await page.keyboard.up('ArrowUp');
await place(100, -1, 22);
await page.waitForFunction(() => window.__game.state().wrongWay, null, { timeout: 8000 }).catch(() => {});
const w = await page.evaluate(() => ({ s: window.__game.state().wrongWay, shown: getComputedStyle(document.querySelector('#h-wrong')).display }));
check('Falsche Richtung löst Warnung aus', w.s && w.shown === 'block', w);
await page.screenshot({ path: shot });

// Wieder richtig herum: Warnung verschwindet
await page.keyboard.down('ArrowUp');
await place(100, 1, 25);
await page.waitForFunction(() => !window.__game.state().wrongWay, null, { timeout: 5000 }).catch(() => {});
const w2 = await page.evaluate(() => ({ s: window.__game.state().wrongWay, shown: getComputedStyle(document.querySelector('#h-wrong')).display }));
check('Warnung verschwindet wieder', !w2.s && w2.shown === 'none', w2);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
