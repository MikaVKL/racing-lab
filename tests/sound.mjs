// Motorsound (WebAudio): Start nach Taste, Drehzahl/Gänge, Stummschalten mit M, Persistenz
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await launchBrowser(['--autoplay-policy=no-user-gesture-required']);
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
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
const snd = () => page.evaluate(() => { const s = window.__game.sound; return { ctx: s.ctx ? s.ctx.state : null, hz: +s.engineHz.toFixed(1), gear: s.gear, muted: s.muted, gain: s.ctx ? +s.master.gain.value.toFixed(2) : null, v: +window.__game.car.speed.toFixed(1) }; });

check('Vor erster Taste kein AudioContext', (await snd()).ctx === null);

await page.keyboard.down('ArrowUp');
await page.waitForTimeout(300);
const a = await snd();
check('Nach Taste läuft der AudioContext', a.ctx === 'running', a);

// Gänge beim Beschleunigen mitschneiden
const gears = new Set([a.gear]);
let minHz = a.hz, maxHz = a.hz;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(100);
  const s = await snd();
  gears.add(s.gear); minHz = Math.min(minHz, s.hz); maxHz = Math.max(maxHz, s.hz);
}
const b = await snd();
check('Gang wechselt beim Beschleunigen', gears.size >= 2, [...gears]);
check('Motorfrequenz steigt mit Tempo', maxHz > minHz + 30 && b.hz > 55, { minHz, maxHz });
await page.keyboard.up('ArrowUp');

// Stumm mit M
await page.keyboard.press('KeyM');
await page.waitForTimeout(400);
const m = await snd();
const hud = await page.evaluate(() => document.querySelector('#h-mute').textContent);
check('M schaltet stumm (Lautstärke 0)', m.muted && m.gain === 0, m);
check('HUD zeigt "Ton aus"', hud === 'Ton aus', hud);
check('Stummschaltung gespeichert', (await page.evaluate(() => localStorage.getItem('racing-lab.muted'))) === '1');

await page.reload();
await page.waitForFunction(() => window.__game);
const hud2 = await page.evaluate(() => document.querySelector('#h-mute').textContent);
check('Stummschaltung nach Reload erhalten', (await snd()).muted && hud2 === 'Ton aus', hud2);

// wieder an
await page.keyboard.press('KeyM');
await page.waitForTimeout(400);
const on = await snd();
check('M schaltet wieder ein', !on.muted && on.gain > 0.2, on);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
