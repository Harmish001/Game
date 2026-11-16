import * as THREE from 'three';
import { Fighter } from '../game/Fighter';
import { MatchManager } from '../game/MatchManager';

export class HUD {
  private container: HTMLElement;
  private p1HealthFill: HTMLElement | null = null;
  private p1HealthDelay: HTMLElement | null = null;
  private p2HealthFill: HTMLElement | null = null;
  private p2HealthDelay: HTMLElement | null = null;

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
        .hud-wrapper {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 16px 24px;
          pointer-events: none;
          font-family: 'Rajdhani', sans-serif;
        }

        /* Top Bar: Health, Names, Timer, Pips */
        .hud-top {
          display: grid;
          grid-template-columns: 1fr 120px 1fr;
          align-items: center;
          gap: 16px;
        }

        .fighter-hud {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .fighter-hud.p2 {
          align-items: flex-end;
        }

        .fighter-info {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .fighter-hud.p2 .fighter-info {
          flex-direction: row-reverse;
        }

        .fighter-name {
          font-family: 'Teko', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
          line-height: 1;
        }

        .p1 .fighter-name { color: #60a5fa; }
        .p2 .fighter-name { color: #f87171; }

        .round-pips {
          display: flex;
          gap: 6px;
        }

        .pip {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          border: 2px solid #e2e8f0;
          background: rgba(0,0,0,0.5);
          box-shadow: 0 0 6px rgba(0,0,0,0.6);
        }

        .pip.active {
          background: #facc15;
          border-color: #fef08a;
          box-shadow: 0 0 10px #facc15;
        }

        /* Health Bar Containers */
        .health-bar-frame {
          position: relative;
          width: 100%;
          height: 24px;
          background: #0f172a;
          border: 2px solid #334155;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.5);
          transform: skewX(-12deg);
        }

        .health-bar-delay {
          position: absolute;
          top: 0;
          bottom: 0;
          background: #ef4444;
          transition: width 0.4s ease-out;
        }

        .health-bar-fill {
          position: absolute;
          top: 0;
          bottom: 0;
          background: linear-gradient(90deg, #22c55e, #84cc16);
          box-shadow: 0 0 8px rgba(34, 197, 94, 0.6);
          transition: width 0.08s ease-out;
        }

        .p1 .health-bar-fill, .p1 .health-bar-delay {
          left: 0;
        }

        .p2 .health-bar-frame {
          transform: skewX(12deg);
        }

        .p2 .health-bar-fill, .p2 .health-bar-delay {
          right: 0;
          background: linear-gradient(90deg, #84cc16, #22c55e);
        }

        /* Round Timer */
        .timer-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .timer-box {
          width: 80px;
          height: 60px;
          background: linear-gradient(180deg, #1e293b, #0f172a);
          border: 2px solid #475569;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Teko', sans-serif;
          font-size: 3rem;
          font-weight: 700;
          color: #f8fafc;
          text-shadow: 0 0 12px rgba(255, 204, 0, 0.4);
          box-shadow: 0 4px 16px rgba(0,0,0,0.6);
        }

        .timer-box.urgent {
          color: #ef4444;
          border-color: #ef4444;
          animation: pulseTimer 0.6s infinite alternate;
        }

        @keyframes pulseTimer {
          from { transform: scale(1); }
          to { transform: scale(1.08); }
        }

        /* Center Banner */
        .hud-center {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 1;
        }

        .announcer-banner {
          font-family: 'Teko', sans-serif;
          font-size: 5rem;
          font-weight: 700;
          letter-spacing: 4px;
          color: #facc15;
          text-shadow: 0 4px 20px rgba(0,0,0,0.9), 0 0 25px rgba(250, 204, 21, 0.8);
          opacity: 0;
          transform: scale(0.7);
          transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          text-align: center;
        }

        .announcer-banner.visible {
          opacity: 1;
          transform: scale(1.1);
        }

        /* Combo Counter */
        .combo-counter {
          position: absolute;
          left: 40px;
          top: 38%;
          display: flex;
          flex-direction: column;
          opacity: 0;
          transform: translateX(-30px);
          transition: all 0.2s ease;
        }

        .combo-counter.visible {
          opacity: 1;
          transform: translateX(0);
        }

        .combo-hits {
          font-family: 'Teko', sans-serif;
          font-size: 4rem;
          font-weight: 700;
          line-height: 0.9;
          color: #f97316;
          text-shadow: 0 0 16px #ea580c;
        }

        .combo-label {
          font-size: 1.2rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: #fef08a;
        }

        /* Bottom Super Meters */
        .hud-bottom {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
        }

        .meter-container {
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 320px;
        }

        .meter-container.p2 {
          align-items: flex-end;
        }

        .meter-label {
          font-family: 'Teko', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 2px;
          font-weight: 700;
          color: #94a3b8;
        }

        .meter-frame {
          position: relative;
          width: 100%;
          height: 18px;
          background: #090d16;
          border: 2px solid #334155;
          border-radius: 4px;
          overflow: hidden;
          transform: skewX(-10deg);
        }

        .p2 .meter-frame {
          transform: skewX(10deg);
        }

        .meter-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6, #06b6d4);
          width: 0%;
          transition: width 0.1s ease-out;
        }

        .meter-fill.ready {
          background: linear-gradient(90deg, #f59e0b, #ef4444);
          animation: pulseMeter 0.5s infinite alternate;
          box-shadow: 0 0 12px #f59e0b;
        }

        @keyframes pulseMeter {
          from { filter: brightness(1.0); }
          to { filter: brightness(1.6); }
        }

        /* Mobile Pause Button */
        .hud-pause-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          pointer-events: auto;
          background: rgba(15, 23, 42, 0.8);
          border: 1px solid #475569;
          color: #fff;
          width: 38px;
          height: 38px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .hud-wrapper { padding: 10px 12px; }
          .meter-container { width: 160px; }
          .fighter-name { font-size: 1.4rem; }
          .timer-box { width: 60px; height: 46px; font-size: 2.2rem; }
          .health-bar-frame { height: 18px; }
        }
      </style>

      <div class="hud-wrapper">
        <!-- TOP: P1 Health | Timer | P2 Health -->
        <div class="hud-top">
          <!-- P1 -->
          <div class="fighter-hud p1">
            <div class="fighter-info">
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
          </div>

          <!-- Round Timer -->
          <div class="timer-container">
            <div id="round-timer" class="timer-box">60</div>
          </div>

          <!-- P2 -->
          <div class="fighter-hud p2">
            <div class="fighter-info">
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
          </div>
        </div>

        <!-- CENTER: Announcer Banners & Combo Counter -->
        <div class="hud-center">
          <div id="announcer-banner" class="announcer-banner">ROUND 1</div>
          <div id="combo-counter" class="combo-counter">
            <span id="combo-hits" class="combo-hits">2</span>
            <span class="combo-label">HITS COMBO!</span>
          </div>
        </div>

        <!-- BOTTOM: Super Meters -->
        <div class="hud-bottom">
          <div class="meter-container p1">
            <div class="meter-label">SUPER GAUGE <span id="p1-meter-txt">0%</span></div>
            <div class="meter-frame">
              <div id="p1-meter-fill" class="meter-fill" style="width: 0%;"></div>
            </div>
          </div>

          <div class="meter-container p2">
            <div class="meter-label"><span id="p2-meter-txt">0%</span> SUPER GAUGE</div>
            <div class="meter-frame">
              <div id="p2-meter-fill" class="meter-fill" style="width: 0%;"></div>
            </div>
          </div>
        </div>

        <button id="btn-pause" class="hud-pause-btn" title="Pause">⏸</button>
      </div>
    `;

    this.p1HealthFill = this.container.querySelector('#p1-hp-fill');
    this.p1HealthDelay = this.container.querySelector('#p1-hp-delay');
    this.p2HealthFill = this.container.querySelector('#p2-hp-fill');
    this.p2HealthDelay = this.container.querySelector('#p2-hp-delay');

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

    if (this.p1HealthFill) this.p1HealthFill.style.width = `${p1HpPercent}%`;
    if (this.p2HealthFill) this.p2HealthFill.style.width = `${p2HpPercent}%`;

    // Chip delay catch-up
    this.p1DelayedHp = THREE.MathUtils.lerp(this.p1DelayedHp, p1HpPercent, dt * 4);
    this.p2DelayedHp = THREE.MathUtils.lerp(this.p2DelayedHp, p2HpPercent, dt * 4);

    if (this.p1HealthDelay) this.p1HealthDelay.style.width = `${this.p1DelayedHp}%`;
    if (this.p2HealthDelay) this.p2HealthDelay.style.width = `${this.p2DelayedHp}%`;

    // 2. Super Meters
    if (this.p1MeterFill) {
      this.p1MeterFill.style.width = `${p1.meter}%`;
      const ready = p1.meter >= 100;
      this.p1MeterFill.classList.toggle('ready', ready);
      const txt = this.container.querySelector('#p1-meter-txt');
      if (txt) txt.textContent = ready ? 'MAX READY!' : `${Math.round(p1.meter)}%`;
    }

    if (this.p2MeterFill) {
      this.p2MeterFill.style.width = `${p2.meter}%`;
      const ready = p2.meter >= 100;
      this.p2MeterFill.classList.toggle('ready', ready);
      const txt = this.container.querySelector('#p2-meter-txt');
      if (txt) txt.textContent = ready ? 'MAX READY!' : `${Math.round(p2.meter)}%`;
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
