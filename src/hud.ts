import { formatTime, type LapTimer } from './laps';

export class Hud {
  private speed: HTMLElement;
  private lap: HTMLElement;
  private cur: HTMLElement;
  private last: HTMLElement;
  private best: HTMLElement;
  private banner: HTMLElement;
  private bannerUntil = 0;

  constructor() {
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
      #hud .help { left: 16px; bottom: 16px; font-size: 13px; opacity: .8; }
      #hud .banner { top: 18%; left: 50%; transform: translateX(-50%); font-size: 28px; color: #fff; text-align: center; border-color: #ff2bd6; text-shadow: 0 0 12px #ff2bd6; transition: opacity .3s; }
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `
      <div class="box tl">
        <div><b>RUNDE</b> <span id="h-lap" class="big">1</span></div>
        <div><b>ZEIT</b> <span id="h-cur">00:00.000</span></div>
        <div><b>LETZTE</b> <span id="h-last">--:--.---</span></div>
        <div><b>BEST</b> <span id="h-best">--:--.---</span></div>
      </div>
      <div class="box br"><div class="num" id="h-speed">0</div><div class="unit">KM/H</div></div>
      <div class="box help">↑/W Gas · ↓/S Bremse · ←→/AD Lenken · Leertaste Handbremse · R Neustart</div>
      <div class="box banner" id="h-banner" style="opacity:0"></div>`;
    document.body.appendChild(root);

    const q = (id: string) => root.querySelector<HTMLElement>('#' + id)!;
    this.speed = q('h-speed'); this.lap = q('h-lap'); this.cur = q('h-cur');
    this.last = q('h-last'); this.best = q('h-best'); this.banner = q('h-banner');
    this.showBanner('Gas geben zum Start!', 1e9);
  }

  showBanner(text: string, ms = 3000) {
    this.banner.textContent = text;
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
