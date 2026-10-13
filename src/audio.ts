// Synthetischer Motor- und Reifensound über WebAudio (keine Audiodateien nötig)

const STORAGE_KEY = 'racing-lab.muted';
const GEARS = [0, 12, 24, 36, 48, 62]; // Tempogrenzen (m/s) der fünf Gänge
const MASTER_VOLUME = 0.35;

function loadMuted(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export class Sound {
  muted = loadMuted();
  /** aktuelle Motorfrequenz in Hz (für Tests und Anzeige) */
  engineHz = 0;
  /** aktueller Gang 1..5 */
  gear = 1;
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private engineFilter!: BiquadFilterNode;
  private engineGain!: GainNode;
  private squealGain!: GainNode;
  private squealFilter!: BiquadFilterNode;
  private offroadGain!: GainNode;

  /** Muss aus einer Nutzeraktion (Taste/Klick) aufgerufen werden, sonst blockiert der Browser Audio */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(ctx.destination);

    // Motor: zwei leicht verstimmte Sägezähne durch einen Tiefpass
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 600;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.25;
    this.osc1 = ctx.createOscillator();
    this.osc2 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2.type = 'square';
    this.osc1.connect(this.engineFilter);
    this.osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);
    this.osc1.start();
    this.osc2.start();

    // Rauschen als Basis für Quietschen (Bandpass) und Offroad-Rumpeln (Tiefpass)
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noise.buffer = buf;
    noise.loop = true;

    this.squealFilter = ctx.createBiquadFilter();
    this.squealFilter.type = 'bandpass';
    this.squealFilter.frequency.value = 1800;
    this.squealFilter.Q.value = 4;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    noise.connect(this.squealFilter).connect(this.squealGain).connect(this.master);

    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = 250;
    this.offroadGain = ctx.createGain();
    this.offroadGain.gain.value = 0;
    noise.connect(rumble).connect(this.offroadGain).connect(this.master);
    noise.start();
  }

  /** Pause: Audio-Kontext anhalten bzw. fortsetzen */
  setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend(); else void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try { localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0'); } catch { /* ignorieren */ }
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.03);
    return this.muted;
  }

  update(speed: number, throttle: boolean, skidding: boolean, offTrack: boolean) {
    // Gang und Drehzahl (0..1 im aktuellen Gang) aus dem Tempo
    let g = GEARS.length - 2;
    for (let i = 1; i < GEARS.length; i++) if (speed < GEARS[i]) { g = i - 1; break; }
    this.gear = g + 1;
    const rpm = Math.min(Math.max((speed - GEARS[g]) / (GEARS[g + 1] - GEARS[g]), 0), 1);
    this.engineHz = 55 + rpm * 95 + (throttle ? 12 : 0) + g * 6;

    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.osc1.frequency.setTargetAtTime(this.engineHz, t, 0.04);
    this.osc2.frequency.setTargetAtTime(this.engineHz * 0.5 * 1.01, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(350 + rpm * 700 + (throttle ? 450 : 0), t, 0.05);
    this.engineGain.gain.setTargetAtTime(throttle ? 0.34 : 0.2, t, 0.08);
    this.squealGain.gain.setTargetAtTime(skidding ? 0.22 : 0, t, 0.05);
    this.squealFilter.frequency.setTargetAtTime(1500 + Math.min(speed, 50) * 20, t, 0.1);
    this.offroadGain.gain.setTargetAtTime(offTrack ? Math.min(speed / 30, 1) * 0.5 : 0, t, 0.1);
  }
}
