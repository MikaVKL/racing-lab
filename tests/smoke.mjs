// Startet das Spiel im Headless-Chromium, sammelt Konsolenfehler und macht einen Screenshot.
// Aufruf: node tests/smoke.mjs [url] [ausgabe.png]
import { launchBrowser } from './launch.mjs';

const url = process.argv[2] ?? 'http://localhost:5173/';
const out = process.argv[3] ?? 'screenshot.png';

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) { console.error('FEHLER:', errors); process.exit(1); }
console.log('OK – keine Konsolenfehler,', out);
