// Geisterauto: Aufzeichnung der Bestrunde, Wiedergabe in der nächsten Runde, Speicherung
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:5173/';
const shot = process.argv[3] ?? 'ghost.png';
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
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };

// Bot per Tastatur-Events: fährt, bis `stopWhen` wahr ist
await page.evaluate(() => {
  const { car, track } = window.__game;
  const N = track.points.length, held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    down ? held.add(code) : held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  window.__bot = { stop: false };
  const tick = () => {
    const look = Math.round((10 + car.speed * 0.5) / (track.length / N));
    const p = track.points[(car.trackIndex + look) % N];
    const e = Math.atan2(Math.sin(Math.atan2(p.x - car.x, p.z - car.z) - car.heading), Math.cos(Math.atan2(p.x - car.x, p.z - car.z) - car.heading));
    key('ArrowLeft', e > 0.04); key('ArrowRight', e < -0.04);
    key('ArrowUp', car.speed < 34); key('ArrowDown', car.speed > 42);
    if (window.__bot.stop) ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((k) => key(k, false));
    else requestAnimationFrame(tick);
  };
  tick();
});

check('Anfangs kein Geist', !(await page.evaluate(() => window.__game.ghost.hasData)));
await page.waitForFunction(() => window.__game.laps.lapsDone >= 1, null, { timeout: 120000 });
await page.waitForTimeout(300);
const a = await page.evaluate(() => {
  const g = window.__game, raw = JSON.parse(localStorage.getItem('racing-lab.ghost') || 'null');
  return { has: g.ghost.hasData, lap: g.laps.lastLap, stored: raw && raw.lap, samples: raw ? raw.s.length / 3 : 0 };
});
check('Bestrunde als Geist gespeichert', a.has && Math.abs(a.stored - a.lap) < 1e-6, a);
check('Anzahl Stützpunkte passt zur Rundenzeit (30 Hz)', Math.abs(a.samples - a.lap * 30) < a.lap * 30 * 0.05, a);

// Runde 2: Geist muss sichtbar sein und auf der Strecke fahren
await page.waitForFunction(() => window.__game.laps.currentLap > 3 && window.__game.ghost.visible, null, { timeout: 20000 });
const p1 = await page.evaluate(() => { const g = window.__game, m = g.ghost.mesh.position; return { x: m.x, z: m.z, d: g.track.query(m.x, m.z).distance, car: { x: g.car.x, z: g.car.z } }; });
await page.waitForTimeout(1000);
const p2 = await page.evaluate(() => { const m = window.__game.ghost.mesh.position; return { x: m.x, z: m.z }; });
check('Geist fährt auf der Strecke', p1.d < 9, p1);
check('Geist bewegt sich', Math.hypot(p2.x - p1.x, p2.z - p1.z) > 5, [p1, p2]);
check('Geist ist in der Nähe des Autos (gleiche Fahrweise)', Math.hypot(p1.x - p1.car.x, p1.z - p1.car.z) < 40, p1);
await page.evaluate(() => { window.__bot.stop = true; });
// Auto ausrollen lassen, bis der Geist überholt und vor dem Auto im Bild ist
await page.waitForFunction(() => {
  const { car, ghost } = window.__game, m = ghost.mesh.position;
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  const ahead = (m.x - car.x) * fx + (m.z - car.z) * fz;
  const side = Math.abs((m.x - car.x) * Math.cos(car.heading) - (m.z - car.z) * Math.sin(car.heading));
  return ghost.visible && ahead > 8 && ahead < 30 && side < 8;
}, null, { timeout: 30000 }).catch(() => console.log('INFO Geist kam nicht ins Bild'));
await page.screenshot({ path: shot });

// Persistenz und Gültigkeitsprüfung
await page.reload();
await page.waitForFunction(() => window.__game);
check('Geist nach Reload geladen', await page.evaluate(() => window.__game.ghost.hasData));
await page.evaluate(() => localStorage.setItem('racing-lab.bestLap', '99'));
await page.reload();
await page.waitForFunction(() => window.__game);
check('Geist verworfen, wenn Bestzeit nicht dazu passt', !(await page.evaluate(() => window.__game.ghost.hasData)));

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
