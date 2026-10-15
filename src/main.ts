import * as THREE from 'three';
import { Track, SAMPLES } from './track';
import { findTrack, nextTrack } from './tracks';
import { Car } from './car';
import { Input } from './input';
import { ChaseCamera } from './chaseCamera';
import { LapTimer } from './laps';
import { Hud } from './hud';
import { Effects } from './effects';
import { Sound } from './audio';
import { Ghost } from './ghost';
import { Minimap } from './minimap';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.Fog(0x05060f, 150, 600);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);

// Strecke: ?track=<id> (nur für diesen Aufruf) oder zuletzt mit T gewählte
const TRACK_KEY = 'racing-lab.track';
const savedTrack = (() => { try { return localStorage.getItem(TRACK_KEY); } catch { return null; } })();
const trackDef = findTrack(new URLSearchParams(location.search).get('track') ?? savedTrack);
const track = new Track(trackDef);
scene.add(track.group);

const car = new Car(track);
scene.add(car.mesh);

const input = new Input();
const sound = new Sound();
const effects = new Effects();
scene.add(effects.group);

const laps = new LapTimer(SAMPLES, trackDef.id);
const ghost = new Ghost(trackDef.id);
ghost.validateAgainst(laps.bestLap);
scene.add(ghost.mesh);
let serial = laps.lapSerial;
const hud = new Hud(trackDef.name);
const minimap = new Minimap(track, trackDef);
const chase = new ChaseCamera(camera);
chase.snap(car);

// Browser erlauben Ton erst nach einer Nutzeraktion; M schaltet stumm
addEventListener('keydown', (e) => {
  sound.start();
  if (e.code === 'KeyM' && !e.repeat) hud.setMuted(sound.toggleMute());
  if (e.code === 'KeyT' && !e.repeat) {
    // nächste Strecke: Wahl merken und neu laden (Bestzeiten und Geist gehören pro Strecke)
    try { localStorage.setItem(TRACK_KEY, nextTrack(trackDef.id).id); } catch { /* ignorieren */ }
    location.assign(location.pathname);
  }
});
addEventListener('pointerdown', () => sound.start());
hud.setMuted(sound.muted);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Feste Physik-Schrittweite, unabhängig von der Bildrate
const STEP = 1 / 120;
const COUNTDOWN_SECONDS = 3;
// Testhook: ohne Countdown, Zeit startet mit dem ersten Gasgeben (wie in den Schritten 1–10)
const legacyStart = (window as unknown as { __NO_COUNTDOWN?: boolean }).__NO_COUNTDOWN === true;
let acc = 0;
let controls = input.read();
let last = performance.now();
let countdownLeft = 0;
let shownCount = -1;
let paused = false;
let wrongWayTime = 0;   // Sekunden am Stück entgegen der Fahrtrichtung
let wrongWay = false;

function beginRace() {
  car.reset(); effects.clear(); laps.reset(); ghost.beginLap(); chase.snap(car);
  if (legacyStart) { countdownLeft = 0; hud.showBanner('Gas geben zum Start!', 1e9); return; }
  countdownLeft = COUNTDOWN_SECONDS;
  shownCount = -1;
}

function setPaused(p: boolean) {
  if (paused === p) return;
  paused = p;
  sound.setPaused(p);
  if (p) hud.showBanner('PAUSE\nP oder Esc zum Fortsetzen', 1e9);
  else { input.read(); hud.hideBanner(); shownCount = -1; last = performance.now(); } // Tasten aus der Pause verwerfen
}

addEventListener('keydown', (e) => {
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) setPaused(!paused);
});
// Tab-Wechsel oder Fenster verloren: automatisch pausieren (Zeitnahme läuft sonst weiter)
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

beginRace();

renderer.setAnimationLoop((now) => {
  const frameDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (paused) input.read(); // Tasten während der Pause verwerfen (z. B. R)
  else acc += frameDt;
  while (acc >= STEP) {
    controls = input.read();
    if (controls.reset) { beginRace(); wrongWayTime = 0; wrongWay = false; }

    if (countdownLeft > 0) {
      // Auto steht, bis der Countdown abgelaufen ist
      countdownLeft -= STEP;
      const n = Math.ceil(countdownLeft);
      if (countdownLeft > 0 && n !== shownCount) { shownCount = n; hud.showBanner(String(n), 1e9, true); }
      if (countdownLeft <= 0) { laps.start(); hud.showBanner('GO!', 900, true); }
    } else {
      if (legacyStart && !laps.running && (controls.throttle || controls.brake)) { laps.start(); hud.hideBanner(); }
      car.update(controls, STEP);
      effects.update(car, controls.brake, STEP);
      const before = laps.lapsDone;
      laps.update(car.trackIndex, STEP);
      // Falsche Richtung: Bewegung entgegen der Streckenrichtung (Rückwärts-Rangieren in Fahrtrichtung zählt nicht)
      const tg = track.tangents[car.trackIndex];
      const along = car.vx * tg.x + car.vz * tg.z;
      wrongWayTime = car.speed > 6 && along < -0.3 * car.speed ? wrongWayTime + STEP : 0;
      wrongWay = wrongWayTime > 0.8;
      if (laps.running) ghost.record(laps.currentLap, car.x, car.z, car.heading);
      if (laps.lapsDone > before) {
        hud.lapCompleted(laps);
        if (laps.newBest && laps.lastLap !== null) ghost.commit(laps.lastLap);
      }
    }
    if (laps.lapSerial !== serial) { serial = laps.lapSerial; ghost.beginLap(); }
    acc -= STEP;
  }
  if (!paused) chase.update(car, frameDt);
  sound.update(car.speed, controls.throttle, effects.skidding, car.offTrack);
  ghost.show(laps.currentLap, laps.running);
  hud.setWrongWay(wrongWay && !paused);
  minimap.update(car, ghost.visible ? { x: ghost.mesh.position.x, z: ghost.mesh.position.z } : null);
  hud.update(car.speed, laps);
  renderer.render(scene, camera);
});

// Für automatisierte Tests im Browser
(window as unknown as { __game: unknown }).__game = { car, track, laps, effects, sound, ghost, trackDef, chase, state: () => ({ countdownLeft, paused, wrongWay }) };
