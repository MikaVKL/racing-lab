import * as THREE from 'three';
import type { Controls } from './input';
import { TRACK_WIDTH, type Track } from './track';

// Fahrphysik-Parameter (Einheiten: Meter, Sekunden)
const ACCEL = 30;          // Vortrieb
const BRAKE = 45;          // Bremsverzögerung
const DRAG = 0.5;          // Luftwiderstand -> Höchstgeschwindigkeit ca. ACCEL/DRAG = 60 m/s
const REVERSE_MAX = 14;
const STEER_RATE = 2.4;    // rad/s bei voller Lenkung (bei niedrigem Tempo)
const GRIP = 5.0;          // wie schnell Querbewegung abgebaut wird (kleiner = rutschiger)
const GRIP_HANDBRAKE = 1.2;
const OFFTRACK_DRAG = 2.2; // zusätzliche Reibung im Gelände
const CAR_HALF_WIDTH = 1;

export class Car {
  readonly mesh = new THREE.Group();
  x = 0;
  z = 0;
  heading = 0;
  vx = 0;
  vz = 0;
  /** aktuelle Lenkung (geglättet) */
  steer = 0;
  /** Slip-Winkel-Maß: Querkomponente der Geschwindigkeit */
  slip = 0;
  offTrack = false;
  /** Index der nächsten Streckenstützstelle (für Rundenzählung) */
  trackIndex = 0;
  private body: THREE.Group;
  private lastIndex: number | undefined;

  constructor(private track: Track) {
    this.body = buildCarModel();
    this.mesh.add(this.body);
    this.reset();
  }

  get speed() { return Math.hypot(this.vx, this.vz); }

  reset() {
    const s = this.track.start;
    this.x = s.position.x;
    this.z = s.position.z;
    this.heading = s.heading;
    this.vx = this.vz = 0;
    this.steer = 0;
    this.slip = 0;
    this.lastIndex = undefined; // volle Suche nach dem Teleport
    this.syncMesh(0);
  }

  update(c: Controls, dt: number) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;

    // Lenkung sanft aufbauen/zurückführen
    const target = c.steer;
    const rate = target === 0 ? 8 : 5;
    this.steer += Math.sign(target - this.steer) * Math.min(Math.abs(target - this.steer), rate * dt);

    // Längsdynamik
    if (c.throttle) vf += ACCEL * dt;
    if (c.brake) vf -= (vf > 0.5 ? BRAKE : ACCEL * 0.6) * dt;
    if (!c.throttle && !c.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt); // Rollreibung
    vf *= Math.exp(-DRAG * dt * (vf > 0 ? 1 : 0.5));
    vf = Math.max(vf, -REVERSE_MAX);

    // Offroad-Bremsung
    const q = this.track.query(this.x, this.z, this.lastIndex);
    this.lastIndex = q.index;
    this.trackIndex = q.index;
    this.offTrack = q.distance > TRACK_WIDTH / 2 + CAR_HALF_WIDTH;
    if (this.offTrack) {
      const k = Math.exp(-OFFTRACK_DRAG * dt);
      vf *= k; vr *= k;
    }

    // Seitengrip: nur begrenzt, dadurch rutscht das Auto in Kurven leicht
    const grip = c.handbrake ? GRIP_HANDBRAKE : GRIP;
    vr *= Math.exp(-grip * dt);

    // Gierrate: bei Stillstand keine Drehung, bei hohem Tempo etwas weniger Lenkeinschlag
    const speedFactor = Math.min(Math.abs(vf) / 8, 1) / (1 + Math.abs(vf) / 30);
    const dir = vf >= 0 ? 1 : -1;
    this.heading += this.steer * STEER_RATE * speedFactor * dir * dt;

    // zurück in Weltkoordinaten – mit der Basis VOR der Drehung: Das Heading dreht sich,
    // die Geschwindigkeit bleibt zunächst erhalten und wird nur über den Grip abgebaut -> Rutschen
    this.vx = fx * vf + rx * vr;
    this.vz = fz * vf + rz * vr;

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.slip = this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading);
    this.syncMesh(dt);
  }

  private roll = 0;

  private syncMesh(dt: number) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // leichtes Wanken in Kurven + Ausrichtung des Hecks beim Rutschen
    const targetRoll = THREE.MathUtils.clamp(-this.slip * 0.012, -0.12, 0.12);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8);
    this.body.rotation.z = this.roll;
  }
}

export function buildCarModel(): THREE.Group {
  const g = new THREE.Group();
  const darkMat = new THREE.MeshBasicMaterial({ color: 0x0a0c20 });
  const edgeCyan = new THREE.LineBasicMaterial({ color: 0x00ffe1 });
  const edgeMagenta = new THREE.LineBasicMaterial({ color: 0xff2bd6 });

  const addBox = (w: number, h: number, d: number, x: number, y: number, z: number, edge: THREE.LineBasicMaterial) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, darkMat);
    m.position.set(x, y, z);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
    g.add(m);
    return m;
  };

  addBox(1.9, 0.5, 4.2, 0, 0.55, 0, edgeCyan);       // Chassis
  addBox(1.4, 0.45, 1.8, 0, 0.98, -0.3, edgeCyan);   // Kabine
  addBox(2.1, 0.08, 0.7, 0, 1.0, -2.0, edgeMagenta); // Heckflügel
  // Räder
  for (const sx of [-1, 1]) for (const sz of [-1.3, 1.4]) {
    addBox(0.35, 0.8, 0.8, sx * 1.05, 0.4, sz, edgeMagenta);
  }
  // Rücklichter und Scheinwerfer
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2040 });
  const head = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.05), tail);
    t.position.set(sx, 0.65, -2.12);
    g.add(t);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.05), head);
    h.position.set(sx, 0.6, 2.12);
    g.add(h);
  }
  // Neon-Schimmer unter dem Auto
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5),
    new THREE.MeshBasicMaterial({ color: 0x00ffe1, transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  g.add(glow);
  return g;
}
