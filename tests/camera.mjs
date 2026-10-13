// Screenshots der Verfolgerkamera: Start, Vollgas, Kurvenfahrt
import { chromium } from 'playwright';
const dir = process.argv[2] ?? '.';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5173/');
await page.waitForFunction(() => window.__game);
await page.waitForTimeout(500);
await page.screenshot({ path: `${dir}/cam-start.png` });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${dir}/cam-speed.png` });
await browser.close();
if (errors.length) { console.error(errors); process.exit(1); }
console.log('OK');
