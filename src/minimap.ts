import type { Track } from './track';
import type { TrackDef } from './tracks';

const SIZE = 150;   // CSS-Pixel
const PADDING = 10;

/** Minikarte oben rechts: Streckenumriss, Auto (Pfeil) und Geisterauto (Punkt) */
export class Minimap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private outline: HTMLCanvasElement;
  private scale = 1;
  private ox = 0;
  private oz = 0;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor(track: Track, def: TrackDef) {
    const style = document.createElement('style');
    style.textContent = `
      #minimap { position: fixed; top: 16px; right: 16px; width: ${SIZE}px; height: ${SIZE}px; pointer-events: none;
        background: rgba(5,6,15,.55); border: 1px solid rgba(0,255,225,.45); border-radius: 6px; }
      @media (max-width: 600px) { #minimap { width: 100px; height: 100px; } }
    `;
    document.head.appendChild(style);

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.canvas.width = this.canvas.height = SIZE * this.dpr;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Umriss einmal vorzeichnen
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of track.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const inner = SIZE - PADDING * 2;
    this.scale = inner / Math.max(maxX - minX, maxZ - minZ);
    this.ox = PADDING + (inner - (maxX - minX) * this.scale) / 2 - minX * this.scale;
    this.oz = PADDING + (inner - (maxZ - minZ) * this.scale) / 2 - minZ * this.scale;

    this.outline = document.createElement('canvas');
    this.outline.width = this.outline.height = SIZE * this.dpr;
    const g = this.outline.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    g.lineJoin = 'round';
    const path = () => {
      g.beginPath();
      track.points.forEach((p, i) => (i ? g.lineTo(this.mx(p.x), this.mz(p.z)) : g.moveTo(this.mx(p.x), this.mz(p.z))));
      g.closePath();
    };
    g.strokeStyle = '#0d1024'; g.lineWidth = 6; path(); g.stroke();
    g.strokeStyle = '#' + def.edgeRight.toString(16).padStart(6, '0'); g.lineWidth = 3.5; path(); g.stroke();
    g.strokeStyle = '#0d1024'; g.lineWidth = 1.5; path(); g.stroke();
    // Start/Ziel
    const s = track.points[0];
    g.fillStyle = '#fff';
    g.fillRect(this.mx(s.x) - 3, this.mz(s.z) - 3, 6, 6);
  }

  private mx(x: number) { return x * this.scale + this.ox; }
  private mz(z: number) { return z * this.scale + this.oz; }

  update(car: { x: number; z: number; heading: number }, ghost: { x: number; z: number } | null) {
    const g = this.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(this.outline, 0, 0);
    g.scale(this.dpr, this.dpr);

    if (ghost) {
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.beginPath(); g.arc(this.mx(ghost.x), this.mz(ghost.z), 3, 0, Math.PI * 2); g.fill();
    }
    // Auto als Pfeil in Fahrtrichtung (Karte: x nach rechts, z nach unten)
    const cx = this.mx(car.x), cz = this.mz(car.z);
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    g.fillStyle = '#ff2bd6';
    g.shadowColor = '#ff2bd6'; g.shadowBlur = 6;
    g.beginPath();
    g.moveTo(cx + fx * 6, cz + fz * 6);
    g.lineTo(cx - fx * 4 + fz * 4, cz - fz * 4 - fx * 4);
    g.lineTo(cx - fx * 4 - fz * 4, cz - fz * 4 + fx * 4);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
  }
}
