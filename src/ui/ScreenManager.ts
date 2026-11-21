import { AIDifficulty, FighterId, GameMode, MatchSettings } from '../game/types';
import { CHARACTER_ROSTER } from '../characters/roster';
import { AudioManager } from '../engine/AudioManager';
import { MatchStats } from '../game/MatchManager';

export class ScreenManager {
  private container: HTMLElement;
  private audio: AudioManager;

  // Selected match settings
  public matchSettings: MatchSettings = {
    mode: 'vs_cpu',
    roundsToWin: 2,
    roundTimer: 60,
    difficulty: 'normal',
    p1Character: 'opener',
    p2Character: 'finisher',
    arena: 'stadium_day'
  };

  public onStartMatch?: (settings: MatchSettings) => void;
  public onResumeMatch?: () => void;
  public onRestartMatch?: () => void;
  public onQuitToMenu?: () => void;
  public onPreviewFighter?: (fighterId: FighterId) => void;

  /** Match asset loader overlay (blocks blank fight canvas) */
  public showMatchLoader(p1Name: string, p2Name: string): void {
    this.container.innerHTML = `
      ${this.sharedStyles}
      <style>
        .match-loader {
          position: absolute;
          inset: 0;
          z-index: 50;
          pointer-events: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          background:
            radial-gradient(ellipse at 50% 40%, rgba(30,58,138,0.35) 0%, transparent 55%),
            linear-gradient(180deg, #06090f 0%, #0c1220 100%);
        }
        .match-loader-vs {
          font-family: 'Teko', sans-serif;
          font-size: clamp(1.8rem, 5vw, 3rem);
          letter-spacing: 4px;
          text-transform: uppercase;
          color: #e2e8f0;
        }
        .match-loader-vs span.gold { color: var(--gold); }
        .match-loader-bar {
          width: min(420px, 72vw);
          height: 10px;
          border-radius: 6px;
          background: #0f172a;
          border: 1px solid #1e3a5f;
          overflow: hidden;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.6);
        }
        .match-loader-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #1d4ed8, #fbbf24, #fef08a);
          background-size: 200% 100%;
          animation: loaderShine 1.2s linear infinite;
          transition: width 0.15s ease-out;
        }
        @keyframes loaderShine {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }
        .match-loader-pct {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.35rem;
          font-weight: 700;
          color: #94a3b8;
          letter-spacing: 2px;
        }
        .match-loader-hint {
          font-size: 0.95rem;
          color: #64748b;
          letter-spacing: 1px;
        }
        .match-loader-spin {
          width: 42px;
          height: 42px;
          border: 3px solid #1e3a5f;
          border-top-color: var(--gold);
          border-radius: 50%;
          animation: spinLoader 0.7s linear infinite;
        }
        @keyframes spinLoader {
          to { transform: rotate(360deg); }
        }
      </style>
      <div class="match-loader interactive" id="match-loader">
        <div class="match-loader-spin" aria-hidden="true"></div>
        <div class="match-loader-vs">
          ${p1Name} <span class="gold">VS</span> ${p2Name}
        </div>
        <div class="match-loader-bar">
          <div class="match-loader-fill" id="match-loader-fill"></div>
        </div>
        <div class="match-loader-pct" id="match-loader-pct">LOADING 0%</div>
        <div class="match-loader-hint">Preparing fighters…</div>
      </div>
    `;
  }

  public updateMatchLoader(progress01: number, hint?: string): void {
    const pct = Math.max(0, Math.min(100, Math.round(progress01 * 100)));
    const fill = this.container.querySelector('#match-loader-fill') as HTMLElement | null;
    const label = this.container.querySelector('#match-loader-pct');
    const hintEl = this.container.querySelector('.match-loader-hint');
    if (fill) fill.style.width = `${pct}%`;
    if (label) label.textContent = `LOADING ${pct}%`;
    if (hint && hintEl) hintEl.textContent = hint;
  }

  public hideMatchLoader(): void {
    this.container.innerHTML = '';
  }

  constructor(container: HTMLElement, audio: AudioManager) {
    this.container = container;
    this.audio = audio;
  }

  // ─── SHARED STYLES ────────────────────────────────────────────────────────

