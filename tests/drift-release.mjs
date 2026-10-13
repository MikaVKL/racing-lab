// Handbremse loslassen: Seitwärtsbewegung soll sich weich abbauen, ohne dass das Auto "anhält".
// Misst Gesamttempo und Quergeschwindigkeit (Komponente quer zur Blickrichtung) nach dem Loslassen.
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const driftMs = Number(process.argv[3] ?? 700);
const verbose = process.argv.includes('-v');
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; });
await page.goto(url);
await page.waitForFunction(() => window.__game);

// Offroad-Bremsung ausschalten, damit nur das Grip-Verhalten gemessen wird
await page.evaluate(() => {
  const { car, track } = window.__game;
  track.width = 100000;
  const p = track.points[5], t = track.tangents[5];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z); car.vx = t.x * 40; car.vz = t.z * 40; car.lastIndex = undefined;
});
const sample = () => page.evaluate(() => {
  const c = window.__game.car;
  const lat = c.vx * Math.cos(c.heading) - c.vz * Math.sin(c.heading);
  return { t: performance.now(), v: Math.hypot(c.vx, c.vz), lat: Math.abs(lat) };
});
await page.keyboard.down('ArrowUp');
await page.keyboard.down('Space');
await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(driftMs);
await page.keyboard.up('ArrowLeft'); // Lenkung zurück, Handbremse noch gedrückt: Auto rutscht quer
await page.waitForTimeout(200);
const before = await sample();
await page.keyboard.up('Space');
const rows = [];
for (let i = 0; i < 25; i++) { await page.waitForTimeout(30); rows.push(await sample()); }
await browser.close();

const t0 = before.t;
if (verbose) for (const r of rows) console.log(`+${String(Math.round(r.t - t0)).padStart(5)} ms  Tempo ${r.v.toFixed(1).padStart(5)}  quer ${r.lat.toFixed(1).padStart(5)} m/s`);
// Zeit, bis die Querbewegung unter 15 % ihres Anfangswerts fällt
const settle = rows.find((r) => r.lat < before.lat * 0.15);
const settleMs = settle ? settle.t - t0 : Infinity;
const minV = Math.min(...rows.map((r) => r.v));
// Gas bleibt gedrückt: ein Einbruch des Gesamttempos kommt vom Grip-Wechsel ("Anhalten")
const lossPct = (1 - minV / before.v) * 100;
console.log(JSON.stringify({ quer_vorher: +before.lat.toFixed(1), tempo_vorher: +before.v.toFixed(1), abbau_ms: Math.round(settleMs), tempoverlust_pct: +lossPct.toFixed(1) }));
const ok = settleMs >= 600 && lossPct < 6; // vor dem Fix: ca. 350–410 ms
console.log(ok ? 'OK   Handbremse loslassen: weicher Übergang, kein Anhalten' : 'FAIL Handbremse loslassen: Querbewegung bricht zu abrupt ab oder Tempo geht verloren');
process.exit(ok ? 0 : 1);
