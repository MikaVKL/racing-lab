// Streckenauswahl: URL-Parameter, Taste T, Persistenz, getrennte Bestzeiten
import { launchBrowser } from './launch.mjs';
const base = (process.argv[2] ?? 'http://localhost:5173/').replace(/\?.*$/, '');
const shot = process.argv[3] ?? 'track2.png';
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; }); // Tests starten ohne Countdown
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const fails = [];
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };
const load = async (q = '') => { await page.goto(base + q); await page.waitForFunction(() => window.__game); };
const info = () => page.evaluate(() => ({ id: window.__game.trackDef.id, hud: document.querySelector('#h-track').textContent, len: Math.round(window.__game.track.length) }));

await load();
await page.evaluate(() => localStorage.clear());
await load();
const a = await info();
check('Standard ist Neon Lab', a.id === 'neon-lab' && a.hud === 'Neon Lab', a);

await load('?track=serpentine');
const b = await info();
check('?track=serpentine lädt die zweite Strecke', b.id === 'serpentine' && b.hud === 'Serpentine' && b.len !== a.len, b);
check('Parameter wird nicht dauerhaft gespeichert', (await page.evaluate(() => localStorage.getItem('racing-lab.track'))) === null);

await load('?track=gibtsnicht');
check('Unbekannte Strecke fällt auf Standard zurück', (await info()).id === 'neon-lab');

// Taste T wechselt, merkt sich die Wahl
await load();
await Promise.all([page.waitForNavigation(), page.keyboard.press('KeyT')]);
await page.waitForFunction(() => window.__game);
check('T wechselt zur nächsten Strecke', (await info()).id === 'serpentine');
await page.reload();
await page.waitForFunction(() => window.__game);
check('Wahl bleibt nach Reload erhalten', (await info()).id === 'serpentine');
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(2500);
await page.screenshot({ path: shot });
await page.keyboard.up('ArrowUp');
await Promise.all([page.waitForNavigation(), page.keyboard.press('KeyT')]);
await page.waitForFunction(() => window.__game);
check('T wechselt zurück (zyklisch)', (await info()).id === 'neon-lab');

// Bestzeiten getrennt: Runde auf Serpentine per Teleport
await load('?track=serpentine');
const teleport = (i) => page.evaluate((i) => {
  const { car, track } = window.__game; const p = track.points[i], t = track.tangents[i];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z); car.vx = t.x * 30; car.vz = t.z * 30; car.lastIndex = undefined;
}, i);
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(300);
for (const i of [200, 400, 600]) { await teleport(i); await page.waitForTimeout(150); }
await teleport(792);
await page.waitForFunction(() => window.__game.laps.lapsDone >= 1, null, { timeout: 15000 });
const keys = await page.evaluate(() => ({ s: localStorage.getItem('racing-lab.bestLap.serpentine'), n: localStorage.getItem('racing-lab.bestLap') }));
check('Bestzeit unter Strecken-Schlüssel gespeichert', keys.s !== null && keys.n === null, keys);
await load();
const lab = await page.evaluate(() => window.__game.laps.bestLap);
check('Neon Lab bleibt davon unberührt', lab === null, lab);
await load('?track=serpentine');
check('Serpentine kennt ihre Bestzeit nach Reload', (await page.evaluate(() => window.__game.laps.bestLap)) !== null);

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
