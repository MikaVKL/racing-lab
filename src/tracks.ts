// Streckendefinitionen. Neue Strecke = neuer Eintrag in TRACKS (geschlossene Kontrollpunkte in x/z).

export interface TrackDef {
  id: string;
  name: string;
  /** geschlossene Kontrollpunkte (x, z); Punkt 0 liegt am Start/Ziel */
  control: [number, number][];
  scale: number;
  width: number;
  /** Randfarben: links / rechts in Fahrtrichtung */
  edgeLeft: number;
  edgeRight: number;
  /** Farben der Kulisse */
  accents: number[];
  /** Seed für die Kulissenverteilung */
  seed: number;
}

export const DEFAULT_TRACK_ID = 'neon-lab';

export const TRACKS: TrackDef[] = [
  {
    id: DEFAULT_TRACK_ID,
    name: 'Neon Lab',
    control: [
      [0, 0], [60, 0], [120, -10], [165, -50], [160, -110], [110, -140],
      [60, -120], [30, -150], [-20, -185], [-80, -170], [-105, -120],
      [-80, -70], [-110, -30], [-70, 15], [-30, 10],
    ],
    scale: 1.5,
    width: 18,
    edgeLeft: 0xff2bd6,
    edgeRight: 0x00ffe1,
    accents: [0xff2bd6, 0x00ffe1, 0x7a5cff, 0xffd23f],
    seed: 7,
  },
  {
    id: 'serpentine',
    name: 'Serpentine',
    control: [
      [148, -43], [113, -73], [83, -95], [46, -100], [13, -88], [-13, -92], [-55, -120],
      [-115, -133], [-158, -102], [-169, -50], [-166, 0], [-150, 44], [-111, 71],
      [-66, 76], [-39, 85], [-17, 115], [20, 136], [58, 126], [91, 105], [134, 86],
      [175, 51], [179, 0],
    ],
    scale: 1.2,
    width: 18,
    edgeLeft: 0xff8a1f,
    edgeRight: 0x7a5cff,
    accents: [0xff8a1f, 0x7a5cff, 0xffd23f, 0x00ffe1],
    seed: 21,
  },
];

export function findTrack(id: string | null | undefined): TrackDef {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

/** Speicherschlüssel pro Strecke; die erste Strecke behält die alten Schlüssel (bestehende Bestzeiten bleiben gültig) */
export function storageKey(base: string, trackId: string): string {
  return trackId === DEFAULT_TRACK_ID ? base : `${base}.${trackId}`;
}

export function nextTrack(id: string): TrackDef {
  const i = TRACKS.findIndex((t) => t.id === id);
  return TRACKS[(i + 1) % TRACKS.length];
}
