// End-to-End: Ein Bot fährt per Tastatur-Events eine komplette Runde (ohne Teleport).
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__game);

const result = await page.evaluate(() => new Promise((resolve) => {
  const { car, track, laps } = window.__game;
  const N = track.points.length;
  const held = new Set();
  const key = (code, down) => {
    if (down === held.has(code)) return;
    down ? held.add(code) : held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  let offFrames = 0, maxOff = 0;
  const t0 = performance.now();
  const TARGET = 34; // m/s
  const tick = () => {
    const look = Math.round((10 + car.speed * 0.5) / (track.length / N));
    const p = track.points[(car.trackIndex + look) % N];
    const err = Math.atan2(p.x - car.x, p.z - car.z) - car.heading;
    const e = Math.atan2(Math.sin(err), Math.cos(err));
    key('ArrowLeft', e > 0.04);
    key('ArrowRight', e < -0.04);
    key('ArrowUp', car.speed < TARGET);
    key('ArrowDown', car.speed > TARGET + 8);
    if (car.offTrack) { offFrames++; maxOff = Math.max(maxOff, offFrames); } else offFrames = 0;
    if (laps.lapsDone >= 1 || performance.now() - t0 > 150000) {
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].forEach((k) => key(k, false));
      resolve({ done: laps.lapsDone, lap: laps.lastLap, wall: (performance.now() - t0) / 1000, maxOff });
    } else requestAnimationFrame(tick);
  };
  tick();
}));
console.log(JSON.stringify(result));
let ok = result.done >= 1;
console.log(ok ? 'OK   Bot fährt eine volle Runde' : 'FAIL Bot schafft keine Runde');
await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); ok = false; }
process.exit(ok ? 0 : 1);
