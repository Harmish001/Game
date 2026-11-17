import { RawPlayerInput } from '../game/types';

export interface KeyBindings {
  up: string;
  down: string;
  left: string;
  right: string;
  lp: string;
  hp: string;
  lk: string;
  hk: string;
  block: string;
  special: string;
  super: string;
  pause: string;
}

export type MotionCommand = 'NONE' | 'QCF' | 'QCB' | 'DP_FWD' | 'DASH_FWD' | 'DASH_BACK';

export class InputManager {
  private p1Keys: KeyBindings = {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    lp: 'KeyJ',
    hp: 'KeyK',
    lk: 'KeyU',
    hk: 'KeyI',
    block: 'KeyL',
    special: 'KeyO',
    super: 'Space',
    pause: 'Escape'
  };

  private p2Keys: KeyBindings = {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    lp: 'Numpad1',
    hp: 'Numpad2',
    lk: 'Numpad4',
    hk: 'Numpad5',
    block: 'Numpad3',
    special: 'Numpad6',
    super: 'Numpad0',
    pause: 'Backspace'
  };

  private activeKeys: Set<string> = new Set();
  private touchP1Input: RawPlayerInput = this.createEmptyInput();

  // Sliding input buffers for motion detection (12 frames)
  private p1Buffer: { input: RawPlayerInput; facingRight: boolean }[] = [];
  private p2Buffer: { input: RawPlayerInput; facingRight: boolean }[] = [];
  private readonly bufferSize: number = 16;

  constructor() {
    this.loadCustomBindings();
    if (typeof window !== 'undefined') {
      this.setupListeners();
    }
  }

  private createEmptyInput(): RawPlayerInput {
    return {
      up: false,
      down: false,
      left: false,
      right: false,
      lp: false,
      hp: false,
      lk: false,
      hk: false,
      block: false,
      special: false,
      super: false,
      pause: false
    };
  }

