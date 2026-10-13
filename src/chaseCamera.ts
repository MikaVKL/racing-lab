import * as THREE from 'three';
import type { Car } from './car';

const DISTANCE = 9;   // Abstand hinter dem Auto
const HEIGHT = 4.2;   // Höhe über dem Boden
const LOOK_AHEAD = 7; // Blickpunkt vor dem Auto
const FOV_MIN = 66;
const FOV_MAX = 88;

export class ChaseCamera {
  private heading = 0;
  private pos = new THREE.Vector3();
  private target = new THREE.Vector3();
  private initialised = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  /** Sofort hinter das Auto setzen (Start/Reset) */
  snap(car: Car) { this.initialised = false; this.update(car, 1); }

  update(car: Car, dt: number) {
    // Kamera-Richtung folgt dem Heading zeitverzögert -> beim Rutschen sieht man die Seite des Autos
    const diff = Math.atan2(Math.sin(car.heading - this.heading), Math.cos(car.heading - this.heading));
    this.heading = this.initialised ? this.heading + diff * Math.min(1, dt * 4) : car.heading;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const wantPos = new THREE.Vector3(car.x - fx * DISTANCE, HEIGHT, car.z - fz * DISTANCE);
    const wantTarget = new THREE.Vector3(car.x + fx * LOOK_AHEAD, 1.2, car.z + fz * LOOK_AHEAD);

    if (!this.initialised) {
      this.pos.copy(wantPos);
      this.target.copy(wantTarget);
      this.initialised = true;
    } else {
      const k = Math.min(1, dt * 8);
      this.pos.lerp(wantPos, k);
      this.target.lerp(wantTarget, k);
    }
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);

    const fov = FOV_MIN + (FOV_MAX - FOV_MIN) * Math.min(car.speed / 60, 1);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 3);
      this.camera.updateProjectionMatrix();
    }
  }
}
