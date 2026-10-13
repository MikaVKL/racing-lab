import * as THREE from 'three';

export const TRACK_WIDTH = 16;
const SAMPLES = 800;

// Kontrollpunkte (x, z) der geschlossenen Strecke – Start/Ziel liegt auf der Geraden bei Punkt 0.
const CONTROL: [number, number][] = [
  [0, 0], [60, 0], [120, -10], [165, -50], [160, -110], [110, -140],
  [60, -120], [30, -150], [-20, -185], [-80, -170], [-105, -120],
  [-80, -70], [-110, -30], [-70, 15], [-30, 10],
];

export interface TrackQuery {
  /** Index der nächstgelegenen Stützstelle */
  index: number;
  /** vorzeichenbehafteter Seitenabstand zur Mittellinie (positiv = links der Fahrtrichtung) */
  lateral: number;
  /** Abstand zur Mittellinie (Betrag) */
  distance: number;
  /** Fortschritt entlang der Strecke 0..1 */
  progress: number;
}

export class Track {
  readonly points: THREE.Vector3[];
  readonly tangents: THREE.Vector3[];
  readonly length: number;
  readonly group = new THREE.Group();

  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CONTROL.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'catmullrom',
      0.5,
    );
    this.length = curve.getLength();
    this.points = curve.getSpacedPoints(SAMPLES).slice(0, SAMPLES);
    this.tangents = this.points.map((p, i) => {
      const next = this.points[(i + 1) % SAMPLES];
      return next.clone().sub(p).setY(0).normalize();
    });
    this.buildMeshes();
  }

  /** Links-Normale (in Fahrtrichtung gesehen) bei Stützstelle i */
  normal(i: number): THREE.Vector3 {
    const t = this.tangents[i % SAMPLES];
    return new THREE.Vector3(t.z, 0, -t.x);
  }

  /** Startposition und Blickwinkel (Rotation um Y; Fahrtrichtung = (sin a, cos a)) */
  get start() {
    const t = this.tangents[0];
    return { position: this.points[0].clone(), heading: Math.atan2(t.x, t.z) };
  }

  query(x: number, z: number, hint?: number): TrackQuery {
    let best = 0;
    let bestD = Infinity;
    const check = (i: number) => {
      const p = this.points[i];
      const d = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    };
    if (hint === undefined) {
      for (let i = 0; i < SAMPLES; i++) check(i);
    } else {
      // lokale Suche um den letzten Treffer (schnell und verwechselt keine Streckenteile)
      for (let k = -40; k <= 40; k++) check((hint + k + SAMPLES) % SAMPLES);
    }
    const p = this.points[best];
    const n = this.normal(best);
    const lateral = (x - p.x) * n.x + (z - p.z) * n.z;
    return { index: best, lateral, distance: Math.abs(lateral), progress: best / SAMPLES };
  }

  private buildMeshes() {
    const half = TRACK_WIDTH / 2;
    const edge = 0.5; // Breite der Neon-Randlinien

    const ribbon = (offsetIn: number, offsetOut: number, y: number, material: THREE.Material) => {
      const pos: number[] = [];
      const idx: number[] = [];
      for (let i = 0; i <= SAMPLES; i++) {
        const p = this.points[i % SAMPLES];
        const n = this.normal(i);
        pos.push(
          p.x + n.x * offsetIn, y, p.z + n.z * offsetIn,
          p.x + n.x * offsetOut, y, p.z + n.z * offsetOut,
        );
        if (i < SAMPLES) {
          const a = i * 2;
          idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return new THREE.Mesh(g, material);
    };

    // Fahrbahn (von links nach rechts gewickelt, damit die Normale nach oben zeigt)
    const asphalt = new THREE.MeshBasicMaterial({ color: 0x0d1024, side: THREE.DoubleSide });
    this.group.add(ribbon(-half, half, 0.02, asphalt));

    // Neon-Ränder: links magenta, rechts cyan
    const magenta = new THREE.MeshBasicMaterial({ color: 0xff2bd6, side: THREE.DoubleSide });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x00ffe1, side: THREE.DoubleSide });
    this.group.add(ribbon(half - edge, half, 0.05, magenta));
    this.group.add(ribbon(-half, -half + edge, 0.05, cyan));

    // gestrichelte Mittellinie
    const dash = new THREE.MeshBasicMaterial({ color: 0x3b4a8a, side: THREE.DoubleSide });
    for (let i = 0; i < SAMPLES; i += 16) {
      const a = i, b = Math.min(i + 6, SAMPLES - 1);
      const pa = this.points[a], pb = this.points[b];
      const len = pa.distanceTo(pb);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.4, len), dash);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.atan2(-(pb.x - pa.x), -(pb.z - pa.z)) + Math.PI;
      m.position.set((pa.x + pb.x) / 2, 0.04, (pa.z + pb.z) / 2);
      this.group.add(m);
    }

    // Start/Ziel-Linie (Schachbrett)
    const s = this.start;
    const rows = 2, cols = 8, cell = TRACK_WIDTH / cols;
    const dark = new THREE.MeshBasicMaterial({ color: 0x05060f });
    const light = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const n0 = this.normal(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(cell, cell), (r + c) % 2 ? dark : light);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = -s.heading;
        const lat = -half + cell * (c + 0.5);
        const along = (r - 0.5) * cell;
        m.position.set(
          s.position.x + n0.x * lat + this.tangents[0].x * along,
          0.07,
          s.position.z + n0.z * lat + this.tangents[0].z * along,
        );
        this.group.add(m);
      }
    }

    // Boden-Raster
    const grid = new THREE.GridHelper(1200, 120, 0x1a2a6c, 0x101a44);
    grid.position.y = -0.05;
    this.group.add(grid);

    // Low-Poly-Kulisse: Neon-Pylonen neben der Strecke
    const rng = mulberry32(7);
    const colors = [0xff2bd6, 0x00ffe1, 0x7a5cff, 0xffd23f];
    for (let i = 0; i < 70; i++) {
      const k = Math.floor(rng() * SAMPLES);
      const side = rng() < 0.5 ? -1 : 1;
      const dist = half + 14 + rng() * 40;
      const p = this.points[k];
      const n = this.normal(k);
      const h = 4 + rng() * 22;
      const color = colors[Math.floor(rng() * colors.length)];
      const geo = rng() < 0.5 ? new THREE.ConeGeometry(2 + rng() * 3, h, 4) : new THREE.BoxGeometry(3 + rng() * 3, h, 3 + rng() * 3);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x080a1c }));
      mesh.position.set(p.x + n.x * dist * side, h / 2, p.z + n.z * dist * side);
      mesh.rotation.y = rng() * Math.PI;
      mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color })));
      this.group.add(mesh);
    }
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