  private get sharedStyles(): string {
    return `
      <style>
        :root {
          --gold: #fbbf24;
          --gold-light: #fef08a;
          --gold-dark: #d97706;
          --crimson: #dc2626;
          --blue-p1: #3b82f6;
          --red-p2: #ef4444;
          --dark-bg: #06090f;
          --panel-bg: rgba(10,14,24,0.92);
          --border-muted: #1e2d44;
          --border-accent: #2a3f60;
        }

        /* Animated diagonal bg */
        .cc-screen {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          color: #fff;
          z-index: 50;
          overflow: hidden;
          background:
            radial-gradient(ellipse at 20% 50%, rgba(59,130,246,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 50%, rgba(220,38,38,0.07) 0%, transparent 60%),
            linear-gradient(170deg, #060a14 0%, #0a0e1c 40%, #060810 100%);
        }

        /* Vignette overlay */
        .cc-screen::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.75) 100%);
          pointer-events: none;
          z-index: 0;
        }

        /* Scanline overlay */
        .cc-screen::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(
            to bottom,
            transparent 0px, transparent 2px,
            rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px
          );
          pointer-events: none;
          z-index: 1;
          opacity: 0.5;
        }

        .cc-content {
          position: relative;
          z-index: 2;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* ─── Menu Button ─────────────────────────── */
        .btn-menu {
          background: linear-gradient(90deg, rgba(16,24,40,0.9) 0%, rgba(10,14,24,0.95) 100%);
          border: 1px solid var(--border-accent);
          border-left: 3px solid var(--blue-p1);
          color: #e2e8f0;
          padding: 13px 20px;
          font-family: 'Teko', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-radius: 3px;
          position: relative;
          overflow: hidden;
          clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 0px));
        }

        .btn-menu::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(90deg, rgba(59,130,246,0.08) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.2s ease;
        }

        .btn-menu:hover::before { opacity: 1; }

        .btn-menu:hover {
          border-left-color: var(--gold);
          border-color: var(--border-accent);
          transform: translateX(10px);
          box-shadow: -4px 0 20px rgba(251,191,36,0.3), 0 4px 16px rgba(0,0,0,0.5);
          color: #fff;
        }

        .btn-menu:active { transform: scale(0.98) translateX(5px); }

        .btn-menu .btn-icon {
          color: var(--blue-p1);
          font-size: 1.1rem;
          width: 24px;
          text-align: center;
          transition: color 0.2s;
        }
        .btn-menu:hover .btn-icon { color: var(--gold); }

        .btn-menu .btn-arrow {
          color: #475569;
          font-size: 0.9rem;
          transition: color 0.2s, transform 0.2s;
        }
        .btn-menu:hover .btn-arrow { color: var(--gold); transform: translateX(4px); }

        .btn-menu .btn-label { flex: 1; text-align: left; }

        /* ─── Action Buttons ──────────────────────── */
        .btn-confirm {
          background: linear-gradient(90deg, var(--gold-dark) 0%, var(--gold) 100%);
          border: none;
          color: #000;
          padding: 13px 32px;
          font-family: 'Teko', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 2px;
          border-radius: 3px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.2s ease;
          box-shadow: 0 4px 18px rgba(251,191,36,0.4);
          clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
        }

        .btn-confirm:hover {
          filter: brightness(1.15);
          transform: translateY(-2px);
          box-shadow: 0 6px 24px rgba(251,191,36,0.6);
        }

        .btn-back {
          background: transparent;
          border: 1px solid #334155;
          color: #94a3b8;
          padding: 13px 24px;
          font-family: 'Teko', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 2px;
          border-radius: 3px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.2s ease;
        }

        .btn-back:hover {
          border-color: #fff;
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
      </style>
    `;
  }

  // ─── MAIN MENU ────────────────────────────────────────────────────────────

