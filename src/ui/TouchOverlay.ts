import { RawPlayerInput } from '../game/types';

export class TouchOverlay {
  private container: HTMLElement;
  private currentInput: RawPlayerInput = this.createEmptyInput();
  private onInputChange?: (input: RawPlayerInput) => void;

  private joyBase: HTMLElement | null = null;
  private joyThumb: HTMLElement | null = null;
  private joyTouchId: number | null = null;
  private joyCenterX: number = 0;
  private joyCenterY: number = 0;
  private joyRadius: number = 55;

  constructor(container: HTMLElement, onInputChange?: (input: RawPlayerInput) => void) {
    this.container = container;
    this.onInputChange = onInputChange;
    this.build();
    this.setupTouchListeners();
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

  private build(): void {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.container.innerHTML = `
      <style>
        .touch-container {
          position: absolute;
          inset: 0;
          pointer-events: none;
          display: ${isTouch ? 'flex' : 'none'};
          justify-content: space-between;
          align-items: flex-end;
          padding: 24px 32px;
          z-index: 20;
        }

        /* Virtual Joystick */
        .joystick-zone {
          position: relative;
          width: 140px;
          height: 140px;
          pointer-events: auto;
        }

        .joystick-base {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: rgba(30, 41, 59, 0.45);
          border: 2px solid rgba(255, 255, 255, 0.2);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .joystick-thumb {
          width: 54px;
          height: 54px;
          border-radius: 50%;
          background: rgba(56, 189, 248, 0.85);
          box-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
          pointer-events: none;
          transition: transform 0.05s ease-out;
        }

        /* Attack Buttons */
        .button-zone {
          display: grid;
          grid-template-columns: repeat(3, 62px);
          grid-template-rows: repeat(2, 62px);
          gap: 12px;
          pointer-events: auto;
        }

        .touch-btn {
          border-radius: 50%;
          background: rgba(15, 23, 42, 0.7);
          border: 2px solid rgba(255, 255, 255, 0.3);
          color: #fff;
          font-family: 'Teko', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          touch-action: manipulation;
          box-shadow: 0 4px 10px rgba(0,0,0,0.4);
          user-select: none;
        }

        .touch-btn:active, .touch-btn.pressed {
          background: rgba(234, 179, 8, 0.85);
          color: #000;
          transform: scale(0.92);
        }

        .btn-lp { border-color: #3b82f6; }
        .btn-hp { border-color: #ef4444; }
        .btn-lk { border-color: #10b981; }
        .btn-hk { border-color: #f59e0b; }
        .btn-blk { border-color: #64748b; font-size: 1.2rem; }
        .btn-spc { border-color: #a855f7; font-size: 1.2rem; }
      </style>

      <div class="touch-container">
        <!-- Left: Joystick -->
        <div id="joy-zone" class="joystick-zone">
          <div id="joy-base" class="joystick-base">
            <div id="joy-thumb" class="joystick-thumb"></div>
          </div>
        </div>

        <!-- Right: Buttons -->
        <div class="button-zone">
          <button class="touch-btn btn-lp" data-action="lp">LP</button>
          <button class="touch-btn btn-hp" data-action="hp">HP</button>
          <button class="touch-btn btn-spc" data-action="special">SP</button>
          <button class="touch-btn btn-lk" data-action="lk">LK</button>
          <button class="touch-btn btn-hk" data-action="hk">HK</button>
          <button class="touch-btn btn-blk" data-action="block">BLK</button>
        </div>
      </div>
    `;

    this.joyBase = this.container.querySelector('#joy-base');
    this.joyThumb = this.container.querySelector('#joy-thumb');
  }

  private setupTouchListeners(): void {
    const joyZone = this.container.querySelector('#joy-zone');
    if (joyZone) {
      joyZone.addEventListener('touchstart', (e: Event) => {
        const te = e as TouchEvent;
        te.preventDefault();
        const touch = te.changedTouches[0];
        this.joyTouchId = touch.identifier;
        const rect = (joyZone as HTMLElement).getBoundingClientRect();
        this.joyCenterX = rect.left + rect.width / 2;
        this.joyCenterY = rect.top + rect.height / 2;
        this.handleJoyMove(touch.clientX, touch.clientY);
      }, { passive: false });

      joyZone.addEventListener('touchmove', (e: Event) => {
        const te = e as TouchEvent;
        te.preventDefault();
        for (let i = 0; i < te.changedTouches.length; i++) {
          const touch = te.changedTouches[i];
          if (touch.identifier === this.joyTouchId) {
            this.handleJoyMove(touch.clientX, touch.clientY);
            break;
          }
        }
      }, { passive: false });

      const endJoy = (e: Event) => {
        const te = e as TouchEvent;
        for (let i = 0; i < te.changedTouches.length; i++) {
          if (te.changedTouches[i].identifier === this.joyTouchId) {
            this.joyTouchId = null;
            if (this.joyThumb) this.joyThumb.style.transform = `translate(0px, 0px)`;
            this.currentInput.up = false;
            this.currentInput.down = false;
            this.currentInput.left = false;
            this.currentInput.right = false;
            this.emit();
            break;
          }
        }
      };

      joyZone.addEventListener('touchend', endJoy);
      joyZone.addEventListener('touchcancel', endJoy);
    }

    // Button listeners
    const buttons = this.container.querySelectorAll('.touch-btn');
    buttons.forEach(btn => {
      const action = btn.getAttribute('data-action') as keyof RawPlayerInput;
      if (!action) return;

      const press = (e: Event) => {
        e.preventDefault();
        btn.classList.add('pressed');
        (this.currentInput[action] as boolean) = true;
        this.emit();
      };

      const release = (e: Event) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        (this.currentInput[action] as boolean) = false;
        this.emit();
      };

      btn.addEventListener('touchstart', press, { passive: false });
      btn.addEventListener('touchend', release);
      btn.addEventListener('touchcancel', release);
      btn.addEventListener('mousedown', press);
      btn.addEventListener('mouseup', release);
    });
  }

  private handleJoyMove(clientX: number, clientY: number): void {
    const dx = clientX - this.joyCenterX;
    const dy = clientY - this.joyCenterY;
    const dist = Math.hypot(dx, dy);

    const clampedDist = Math.min(dist, this.joyRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = Math.cos(angle) * clampedDist;
    const thumbY = Math.sin(angle) * clampedDist;

    if (this.joyThumb) {
      this.joyThumb.style.transform = `translate(${thumbX}px, ${thumbY}px)`;
    }

    // Directional thresholds
    const threshold = 18;
    this.currentInput.left = dx < -threshold;
    this.currentInput.right = dx > threshold;
    this.currentInput.up = dy < -threshold;
    this.currentInput.down = dy > threshold;

    this.emit();
  }

  private emit(): void {
    if (this.onInputChange) {
      this.onInputChange({ ...this.currentInput });
    }
  }

  public setVisible(visible: boolean): void {
    const el = this.container.querySelector('.touch-container') as HTMLElement;
    if (el) el.style.display = visible ? 'flex' : 'none';
  }
}

