// Drift-Gefühl messen (deterministisch): Physik und Kamera werden im Browser in festen Schritten
// simuliert, unabhängig von der Bildrate. Misst, wie ruckartig der Drift beginnt und ob man das
// Auto schräg zur Kamera sieht.
// Aufruf: node tests/drift-feel.mjs [url] [-v]
import { launchBrowser } from './launch.mjs';
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
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
const deg = 180 / Math.PI;

const run = (speed, withDrift = true) => page.evaluate(([speed, withDrift]) => {
  const { car, track, chase } = window.__game;
  track.width = 100000;
  const p = track.points[5], t = track.tangents[5];
  car.x = p.x; car.z = p.z; car.heading = Math.atan2(t.x, t.z); car.vx = t.x * speed; car.vz = t.z * speed;
  car.steer = 0; car.drifting = false; car.exitT = 0; car.grip = 5; car.lastIndex = undefined;
  chase.snap(car);
  const DT = 1 / 120, rows = [];
  let n = 0;
  const step = (c) => {
    car.update(c, DT);
    if (++n % 2 === 0) chase.update(car, 2 * DT);           // Kamera mit 60 Hz
    rows.push({ t: n * DT, h: car.heading, tr: Math.atan2(car.vx, car.vz), cam: chase.heading, drift: car.drifting, v: Math.hypot(car.vx, car.vz) });
  };
  const steer = { steer: 1, throttle: true, brake: false, handbrake: false, reset: false };
  for (let i = 0; i < 48; i++) step(steer);                   // 0,4 s normales Lenken
  const driftStart = rows.length;
  steer.handbrake = withDrift;
  for (let i = 0; i < 180; i++) step(steer);                  // 1,5 s Drift
  return { rows, driftStart };
}, [speed, withDrift]);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const analyse = ({ rows, driftStart }) => {
  const rs = rows.slice(driftStart), t0 = rs[0].t;
  // größte Drehung innerhalb von 100 ms in den ersten 0,8 s (ab Driftstart)
  const maxIn100 = (key) => { let m = 0; for (let i = 0; i + 12 < rs.length && rs[i].t - t0 < 0.8; i++) m = Math.max(m, Math.abs(wrap(rs[i + 12][key] - rs[i][key]))); return m * deg; };
  const settled = rs.filter((r) => r.t - t0 > 0.6 && r.t - t0 < 1.2);
  const avg = (f) => settled.reduce((s, r) => s + f(r), 0) / settled.length * deg;
  return { rs, t0, nase: maxIn100('h'), kamera: maxIn100('cam'), bewegung: maxIn100('tr'), schraeg: avg((r) => Math.abs(wrap(r.h - r.cam))), nasezubew: avg((r) => Math.abs(wrap(r.h - r.tr))) };
};

for (const speed of [25, 40]) {
  const a = analyse(await run(speed));
  const ref = analyse(await run(speed, false)); // Referenz: gleiches Lenken ohne Drift
  if (verbose) for (let i = 0; i < a.rs.length; i += 18) console.log(`   ${speed} m/s +${String(Math.round((a.rs[i].t - a.t0) * 1000)).padStart(4)} ms  Nase ${(wrap(a.rs[i].h - a.rs[0].h) * deg).toFixed(0).padStart(4)}°  Bewegung ${(wrap(a.rs[i].tr - a.rs[0].tr) * deg).toFixed(0).padStart(4)}°  Kamera ${(wrap(a.rs[i].cam - a.rs[0].cam) * deg).toFixed(0).padStart(4)}°`);
  console.log(JSON.stringify({ tempo: speed, nase_max_pro_100ms: +a.nase.toFixed(1), kamera_max_pro_100ms: +a.kamera.toFixed(1), bewegung_max_pro_100ms: +a.bewegung.toFixed(1), auto_schraeg_zur_kamera: +a.schraeg.toFixed(1), nase_zur_bewegung: +a.nasezubew.toFixed(1), normal_nase: +ref.nase.toFixed(1), normal_kamera: +ref.kamera.toFixed(1) }));
  // Rückmeldung: "fühlt sich wie abruptes Lenken an". Vorher: Nase ~8,7°, Kamera ~6,4° pro 100 ms, Auto nur ~12° schräg im Bild.
  check(`${speed} m/s: Nase dreht im Drift nicht schneller als 1,5x normales Lenken`, a.nase <= ref.nase * 1.5, { drift: +a.nase.toFixed(1), normal: +ref.nase.toFixed(1) });
  check(`${speed} m/s: Kamera schwenkt ruhiger als beim normalen Lenken`, a.kamera <= ref.kamera * 0.9, { drift: +a.kamera.toFixed(1), normal: +ref.kamera.toFixed(1) });
  check(`${speed} m/s: Auto erscheint deutlich schräg zur Kamera (mindestens 20°)`, a.schraeg >= 20, { grad: +a.schraeg.toFixed(1) });
}
await browser.close();
if (errors.length) { console.error('Konsolenfehler:', errors); fails.push('Konsole'); }
process.exit(fails.length ? 1 : 0);
