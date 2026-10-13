import * as THREE from 'three';
import { Track } from './track';

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

// Vorläufige Übersichtskamera (wird in Schritt 4 durch die Verfolgerkamera ersetzt)
camera.position.set(0, 300, -60);
camera.lookAt(0, 0, -75);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
