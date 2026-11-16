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

  constructor(container: HTMLElement, audio: AudioManager) {
    this.container = container;
    this.audio = audio;
  }

  // --- MAIN MENU ---

  public showMainMenu(): void {
    this.container.innerHTML = `
      <style>
        .menu-screen {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(15, 23, 42, 0.75) 0%, rgba(2, 6, 23, 0.95) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: auto;
          color: #fff;
          z-index: 50;
        }

        .title-group {
          text-align: center;
          margin-bottom: 2rem;
          animation: floatTitle 3s ease-in-out infinite alternate;
        }

        @keyframes floatTitle {
          from { transform: translateY(0px); }
          to { transform: translateY(-8px); }
        }

        .main-title {
          font-family: 'Teko', sans-serif;
          font-size: 5.5rem;
          font-weight: 700;
          letter-spacing: 4px;
          line-height: 0.9;
          background: linear-gradient(180deg, #fef08a 0%, #f59e0b 50%, #ea580c 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          filter: drop-shadow(0 4px 20px rgba(245, 158, 11, 0.6));
        }

        .subtitle {
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.4rem;
          letter-spacing: 6px;
          color: #94a3b8;
          text-transform: uppercase;
          margin-top: 6px;
        }

        .menu-buttons {
          display: flex;
          flex-direction: column;
          gap: 14px;
          width: 320px;
        }

        .btn-menu {
          background: linear-gradient(90deg, rgba(30, 41, 59, 0.8) 0%, rgba(15, 23, 42, 0.9) 100%);
          border: 1px solid #475569;
          border-left: 4px solid #38bdf8;
          color: #f8fafc;
          padding: 14px 20px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.3rem;
          font-weight: 700;
          letter-spacing: 2px;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-radius: 4px;
        }

        .btn-menu:hover {
          background: linear-gradient(90deg, #0284c7 0%, #0369a1 100%);
          border-color: #38bdf8;
          border-left-color: #facc15;
          transform: translateX(8px);
          box-shadow: 0 4px 16px rgba(2, 132, 199, 0.5);
        }

        .btn-menu:active {
          transform: scale(0.98);
        }

        .version-tag {
          position: absolute;
          bottom: 16px;
          color: #64748b;
          font-size: 0.9rem;
          letter-spacing: 1px;
        }
      </style>

      <div class="menu-screen">
        <div class="title-group">
          <h1 class="main-title">CRICKET CLASH</h1>
          <div class="subtitle">3D Browser Fighting Game</div>
        </div>

        <div class="menu-buttons">
          <button class="btn-menu" data-mode="vs_cpu">
            <span>⚔️ VS CPU</span> <span>→</span>
          </button>
          <button class="btn-menu" data-mode="local_2p">
            <span>👥 Local 2-Player</span> <span>→</span>
          </button>
          <button class="btn-menu" data-mode="training">
            <span>🥋 Practice / Training</span> <span>→</span>
          </button>
          <button class="btn-menu" data-mode="quick_fight">
            <span>⚡ Quick Fight</span> <span>→</span>
          </button>
          <button class="btn-menu" id="btn-open-settings">
            <span>⚙️ Settings</span> <span>→</span>
          </button>
        </div>

        <div class="version-tag">Version 1.0 (MVP) • Built with Three.js</div>
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

  // --- CHARACTER SELECT SCREEN ---

  public showCharacterSelect(): void {
    const fighters = Object.values(CHARACTER_ROSTER);
    const p1 = CHARACTER_ROSTER[this.matchSettings.p1Character];

    this.container.innerHTML = `
      <style>
        .char-screen {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 75% 50%, rgba(15, 23, 42, 0.4) 0%, rgba(2, 6, 23, 0.92) 100%);
          display: grid;
          grid-template-columns: 440px 1fr;
          padding: 32px 40px;
          color: #fff;
          z-index: 50;
          pointer-events: auto;
        }

        .roster-panel {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .screen-title {
          font-family: 'Teko', sans-serif;
          font-size: 2.8rem;
          font-weight: 700;
          letter-spacing: 2px;
          color: #facc15;
          margin-bottom: -10px;
        }

        .roster-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        .fighter-tile {
          aspect-ratio: 1;
          background: rgba(30, 41, 59, 0.8);
          border: 2px solid #475569;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .fighter-tile:hover {
          border-color: #38bdf8;
          transform: translateY(-4px);
        }

        .fighter-tile.selected {
          border-color: #facc15;
          box-shadow: 0 0 16px rgba(250, 204, 21, 0.6);
          background: rgba(234, 179, 8, 0.15);
        }

        .tile-icon {
          font-size: 2.4rem;
          margin-bottom: 4px;
        }

        .tile-name {
          font-family: 'Teko', sans-serif;
          font-size: 1.3rem;
          letter-spacing: 1px;
          text-align: center;
        }

        /* Fighter Info Card */
        .info-panel {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          align-items: flex-end;
          padding-left: 40px;
        }

        .fighter-detail {
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          background: rgba(15, 23, 42, 0.85);
          padding: 24px;
          border-radius: 12px;
          border: 1px solid #334155;
          backdrop-filter: blur(8px);
        }

        .detail-name {
          font-family: 'Teko', sans-serif;
          font-size: 3.4rem;
          font-weight: 700;
          line-height: 0.9;
          color: #38bdf8;
        }

        .detail-archetype {
          font-size: 1rem;
          letter-spacing: 2px;
          color: #facc15;
          text-transform: uppercase;
          font-weight: 700;
        }

        .detail-quote {
          font-style: italic;
          color: #cbd5e1;
          border-left: 3px solid #38bdf8;
          padding-left: 10px;
          font-size: 1.05rem;
        }

        .detail-desc {
          font-size: 0.95rem;
          line-height: 1.5;
          color: #94a3b8;
        }

        .stat-bars {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 6px;
        }

        .stat-row {
          display: grid;
          grid-template-columns: 80px 1fr 30px;
          align-items: center;
          font-size: 0.9rem;
          font-weight: 700;
          color: #cbd5e1;
        }

        .stat-track {
          height: 8px;
          background: #1e293b;
          border-radius: 4px;
          overflow: hidden;
        }

        .stat-fill {
          height: 100%;
          background: linear-gradient(90deg, #38bdf8, #818cf8);
        }

        /* Action Buttons */
        .bottom-actions {
          display: flex;
          gap: 16px;
          margin-top: 20px;
        }

        .btn-action {
          padding: 14px 32px;
          font-family: 'Rajdhani', sans-serif;
          font-size: 1.3rem;
          font-weight: 700;
          letter-spacing: 2px;
          border-radius: 6px;
          cursor: pointer;
          text-transform: uppercase;
          transition: all 0.2s ease;
        }

        .btn-confirm {
          background: linear-gradient(90deg, #f59e0b 0%, #ea580c 100%);
          border: none;
          color: #000;
          box-shadow: 0 4px 16px rgba(245, 158, 11, 0.4);
        }

        .btn-confirm:hover {
          transform: translateY(-2px);
          filter: brightness(1.15);
        }

        .btn-back {
          background: transparent;
          border: 1px solid #64748b;
          color: #cbd5e1;
        }

        .btn-back:hover {
          border-color: #fff;
          color: #fff;
        }
      </style>

      <div class="char-screen">
        <!-- Left: Roster Grid -->
        <div class="roster-panel">
          <div>
            <h2 class="screen-title">SELECT FIGHTER</h2>
            <p style="color: #94a3b8; font-size: 0.95rem;">Pick your champion to battle on the pitch</p>
          </div>

          <div class="roster-grid">
            ${fighters.map(f => `
              <div class="fighter-tile ${f.id === this.matchSettings.p1Character ? 'selected' : ''}" data-id="${f.id}">
                <div class="tile-icon">🏏</div>
                <div class="tile-name">${f.name}</div>
              </div>
            `).join('')}
          </div>

          <!-- Difficulty selection if vs CPU -->
          ${this.matchSettings.mode === 'vs_cpu' ? `
            <div style="margin-top: 10px;">
              <label style="font-weight: 700; color: #cbd5e1; font-size: 1rem; display: block; margin-bottom: 6px;">CPU DIFFICULTY</label>
              <div style="display: flex; gap: 8px;">
                ${['easy', 'normal', 'hard', 'expert'].map(d => `
                  <button class="btn-diff ${d === this.matchSettings.difficulty ? 'active' : ''}" data-diff="${d}" style="
                    flex: 1; padding: 6px; font-weight: 700; text-transform: uppercase;
                    background: ${d === this.matchSettings.difficulty ? '#facc15' : '#1e293b'};
                    color: ${d === this.matchSettings.difficulty ? '#000' : '#cbd5e1'};
                    border: 1px solid #475569; border-radius: 4px; cursor: pointer;
                  ">${d}</button>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Right: Fighter Detail Panel -->
        <div class="info-panel">
          <div class="fighter-detail">
            <div>
              <div class="detail-archetype">${p1.archetype} FIGHTER</div>
              <h1 class="detail-name">${p1.name}</h1>
            </div>

            <div class="detail-quote">"${p1.quote}"</div>
            <p class="detail-desc">${p1.description}</p>

            <div class="stat-bars">
              <div class="stat-row">
                <span>POWER</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.power * 10}%;"></div></div>
                <span>${p1.stats.power}</span>
              </div>
              <div class="stat-row">
                <span>SPEED</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.speed * 10}%;"></div></div>
                <span>${p1.stats.speed}</span>
              </div>
              <div class="stat-row">
                <span>DEFENSE</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.defense * 10}%;"></div></div>
                <span>${p1.stats.defense}</span>
              </div>
              <div class="stat-row">
                <span>REACH</span>
                <div class="stat-track"><div class="stat-fill" style="width: ${p1.stats.reach * 10}%;"></div></div>
                <span>${p1.stats.reach}</span>
              </div>
            </div>

            <div style="margin-top: 10px; border-top: 1px solid #334155; padding-top: 10px;">
              <div style="font-weight: 700; color: #facc15; font-size: 0.95rem; margin-bottom: 4px;">SIGNATURE SPECIALS</div>
              <ul style="list-style: none; padding: 0; font-size: 0.9rem; color: #cbd5e1; display: flex; flex-direction: column; gap: 4px;">
                ${Object.values(p1.moves).filter(m => m.id.includes('special') || m.id === 'super').map(m => `
                  <li><strong>${m.name}:</strong> <span style="color: #94a3b8;">${m.input}</span></li>
                `).join('')}
              </ul>
            </div>
          </div>

          <div class="bottom-actions">
            <button class="btn-action btn-back" id="btn-back-menu">BACK</button>
            <button class="btn-action btn-confirm" id="btn-start-fight">FIGHT!</button>
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

  // --- SETTINGS SCREEN ---

  public showSettings(): void {
    this.container.innerHTML = `
      <style>
        .settings-screen {
          position: absolute;
          inset: 0;
          background: rgba(2, 6, 23, 0.95);
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
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .setting-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .setting-label {
          font-weight: 700;
          color: #cbd5e1;
          font-size: 1rem;
          display: flex;
          justify-content: space-between;
        }

        .slider {
          width: 100%;
          accent-color: #facc15;
          cursor: pointer;
        }
      </style>

      <div class="settings-screen">
        <div class="settings-box">
          <h2 style="font-family: 'Teko', sans-serif; font-size: 2.8rem; color: #facc15; margin: 0;">SETTINGS</h2>

          <!-- Audio Sliders -->
          <div class="setting-group">
            <div class="setting-label"><span>MASTER VOLUME</span> <span id="val-master">${Math.round(this.audio.getMasterVolume() * 100)}%</span></div>
            <input type="range" class="slider" id="slider-master" min="0" max="1" step="0.05" value="${this.audio.getMasterVolume()}">
          </div>

          <div class="setting-group">
            <div class="setting-label"><span>SFX VOLUME</span> <span id="val-sfx">${Math.round(this.audio.getSfxVolume() * 100)}%</span></div>
            <input type="range" class="slider" id="slider-sfx" min="0" max="1" step="0.05" value="${this.audio.getSfxVolume()}">
          </div>

          <div class="setting-group">
            <div class="setting-label"><span>MUSIC VOLUME</span> <span id="val-music">${Math.round(this.audio.getMusicVolume() * 100)}%</span></div>
            <input type="range" class="slider" id="slider-music" min="0" max="1" step="0.05" value="${this.audio.getMusicVolume()}">
          </div>

          <!-- Controls Help -->
          <div style="border-top: 1px solid #334155; padding-top: 12px;">
            <div style="font-weight: 700; color: #facc15; margin-bottom: 6px;">KEYBOARD CONTROLS (P1)</div>
            <p style="font-size: 0.95rem; color: #94a3b8; line-height: 1.6;">
              <strong>Movement:</strong> W A S D &nbsp;|&nbsp; <strong>Attacks:</strong> J (Light Punch), K (Heavy Punch), U (Light Kick), I (Heavy Kick)<br>
              <strong>Block:</strong> L &nbsp;|&nbsp; <strong>Special:</strong> O (or Motion) &nbsp;|&nbsp; <strong>Super:</strong> Space
            </p>
          </div>

          <button id="btn-close-settings" style="
            margin-top: 10px; padding: 12px; background: #facc15; border: none; font-weight: 700; font-size: 1.2rem;
            color: #000; border-radius: 6px; cursor: pointer; text-transform: uppercase;
          ">CLOSE</button>
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

  // --- PAUSE MENU ---

  public showPauseMenu(): void {
    const pauseEl = document.createElement('div');
    pauseEl.id = 'pause-overlay';
    pauseEl.innerHTML = `
      <style>
        #pause-overlay {
          position: absolute;
          inset: 0;
          background: rgba(2, 6, 23, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          z-index: 80;
          pointer-events: auto;
        }

        .pause-box {
          width: 380px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 32px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          text-align: center;
        }
      </style>

      <div class="pause-box">
        <h2 style="font-family: 'Teko', sans-serif; font-size: 3.5rem; color: #facc15; margin: 0;">MATCH PAUSED</h2>

        <button id="btn-pause-resume" class="btn-menu"><span>▶ RESUME</span> <span>→</span></button>
        <button id="btn-pause-restart" class="btn-menu"><span>🔄 RESTART</span> <span>→</span></button>
        <button id="btn-pause-quit" class="btn-menu"><span>🚪 QUIT TO MENU</span> <span>→</span></button>
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

  // --- RESULTS SCREEN ---

  public showResults(stats: MatchStats): void {
    const winnerName = stats.winner === 1 ? 'PLAYER 1 WINS!' : stats.winner === 2 ? 'PLAYER 2 WINS!' : 'DRAW!';
    const winnerColor = stats.winner === 1 ? '#60a5fa' : stats.winner === 2 ? '#f87171' : '#facc15';

    this.container.innerHTML = `
      <style>
        .result-screen {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(15, 23, 42, 0.9) 0%, rgba(2, 6, 23, 0.98) 100%);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fff;
          z-index: 70;
          pointer-events: auto;
        }

        .result-box {
          width: 500px;
          background: #0f172a;
          border: 1px solid #334155;
          border-radius: 12px;
          padding: 36px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          text-align: center;
        }

        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-top: 10px;
        }

        .stat-card {
          background: #1e293b;
          padding: 16px;
          border-radius: 8px;
          border: 1px solid #334155;
        }
      </style>

      <div class="result-screen">
        <div class="result-box">
          <div style="font-size: 1.2rem; letter-spacing: 4px; color: #94a3b8; font-weight: 700;">FINAL RESULT</div>
          <h1 style="font-family: 'Teko', sans-serif; font-size: 4.8rem; margin: -10px 0; color: ${winnerColor};">${winnerName}</h1>

          <div class="stat-grid">
            <div class="stat-card">
              <div style="color: #60a5fa; font-weight: 700; margin-bottom: 4px;">PLAYER 1</div>
              <div style="font-size: 1.5rem; font-weight: 700;">Max Combo: ${stats.p1MaxCombo}</div>
            </div>
            <div class="stat-card">
              <div style="color: #f87171; font-weight: 700; margin-bottom: 4px;">PLAYER 2</div>
              <div style="font-size: 1.5rem; font-weight: 700;">Max Combo: ${stats.p2MaxCombo}</div>
            </div>
          </div>

          <div style="display: flex; gap: 12px; margin-top: 14px;">
            <button id="btn-result-rematch" class="btn-confirm" style="flex: 1; padding: 14px; font-weight: 700; font-size: 1.2rem; border-radius: 6px; cursor: pointer;">REMATCH</button>
            <button id="btn-result-chars" class="btn-back" style="flex: 1; padding: 14px; font-weight: 700; font-size: 1.2rem; border-radius: 6px; cursor: pointer;">FIGHTERS</button>
            <button id="btn-result-menu" class="btn-back" style="flex: 1; padding: 14px; font-weight: 700; font-size: 1.2rem; border-radius: 6px; cursor: pointer;">MENU</button>
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

