import * as THREE from 'three';
import { Track, SAMPLES } from './track';
import { Car } from './car';
import { Input } from './input';
import { ChaseCamera } from './chaseCamera';
import { LapTimer } from './laps';
import { Hud } from './hud';
import { Effects } from './effects';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060f);
scene.fog = new THREE.Fog(0x05060f, 150, 600);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);

const track = new Track();
scene.add(track.group);

const car = new Car(track);
scene.add(car.mesh);

const input = new Input();
const effects = new Effects();
scene.add(effects.group);

const laps = new LapTimer(SAMPLES);
const hud = new Hud();
const chase = new ChaseCamera(camera);
chase.snap(car);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Feste Physik-Schrittweite, unabhängig von der Bildrate
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

renderer.setAnimationLoop((now) => {
  const frameDt = Math.min((now - last) / 1000, 0.1);
  last = now;
  acc += frameDt;
  while (acc >= STEP) {
    const controls = input.read();
    if (controls.reset) { car.reset(); effects.clear(); laps.reset(); chase.snap(car); hud.showBanner('Gas geben zum Start!', 1e9); }
    if (!laps.running && (controls.throttle || controls.brake)) { laps.start(); hud.hideBanner(); }
    car.update(controls, STEP);
    effects.update(car, controls.throttle, controls.brake, controls.handbrake, STEP);
    const before = laps.lapsDone;
    laps.update(car.trackIndex, STEP);
    if (laps.lapsDone > before) hud.lapCompleted(laps);
    acc -= STEP;
  }
  chase.update(car, frameDt);
  hud.update(car.speed, laps);
  renderer.render(scene, camera);
});

// Für automatisierte Tests im Browser
(window as unknown as { __game: unknown }).__game = { car, track, laps, effects };
