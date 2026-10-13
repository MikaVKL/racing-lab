// Rundenzählung im laufenden Spiel: gültige Runde, Abkürzung, Bestzeit, Persistenz nach Reload
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__game);

const fails = [];
const check = (name, ok, info) => { console.log(ok ? 'OK  ' : 'FAIL', name, JSON.stringify(info ?? '')); if (!ok) fails.push(name); };
const laps = () => page.evaluate(() => { const l = window.__game.laps; return { done: l.lapsDone, last: l.lastLap, best: l.bestLap, running: l.running, newBest: l.newBest }; });

// Auto auf Stützstelle i setzen, in Fahrtrichtung mit Tempo v
const teleport = (i, v = 30) => page.evaluate(([i, v]) => {
  const { car, track } = window.__game;
  const p = track.points[i], t = track.tangents[i];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z);
  car.vx = t.x * v; car.vz = t.z * v; car.lastIndex = undefined;
}, [i, v]);

check('Zeit läuft vor dem Start nicht', !(await laps()).running);
await page.keyboard.down('ArrowUp'); // Rennen starten
await page.waitForTimeout(300);
check('Zeit startet mit Gas', (await laps()).running);

// Abkürzung: ohne Checkpoints über die Ziellinie -> keine Runde
await teleport(792); await page.waitForTimeout(1200);
check('Ohne Checkpoints keine Runde', (await laps()).done === 0, await laps());

// Gültige Runde über alle Checkpoints
for (const i of [200, 400, 600]) { await teleport(i); await page.waitForTimeout(150); }
await teleport(792); await page.waitForTimeout(1200);
const a = await laps();
check('Gültige Runde wird gezählt', a.done === 1 && a.last > 0, a);
check('Erste Runde ist Bestzeit', a.best === a.last && a.newBest, a);
const stored = await page.evaluate(() => localStorage.getItem('racing-lab.bestLap'));
check('Bestzeit im localStorage', Number(stored) === a.best, stored);

// Zweite, langsamere Runde: Bestzeit bleibt
await page.waitForTimeout(1500);
for (const i of [200, 400, 600]) { await teleport(i); await page.waitForTimeout(150); }
await teleport(792); await page.waitForTimeout(1200);
const b = await laps();
check('Zweite Runde gezählt', b.done === 2, b);
check('Langsamere Runde ersetzt Bestzeit nicht', b.best === a.best && !b.newBest && b.last > a.best, b);

// HUD zeigt Werte
const hudText = await page.evaluate(() => document.querySelector('#hud').innerText);
check('HUD zeigt Runde 3', /RUNDE\s*3/.test(hudText), hudText.replace(/\n/g, ' | '));
await page.screenshot({ path: process.argv[3] ?? 'laps.png' });

// Persistenz nach Reload
await page.reload();
await page.waitForFunction(() => window.__game);
const c = await laps();
check('Bestzeit nach Reload geladen', c.best === a.best && c.done === 0, c);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