  public showMainMenu(): void {
    this.container.innerHTML = `
      ${this.sharedStyles}
      <style>
        .menu-logo {
          text-align: center;
          margin-bottom: 2.5rem;
          position: relative;
          z-index: 2;
        }

        .main-title {
          font-family: 'Teko', sans-serif;
          font-size: 6.5rem;
          font-weight: 700;
          letter-spacing: 6px;
          line-height: 0.88;
          background: linear-gradient(180deg, #fff9c4 0%, var(--gold) 40%, #b45309 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 4px 24px rgba(251,191,36,0.7));
          animation: glowPulse 3s ease-in-out infinite alternate;
        }

        @keyframes glowPulse {
          from { filter: drop-shadow(0 4px 20px rgba(251,191,36,0.5)); }
          to   { filter: drop-shadow(0 4px 32px rgba(251,191,36,1.0)) drop-shadow(0 0 60px rgba(251,191,36,0.3)); }
        }

        .main-subtitle {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1rem;
          letter-spacing: 8px;
          color: #64748b;
          text-transform: uppercase;
          margin-top: 8px;
        }

        /* Decorative separator */
        .title-sep {
          width: 180px;
          height: 2px;
          margin: 12px auto 0;
          background: linear-gradient(90deg, transparent, var(--gold), transparent);
        }

        .menu-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 340px;
          position: relative;
          z-index: 2;
        }

        .version-tag {
          position: absolute;
          bottom: 16px;
          color: #2a3f60;
          font-size: 0.85rem;
          letter-spacing: 1px;
          z-index: 2;
        }
      </style>

      <div class="cc-screen">
        <div class="cc-content">
          <div class="menu-logo">
            <h1 class="main-title">CRICKET<br>CLASH</h1>
            <div class="main-subtitle">Fighting Championship</div>
            <div class="title-sep"></div>
          </div>

          <div class="menu-buttons">
            <button class="btn-menu" data-mode="vs_cpu">
              <i class="fa-solid fa-robot btn-icon"></i>
              <span class="btn-label">VS CPU</span>
              <i class="fa-solid fa-chevron-right btn-arrow"></i>
            </button>
            <button class="btn-menu" data-mode="local_2p">
              <i class="fa-solid fa-users btn-icon"></i>
              <span class="btn-label">LOCAL 2-PLAYER</span>
              <i class="fa-solid fa-chevron-right btn-arrow"></i>
            </button>
            <button class="btn-menu" data-mode="training">
              <i class="fa-solid fa-dumbbell btn-icon"></i>
              <span class="btn-label">PRACTICE / TRAINING</span>
              <i class="fa-solid fa-chevron-right btn-arrow"></i>
            </button>
            <button class="btn-menu" data-mode="quick_fight">
              <i class="fa-solid fa-bolt btn-icon"></i>
              <span class="btn-label">QUICK FIGHT</span>
              <i class="fa-solid fa-chevron-right btn-arrow"></i>
            </button>
            <button class="btn-menu" id="btn-open-settings" style="border-left-color: #94a3b8;">
              <i class="fa-solid fa-gear btn-icon" style="color:#94a3b8;"></i>
              <span class="btn-label" style="color:#94a3b8;">SETTINGS</span>
              <i class="fa-solid fa-chevron-right btn-arrow"></i>
            </button>
          </div>
        </div>

        <div class="version-tag">Version 1.0 (MVP) &nbsp;&bull;&nbsp; Built with Three.js</div>
      </div>
    `;

    const buttons = this.container.querySelectorAll('.btn-menu[data-mode]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.audio.playLightHit();
        const mode = btn.getAttribute('data-mode') as GameMode;
        this.matchSettings.mode = mode;
        this.showCharacterSelect();
      });
    });

    const settingsBtn = this.container.querySelector('#btn-open-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.showSettings();
      });
    }
  }

  // ─── CHARACTER SELECT ──────────────────────────────────────────────────────

  public showCharacterSelect(): void {
    const fighters = Object.values(CHARACTER_ROSTER);
    const p1 = CHARACTER_ROSTER[this.matchSettings.p1Character];

    // Mode badge label
    const modeLabels: Record<string, string> = {
      vs_cpu: 'VS CPU',
      local_2p: '2P LOCAL',
      training: 'TRAINING',
      quick_fight: 'QUICK FIGHT'
    };
    const modeBadge = modeLabels[this.matchSettings.mode] || this.matchSettings.mode.toUpperCase();

    this.container.innerHTML = `
      ${this.sharedStyles}
      <style>
        .char-screen {
          position: absolute;
          inset: 0;
          display: grid;
          grid-template-columns: 420px 1fr;
          padding: 28px 36px;
          color: #fff;
          z-index: 50;
          pointer-events: auto;
          background:
            radial-gradient(ellipse at 25% 50%, rgba(59,130,246,0.07) 0%, transparent 55%),
            radial-gradient(ellipse at 75% 50%, rgba(220,38,38,0.06) 0%, transparent 55%),
            linear-gradient(160deg, #060a14 0%, #0a0e1c 50%, #060810 100%);
          overflow: hidden;
        }

        /* Scanline overlay */
        .char-screen::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 3px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
        }

        .char-left, .char-right { position: relative; z-index: 1; }

        .roster-panel {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .screen-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .screen-title {
          font-family: 'Teko', sans-serif;
          font-size: 2.5rem;
          font-weight: 700;
          letter-spacing: 3px;
          color: var(--gold);
          line-height: 1;
          text-shadow: 0 0 20px rgba(251,191,36,0.4);
        }

        .screen-subtitle {
          color: #475569;
          font-size: 0.85rem;
          letter-spacing: 1px;
          margin-top: 3px;
        }

        /* Mode badge */
        .mode-badge {
          background: linear-gradient(135deg, rgba(59,130,246,0.2), rgba(59,130,246,0.1));
          border: 1px solid rgba(59,130,246,0.4);
          color: var(--blue-p1);
          font-family: 'Teko', sans-serif;
          font-size: 1.1rem;
          letter-spacing: 2px;
          padding: 4px 12px;
          border-radius: 2px;
          white-space: nowrap;
        }

        .roster-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .fighter-tile {
          aspect-ratio: 1;
          background: rgba(16,22,36,0.85);
          border: 1px solid var(--border-accent);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          position: relative;
          overflow: hidden;
          gap: 6px;
        }

        /* Geometric diamond placeholder */
        .fighter-tile::before {
          content: '';
          width: 44px;
          height: 44px;
          background: linear-gradient(135deg, #1e3a5f, #0f2040);
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          transition: all 0.2s ease;
          border: none;
        }

        .fighter-tile:hover::before {
          background: linear-gradient(135deg, var(--blue-p1), #1d4ed8);
          transform: scale(1.1) rotate(10deg);
        }

        .fighter-tile:hover {
          border-color: var(--blue-p1);
          transform: translateY(-3px);
          box-shadow: 0 0 16px rgba(59,130,246,0.25), 0 6px 20px rgba(0,0,0,0.5);
        }

        .fighter-tile.selected {
          border-color: var(--gold);
          box-shadow: 0 0 20px rgba(251,191,36,0.5), inset 0 0 20px rgba(251,191,36,0.05);
          background: rgba(251,191,36,0.07);
        }

        .fighter-tile.selected::before {
          background: linear-gradient(135deg, var(--gold-dark), var(--gold));
          transform: rotate(45deg) scale(0.9);
        }

        .tile-name {
          font-family: 'Teko', sans-serif;
          font-size: 1.1rem;
          letter-spacing: 1px;
          text-align: center;
          color: #cbd5e1;
          line-height: 1;
        }

        .fighter-tile.selected .tile-name { color: var(--gold); }

        /* Difficulty buttons */
        .diff-row {
          display: flex;
          gap: 6px;
        }

        .btn-diff {
          flex: 1;
          padding: 7px 4px;
          font-family: 'Teko', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 1px;
          text-transform: uppercase;
          border-radius: 2px;
          cursor: pointer;
          transition: all 0.15s ease;
          background: rgba(16,22,36,0.8);
          color: #64748b;
          border: 1px solid var(--border-muted);
        }

        .btn-diff.active {
          background: var(--gold);
          color: #000;
          border-color: var(--gold);
        }

        .btn-diff:hover:not(.active) {
          border-color: var(--border-accent);
          color: #cbd5e1;
        }

        /* Right panel */
        .info-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-end;
          padding-left: 32px;
        }

        .fighter-detail {
          width: 100%;
          max-width: 460px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          background: rgba(8,12,20,0.9);
          padding: 24px;
          border-radius: 4px;
          border: 1px solid var(--border-accent);
          border-top: 2px solid var(--gold);
          backdrop-filter: blur(10px);
        }

        .detail-archetype {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          letter-spacing: 4px;
          color: var(--gold);
          text-transform: uppercase;
          font-weight: 700;
        }

        .detail-name {
          font-family: 'Teko', sans-serif;
          font-size: 3.6rem;
          font-weight: 700;
          line-height: 0.88;
          color: #e0eeff;
          text-shadow: 0 0 24px rgba(59,130,246,0.5);
        }

        .detail-quote {
          font-style: italic;
          color: #94a3b8;
          border-left: 3px solid var(--blue-p1);
          padding-left: 12px;
          font-size: 0.95rem;
          line-height: 1.4;
        }

        .detail-desc {
          font-size: 0.9rem;
          line-height: 1.6;
          color: #64748b;
        }

        .stat-bars {
          display: flex;
          flex-direction: column;
          gap: 9px;
        }

        .stat-row {
          display: grid;
          grid-template-columns: 72px 1fr 28px;
          align-items: center;
          gap: 10px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          font-weight: 700;
          letter-spacing: 1px;
          color: #64748b;
          text-transform: uppercase;
        }

        .stat-track {
          height: 6px;
          background: #0f172a;
          border-radius: 2px;
          overflow: hidden;
          position: relative;
        }

        .stat-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--blue-p1), #818cf8);
          border-radius: 2px;
          transition: width 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .stat-val {
          text-align: right;
          color: #fff;
        }

        .specials-section {
          border-top: 1px solid var(--border-muted);
          padding-top: 12px;
        }

        .specials-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.8rem;
          letter-spacing: 3px;
          color: var(--gold);
          font-weight: 700;
          margin-bottom: 8px;
          text-transform: uppercase;
        }

        .specials-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .specials-list li {
          font-size: 0.88rem;
          color: #64748b;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .specials-list li::before {
          content: '';
          width: 6px;
          height: 6px;
          background: var(--gold);
          transform: rotate(45deg);
          flex-shrink: 0;
        }

        .specials-list strong { color: #cbd5e1; }

        .bottom-actions {
          display: flex;
          gap: 12px;
          margin-top: 20px;
          align-self: flex-end;
        }
      </style>

      <div class="char-screen">
        <!-- Left: Roster Grid -->
        <div class="char-left roster-panel">
          <div class="screen-header">
            <div>
              <div class="screen-title">SELECT FIGHTER</div>
              <div class="screen-subtitle">CHOOSE YOUR CHAMPION</div>
            </div>
            <div class="mode-badge">${modeBadge}</div>
          </div>

          <div class="roster-grid">
            ${fighters.map(f => `
              <div class="fighter-tile ${f.id === this.matchSettings.p1Character ? 'selected' : ''}" data-id="${f.id}">
                <div class="tile-name">${f.name}</div>
              </div>
            `).join('')}
          </div>

          <!-- Difficulty selection if vs CPU -->
          ${this.matchSettings.mode === 'vs_cpu' ? `
            <div>
              <div style="font-family:'Rajdhani',sans-serif; font-weight:700; color:#475569; font-size:0.8rem; letter-spacing:3px; text-transform:uppercase; margin-bottom:8px;">CPU DIFFICULTY</div>
              <div class="diff-row">
                ${['easy', 'normal', 'hard', 'expert'].map(d => `
                  <button class="btn-diff ${d === this.matchSettings.difficulty ? 'active' : ''}" data-diff="${d}">${d}</button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Right: Fighter Detail Panel -->
        <div class="char-right info-panel">
          <div class="fighter-detail">
            <div>
              <div class="detail-archetype">${p1.archetype} Fighter</div>
              <div class="detail-name">${p1.name}</div>
            </div>

            <div class="detail-quote">"${p1.quote}"</div>
            <p class="detail-desc">${p1.description}</p>

            <div class="stat-bars">
              <div class="stat-row">
                <span>POWER</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.power * 10}%;"></div></div>
                <span class="stat-val">${p1.stats.power}</span>
              </div>
              <div class="stat-row">
                <span>SPEED</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.speed * 10}%;"></div></div>
                <span class="stat-val">${p1.stats.speed}</span>
              </div>
              <div class="stat-row">
                <span>DEFENSE</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.defense * 10}%;"></div></div>
                <span class="stat-val">${p1.stats.defense}</span>
              </div>
              <div class="stat-row">
                <span>REACH</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.reach * 10}%;"></div></div>
                <span class="stat-val">${p1.stats.reach}</span>
              </div>
            </div>

            <div class="specials-section">
              <div class="specials-label">Signature Specials</div>
              <ul class="specials-list">
                ${Object.values(p1.moves).filter(m => m.id.includes('special') || m.id === 'super').map(m => `
                  <li><strong>${m.name}:</strong>&nbsp;<span>${m.input}</span></li>
                `).join('')}
              </ul>
            </div>
          </div>

          <div class="bottom-actions">
            <button class="btn-back" id="btn-back-menu">BACK</button>
            <button class="btn-confirm" id="btn-start-fight">
              <i class="fa-solid fa-swords" style="margin-right:8px;"></i>FIGHT!
            </button>
          </div>
        </div>
      </div>
    `;

    // Setup tile clicks
    const tiles = this.container.querySelectorAll('.fighter-tile');
    tiles.forEach(tile => {
      tile.addEventListener('click', () => {
        this.audio.playLightHit();
        const id = tile.getAttribute('data-id') as FighterId;
        this.matchSettings.p1Character = id;
        // P2 random or alternate
        if (this.matchSettings.mode === 'vs_cpu') {
          const others = fighters.filter(f => f.id !== id);
          this.matchSettings.p2Character = others[Math.floor(Math.random() * others.length)].id;
        }
        if (this.onPreviewFighter) this.onPreviewFighter(id);
        this.showCharacterSelect();
      });
    });

    // Difficulty buttons
    const diffBtns = this.container.querySelectorAll('.btn-diff');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.matchSettings.difficulty = btn.getAttribute('data-diff') as AIDifficulty;
        this.showCharacterSelect();
      });
    });

    // Start fight
    const startBtn = this.container.querySelector('#btn-start-fight');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.audio.playBatHit();
        this.container.innerHTML = '';
        if (this.onStartMatch) {
          this.onStartMatch(this.matchSettings);
        }
      });
    }

    // Back to Menu
    const backBtn = this.container.querySelector('#btn-back-menu');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.showMainMenu();
      });
    }
  }

  // ─── SETTINGS SCREEN ──────────────────────────────────────────────────────

  public showSettings(): void {
    this.container.innerHTML = `
      ${this.sharedStyles}
      <style>
        .settings-screen {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center, rgba(10,14,24,0.85) 0%, rgba(4,7,12,0.98) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          color: #fff;
          z-index: 60;
        }

        .settings-box {
          width: 520px;
          background: rgba(8,12,20,0.95);
          border: 1px solid var(--border-accent);
          border-top: 2px solid var(--gold);
          border-radius: 4px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          backdrop-filter: blur(12px);
        }

        .settings-title {
          font-family: 'Teko', sans-serif;
          font-size: 2.8rem;
          letter-spacing: 3px;
          color: var(--gold);
          line-height: 1;
          margin: 0;
        }

        .settings-title::after {
          content: '';
          display: block;
          width: 60px;
          height: 2px;
          background: var(--gold);
          margin-top: 6px;
          opacity: 0.5;
        }

        .setting-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .setting-label {
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          color: #64748b;
          font-size: 0.85rem;
          letter-spacing: 3px;
          text-transform: uppercase;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .setting-label .val {
          color: var(--gold);
          font-size: 1rem;
        }

        .slider {
          width: 100%;
          accent-color: var(--gold);
          cursor: pointer;
          height: 4px;
        }

        .controls-section {
          border-top: 1px solid var(--border-muted);
          padding-top: 14px;
        }

        .controls-title {
          font-family: 'Rajdhani', sans-serif;
          font-weight: 700;
          color: var(--gold);
          font-size: 0.8rem;
          letter-spacing: 3px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .controls-text {
          font-size: 0.88rem;
          color: #475569;
          line-height: 1.7;
        }

        .controls-text strong { color: #64748b; }
      </style>

      <div class="settings-screen">
        <div class="settings-box">
          <h2 class="settings-title">SETTINGS</h2>

          <!-- Audio Sliders -->
          <div class="setting-group">
            <div class="setting-label">
              <span><i class="fa-solid fa-volume-high" style="margin-right:8px;"></i>MASTER VOLUME</span>
              <span class="val" id="val-master">${Math.round(this.audio.getMasterVolume() * 100)}%</span>
            </div>
            <input type="range" class="slider" id="slider-master" min="0" max="1" step="0.05" value="${this.audio.getMasterVolume()}">
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span><i class="fa-solid fa-waveform" style="margin-right:8px;"></i>SFX VOLUME</span>
              <span class="val" id="val-sfx">${Math.round(this.audio.getSfxVolume() * 100)}%</span>
            </div>
            <input type="range" class="slider" id="slider-sfx" min="0" max="1" step="0.05" value="${this.audio.getSfxVolume()}">
          </div>

          <div class="setting-group">
            <div class="setting-label">
              <span><i class="fa-solid fa-music" style="margin-right:8px;"></i>MUSIC VOLUME</span>
              <span class="val" id="val-music">${Math.round(this.audio.getMusicVolume() * 100)}%</span>
            </div>
            <input type="range" class="slider" id="slider-music" min="0" max="1" step="0.05" value="${this.audio.getMusicVolume()}">
          </div>

          <!-- Controls Help -->
          <div class="controls-section">
            <div class="controls-title"><i class="fa-solid fa-keyboard" style="margin-right:8px;"></i>Keyboard Controls (P1)</div>
            <p class="controls-text">
              <strong>Movement:</strong> W A S D &nbsp;|&nbsp;
              <strong>Attacks:</strong> J (Light Punch), K (Heavy Punch), U (Light Kick), I (Heavy Kick)<br>
              <strong>Block:</strong> L &nbsp;|&nbsp; <strong>Special:</strong> O (or Motion) &nbsp;|&nbsp; <strong>Super:</strong> Space
            </p>
          </div>

          <button id="btn-close-settings" class="btn-confirm" style="align-self:stretch; padding:12px; font-size:1.3rem;">
            <i class="fa-solid fa-xmark" style="margin-right:8px;"></i>CLOSE
          </button>
        </div>
      </div>
    `;

    const sliderMaster = this.container.querySelector('#slider-master') as HTMLInputElement;
    const sliderSfx = this.container.querySelector('#slider-sfx') as HTMLInputElement;
    const sliderMusic = this.container.querySelector('#slider-music') as HTMLInputElement;

    sliderMaster.addEventListener('input', () => {
      const v = parseFloat(sliderMaster.value);
      this.audio.setMasterVolume(v);
      const val = this.container.querySelector('#val-master');
      if (val) val.textContent = `${Math.round(v * 100)}%`;
    });

    sliderSfx.addEventListener('input', () => {
      const v = parseFloat(sliderSfx.value);
      this.audio.setSfxVolume(v);
      const val = this.container.querySelector('#val-sfx');
      if (val) val.textContent = `${Math.round(v * 100)}%`;
    });

    sliderMusic.addEventListener('input', () => {
      const v = parseFloat(sliderMusic.value);
      this.audio.setMusicVolume(v);
      const val = this.container.querySelector('#val-music');
      if (val) val.textContent = `${Math.round(v * 100)}%`;
    });

    const closeBtn = this.container.querySelector('#btn-close-settings');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.showMainMenu();
      });
    }
  }

  // ─── PAUSE MENU ───────────────────────────────────────────────────────────

  public showPauseMenu(): void {
    const pauseEl = document.createElement('div');
    pauseEl.id = 'pause-overlay';
    pauseEl.innerHTML = `
      <style>
        #pause-overlay {
          position: absolute;
          inset: 0;
          background: rgba(4,7,12,0.82);
          backdrop-filter: blur(12px) saturate(0.6);
          -webkit-backdrop-filter: blur(12px) saturate(0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          z-index: 80;
          pointer-events: auto;
        }

        .pause-box {
          width: 360px;
          background: rgba(8,12,20,0.95);
          border: 1px solid #1e3050;
          border-top: 2px solid var(--gold, #fbbf24);
          border-radius: 4px;
          padding: 32px 28px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          text-align: center;
          backdrop-filter: blur(20px);
        }

        .pause-title {
          font-family: 'Teko', sans-serif;
          font-size: 3rem;
          letter-spacing: 4px;
          color: var(--gold, #fbbf24);
          margin: 0 0 8px;
          text-shadow: 0 0 20px rgba(251,191,36,0.4);
          line-height: 1;
        }

        .pause-title::before {
          content: '';
          display: block;
          width: 40px;
          height: 2px;
          background: var(--gold, #fbbf24);
          margin: 0 auto 10px;
          opacity: 0.5;
        }

        .btn-pause-menu {
          background: rgba(16,22,36,0.9);
          border: 1px solid #1e3050;
          border-left: 3px solid #3b82f6;
          color: #e2e8f0;
          padding: 13px 20px;
          font-family: 'Teko', sans-serif;
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.18s ease;
          display: flex;
          align-items: center;
          gap: 12px;
          border-radius: 3px;
        }

        .btn-pause-menu:hover {
          border-left-color: var(--gold, #fbbf24);
          transform: translateX(8px);
          background: rgba(30,41,59,0.95);
          box-shadow: -4px 0 16px rgba(251,191,36,0.2);
          color: #fff;
        }

        .btn-pause-menu .p-icon {
          color: #3b82f6;
          width: 20px;
          text-align: center;
          font-size: 1rem;
          transition: color 0.2s;
        }
        .btn-pause-menu:hover .p-icon { color: var(--gold, #fbbf24); }
      </style>

      <div class="pause-box">
        <h2 class="pause-title">PAUSED</h2>

        <button id="btn-pause-resume" class="btn-pause-menu">
          <i class="fa-solid fa-play p-icon"></i>
          <span>RESUME</span>
        </button>
        <button id="btn-pause-restart" class="btn-pause-menu">
          <i class="fa-solid fa-rotate-right p-icon"></i>
          <span>RESTART MATCH</span>
        </button>
        <button id="btn-pause-quit" class="btn-pause-menu" style="border-left-color:#ef4444;">
          <i class="fa-solid fa-door-open p-icon" style="color:#ef4444;"></i>
          <span>QUIT TO MENU</span>
        </button>
      </div>
    `;

    this.container.appendChild(pauseEl);

    const resumeBtn = pauseEl.querySelector('#btn-pause-resume');
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        this.hidePauseMenu();
        if (this.onResumeMatch) this.onResumeMatch();
      });
    }

    const restartBtn = pauseEl.querySelector('#btn-pause-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        this.hidePauseMenu();
        if (this.onRestartMatch) this.onRestartMatch();
      });
    }

    const quitBtn = pauseEl.querySelector('#btn-pause-quit');
    if (quitBtn) {
      quitBtn.addEventListener('click', () => {
        this.hidePauseMenu();
        if (this.onQuitToMenu) this.onQuitToMenu();
      });
    }
  }

  public hidePauseMenu(): void {
    const el = this.container.querySelector('#pause-overlay');
    if (el) el.remove();
  }

  // ─── RESULTS SCREEN ───────────────────────────────────────────────────────

  public showResults(stats: MatchStats): void {
    const winnerName = stats.winner === 1 ? 'PLAYER 1 WINS!' : stats.winner === 2 ? 'PLAYER 2 WINS!' : 'DRAW!';
    const winnerColor = stats.winner === 1 ? '#3b82f6' : stats.winner === 2 ? '#ef4444' : '#fbbf24';

    this.container.innerHTML = `
      ${this.sharedStyles}
      <style>
        .result-screen {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse at center, rgba(10,14,24,0.9) 0%, rgba(4,7,12,0.98) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fff;
          z-index: 70;
          pointer-events: auto;
        }

        /* Scanlines */
        .result-screen::after {
          content: '';
          position: absolute;
          inset: 0;
          background-image: repeating-linear-gradient(to bottom, transparent 0px, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 3px);
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
        }

        .result-box {
          position: relative;
          z-index: 1;
          width: 520px;
          background: rgba(8,12,20,0.95);
          border: 1px solid #1e3050;
          border-top: 2px solid ${winnerColor};
          border-radius: 4px;
          padding: 36px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          text-align: center;
        }

        .result-label {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.85rem;
          letter-spacing: 5px;
          color: #334155;
          font-weight: 700;
          text-transform: uppercase;
        }

        .result-winner {
          font-family: 'Teko', sans-serif;
          font-size: 4.5rem;
          font-weight: 700;
          letter-spacing: 3px;
          margin: -8px 0;
          color: ${winnerColor};
          text-shadow: 0 0 30px ${winnerColor}99, 0 0 60px ${winnerColor}44;
          animation: shimmer 2s ease-in-out infinite alternate;
          line-height: 1;
        }

        @keyframes shimmer {
          from { filter: brightness(1); }
          to   { filter: brightness(1.3) drop-shadow(0 0 16px ${winnerColor}); }
        }

        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }

        .stat-card {
          background: rgba(16,22,36,0.8);
          padding: 16px;
          border-radius: 3px;
          border: 1px solid #1e3050;
          text-align: left;
        }

        .stat-card-p1 { border-top: 2px solid #3b82f6; }
        .stat-card-p2 { border-top: 2px solid #ef4444; }

        .stat-card-player {
          font-family: 'Rajdhani', sans-serif;
          font-size: 0.75rem;
          letter-spacing: 3px;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .stat-card-p1 .stat-card-player { color: #3b82f6; }
        .stat-card-p2 .stat-card-player { color: #ef4444; }

        .stat-card-val {
          font-family: 'Teko', sans-serif;
          font-size: 2rem;
          font-weight: 700;
          color: #e2e8f0;
          line-height: 1;
        }

        .stat-card-desc {
          font-size: 0.8rem;
          color: #334155;
          margin-top: 2px;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .result-actions {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }

        .btn-result-outline {
          flex: 1;
          padding: 13px 12px;
          background: transparent;
          border: 1px solid #1e3050;
          color: #64748b;
          font-family: 'Teko', sans-serif;
          font-size: 1.3rem;
          font-weight: 700;
          letter-spacing: 2px;
          border-radius: 3px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.2s ease;
        }

        .btn-result-outline:hover {
          border-color: #fff;
          color: #fff;
          background: rgba(255,255,255,0.05);
        }
      </style>

      <div class="result-screen">
        <div class="result-box">
          <div class="result-label">Final Result</div>
          <div class="result-winner">${winnerName}</div>

          <div class="stat-grid">
            <div class="stat-card stat-card-p1">
              <div class="stat-card-player">Player 1</div>
              <div class="stat-card-val">${stats.p1MaxCombo}</div>
              <div class="stat-card-desc">Max Combo</div>
            </div>
            <div class="stat-card stat-card-p2">
              <div class="stat-card-player">Player 2</div>
              <div class="stat-card-val">${stats.p2MaxCombo}</div>
              <div class="stat-card-desc">Max Combo</div>
            </div>
          </div>

          <div class="result-actions">
            <button id="btn-result-rematch" class="btn-confirm" style="flex:1; padding:14px; font-size:1.3rem;">
              <i class="fa-solid fa-rotate-right" style="margin-right:8px;"></i>REMATCH
            </button>
            <button id="btn-result-chars" class="btn-result-outline">
              <i class="fa-solid fa-users" style="margin-right:6px;"></i>FIGHTERS
            </button>
            <button id="btn-result-menu" class="btn-result-outline">
              <i class="fa-solid fa-house" style="margin-right:6px;"></i>MENU
            </button>
          </div>
        </div>
      </div>
    `;

    const rematchBtn = this.container.querySelector('#btn-result-rematch');
    if (rematchBtn) {
      rematchBtn.addEventListener('click', () => {
        this.audio.playBatHit();
        this.container.innerHTML = '';
        if (this.onStartMatch) this.onStartMatch(this.matchSettings);
      });
    }

    const charsBtn = this.container.querySelector('#btn-result-chars');
    if (charsBtn) {
      charsBtn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.showCharacterSelect();
      });
    }

    const menuBtn = this.container.querySelector('#btn-result-menu');
    if (menuBtn) {
      menuBtn.addEventListener('click', () => {
        this.audio.playLightHit();
        this.showMainMenu();
      });
    }
  }
}
