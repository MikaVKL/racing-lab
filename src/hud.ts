import { formatTime, type LapTimer } from './laps';
import { DRIFT_NOSE_SCALE, DRIFT_TURN_SCALE } from './car';

export class Hud {
  private speed: HTMLElement;
  private lap: HTMLElement;
  private cur: HTMLElement;
  private last: HTMLElement;
  private best: HTMLElement;
  private banner: HTMLElement;
  private mute: HTMLElement;
  private wrong: HTMLElement;
  private bannerUntil = 0;

  constructor(trackName: string) {
    const style = document.createElement('style');
    style.textContent = `
      #hud { position: fixed; inset: 0; pointer-events: none; font-family: 'Courier New', monospace; color: #00ffe1; text-shadow: 0 0 8px #00ffe1; user-select: none; }
      #hud .box { position: absolute; padding: 10px 16px; background: rgba(5,6,15,.55); border: 1px solid rgba(0,255,225,.45); border-radius: 6px; }
      #hud .tl { top: 16px; left: 16px; font-size: 16px; line-height: 1.6; }
      #hud .tl b { color: #ff2bd6; text-shadow: 0 0 8px #ff2bd6; }
      #hud .tl .big { font-size: 28px; color: #fff; text-shadow: 0 0 10px #00ffe1; }
      #hud .br { right: 16px; bottom: 16px; text-align: right; }
      #hud .br .num { font-size: 52px; line-height: 1; color: #fff; text-shadow: 0 0 12px #00ffe1; }
      #hud .br .unit { font-size: 14px; letter-spacing: 3px; }
      #hud .help { left: 16px; bottom: 16px; font-size: 13px; opacity: .8; max-width: calc(100vw - 230px); box-sizing: border-box; }
      #hud .wrong { top: 34%; left: 50%; transform: translateX(-50%); font-size: 30px; color: #fff; border-color: #ff2040; text-shadow: 0 0 12px #ff2040; background: rgba(60,0,10,.6); letter-spacing: 3px; animation: wrongpulse .7s infinite alternate; }
      @keyframes wrongpulse { from { opacity: .45; } to { opacity: 1; } }
      #hud .build { top: 4px; left: 50%; transform: translateX(-50%); padding: 2px 8px; font-size: 11px; opacity: .55; border-color: transparent; background: none; }
      #hud .banner { top: 18%; left: 50%; transform: translateX(-50%); font-size: 28px; color: #fff; text-align: center; border-color: #ff2bd6; text-shadow: 0 0 12px #ff2bd6; transition: opacity .3s; }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="box tl">
        <div><b>STRECKE</b> <span id="h-track"></span></div>
        <div><b>RUNDE</b> <span id="h-lap" class="big">1</span></div>
        <div><b>ZEIT</b> <span id="h-cur">00:00.000</span></div>
        <div><b>LETZTE</b> <span id="h-last">--:--.---</span></div>
        <div><b>BEST</b> <span id="h-best">--:--.---</span></div>
      </div>
      <div class="box br"><div class="num" id="h-speed">0</div><div class="unit">KM/H</div></div>
      <div class="box help">↑/W Gas · ↓/S Bremse · ←→/AD Lenken · Leertaste Drift · R Neustart · P Pause · T Strecke · M <span id="h-mute">Ton an</span></div>
      <div class="box banner" id="h-banner" style="opacity:0"></div>
      <div class="box build" id="h-build"></div>
      <div class="box wrong" id="h-wrong" style="display:none">⚠ FALSCHE RICHTUNG ⚠</div>`;
    document.body.appendChild(root);

    const q = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
    q('h-track').textContent = trackName;
    const tuned = [DRIFT_TURN_SCALE !== 1 ? `drift ${DRIFT_TURN_SCALE}` : '', DRIFT_NOSE_SCALE !== 1 ? `nose ${DRIFT_NOSE_SCALE}` : ''].filter(Boolean);
    q('h-build').textContent = ['Version ' + __BUILD__, ...tuned].join(' · ');
    this.speed = q('h-speed'); this.lap = q('h-lap'); this.cur = q('h-cur');
    this.last = q('h-last'); this.best = q('h-best'); this.banner = q('h-banner'); this.mute = q('h-mute'); this.wrong = q('h-wrong');
  }

  setWrongWay(on: boolean) { this.wrong.style.display = on ? 'block' : 'none'; }

  setMuted(muted: boolean) { this.mute.textContent = muted ? 'Ton aus' : 'Ton an'; }

  showBanner(text: string, ms = 3000, big = false) {
    this.banner.textContent = text;
    this.banner.style.fontSize = big ? '72px' : '28px';
    this.banner.style.whiteSpace = 'pre-line';
    this.banner.style.opacity = '1';
    this.bannerUntil = performance.now() + ms;
  }

  hideBanner() { this.banner.style.opacity = '0'; this.bannerUntil = 0; }

  /** Rundenabschluss anzeigen */
  lapCompleted(t: LapTimer) {
    this.showBanner(
      t.newBest ? `NEUE BESTZEIT!\n${formatTime(t.lastLap)}` : `Runde ${t.lapsDone}: ${formatTime(t.lastLap)}`,
    );
    this.banner.style.whiteSpace = 'pre-line';
  }

  update(speedMs: number, t: LapTimer) {
    this.speed.textContent = String(Math.round(speedMs * 3.6));
    this.lap.textContent = String(t.lapsDone + 1);
    this.cur.textContent = formatTime(t.currentLap);
    this.last.textContent = formatTime(t.lastLap);
    this.best.textContent = formatTime(t.bestLap);
    if (this.bannerUntil && performance.now() > this.bannerUntil) this.hideBanner();
  }
}
