// Fahrtest im laufenden Spiel: Gas, Lenken, Bremsen, Offroad – liest den Zustand über window.__game.
import { launchBrowser } from './launch.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__game);

const state = () => page.evaluate(() => {
  const c = window.__game.car;
  return { x: +c.x.toFixed(1), z: +c.z.toFixed(1), h: +c.heading.toFixed(2), v: +c.speed.toFixed(1), slip: +c.slip.toFixed(2), off: c.offTrack };
});
const fails = [];
const check = (name, ok, info) => { console.log(ok ? 'OK  ' : 'FAIL', name, JSON.stringify(info)); if (!ok) fails.push(name); };

const s0 = await state();
check('Auto steht am Start', s0.v === 0, s0);

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2000);
const s1 = await state();
check('Gas beschleunigt', s1.v > 15, s1);

await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(350);
const s2 = await state();
check('Links lenken dreht Heading nach links (+)', s2.h > s1.h + 0.1, s2);
check('Rutschen bei Kurvenfahrt (Querkomponente)', Math.abs(s2.slip) > 0.5 && !s2.off, s2);
await page.keyboard.up('ArrowLeft');
await page.keyboard.up('ArrowUp');

await page.keyboard.down('ArrowDown');
await page.waitForTimeout(1500);
const s3 = await state();
check('Bremsen verringert Tempo', s3.v < s2.v, s3);
await page.keyboard.up('ArrowDown');

await page.keyboard.press('KeyR');
await page.waitForTimeout(200);
const s4 = await state();
check('R setzt zurück', s4.v === 0 && s4.x === s0.x, s4);

// WASD + Offroad: quer ins Gelände fahren
await page.keyboard.down('KeyW');
await page.keyboard.down('KeyA');
await page.waitForTimeout(3000);
const s5 = await state();
console.log('INFO nach 3s W+A', s5);
await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
