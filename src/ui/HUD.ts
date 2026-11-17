import * as THREE from 'three';
import { Fighter } from '../game/Fighter';
import { MatchManager } from '../game/MatchManager';

export class HUD {
  private container: HTMLElement;
  private p1HealthFill: HTMLElement | null = null;
  private p1HealthDelay: HTMLElement | null = null;
  private p1GuardFill: HTMLElement | null = null;
  private p2HealthFill: HTMLElement | null = null;
  private p2HealthDelay: HTMLElement | null = null;
  private p2GuardFill: HTMLElement | null = null;

  private p1MeterFill: HTMLElement | null = null;
  private p2MeterFill: HTMLElement | null = null;

  private p1RoundPips: HTMLElement[] = [];
  private p2RoundPips: HTMLElement[] = [];

  private timerEl: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private comboEl: HTMLElement | null = null;

  private p1DelayedHp: number = 100;
  private p2DelayedHp: number = 100;

  constructor(container: HTMLElement) {
    this.container = container;
    this.build();
  }

  private build(): void {
    this.container.innerHTML = `
      <style>
        :root {
          --gold: #fbbf24;
          --gold-light: #fef08a;
          --gold-dark: #d97706;
          --crimson: #dc2626;
          --blue-p1: #3b82f6;
          --blue-p1-glow: rgba(59,130,246,0.6);
          --red-p2: #ef4444;
          --red-p2-glow: rgba(239,68,68,0.6);
          --hp-green: #22c55e;
          --hp-yellow: #eab308;
          --hp-red: #ef4444;
          --dark-bg: #080c14;
          --panel-bg: rgba(10,14,24,0.92);
          --border-muted: #1e2d44;
        }

        .hud-wrapper {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 14px 20px 12px;
          pointer-events: none;
          font-family: 'Rajdhani', sans-serif;
        }

        /* ─── TOP BAR ─────────────────────────────── */
        .hud-top {
          display: grid;
          grid-template-columns: 1fr 110px 1fr;
          align-items: start;
          gap: 12px;
        }

        .fighter-hud {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .fighter-hud.p2 {
          align-items: flex-end;
        }

        /* Name row */
        .fighter-name-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .fighter-hud.p2 .fighter-name-row {
          flex-direction: row-reverse;
        }

        .fighter-name {
          font-family: 'Teko', sans-serif;
          font-size: 1.9rem;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          line-height: 1;
          position: relative;
        }

        .fighter-name::after {
          content: '';
          position: absolute;
          bottom: -3px;
          left: 0;
          right: 0;
          height: 2px;
          border-radius: 1px;
        }

        .p1 .fighter-name {
          color: #e0eeff;
          text-shadow: 0 0 18px var(--blue-p1-glow), 0 2px 6px rgba(0,0,0,0.9);
        }
        .p1 .fighter-name::after { background: var(--blue-p1); box-shadow: 0 0 8px var(--blue-p1-glow); }

        .p2 .fighter-name {
          color: #ffe0e0;
          text-shadow: 0 0 18px var(--red-p2-glow), 0 2px 6px rgba(0,0,0,0.9);
        }
        .p2 .fighter-name::after { background: var(--red-p2); box-shadow: 0 0 8px var(--red-p2-glow); }

        /* Round win pips — diamond shapes */
        .round-pips {
          display: flex;
          gap: 5px;
          align-items: center;
        }

        .pip {
          width: 13px;
          height: 13px;
          transform: rotate(45deg);
          border: 2px solid #334155;
          background: rgba(0,0,0,0.5);
          box-shadow: 0 0 4px rgba(0,0,0,0.6);
          transition: all 0.3s ease;
        }

        .pip.active {
          background: var(--gold);
          border-color: var(--gold-light);
          box-shadow: 0 0 10px var(--gold), 0 0 20px rgba(251,191,36,0.4);
        }

        /* Health bar */
        .health-bar-frame {
          position: relative;
          width: 100%;
          height: 22px;
          background: #03060f;
          border: 1px solid #1a2840;
          border-radius: 2px;
          overflow: hidden;
          transform: skewX(-8deg);
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03);
          /* Scanline texture */
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0px,
            transparent 3px,
            rgba(0,0,0,0.25) 3px,
            rgba(0,0,0,0.25) 4px
          );
        }

        .p2 .health-bar-frame {
          transform: skewX(8deg);
        }

        .health-bar-delay {
          position: absolute;
          top: 0;
          bottom: 0;
          background: #b45309;
          transition: width 0.45s ease-out;
        }

        .health-bar-fill {
          position: absolute;
          top: 0;
          bottom: 0;
          transition: width 0.08s ease-out, background 0.6s ease;
        }

        /* Dynamic color: green → yellow → red via CSS gradient trick */
        .p1 .health-bar-fill,
        .p2 .health-bar-fill {
          background: linear-gradient(90deg, var(--hp-red) 0%, var(--hp-yellow) 50%, var(--hp-green) 100%);
          background-size: 300% 100%;
          background-position: right center; /* full HP = right = green */
          box-shadow: 0 0 10px rgba(34,197,94,0.5);
        }

        .p1 .health-bar-fill,
        .p1 .health-bar-delay {
          left: 0;
        }

        .p2 .health-bar-fill,
        .p2 .health-bar-delay {
          right: 0;
        }

        /* Guard Gauge sub-bar */
        .guard-bar-frame {
          width: 100%;
          height: 5px;
          background: rgba(0,0,0,0.7);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 2px;
          margin-top: 4px;
          overflow: hidden;
        }

        .guard-bar-fill {
          height: 100%;
          background: #38bdf8;
          box-shadow: 0 0 6px rgba(56,189,248,0.6);
          transition: width 0.05s ease, background 0.2s ease;
        }

        .p2 .guard-bar-fill {
          float: right;
        }

        /* Timer */
        .timer-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .timer-box {
          width: 76px;
          height: 56px;
          background: linear-gradient(180deg, #111827 0%, #0a0e1a 100%);
          border: 2px solid #1e3050;
          clip-path: polygon(8% 0%, 92% 0%, 100% 15%, 100% 85%, 92% 100%, 8% 100%, 0% 85%, 0% 15%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Teko', sans-serif;
          font-size: 2.8rem;
          font-weight: 700;
          color: #e2e8f0;
          text-shadow: 0 0 14px rgba(255,220,80,0.3);
          box-shadow: 0 4px 16px rgba(0,0,0,0.7);
        }

        .timer-box.urgent {
          color: var(--crimson);
          border-color: var(--crimson);
          text-shadow: 0 0 12px rgba(220,38,38,0.9);
          animation: pulseTimer 0.55s infinite alternate;
        }

        @keyframes pulseTimer {
          from { transform: scale(1); box-shadow: 0 4px 16px rgba(220,38,38,0.4); }
          to   { transform: scale(1.1); box-shadow: 0 4px 24px rgba(220,38,38,0.8); }
        }

        /* ─── CENTER ───────────────────────────────── */
        .hud-center {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
          pointer-events: none;
        }

        .announcer-banner {
          font-family: 'Teko', sans-serif;
          font-size: 5.5rem;
          font-weight: 700;
          letter-spacing: 5px;
          text-transform: uppercase;
          background: linear-gradient(180deg, #fff5b0 0%, var(--gold) 45%, #b45309 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 0 20px rgba(251,191,36,0.9)) drop-shadow(0 4px 8px rgba(0,0,0,0.9));
          opacity: 0;
          transform: scale(0.6) translateY(10px);
          transition: all 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          text-align: center;
        }

        .announcer-banner.visible {
          opacity: 1;
          transform: scale(1.08) translateY(0);
        }

        /* Combo Counter */
        .combo-counter {
          position: absolute;
          left: 36px;
          top: 36%;
          display: flex;
          flex-direction: column;
          opacity: 0;
          transform: translateX(-40px);
          transition: all 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .combo-counter.visible {
          opacity: 1;
          transform: translateX(0);
        }

        .combo-hits {
          font-family: 'Teko', sans-serif;
          font-size: 5rem;
          font-weight: 700;
          line-height: 0.85;
          color: #f97316;
          text-shadow: 0 0 20px #ea580c, 0 0 40px rgba(234,88,12,0.4);
        }

        .combo-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 3px;
          color: var(--gold);
          text-shadow: 0 0 8px rgba(251,191,36,0.6);
        }

        /* ─── BOTTOM SUPER METERS ──────────────────── */
        .hud-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .meter-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 300px;
        }

        .meter-container.p2 {
          align-items: flex-end;
        }

        .meter-label {
          font-family: 'Teko', sans-serif;
          font-size: 1.1rem;
          letter-spacing: 3px;
          font-weight: 700;
        }

        .p1 .meter-label { color: var(--blue-p1); }
        .p2 .meter-label { color: var(--red-p2); }

        .meter-frame {
          position: relative;
          width: 100%;
          height: 16px;
          background: #040710;
          border: 1px solid #1a2840;
          border-radius: 2px;
          overflow: visible;
          transform: skewX(-10deg);
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.9);
        }

        .p2 .meter-frame {
          transform: skewX(10deg);
        }

        .meter-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--blue-p1) 0%, #06b6d4 100%);
          width: 0%;
          transition: width 0.12s ease-out;
          position: relative;
        }

        .p2 .meter-fill {
          background: linear-gradient(90deg, #c026d3 0%, var(--red-p2) 100%);
        }

        /* Tick marks overlaid on meter */
        .meter-ticks {
          position: absolute;
          inset: 0;
          display: flex;
          pointer-events: none;
        }

        .meter-tick {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 2px;
          background: rgba(0,0,0,0.5);
        }

        .meter-tick:nth-child(1) { left: 25%; }
        .meter-tick:nth-child(2) { left: 50%; }
        .meter-tick:nth-child(3) { left: 75%; }

        .meter-fill.ready {
          background: linear-gradient(90deg, var(--gold-dark) 0%, var(--gold) 50%, var(--gold-light) 100%);
          animation: pulseMeter 0.5s infinite alternate;
          box-shadow: 0 0 14px var(--gold), 0 0 28px rgba(251,191,36,0.4);
        }

        @keyframes pulseMeter {
          from { filter: brightness(1.0); }
          to   { filter: brightness(1.7); }
        }

        /* ─── PAUSE BUTTON ─────────────────────────── */
        .hud-pause-btn {
          position: absolute;
          top: 14px;
          right: 14px;
          pointer-events: auto;
          background: rgba(8,12,20,0.85);
          border: 1px solid #1e3050;
          color: #94a3b8;
          width: 36px;
          height: 36px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .hud-pause-btn:hover {
          background: rgba(30,41,59,0.95);
          color: #fff;
          border-color: var(--gold);
        }

        /* ─── RESPONSIVE ───────────────────────────── */
        @media (max-width: 768px) {
          .hud-wrapper { padding: 8px 10px; }
          .meter-container { width: 150px; }
          .fighter-name { font-size: 1.3rem; }
          .timer-box { width: 58px; height: 44px; font-size: 2.1rem; }
          .health-bar-frame { height: 16px; }
          .combo-hits { font-size: 3.5rem; }
          .announcer-banner { font-size: 3.5rem; }
        }
      </style>

      <div class="hud-wrapper">
        <!-- TOP: P1 Health | Timer | P2 Health -->
        <div class="hud-top">
          <!-- P1 -->
          <div class="fighter-hud p1">
            <div class="fighter-name-row">
              <span id="p1-name" class="fighter-name">PLAYER 1</span>
              <div class="round-pips">
                <div class="pip p1-pip"></div>
                <div class="pip p1-pip"></div>
              </div>
            </div>
            <div class="health-bar-frame">
              <div id="p1-hp-delay" class="health-bar-delay" style="width: 100%;"></div>
              <div id="p1-hp-fill" class="health-bar-fill" style="width: 100%;"></div>
            </div>
            <div class="guard-bar-frame">
              <div id="p1-guard-fill" class="guard-bar-fill" style="width: 100%;"></div>
            </div>
          </div>

          <!-- Round Timer -->
          <div class="timer-container">
            <div id="round-timer" class="timer-box">60</div>
          </div>

          <!-- P2 -->
          <div class="fighter-hud p2">
            <div class="fighter-name-row">
              <span id="p2-name" class="fighter-name">PLAYER 2</span>
              <div class="round-pips">
                <div class="pip p2-pip"></div>
                <div class="pip p2-pip"></div>
              </div>
            </div>
            <div class="health-bar-frame">
              <div id="p2-hp-delay" class="health-bar-delay" style="width: 100%;"></div>
              <div id="p2-hp-fill" class="health-bar-fill" style="width: 100%;"></div>
            </div>
            <div class="guard-bar-frame">
              <div id="p2-guard-fill" class="guard-bar-fill" style="width: 100%;"></div>
            </div>
          </div>
        </div>

        <!-- CENTER: Announcer Banners & Combo Counter -->
        <div class="hud-center">
          <div id="announcer-banner" class="announcer-banner">ROUND 1</div>
          <div id="combo-counter" class="combo-counter">
            <span id="combo-hits" class="combo-hits">2</span>
            <span class="combo-label">HIT COMBO</span>
          </div>
        </div>

        <!-- BOTTOM: Super Meters -->
        <div class="hud-bottom">
          <div class="meter-container p1">
            <div class="meter-label">POWER GAUGE &nbsp;<span id="p1-meter-txt">0%</span></div>
            <div class="meter-frame">
              <div id="p1-meter-fill" class="meter-fill" style="width: 0%;"></div>
              <div class="meter-ticks">
                <div class="meter-tick"></div>
                <div class="meter-tick"></div>
                <div class="meter-tick"></div>
              </div>
            </div>
          </div>

          <div class="meter-container p2">
            <div class="meter-label"><span id="p2-meter-txt">0%</span>&nbsp; POWER GAUGE</div>
            <div class="meter-frame">
              <div id="p2-meter-fill" class="meter-fill" style="width: 0%;"></div>
              <div class="meter-ticks">
                <div class="meter-tick"></div>
                <div class="meter-tick"></div>
                <div class="meter-tick"></div>
              </div>
            </div>
          </div>
        </div>

        <button id="btn-pause" class="hud-pause-btn" title="Pause">
          <i class="fa-solid fa-pause"></i>
        </button>
      </div>
    `;

    this.p1HealthFill = this.container.querySelector('#p1-hp-fill');
    this.p1HealthDelay = this.container.querySelector('#p1-hp-delay');
    this.p1GuardFill = this.container.querySelector('#p1-guard-fill');
    this.p2HealthFill = this.container.querySelector('#p2-hp-fill');
    this.p2HealthDelay = this.container.querySelector('#p2-hp-delay');
    this.p2GuardFill = this.container.querySelector('#p2-guard-fill');

    this.p1MeterFill = this.container.querySelector('#p1-meter-fill');
    this.p2MeterFill = this.container.querySelector('#p2-meter-fill');

    this.timerEl = this.container.querySelector('#round-timer');
    this.bannerEl = this.container.querySelector('#announcer-banner');
    this.comboEl = this.container.querySelector('#combo-counter');

    this.p1RoundPips = Array.from(this.container.querySelectorAll('.p1-pip'));
    this.p2RoundPips = Array.from(this.container.querySelectorAll('.p2-pip'));
  }

