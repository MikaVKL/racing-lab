// Drift im Mario-Kart-Stil: Start, Bogen, Lenken mit/gegen den Drift, Loslassen ohne Anhalten und ohne Boost.
// Offroad-Bremsung ist ausgeschaltet (track.width riesig), damit nur das Fahrverhalten gemessen wird.
import { launchBrowser } from './launch.mjs';
const url = process.argv[2] ?? 'http://localhost:5173/';
const verbose = process.argv.includes('-v');
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.addInitScript(() => { window.__NO_COUNTDOWN = true; });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url);
await page.waitForFunction(() => window.__game);
const fails = [];
const check = (n, ok, i) => { console.log(ok ? 'OK  ' : 'FAIL', n, JSON.stringify(i ?? '')); if (!ok) fails.push(n); };

const setup = (v) => page.evaluate((v) => {
  const { car, track } = window.__game;
  track.width = 100000;
  const p = track.points[5], t = track.tangents[5];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z); car.vx = t.x * v; car.vz = t.z * v;
  car.steer = 0; car.drifting = false; car.exitT = 0; car.grip = 5; car.lastIndex = undefined;
}, v);
const st = () => page.evaluate(() => {
  const c = window.__game.car, travel = Math.atan2(c.vx, c.vz);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  return { t: performance.now(), v: Math.hypot(c.vx, c.vz), drift: c.drifting, dir: c.driftDir, travel, lead: wrap(c.heading - travel), slipAngle: Math.abs(wrap(c.heading - travel)) };
});
const release = async () => { for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'Space']) await page.keyboard.up(k); };
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// --- A) Kein Drift ohne Lenken oder bei zu wenig Tempo
await setup(40); await page.keyboard.down('ArrowUp'); await page.keyboard.down('Space');
await page.waitForTimeout(500);
check('Ohne Lenken kein Drift', !(await st()).drift);
await release();
await setup(4); await page.keyboard.down('Space'); await page.keyboard.down('ArrowLeft');
await page.waitForTimeout(500);
check('Zu langsam: kein Drift', !(await st()).drift);
await release();

// --- B) Drift startet, Nase zeigt nach innen, Bewegungsrichtung dreht sich im Bogen
await setup(40); await page.keyboard.down('ArrowUp'); await page.keyboard.down('Space'); await page.keyboard.down('ArrowLeft');
await page.waitForFunction(() => window.__game.car.drifting, null, { timeout: 5000 }).catch(() => {});
const b0 = await st();
await page.waitForTimeout(600);
const b1 = await st();
const rate = wrap(b1.travel - b0.travel) / ((b1.t - b0.t) / 1000);
check('Leertaste + Lenken startet den Drift (links)', b0.drift && b0.dir === 1, b0);
check('Nase zeigt nach innen (eilt der Bewegung voraus)', b1.lead > 0.15 && b1.lead < 0.65, { lead_rad: +b1.lead.toFixed(2) });
check('Bewegungsrichtung dreht sich nach links im Bogen', rate > 0.5 && rate < 2.2, { rad_pro_s: +rate.toFixed(2) });
await release();

// --- C) Mit dem Drift lenken = enger, gegen den Drift = weiter
const measureRate = async (extraKey) => {
  await setup(40); await page.keyboard.down('ArrowUp'); await page.keyboard.down('Space'); await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__game.car.drifting, null, { timeout: 5000 }).catch(() => {});
  if (extraKey === 'neutral') await page.keyboard.up('ArrowLeft');
  if (extraKey === 'against') { await page.keyboard.up('ArrowLeft'); await page.keyboard.down('ArrowRight'); }
  await page.waitForTimeout(500);                       // Lenkung einschwingen lassen
  const a = await st(); await page.waitForTimeout(500); const z = await st();
  await release();
  return wrap(z.travel - a.travel) / ((z.t - a.t) / 1000);
};
const withR = await measureRate('with'), neutR = await measureRate('neutral'), againstR = await measureRate('against');
check('Mit dem Drift lenken: engerer Bogen als neutral', withR > neutR * 1.15, { mit: +withR.toFixed(2), neutral: +neutR.toFixed(2) });
check('Gegen den Drift lenken: weiterer Bogen als neutral', againstR < neutR * 0.85, { gegen: +againstR.toFixed(2), neutral: +neutR.toFixed(2) });

// --- D) Loslassen: Bewegung bleibt erhalten, Nase schwenkt zurück, kein Anhalten, kein Boost
for (const throttle of [true, false]) {
  await setup(40);
  if (throttle) await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Space'); await page.keyboard.down('ArrowLeft');
  await page.waitForFunction(() => window.__game.car.drifting, null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.keyboard.up('ArrowLeft');                  // Lenkung neutral, Drift läuft noch
  await page.waitForTimeout(250);
  const before = await st();
  await page.keyboard.up('Space');
  const rows = [];
  for (let i = 0; i < 26; i++) { await page.waitForTimeout(30); rows.push(await st()); }
  await release();
  if (verbose) for (const r of rows.filter((_, i) => i % 3 === 0)) console.log(`   +${Math.round(r.t - before.t)} ms  Tempo ${r.v.toFixed(1)}  Nase-Bewegung ${(r.lead * 57.3).toFixed(1)}°  Richtung ${(wrap(r.travel - before.travel) * 57.3).toFixed(1)}°`);
  const tag = throttle ? 'mit Gas' : 'ohne Gas';
  const last = rows[rows.length - 1];
  const pathChange = Math.max(...rows.map((r) => Math.abs(wrap(r.travel - before.travel))));
  check(`Loslassen (${tag}): Drift endet`, before.drift && !last.drift);
  check(`Loslassen (${tag}): Bewegungsrichtung bleibt erhalten (kein Einrasten)`, pathChange < 0.15, { aenderung_rad: +pathChange.toFixed(3) });
  check(`Loslassen (${tag}): Nase schwenkt zur Bewegungsrichtung zurück`, last.slipAngle < 0.08 && before.slipAngle > 0.15, { vorher: +before.slipAngle.toFixed(2), nachher: +last.slipAngle.toFixed(2) });
  const minV = Math.min(...rows.map((r) => r.v)), maxV = Math.max(...rows.map((r) => r.v));
  if (throttle) check('Loslassen (mit Gas): Tempo bricht nicht ein', minV >= before.v * 0.96, { vorher: +before.v.toFixed(1), min: +minV.toFixed(1) });
  else check('Loslassen (ohne Gas): kein Boost', maxV <= before.v * 1.005, { vorher: +before.v.toFixed(1), max: +maxV.toFixed(1) });
}

await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