  private setupListeners(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Prevent scrolling on space / arrows during gameplay
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.activeKeys.add(e.code);
    });

    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.activeKeys.delete(e.code);
    });

    // Handle blur: clear keys to prevent sticky keys
    window.addEventListener('blur', () => {
      this.activeKeys.clear();
    });
  }

  public setTouchInput(input: RawPlayerInput): void {
    this.touchP1Input = { ...input };
  }

  public getPlayerInput(playerIndex: 1 | 2, facingRight: boolean): RawPlayerInput {
    const raw = playerIndex === 1 ? this.pollP1() : this.pollP2();

    // Push into buffer
    const buffer = playerIndex === 1 ? this.p1Buffer : this.p2Buffer;
    buffer.push({ input: { ...raw }, facingRight });
    if (buffer.length > this.bufferSize) {
      buffer.shift();
    }

    return raw;
  }

  private pollP1(): RawPlayerInput {
    const input = this.createEmptyInput();
    const b = this.p1Keys;

    // Keyboard poll
    if (this.activeKeys.has(b.up)) input.up = true;
    if (this.activeKeys.has(b.down)) input.down = true;
    if (this.activeKeys.has(b.left)) input.left = true;
    if (this.activeKeys.has(b.right)) input.right = true;
    if (this.activeKeys.has(b.lp)) input.lp = true;
    if (this.activeKeys.has(b.hp)) input.hp = true;
    if (this.activeKeys.has(b.lk)) input.lk = true;
    if (this.activeKeys.has(b.hk)) input.hk = true;
    if (this.activeKeys.has(b.block)) input.block = true;
    if (this.activeKeys.has(b.special)) input.special = true;
    if (this.activeKeys.has(b.super)) input.super = true;
    if (this.activeKeys.has(b.pause)) input.pause = true;

    // Combine with touch input
    if (this.touchP1Input.up) input.up = true;
    if (this.touchP1Input.down) input.down = true;
    if (this.touchP1Input.left) input.left = true;
    if (this.touchP1Input.right) input.right = true;
    if (this.touchP1Input.lp) input.lp = true;
    if (this.touchP1Input.hp) input.hp = true;
    if (this.touchP1Input.lk) input.lk = true;
    if (this.touchP1Input.hk) input.hk = true;
    if (this.touchP1Input.block) input.block = true;
    if (this.touchP1Input.special) input.special = true;
    if (this.touchP1Input.super) input.super = true;
    if (this.touchP1Input.pause) input.pause = true;

    // Combine with Gamepad 0
    this.pollGamepad(0, input);

    return this.cleanSOCD(input);
  }

  private pollP2(): RawPlayerInput {
    const input = this.createEmptyInput();
    const b = this.p2Keys;

    // Keyboard poll
    if (this.activeKeys.has(b.up)) input.up = true;
    if (this.activeKeys.has(b.down)) input.down = true;
    if (this.activeKeys.has(b.left)) input.left = true;
    if (this.activeKeys.has(b.right)) input.right = true;
    if (this.activeKeys.has(b.lp)) input.lp = true;
    if (this.activeKeys.has(b.hp)) input.hp = true;
    if (this.activeKeys.has(b.lk)) input.lk = true;
    if (this.activeKeys.has(b.hk)) input.hk = true;
    if (this.activeKeys.has(b.block)) input.block = true;
    if (this.activeKeys.has(b.special)) input.special = true;
    if (this.activeKeys.has(b.super)) input.super = true;
    if (this.activeKeys.has(b.pause)) input.pause = true;

    // Combine with Gamepad 1 (or Gamepad 0 if P1 is using keyboard only)
    this.pollGamepad(1, input);

    return this.cleanSOCD(input);
  }

  /**
   * Standard tournament SOCD Cleaner:
   * Left + Right -> Neutral (both false)
   * Up + Down -> Up Priority (up=true, down=false)
   */
  public cleanSOCD(input: RawPlayerInput): RawPlayerInput {
    if (input.left && input.right) {
      input.left = false;
      input.right = false;
    }
    if (input.up && input.down) {
      input.up = true;
      input.down = false;
    }
    return input;
  }

  private pollGamepad(padIndex: number, out: RawPlayerInput): void {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    const gamepads = navigator.getGamepads();
    const gp = gamepads[padIndex];
    if (!gp || !gp.connected) return;

    // Standard Gamepad mappings:
    // Axes: 0 = LStick X (-1 left, +1 right), 1 = LStick Y (-1 up, +1 down)
    // Buttons: 0 = A/Cross, 1 = B/Circle, 2 = X/Square, 3 = Y/Triangle
    // 4 = LB, 5 = RB, 6 = LT, 7 = RT, 9 = Start, 12 = Dpad Up, 13 = Dpad Down, 14 = Dpad Left, 15 = Dpad Right

    const deadzone = 0.35;
    if (gp.axes[1] < -deadzone || (gp.buttons[12] && gp.buttons[12].pressed)) out.up = true;
    if (gp.axes[1] > deadzone || (gp.buttons[13] && gp.buttons[13].pressed)) out.down = true;
    if (gp.axes[0] < -deadzone || (gp.buttons[14] && gp.buttons[14].pressed)) out.left = true;
    if (gp.axes[0] > deadzone || (gp.buttons[15] && gp.buttons[15].pressed)) out.right = true;

    if (gp.buttons[2] && gp.buttons[2].pressed) out.lp = true; // X (Light Punch)
    if (gp.buttons[3] && gp.buttons[3].pressed) out.hp = true; // Y (Heavy Punch)
    if (gp.buttons[0] && gp.buttons[0].pressed) out.lk = true; // A (Light Kick)
    if (gp.buttons[1] && gp.buttons[1].pressed) out.hk = true; // B (Heavy Kick)

    if ((gp.buttons[4] && gp.buttons[4].pressed) || (gp.buttons[6] && gp.buttons[6].pressed)) {
      out.block = true; // LB / LT
    }
    if ((gp.buttons[5] && gp.buttons[5].pressed)) {
      out.special = true; // RB
    }
    if ((gp.buttons[7] && gp.buttons[7].pressed)) {
      out.super = true; // RT
    }
    if (gp.buttons[9] && gp.buttons[9].pressed) out.pause = true; // Start
  }

  /**
   * Detects motion inputs in the buffer (relative to player facing)
   * Priority: DP > QCF > QCB > DASH_FWD > DASH_BACK
   */
  public detectMotion(playerIndex: 1 | 2): MotionCommand {
    const buffer = playerIndex === 1 ? this.p1Buffer : this.p2Buffer;
    if (buffer.length < 5) return 'NONE';

    const latest = buffer[buffer.length - 1];
    const facingRight = latest.facingRight;

    const isFwd = (inp: RawPlayerInput) => (facingRight ? inp.right : inp.left);
    const isBack = (inp: RawPlayerInput) => (facingRight ? inp.left : inp.right);

    // 1. Dragon Punch motion with leniency: Fwd -> Down -> (Down-Fwd OR Fwd)
    // Checked first so DP takes priority over QCF when both could match
    let stageDP = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const inp = buffer[i].input;
      const f = isFwd(inp);
      const d = inp.down;

      if (stageDP === 0 && f) {
        stageDP = 1; // Ending on Down-Fwd or Fwd
      } else if (stageDP === 1 && d) {
        stageDP = 2; // Middle has Down
      } else if (stageDP === 2 && f && !d) {
        return 'DP_FWD'; // Started with pure Forward
      }
    }

    // 2. Quarter Circle Forward (↓ ↘ →) with leniency (accept ↓ → skipping ↘)
    let stageQCF = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const inp = buffer[i].input;
      const f = isFwd(inp);
      const d = inp.down;

      if (stageQCF === 0 && f && !d) {
        stageQCF = 1; // Ended on Forward
      } else if (stageQCF === 1 && (f && d)) {
        stageQCF = 2; // Found Down-Forward
      } else if (stageQCF === 1 && (d && !f)) {
        // Skipped Down-Forward diagonal directly to Down! Valid lenient QCF
        return 'QCF';
      } else if (stageQCF === 2 && (d && !f)) {
        return 'QCF'; // Full Down-Forward to Down complete!
      }
    }

    // 3. Quarter Circle Back (↓ ↙ ←) with leniency (accept ↓ ← skipping ↙)
    let stageQCB = 0;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const inp = buffer[i].input;
      const b = isBack(inp);
      const d = inp.down;

      if (stageQCB === 0 && b && !d) {
        stageQCB = 1; // Ended on Back
      } else if (stageQCB === 1 && (b && d)) {
        stageQCB = 2; // Found Down-Back
      } else if (stageQCB === 1 && (d && !b)) {
        // Skipped Down-Back diagonal directly to Down! Valid lenient QCB
        return 'QCB';
      } else if (stageQCB === 2 && (d && !b)) {
        return 'QCB'; // Full Down-Back to Down complete!
      }
    }

    // 4. Double tap dash forward (Forward -> Neutral -> Forward)
    let fwdTaps = 0;
    let wasFwd = false;
    let sawNeutralFwd = false;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const inp = buffer[i].input;
      if (inp.down || inp.up) break;
      const f = isFwd(inp);
      const isNeutral = !inp.right && !inp.left;
      if (f && !wasFwd) {
        if (fwdTaps === 0) {
          fwdTaps = 1;
        } else if (fwdTaps === 1 && sawNeutralFwd) {
          return 'DASH_FWD';
        }
      } else if (isNeutral && fwdTaps === 1) {
        sawNeutralFwd = true;
      }
      wasFwd = f;
    }

    // 5. Double tap dash backward (Back -> Neutral -> Back)
    let backTaps = 0;
    let wasBack = false;
    let sawNeutralBack = false;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const inp = buffer[i].input;
      if (inp.down || inp.up) break;
      const b = isBack(inp);
      const isNeutral = !inp.right && !inp.left;
      if (b && !wasBack) {
        if (backTaps === 0) {
          backTaps = 1;
        } else if (backTaps === 1 && sawNeutralBack) {
          return 'DASH_BACK';
        }
      } else if (isNeutral && backTaps === 1) {
        sawNeutralBack = true;
      }
      wasBack = b;
    }

    return 'NONE';
  }

  public getBindings(player: 1 | 2): KeyBindings {
    return player === 1 ? { ...this.p1Keys } : { ...this.p2Keys };
  }

  public setBinding(player: 1 | 2, action: keyof KeyBindings, code: string): void {
    if (player === 1) {
      this.p1Keys[action] = code;
    } else {
      this.p2Keys[action] = code;
    }
    this.saveCustomBindings();
  }

  public resetBindings(): void {
    localStorage.removeItem('cricket_clash_bindings_p1');
    localStorage.removeItem('cricket_clash_bindings_p2');
    this.loadCustomBindings();
  }

  private loadCustomBindings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const s1 = localStorage.getItem('cricket_clash_bindings_p1');
      if (s1) this.p1Keys = { ...this.p1Keys, ...JSON.parse(s1) };
      const s2 = localStorage.getItem('cricket_clash_bindings_p2');
      if (s2) this.p2Keys = { ...this.p2Keys, ...JSON.parse(s2) };
    } catch {}
  }

  private saveCustomBindings(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem('cricket_clash_bindings_p1', JSON.stringify(this.p1Keys));
      localStorage.setItem('cricket_clash_bindings_p2', JSON.stringify(this.p2Keys));
    } catch {}
  }
}

