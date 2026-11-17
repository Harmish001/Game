import * as THREE from 'three';
import { GameLoop } from './engine/GameLoop';
import { InputManager, MotionCommand } from './engine/InputManager';
import { AudioManager } from './engine/AudioManager';
import { SceneManager } from './engine/SceneManager';
import { HitboxSystem, WorldBox2D } from './engine/HitboxSystem';
import { VFXSystem } from './engine/VFXSystem';
import { ProjectileSystem } from './game/projectiles/ProjectileSystem';
import { Fighter } from './game/Fighter';
import { CPUAI } from './game/ai/CPUAI';
import { MatchManager, MatchStats } from './game/MatchManager';
import { HUD } from './ui/HUD';
import { TouchOverlay } from './ui/TouchOverlay';
import { ScreenManager } from './ui/ScreenManager';
import { CHARACTER_ROSTER } from './characters/roster';
import { FighterId, MatchSettings, RawPlayerInput } from './game/types';

class CricketClashGame {
  private canvas: HTMLCanvasElement;
  private uiLayer: HTMLElement;

  // Subsystems
  private sceneManager: SceneManager;
  private audioManager: AudioManager;
  private inputManager: InputManager;
  private hitboxSystem: HitboxSystem;
  private vfxSystem: VFXSystem;
  private projectileSystem: ProjectileSystem;
  private loop: GameLoop;
  private cpuAI: CPUAI;

  // UI
  private hud: HUD;
  private touchOverlay: TouchOverlay;
  private screenManager: ScreenManager;

  // Game entities
  private p1: Fighter | null = null;
  private p2: Fighter | null = null;
  private matchManager: MatchManager | null = null;

  // State
  private isMatchRunning: boolean = false;
  private previewFighterGroup: THREE.Group | null = null;
  private trainingDummyMode: 'stand' | 'always_block' | 'crouch_block' = 'stand';

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.uiLayer = document.getElementById('ui-layer') as HTMLElement;

    // 1. Initialize Engine Systems
    this.sceneManager = new SceneManager(this.canvas);
    this.audioManager = new AudioManager();
    this.inputManager = new InputManager();
    this.hitboxSystem = new HitboxSystem(this.sceneManager.scene);
    this.vfxSystem = new VFXSystem(this.sceneManager.scene);
    this.projectileSystem = new ProjectileSystem(this.sceneManager.scene);
    this.cpuAI = new CPUAI('normal');

    // 2. Initialize UI Layers
    const hudContainer = document.createElement('div');
    hudContainer.id = 'hud-container';
    this.uiLayer.appendChild(hudContainer);
    this.hud = new HUD(hudContainer);

    const touchContainer = document.createElement('div');
    touchContainer.id = 'touch-container';
    this.uiLayer.appendChild(touchContainer);
    this.touchOverlay = new TouchOverlay(touchContainer, (input) => {
      this.inputManager.setTouchInput(input);
    });

    const screenContainer = document.createElement('div');
    screenContainer.id = 'screen-container';
    this.uiLayer.appendChild(screenContainer);
    this.screenManager = new ScreenManager(screenContainer, this.audioManager);

    // 3. Connect UI Callbacks
    this.setupScreenEvents();

    // 4. Keyboard Shortcuts (Debug hitbox toggle with 'H')
    window.addEventListener('keydown', (e) => {
      if (e.key === 'h' || e.key === 'H') {
        const visible = this.hitboxSystem.toggleDebug();
        console.log(`Hitbox Debug: ${visible ? 'ON' : 'OFF'}`);
      }
      if ((e.key === 'b' || e.key === 'B') && this.isMatchRunning && this.matchManager?.settings.mode === 'training') {
        const modes: Array<'stand' | 'always_block' | 'crouch_block'> = ['stand', 'always_block', 'crouch_block'];
        const nextIdx = (modes.indexOf(this.trainingDummyMode) + 1) % modes.length;
        this.trainingDummyMode = modes[nextIdx];
        this.hud.showBanner(`DUMMY: ${this.trainingDummyMode.replace('_', ' ').toUpperCase()}`);
        setTimeout(() => this.hud.showBanner(''), 1200);
      }
      if (e.key === 'Escape' && this.isMatchRunning) {
        this.togglePause();
      }
    });

