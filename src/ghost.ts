import * as THREE from 'three';
import { buildCarModel } from './car';

const SAMPLE_HZ = 30;
const STORAGE_KEY = 'racing-lab.ghost';

interface Stored { lap: number; s: number[] }

/** Zeichnet die Fahrspur der laufenden Runde auf und spielt die Bestrunde als durchsichtiges Auto ab */
export class Ghost {
  readonly mesh: THREE.Group;
  /** Bestrunde als flache Liste x, z, heading, x, z, heading … im Takt SAMPLE_HZ */
  private best: number[] | null = null;
  private bestLap: number | null = null;
  private rec: number[] = [];
  private nextSample = 0;

  constructor() {
    this.mesh = buildCarModel();
    this.mesh.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if (!m) return;
      m.transparent = true;
      m.opacity = Math.min(m.opacity, 0.3);
      m.depthWrite = false;
    });
    this.mesh.visible = false;
    this.load();
  }

  get hasData() { return this.best !== null; }
  get visible() { return this.mesh.visible; }
  /** Anzahl aufgezeichneter Stützpunkte der laufenden Runde (für Tests) */
  get recorded() { return this.rec.length / 3; }

  /** Gespeicherten Geist nur verwenden, wenn er zur aktuellen Bestzeit passt */
  validateAgainst(bestLap: number | null) {
    if (this.best && (bestLap === null || this.bestLap === null || Math.abs(this.bestLap - bestLap) > 1e-6)) {
      this.best = null;
      this.bestLap = null;
    }
  }

  beginLap() {
    this.rec = [];
    this.nextSample = 0;
  }

  /** pro Physikschritt aufrufen, solange eine Runde läuft */
  record(lapTime: number, x: number, z: number, heading: number) {
    while (this.nextSample <= lapTime) {
      this.rec.push(+x.toFixed(2), +z.toFixed(2), +heading.toFixed(3));
      this.nextSample += 1 / SAMPLE_HZ;
    }
  }

  /** Aufzeichnung der soeben beendeten Runde ist die neue Bestrunde */
  commit(lapTime: number) {
    this.best = this.rec.slice();
    this.bestLap = lapTime;
    try {
      const data: Stored = { lap: lapTime, s: this.best };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignorieren */ }
  }

  /** Geist an die Stelle setzen, an der er nach lapTime Sekunden war */
  show(lapTime: number, running: boolean) {
    const b = this.best;
    if (!running || !b || b.length < 6) { this.mesh.visible = false; return; }
    const f = lapTime * SAMPLE_HZ;
    const i = Math.floor(f);
    if (i >= b.length / 3 - 1) { this.mesh.visible = false; return; } // Geist ist schon im Ziel
    const t = f - i;
    const a = i * 3, c = a + 3;
    const dh = Math.atan2(Math.sin(b[c + 2] - b[a + 2]), Math.cos(b[c + 2] - b[a + 2]));
    this.mesh.position.set(b[a] + (b[c] - b[a]) * t, 0, b[a + 1] + (b[c + 1] - b[a + 1]) * t);
    this.mesh.rotation.y = b[a + 2] + dh * t;
    this.mesh.visible = true;
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Stored;
      if (Array.isArray(d.s) && d.s.length >= 6 && d.s.length % 3 === 0 && isFinite(d.lap)) {
        this.best = d.s;
        this.bestLap = d.lap;
      }
    } catch { /* kaputte Daten ignorieren */ }
  }
}
