import type { MenuAction, PadButton, PadState } from './types';

/* Gamepad input manager: up to 4 Xbox pads, plus a keyboard fallback that
 * merges into pad slot 0 (dev/testing). Produces per-frame edge states and
 * menu navigation actions with hold-repeat. */

const BTN_INDEX: Record<Exclude<PadButton, 'up' | 'down' | 'left' | 'right'>, number> = {
  a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, back: 8, start: 9,
};
const DPAD: Record<'up' | 'down' | 'left' | 'right', number> = { up: 12, down: 13, left: 14, right: 15 };

const STICK_DEADZONE = 0.22;
const MENU_STICK_THRESHOLD = 0.55;
const REPEAT_DELAY = 0.42;
const REPEAT_INTERVAL = 0.12;

const ALL_BUTTONS: PadButton[] = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'up', 'down', 'left', 'right'];

class Pad implements PadState {
  connected = false;
  moveX = 0;
  moveY = 0;
  private now = new Set<PadButton>();
  private prev = new Set<PadButton>();
  private rumbleEnabled: () => boolean;
  private raw: Gamepad | null = null;

  constructor(rumbleEnabled: () => boolean) {
    this.rumbleEnabled = rumbleEnabled;
  }

  held(btn: PadButton): boolean { return this.now.has(btn); }
  pressed(btn: PadButton): boolean { return this.now.has(btn) && !this.prev.has(btn); }
  released(btn: PadButton): boolean { return !this.now.has(btn) && this.prev.has(btn); }

  rumble(lo: number, hi: number, ms: number): void {
    if (!this.rumbleEnabled() || !this.raw) return;
    const act = (this.raw as any).vibrationActuator;
    act?.playEffect?.('dual-rumble', {
      duration: ms, strongMagnitude: Math.min(1, lo), weakMagnitude: Math.min(1, hi),
    })?.catch?.(() => {});
  }

  /** internal: refresh from a Gamepad (or null) + extra keyboard set */
  _update(gp: Gamepad | null, extra: Set<PadButton> | null, extraStick: { x: number; y: number } | null): void {
    this.prev = this.now;
    this.now = new Set<PadButton>();
    this.raw = gp;
    this.connected = !!gp;
    let mx = 0, my = 0;
    if (gp) {
      for (const [name, idx] of Object.entries(BTN_INDEX)) {
        if (gp.buttons[idx]?.pressed) this.now.add(name as PadButton);
      }
      for (const [name, idx] of Object.entries(DPAD)) {
        if (gp.buttons[idx]?.pressed) this.now.add(name as PadButton);
      }
      mx = gp.axes[0] ?? 0;
      my = gp.axes[1] ?? 0;
      const mag = Math.hypot(mx, my);
      if (mag < STICK_DEADZONE) { mx = 0; my = 0; }
      else { const s = (mag - STICK_DEADZONE) / (1 - STICK_DEADZONE) / mag; mx *= s; my *= s; }
    }
    if (extra) {
      for (const b of extra) this.now.add(b);
      this.connected = this.connected || extra.size > 0;
    }
    if (extraStick && (extraStick.x !== 0 || extraStick.y !== 0)) {
      mx = extraStick.x; my = extraStick.y;
    }
    this.moveX = mx;
    this.moveY = my;
  }
}

interface RepeatState { action: MenuAction; t: number; fired: boolean }

export class InputManager {
  readonly pads: Pad[];
  private keyHeld = new Set<PadButton>();
  private menuListeners: ((action: MenuAction, padIndex: number) => void)[] = [];
  private repeats: (RepeatState | null)[] = [null, null, null, null];
  private everSeen = [false, false, false, false];
  private keyboardUsed = false;

  constructor(rumbleEnabled: () => boolean) {
    this.pads = [0, 1, 2, 3].map(() => new Pad(rumbleEnabled));
    window.addEventListener('keydown', (e) => {
      const b = this.mapKey(e.code);
      if (b) { this.keyHeld.add(b); this.keyboardUsed = true; if (!e.metaKey && !e.ctrlKey) e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      const b = this.mapKey(e.code);
      if (b) this.keyHeld.delete(b);
    });
    window.addEventListener('blur', () => this.keyHeld.clear());
  }

  private mapKey(code: string): PadButton | null {
    switch (code) {
      case 'ArrowUp': case 'KeyW': return 'up';
      case 'ArrowDown': case 'KeyS': return 'down';
      case 'ArrowLeft': case 'KeyA': return 'left';
      case 'ArrowRight': case 'KeyD': return 'right';
      case 'KeyJ': case 'Space': return 'a';
      case 'KeyK': return 'b';
      case 'KeyL': return 'x';
      case 'KeyI': return 'y';
      case 'ShiftLeft': return 'rt';
      case 'Enter': return 'start';
      case 'Escape': case 'Backspace': return 'b';
      default: return null;
    }
  }

  onMenuAction(cb: (action: MenuAction, padIndex: number) => void): void {
    this.menuListeners.push(cb);
  }

  /** pads currently connected (incl. keyboard-as-pad-0 once used) */
  connectedPads(): number[] {
    const out: number[] = [];
    for (let i = 0; i < 4; i++) if (this.pads[i].connected || this.everSeen[i]) out.push(i);
    return out;
  }

  /** any button pressed this frame on any pad → pad index, else -1 */
  anyPressed(): number {
    for (let i = 0; i < 4; i++) {
      for (const b of ALL_BUTTONS) if (this.pads[i].pressed(b)) return i;
    }
    return -1;
  }

  update(dt: number): void {
    const raw = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < 4; i++) {
      const gp = raw[i] ?? null;
      const isKb = i === 0 && this.keyboardUsed;
      // keyboard dpad doubles as stick for gameplay
      let ks: { x: number; y: number } | null = null;
      if (isKb && !gp) {
        ks = {
          x: (this.keyHeld.has('right') ? 1 : 0) - (this.keyHeld.has('left') ? 1 : 0),
          y: (this.keyHeld.has('down') ? 1 : 0) - (this.keyHeld.has('up') ? 1 : 0),
        };
      }
      this.pads[i]._update(gp, isKb ? this.keyHeld : null, ks);
      if (this.pads[i].connected) this.everSeen[i] = true;
      this.emitMenu(i, dt);
    }
  }

  private emitMenu(i: number, dt: number): void {
    const p = this.pads[i];
    const dir: MenuAction | null =
      p.held('up') || p.moveY < -MENU_STICK_THRESHOLD ? 'up'
      : p.held('down') || p.moveY > MENU_STICK_THRESHOLD ? 'down'
      : p.held('left') || p.moveX < -MENU_STICK_THRESHOLD ? 'left'
      : p.held('right') || p.moveX > MENU_STICK_THRESHOLD ? 'right'
      : null;

    const rep = this.repeats[i];
    if (dir) {
      if (!rep || rep.action !== dir) {
        this.repeats[i] = { action: dir, t: 0, fired: true };
        this.fire(dir, i);
      } else {
        rep.t += dt;
        if (rep.t > REPEAT_DELAY) {
          rep.t -= REPEAT_INTERVAL;
          this.fire(dir, i);
        }
      }
    } else {
      this.repeats[i] = null;
    }

    if (p.pressed('a')) this.fire('confirm', i);
    if (p.pressed('b')) this.fire('back', i);
    if (p.pressed('start')) this.fire('start', i);
    if (p.pressed('lb')) this.fire('prev', i);
    if (p.pressed('rb')) this.fire('next', i);
  }

  private fire(action: MenuAction, pad: number): void {
    for (const cb of this.menuListeners) cb(action, pad);
  }
}
