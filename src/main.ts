import * as THREE from 'three';
import { Track } from './track';
import { Car } from './car';
import { Input } from './input';

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

// Vorläufige Übersichtskamera (wird in Schritt 4 durch die Verfolgerkamera ersetzt)
camera.position.set(0, 300, -60);
camera.lookAt(0, 0, -75);

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
  acc += Math.min((now - last) / 1000, 0.1);
  last = now;
  while (acc >= STEP) {
    const controls = input.read();
    if (controls.reset) car.reset();
    car.update(controls, STEP);
    acc -= STEP;
  }
  renderer.render(scene, camera);
});

// Für automatisierte Tests im Browser
(window as unknown as { __game: unknown }).__game = { car, track };
