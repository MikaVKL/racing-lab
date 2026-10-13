import * as THREE from 'three';
import type { Car } from './car';

const MAX_MARKS = 1600;      // Ringpuffer für Reifenspuren
const MARK_SPACING = 0.7;    // Abstand zwischen zwei Spurstücken (m)
const MAX_SMOKE = 60;
const SLIP_THRESHOLD = 3.5;  // Querkomponente (m/s), ab der die Reifen "quietschen"
const WHEEL_X = 1.05;
const REAR_Z = -1.3;

/** Reifenspuren und Qualm beim Driften, Bremsen und Handbremse */
export class Effects {
  readonly group = new THREE.Group();
  /** Anzahl bisher gesetzter Spurstücke (für Tests) */
  marksPlaced = 0;
  /** aktuell sichtbare Rauchpartikel (für Tests) */
  get smokeActive() { return this.smoke.filter((s) => s.life > 0).length; }
  /** true, solange die Reifen gerade durchdrehen/rutschen */
  skidding = false;

  private marks: THREE.InstancedMesh;
  private markIdx = 0;
  private dist = 0;
  private lastX = NaN;
  private lastZ = NaN;
  private smoke: { sprite: THREE.Sprite; life: number; vy: number }[] = [];
  private smokeIdx = 0;
  private smokeTimer = 0;
  private tmp = new THREE.Object3D();

  constructor() {
    const geo = new THREE.PlaneGeometry(0.35, 0.9);
    geo.rotateX(-Math.PI / 2);
    this.marks = new THREE.InstancedMesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x7a5cff, transparent: true, opacity: 0.55 }),
      MAX_MARKS,
    );
    this.marks.frustumCulled = false;
    // alle Instanzen unsichtbar unter den Boden legen
    this.tmp.position.set(0, -10, 0);
    this.tmp.updateMatrix();
    for (let i = 0; i < MAX_MARKS; i++) this.marks.setMatrixAt(i, this.tmp.matrix);
    this.group.add(this.marks);

    const tex = makeSmokeTexture();
    for (let i = 0; i < MAX_SMOKE; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: 0x9fb4ff, transparent: true, opacity: 0, depthWrite: false }),
      );
      sprite.visible = false;
      this.group.add(sprite);
      this.smoke.push({ sprite, life: 0, vy: 0 });
    }
  }

  update(car: Car, throttle: boolean, brake: boolean, handbrake: boolean, dt: number) {
    const sideSlip = Math.abs(car.slip);
    const braking = brake && car.speed > 15;
    const burnout = handbrake && car.speed > 8;
    this.skidding = !car.offTrack && (sideSlip > SLIP_THRESHOLD || braking || burnout);

    if (this.skidding) {
      const moved = Math.hypot(car.x - this.lastX, car.z - this.lastZ);
      this.dist += isFinite(moved) ? moved : 0;
      while (this.dist >= MARK_SPACING) {
        this.dist -= MARK_SPACING;
        this.placeMarks(car);
      }
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.05;
        this.emitSmoke(car, Math.min(1, sideSlip / 10 + (braking || burnout ? 0.4 : 0)));
      }
    } else {
      this.dist = 0;
    }
    this.lastX = car.x;
    this.lastZ = car.z;

    for (const s of this.smoke) {
      if (s.life <= 0) continue;
      s.life -= dt;
      const t = Math.max(s.life, 0) / 0.9; // 1 -> 0
      s.sprite.position.y += s.vy * dt;
      s.sprite.scale.setScalar(1.2 + (1 - t) * 3.2);
      s.sprite.material.opacity = t * 0.35;
      if (s.life <= 0) s.sprite.visible = false;
    }
  }

  /** alles zurücksetzen (Neustart) */
  clear() {
    this.tmp.position.set(0, -10, 0);
    this.tmp.rotation.set(0, 0, 0);
    this.tmp.updateMatrix();
    for (let i = 0; i < MAX_MARKS; i++) this.marks.setMatrixAt(i, this.tmp.matrix);
    this.marks.instanceMatrix.needsUpdate = true;
    this.marksPlaced = 0;
    this.markIdx = 0;
    for (const s of this.smoke) { s.life = 0; s.sprite.visible = false; }
  }

  private wheelPos(car: Car, side: number) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
    return {
      x: car.x + rx * WHEEL_X * side + fx * REAR_Z,
      z: car.z + rz * WHEEL_X * side + fz * REAR_Z,
    };
  }

  private placeMarks(car: Car) {
    // Spur zeigt in Bewegungsrichtung, nicht in Blickrichtung des Autos
    const angle = car.speed > 1 ? Math.atan2(car.vx, car.vz) : car.heading;
    for (const side of [-1, 1]) {
      const p = this.wheelPos(car, side);
      this.tmp.position.set(p.x, 0.06, p.z);
      this.tmp.rotation.set(0, angle, 0);
      this.tmp.updateMatrix();
      this.marks.setMatrixAt(this.markIdx, this.tmp.matrix);
      this.markIdx = (this.markIdx + 1) % MAX_MARKS;
      this.marksPlaced++;
    }
    this.marks.instanceMatrix.needsUpdate = true;
  }

  private emitSmoke(car: Car, strength: number) {
    for (const side of [-1, 1]) {
      const s = this.smoke[this.smokeIdx];
      this.smokeIdx = (this.smokeIdx + 1) % MAX_SMOKE;
      const p = this.wheelPos(car, side);
      s.sprite.position.set(p.x + (Math.random() - 0.5) * 0.4, 0.4, p.z + (Math.random() - 0.5) * 0.4);
      s.sprite.visible = true;
      s.life = 0.9 * (0.6 + 0.4 * strength);
      s.vy = 1.2 + Math.random() * 0.8;
    }
  }
}

function makeSmokeTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
