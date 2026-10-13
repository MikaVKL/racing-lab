// Tastatureingabe: Pfeiltasten und WASD

export interface Controls {
  /** -1..1, positiv = links */
  steer: number;
  throttle: boolean;
  brake: boolean;
  handbrake: boolean;
  reset: boolean;
}

const KEYS: Record<string, keyof Controls | 'left' | 'right'> = {
  ArrowUp: 'throttle', KeyW: 'throttle',
  ArrowDown: 'brake', KeyS: 'brake',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'handbrake',
  KeyR: 'reset',
};

export class Input {
  private down = new Set<string>();
  private resetPressed = false;

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.code in KEYS) {
        e.preventDefault();
        this.down.add(KEYS[e.code]);
        if (e.code === 'KeyR') this.resetPressed = true;
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code in KEYS) this.down.delete(KEYS[e.code]);
    });
    // Fokusverlust: sonst bleiben Tasten "hängen"
    addEventListener('blur', () => this.down.clear());
  }

  read(): Controls {
    const d = this.down;
    const reset = this.resetPressed;
    this.resetPressed = false; // Reset gilt nur einmal pro Tastendruck
    return {
      steer: (d.has('left') ? 1 : 0) - (d.has('right') ? 1 : 0),
      throttle: d.has('throttle'),
      brake: d.has('brake'),
      handbrake: d.has('handbrake'),
      reset,
    };
  }
}
