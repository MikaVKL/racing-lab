import * as THREE from 'three';
import type { Controls } from './input';
import type { Track } from './track';

// Fahrphysik-Parameter (Einheiten: Meter, Sekunden)
const ACCEL = 30;          // Vortrieb
const BRAKE = 45;          // Bremsverzögerung
const DRAG = 0.5;          // Luftwiderstand -> Höchstgeschwindigkeit ca. ACCEL/DRAG = 60 m/s
const REVERSE_MAX = 14;
const STEER_RATE = 2.4;    // rad/s bei voller Lenkung (bei niedrigem Tempo)
const GRIP = 5.0;          // wie schnell Querbewegung abgebaut wird (kleiner = rutschiger)
const GRIP_RECOVERY = 3.0; // Grip-Aufbau nach dem Drift (Einheiten pro Sekunde)
const GRIP_EXIT = 0.8;     // Grip direkt nach dem Drift: die Bewegungsrichtung bleibt erhalten
const OFFTRACK_DRAG = 2.2; // zusätzliche Reibung im Gelände
const CAR_HALF_WIDTH = 1;

// Drift (Leertaste + Lenken), angelehnt an Mario Kart: eigener Zustand mit festem Bogen,
// die Nase zeigt nach innen; beim Loslassen schwenkt sie zur Bewegungsrichtung zurück (kein Boost)
const DRIFT_MIN_SPEED = 12;     // m/s, darunter kein Drift
const DRIFT_STEER_MIN = 0.2;    // nötige Lenkung zum Start
const DRIFT_TURN_BASE = 1.0;    // Drehrate der Bewegungsrichtung relativ zum normalen Lenken (neutral)
const DRIFT_TURN_STEER = 0.5;   // +/- je nach Lenken mit (+) oder gegen (-) die Driftrichtung
const DRIFT_ANGLE = 0.38;       // rad: um so viel eilt die Nase der Bewegungsrichtung nach innen voraus
const DRIFT_ANGLE_STEER = 0.2;  // +/- je nach Lenken
const DRIFT_HEADING_FOLLOW = 10; // 1/s: wie schnell die Nase ihren Winkel einnimmt
const DRIFT_SPEED_LOSS = 0.1;   // 1/s: leichter Tempoverlust im Drift
const EXIT_ALIGN = 9;           // 1/s: Nase schwenkt nach dem Drift zur Bewegungsrichtung
const EXIT_TIME = 0.5;          // s
const HOP_TIME = 0.28;          // s: kleiner Hüpfer beim Driftstart
const HOP_HEIGHT = 0.45;        // m

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Lenkwirkung: bei Stillstand keine Drehung, bei hohem Tempo etwas weniger Einschlag */
const turnFactor = (speed: number) => Math.min(Math.abs(speed) / 8, 1) / (1 + Math.abs(speed) / 30);

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
  /** aktueller Seitengrip (nach dem Drift niedrig, steigt dann allmählich) */
  grip = GRIP;
  /** true, solange der Drift läuft */
  drifting = false;
  /** Driftrichtung: +1 links, -1 rechts */
  driftDir = 0;
  private travel = 0;     // Bewegungsrichtung im Drift (rad)
  private exitT = 0;      // Restzeit, in der die Nase nach dem Drift zur Bewegungsrichtung schwenkt
  private hopT = 0;
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
    this.grip = GRIP;
    this.drifting = false;
    this.driftDir = 0;
    this.exitT = 0;
    this.hopT = 0;
    this.lastIndex = undefined; // volle Suche nach dem Teleport
    this.syncMesh(0);
  }

  update(c: Controls, dt: number) {
    // Lenkung sanft aufbauen/zurückführen
    const target = c.steer;
    const rate = target === 0 ? 8 : 5;
    this.steer += Math.sign(target - this.steer) * Math.min(Math.abs(target - this.steer), rate * dt);

    // Streckenposition und Offroad-Erkennung
    const q = this.track.query(this.x, this.z, this.lastIndex);
    this.lastIndex = q.index;
    this.trackIndex = q.index;
    this.offTrack = q.distance > this.track.width / 2 + CAR_HALF_WIDTH;

    this.updateDriftState(c);
    if (this.drifting) this.updateDrift(c, dt);
    else this.updateNormal(c, dt);

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.slip = this.vx * Math.cos(this.heading) - this.vz * Math.sin(this.heading);
    if (this.hopT > 0) this.hopT = Math.max(0, this.hopT - dt);
    this.syncMesh(dt);
  }

  /** Drift beginnt mit Leertaste + Lenken bei genug Tempo und endet beim Loslassen */
  private updateDriftState(c: Controls) {
    const forward = this.vx * Math.sin(this.heading) + this.vz * Math.cos(this.heading);
    const can = c.handbrake && !this.offTrack && forward > DRIFT_MIN_SPEED;
    if (!this.drifting) {
      if (can && Math.abs(this.steer) > DRIFT_STEER_MIN) {
        this.drifting = true;
        this.driftDir = Math.sign(this.steer);
        this.travel = Math.atan2(this.vx, this.vz);
        this.hopT = HOP_TIME;
        this.exitT = 0;
      }
    } else if (!can) {
      // Drift beendet: Bewegungsrichtung bleibt, die Nase schwenkt dorthin zurück
      this.drifting = false;
      this.exitT = EXIT_TIME;
      this.grip = GRIP_EXIT;
    }
  }

  /** Drift: fester Bogen, Nase zeigt nach innen, Lenken macht den Bogen enger oder weiter */
  private updateDrift(c: Controls, dt: number) {
    let s = this.speed;
    if (c.throttle) s += ACCEL * dt;
    if (c.brake) s -= BRAKE * dt;
    if (!c.throttle && !c.brake) s -= Math.min(s, 4 * dt);
    s *= Math.exp(-(DRAG + DRIFT_SPEED_LOSS) * dt);
    if (this.offTrack) s *= Math.exp(-OFFTRACK_DRAG * dt);
    s = Math.max(s, 0);

    const along = this.steer * this.driftDir; // -1 gegen, +1 mit der Driftrichtung
    const turn = STEER_RATE * turnFactor(s) * (DRIFT_TURN_BASE + DRIFT_TURN_STEER * along);
    this.travel += this.driftDir * turn * dt;

    const noseTarget = this.travel + this.driftDir * (DRIFT_ANGLE + DRIFT_ANGLE_STEER * along);
    this.heading += wrapAngle(noseTarget - this.heading) * (1 - Math.exp(-DRIFT_HEADING_FOLLOW * dt));

    this.vx = s * Math.sin(this.travel);
    this.vz = s * Math.cos(this.travel);
  }

  /** Normales Fahren: Auto dreht sich, Geschwindigkeit folgt über den Seitengrip (leichtes Rutschen) */
  private updateNormal(c: Controls, dt: number) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    let vf = this.vx * fx + this.vz * fz;
    let vr = this.vx * rx + this.vz * rz;

    // Längsdynamik
    if (c.throttle) vf += ACCEL * dt;
    if (c.brake) vf -= (vf > 0.5 ? BRAKE : ACCEL * 0.6) * dt;
    if (!c.throttle && !c.brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 4 * dt); // Rollreibung
    vf *= Math.exp(-DRAG * dt * (vf > 0 ? 1 : 0.5));
    vf = Math.max(vf, -REVERSE_MAX);

    if (this.offTrack) {
      const k = Math.exp(-OFFTRACK_DRAG * dt);
      vf *= k; vr *= k;
    }

    // Seitengrip: nur begrenzt, dadurch rutscht das Auto in Kurven leicht. Nach dem Drift startet er niedrig
    // und baut sich allmählich auf, damit die Bewegungsrichtung nicht schlagartig zur Blickrichtung springt.
    this.grip = Math.min(GRIP, this.grip + GRIP_RECOVERY * dt);
    vr *= Math.exp(-this.grip * dt);

    // Gierrate
    const dir = vf >= 0 ? 1 : -1;
    this.heading += this.steer * STEER_RATE * turnFactor(vf) * dir * dt;

    // nach dem Drift: Nase schwenkt zur Bewegungsrichtung zurück (statt dass die Bewegung zur Nase springt)
    if (this.exitT > 0) {
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 1) this.heading += wrapAngle(Math.atan2(this.vx, this.vz) - this.heading) * (1 - Math.exp(-EXIT_ALIGN * dt));
      this.exitT = Math.max(0, this.exitT - dt);
    }

    // zurück in Weltkoordinaten – mit der Basis VOR der Drehung: Das Heading dreht sich,
    // die Geschwindigkeit bleibt zunächst erhalten und wird nur über den Grip abgebaut -> Rutschen
    this.vx = fx * vf + rx * vr;
    this.vz = fz * vf + rz * vr;
  }

  private roll = 0;

  private syncMesh(dt: number) {
    const hop = this.hopT > 0 ? HOP_HEIGHT * Math.sin(Math.PI * (1 - this.hopT / HOP_TIME)) : 0;
    this.mesh.position.set(this.x, hop, this.z);
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
