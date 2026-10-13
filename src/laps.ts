// Rundenzählung und Zeitnahme (reine Logik, ohne DOM/Three – gut testbar)

const STORAGE_KEY = 'racing-lab.bestLap';
const CHECKPOINTS = 3; // bei 25 %, 50 % und 75 % der Strecke

export function formatTime(seconds: number | null): string {
  if (seconds === null || !isFinite(seconds)) return '--:--.---';
  const ms = Math.round(seconds * 1000);
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

export function loadBest(): number | null {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    return isFinite(v) && v > 0 ? v : null;
  } catch {
    return null; // Speicher gesperrt (z. B. privater Modus)
  }
}

function saveBest(t: number) {
  try { localStorage.setItem(STORAGE_KEY, String(t)); } catch { /* ignorieren */ }
}

export class LapTimer {
  /** Anzahl abgeschlossener Runden */
  lapsDone = 0;
  lastLap: number | null = null;
  bestLap: number | null = loadBest();
  /** true, wenn die letzte Runde eine neue Bestzeit war */
  newBest = false;
  running = false;
  private clock = 0;       // Simulationszeit in s, solange das Rennen läuft
  private lapStart = 0;
  private nextCp = 1;
  private prevIndex: number | null = null;

  constructor(private samples: number) {}

  get currentLap() { return this.running ? this.clock - this.lapStart : 0; }

  /** Zeit läuft ab dem ersten Gasgeben */
  start() { this.running = true; }

  /** Zurück an den Start (Runden und Bestzeit bleiben erhalten; Bestzeit liegt im Speicher) */
  reset() {
    this.running = false;
    this.clock = this.lapStart = 0;
    this.nextCp = 1;
    this.prevIndex = null;
  }

  update(index: number, dt: number) {
    if (this.running) this.clock += dt;
    const n = this.samples;
    const prev = this.prevIndex;
    this.prevIndex = index;
    if (prev === null) return;

    // Checkpoint der Reihe nach?
    if (this.nextCp <= CHECKPOINTS) {
      const target = (this.nextCp * n) / (CHECKPOINTS + 1);
      const d = Math.abs(index - target);
      if (Math.min(d, n - d) < n / 16) this.nextCp++;
    }

    // Start/Ziel-Linie in Fahrtrichtung überquert (Sprung von hinten nach vorn im Index)
    if (prev > n * 0.75 && index < n * 0.25) {
      if (this.running && this.nextCp > CHECKPOINTS) {
        const t = this.clock - this.lapStart;
        this.lapsDone++;
        this.lastLap = t;
        this.newBest = this.bestLap === null || t < this.bestLap;
        if (this.newBest) { this.bestLap = t; saveBest(t); }
      }
      this.lapStart = this.clock;
      this.nextCp = 1;
    }
  }
}