  public setFighterNames(p1Name: string, p2Name: string): void {
    const el1 = this.container.querySelector('#p1-name');
    const el2 = this.container.querySelector('#p2-name');
    if (el1) el1.textContent = p1Name;
    if (el2) el2.textContent = p2Name;
  }

  public showBanner(text: string): void {
    if (!this.bannerEl) return;
    if (text) {
      this.bannerEl.textContent = text;
      this.bannerEl.classList.add('visible');
    } else {
      this.bannerEl.classList.remove('visible');
    }
  }

  public update(p1: Fighter, p2: Fighter, match: MatchManager, dt: number): void {
    // 1. Health Bars
    const p1HpPercent = Math.max(0, (p1.health / p1.maxHealth) * 100);
    const p2HpPercent = Math.max(0, (p2.health / p2.maxHealth) * 100);

    if (this.p1HealthFill) {
      this.p1HealthFill.style.width = `${p1HpPercent}%`;
      // Shift background position: 100%=green (right), 0%=red (left)
      (this.p1HealthFill as HTMLElement).style.backgroundPosition = `${p1HpPercent}% center`;
    }
    if (this.p2HealthFill) {
      this.p2HealthFill.style.width = `${p2HpPercent}%`;
      (this.p2HealthFill as HTMLElement).style.backgroundPosition = `${p2HpPercent}% center`;
    }

    // Chip delay catch-up
    this.p1DelayedHp = THREE.MathUtils.lerp(this.p1DelayedHp, p1HpPercent, dt * 4);
    this.p2DelayedHp = THREE.MathUtils.lerp(this.p2DelayedHp, p2HpPercent, dt * 4);

    if (this.p1HealthDelay) this.p1HealthDelay.style.width = `${this.p1DelayedHp}%`;
    if (this.p2HealthDelay) this.p2HealthDelay.style.width = `${this.p2DelayedHp}%`;

    // 1b. Guard Gauges
    if (this.p1GuardFill) {
      const p1Guard = Math.max(0, p1.guardGauge);
      this.p1GuardFill.style.width = `${p1Guard}%`;
      this.p1GuardFill.style.background = p1Guard < 30 ? '#ef4444' : p1Guard < 60 ? '#f59e0b' : '#38bdf8';
    }
    if (this.p2GuardFill) {
      const p2Guard = Math.max(0, p2.guardGauge);
      this.p2GuardFill.style.width = `${p2Guard}%`;
      this.p2GuardFill.style.background = p2Guard < 30 ? '#ef4444' : p2Guard < 60 ? '#f59e0b' : '#38bdf8';
    }

    // 2. Super Meters
    if (this.p1MeterFill) {
      this.p1MeterFill.style.width = `${p1.meter}%`;
      const ready = p1.meter >= 100;
      this.p1MeterFill.classList.toggle('ready', ready);
      const txt = this.container.querySelector('#p1-meter-txt');
      if (txt) txt.textContent = ready ? 'MAX!' : `${Math.round(p1.meter)}%`;
    }

    if (this.p2MeterFill) {
      this.p2MeterFill.style.width = `${p2.meter}%`;
      const ready = p2.meter >= 100;
      this.p2MeterFill.classList.toggle('ready', ready);
      const txt = this.container.querySelector('#p2-meter-txt');
      if (txt) txt.textContent = ready ? 'MAX!' : `${Math.round(p2.meter)}%`;
    }

    // 3. Round Timer
    if (this.timerEl) {
      if (match.settings.roundTimer === 0) {
        this.timerEl.textContent = '∞';
        this.timerEl.classList.remove('urgent');
      } else {
        const remaining = Math.ceil(match.roundTimeRemaining);
        this.timerEl.textContent = `${remaining}`;
        this.timerEl.classList.toggle('urgent', remaining <= 10);
      }
    }

    // 4. Round Win Pips
    this.p1RoundPips.forEach((pip, idx) => {
      pip.classList.toggle('active', idx < match.p1RoundsWon);
    });
    this.p2RoundPips.forEach((pip, idx) => {
      pip.classList.toggle('active', idx < match.p2RoundsWon);
    });

    // 5. Combo Counter
    if (this.comboEl) {
      const activeCombo = p1.comboHitCount > 1 ? p1.comboHitCount : p2.comboHitCount > 1 ? p2.comboHitCount : 0;
      if (activeCombo > 1) {
        this.comboEl.classList.add('visible');
        const hitsEl = this.container.querySelector('#combo-hits');
        if (hitsEl) hitsEl.textContent = `${activeCombo}`;
      } else {
        this.comboEl.classList.remove('visible');
      }
    }
  }

  public onPauseClicked(cb: () => void): void {
    const btn = this.container.querySelector('#btn-pause');
    if (btn) btn.addEventListener('click', cb);
  }
}