    // 5. Game Loop
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (alpha) => this.render(alpha)
    );
    this.loop.start();

    // Show initial title menu
    this.screenManager.showMainMenu();
  }

  private setupScreenEvents(): void {
    this.screenManager.onStartMatch = (settings: MatchSettings) => {
      this.startNewMatch(settings);
    };

    this.screenManager.onResumeMatch = () => {
      this.loop.resume();
    };

    this.screenManager.onRestartMatch = () => {
      if (this.matchManager) {
        this.loop.resume();
        this.startNewMatch(this.matchManager.settings);
      }
    };

    this.screenManager.onQuitToMenu = () => {
      this.endCurrentMatch();
      this.screenManager.showMainMenu();
    };

    this.hud.onPauseClicked(() => {
      this.togglePause();
    });
  }

  private togglePause(): void {
    if (!this.isMatchRunning) return;
    const paused = this.loop.togglePause();
    if (paused) {
      this.screenManager.showPauseMenu();
    } else {
      this.screenManager.hidePauseMenu();
    }
  }

  private startNewMatch(settings: MatchSettings): void {
    this.endCurrentMatch();

    // Build arena
    this.sceneManager.buildStadiumArena(settings.arena);

    // Create Fighters
    const p1Profile = CHARACTER_ROSTER[settings.p1Character];
    const p2Profile = CHARACTER_ROSTER[settings.p2Character];

    this.p1 = new Fighter(p1Profile, 1, -3.5, this.sceneManager.scene);
    this.p2 = new Fighter(p2Profile, 2, 3.5, this.sceneManager.scene);
    this.projectileSystem.clear();
    this.p1.projectileSystem = this.projectileSystem;
    this.p2.projectileSystem = this.projectileSystem;

    // Set CPU AI
    this.cpuAI.setDifficulty(settings.difficulty);

    // Create Match Manager
    this.matchManager = new MatchManager(
      settings,
      this.audioManager,
      this.sceneManager,
      this.vfxSystem
    );

    this.hud.setFighterNames(p1Profile.name, p2Profile.name);

    this.matchManager.onPhaseChange = (phase, bannerText) => {
      this.hud.showBanner(bannerText);
    };

    this.matchManager.onMatchComplete = (stats: MatchStats) => {
      this.screenManager.showResults(stats);
    };

    this.matchManager.startMatch(this.p1, this.p2);
    this.isMatchRunning = true;
  }

  private endCurrentMatch(): void {
    this.isMatchRunning = false;
    this.audioManager.stopBattleMusic();
    this.projectileSystem.clear();

    if (this.p1) {
      if (this.p1.mesh) this.sceneManager.scene.remove(this.p1.mesh.root);
      this.p1 = null;
    }
    if (this.p2) {
      if (this.p2.mesh) this.sceneManager.scene.remove(this.p2.mesh.root);
      this.p2 = null;
    }
    this.matchManager = null;
  }

  // --- 60 HZ SIMULATION TICK ---

  private update(dt: number): void {
    // 1. Tick VFX and Hitstop
    this.vfxSystem.update(dt);
    if (this.vfxSystem.tickHitstop()) {
      return; // Freeze combat frames during impact hit-stop!
    }

    if (!this.isMatchRunning || !this.p1 || !this.p2 || !this.matchManager) {
      return;
    }

    // 2. Poll Inputs
    const p1Facing = this.p1.facingRight;
    const p2Facing = this.p2.facingRight;

    let p1Input = this.inputManager.getPlayerInput(1, p1Facing);
    let p2Input: RawPlayerInput;

    const p1Motion = this.inputManager.detectMotion(1);
    let p2Motion: MotionCommand = 'NONE';

    if (this.matchManager.settings.mode === 'local_2p') {
      p2Input = this.inputManager.getPlayerInput(2, p2Facing);
      p2Motion = this.inputManager.detectMotion(2);
    } else if (this.matchManager.settings.mode === 'training') {
      p2Input = {
        up: false, down: false, left: false, right: false,
        lp: false, hp: false, lk: false, hk: false,
        block: false, special: false, super: false, pause: false
      };
      if (this.trainingDummyMode === 'always_block') {
        p2Input.block = true;
        if (p2Facing) p2Input.left = true; else p2Input.right = true;
      } else if (this.trainingDummyMode === 'crouch_block') {
        p2Input.block = true;
        p2Input.down = true;
        if (p2Facing) p2Input.left = true; else p2Input.right = true;
      }
    } else {
      // CPU AI
      p2Input = this.cpuAI.update(this.p2, this.p1, dt);
    }

    // Freeze controls during intro or round end
    if (this.matchManager.phase !== 'FIGHTING') {
      p1Input = { ...p1Input, lp: false, hp: false, lk: false, hk: false, special: false, super: false };
      p2Input = { ...p2Input, lp: false, hp: false, lk: false, hk: false, special: false, super: false };
    }

    // 3. Update Fighters
    this.p1.update(p1Input, p1Motion, this.p2.x, dt);
    this.p2.update(p2Input, p2Motion, this.p1.x, dt);

    // 4. Resolve Pushbox Collisions (cannot walk through each other)
    const p1PushWorld = this.hitboxSystem.toWorldBox(this.p1.getPushbox(), this.p1.x, this.p1.y, this.p1.facingRight);
    const p2PushWorld = this.hitboxSystem.toWorldBox(this.p2.getPushbox(), this.p2.x, this.p2.y, this.p2.facingRight);
    const pushShift = this.hitboxSystem.resolvePush(p1PushWorld, p2PushWorld);
    this.p1.x += pushShift.p1Shift;
    this.p2.x += pushShift.p2Shift;

    // 5. Check Attack Hitboxes vs Hurtboxes & Update Projectiles
    if (this.matchManager.phase === 'FIGHTING') {
      this.projectileSystem.update(dt, this.p1, this.p2);
      this.checkCombatCollisions(this.p1, this.p2);
      this.checkCombatCollisions(this.p2, this.p1);
    }

    // 6. Update Match Rules & Round Timer
    this.matchManager.update(this.p1, this.p2, dt);

    // 7. Update HUD
    this.hud.update(this.p1, this.p2, this.matchManager, dt);

    // 8. Update Camera 2.5D tracking
    if (this.p1.mesh && this.p2.mesh) {
      this.sceneManager.updateCamera(
        this.p1.mesh.root.position,
        this.p2.mesh.root.position,
        dt
      );
    }

    // 9. Update Debug Hitboxes (if toggled)
    this.updateDebugHitboxes();
  }

  private checkCombatCollisions(attacker: Fighter, defender: Fighter): void {
    const hitbox = attacker.getActiveHitbox();
    if (!hitbox || !attacker.currentMoveExecutor) return;

    // --- Proximity gate: reject hits from too far away ---
    const dist = Math.abs(attacker.x - defender.x);
    const maxRange = (attacker.currentMoveExecutor.move.maxRange ?? 1.4) + (attacker.runUpActive ? 0.5 : 0);
    // Close-range: skip the range gate entirely; AABB overlap check is authoritative
    if (dist >= 0.3 && dist > maxRange) return;

    // Reject hits if attacker is facing completely away from defender
    const isFacingDefender = attacker.facingRight
      ? defender.x >= attacker.x - 0.25
      : defender.x <= attacker.x + 0.25;
    if (!isFacingDefender) return;

    let hitWorld = this.hitboxSystem.toWorldBox(hitbox, attacker.x, attacker.y, attacker.facingRight);

    // Close-range coverage: ensure attack hitbox volume extends back through the attacker's own core
    // so point-blank or overlapping fighters (e.g. inside pushbox collision) connect 100% reliably
    if (dist <= 0.6) {
      if (attacker.facingRight) {
        hitWorld.minX = Math.min(hitWorld.minX, attacker.x - 0.25);
      } else {
        hitWorld.maxX = Math.max(hitWorld.maxX, attacker.x + 0.25);
      }
    }
    const hurtWorld = this.hitboxSystem.toWorldBox(defender.getHurtbox(), defender.x, defender.y, defender.facingRight);

    if (this.hitboxSystem.checkOverlap(hitWorld, hurtWorld)) {
      // Mark move as having connected
      attacker.currentMoveExecutor.hasHit = true;

      const isThrow = attacker.currentMoveExecutor.move.hitLevel === 'throw';
      const result = defender.takeHit(attacker, attacker.currentMoveExecutor.move, isThrow);

      // VFX & Audio triggers
      const impactX = (hitWorld.minX + hurtWorld.minX) * 0.5;
      const impactY = (hitWorld.minY + hurtWorld.minY) * 0.5;

      if (result.blocked) {
        this.audioManager.playBlock();
        this.vfxSystem.spawnHitSparks(impactX, impactY, 'block');
      } else {
        // Clean Hit
        const sfxType = attacker.currentMoveExecutor.move.sfxType;
        if (sfxType === 'heavy_hit' || sfxType === 'bat_hit') this.audioManager.playHeavyHit();
        else if (sfxType === 'super') this.audioManager.playSuperFlash();
        else this.audioManager.playLightHit();

        const vfxType = attacker.currentMoveExecutor.move.vfxType;
        this.vfxSystem.spawnHitSparks(
          impactX,
          impactY,
          vfxType === 'super' ? 'super' : vfxType === 'punch' ? 'heavy' : 'heavy'
        );

        // Screen Shake
        const intensity = vfxType === 'super' ? 0.45 : vfxType === 'sparks' ? 0.25 : 0.12;
        this.sceneManager.triggerScreenShake(intensity, 0.2);

        // Set Hitstop freeze frames
        this.vfxSystem.setHitstop(result.hitstop);
      }
    }
  }

  private updateDebugHitboxes(): void {
    if (!this.p1 || !this.p2) return;

    const boxes: { box: WorldBox2D; type: 'hit' | 'hurt' | 'push' | 'throw' }[] = [];

    // Pushboxes
    boxes.push({
      box: this.hitboxSystem.toWorldBox(this.p1.getPushbox(), this.p1.x, this.p1.y, this.p1.facingRight),
      type: 'push'
    });
    boxes.push({
      box: this.hitboxSystem.toWorldBox(this.p2.getPushbox(), this.p2.x, this.p2.y, this.p2.facingRight),
      type: 'push'
    });

    // Hurtboxes
    boxes.push({
      box: this.hitboxSystem.toWorldBox(this.p1.getHurtbox(), this.p1.x, this.p1.y, this.p1.facingRight),
      type: 'hurt'
    });
    boxes.push({
      box: this.hitboxSystem.toWorldBox(this.p2.getHurtbox(), this.p2.x, this.p2.y, this.p2.facingRight),
      type: 'hurt'
    });

    // Hitboxes
    const p1Hit = this.p1.getActiveHitbox();
    if (p1Hit) {
      boxes.push({
        box: this.hitboxSystem.toWorldBox(p1Hit, this.p1.x, this.p1.y, this.p1.facingRight),
        type: 'hit'
      });
    }

    const p2Hit = this.p2.getActiveHitbox();
    if (p2Hit) {
      boxes.push({
        box: this.hitboxSystem.toWorldBox(p2Hit, this.p2.x, this.p2.y, this.p2.facingRight),
        type: 'hit'
      });
    }

    this.hitboxSystem.updateDebugBoxes(boxes);
  }

  // --- RENDER ---

  private render(_alpha: number): void {
    this.sceneManager.render();
  }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  new CricketClashGame();
});
