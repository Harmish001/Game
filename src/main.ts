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

    const p1Profile = CHARACTER_ROSTER[settings.p1Character];
    const p2Profile = CHARACTER_ROSTER[settings.p2Character];

    // Loader covers blank canvas while GLBs download / parse
    const hudRoot = document.getElementById('hud-container');
    if (hudRoot) hudRoot.style.visibility = 'hidden';
    this.screenManager.showMatchLoader(p1Profile.name, p2Profile.name);
    this.hud.setFighterNames(p1Profile.name, p2Profile.name);

    this.sceneManager.buildStadiumArena(settings.arena);

    this.p1 = new Fighter(p1Profile, 1, -3.5, this.sceneManager.scene);
    this.p2 = new Fighter(p2Profile, 2, 3.5, this.sceneManager.scene);
    this.projectileSystem.clear();
    this.p1.projectileSystem = this.projectileSystem;
    this.p2.projectileSystem = this.projectileSystem;

    this.cpuAI.setDifficulty(settings.difficulty);

    this.matchManager = new MatchManager(
      settings,
      this.audioManager,
      this.sceneManager,
      this.vfxSystem
    );

    this.matchManager.onPhaseChange = (_phase, bannerText) => {
      this.hud.showBanner(bannerText);
    };

    this.matchManager.onMatchComplete = (stats: MatchStats) => {
      this.screenManager.showResults(stats);
    };

    // Hold FIGHT until both meshes ready (timeout so a failed load never soft-locks)
    void this.waitForFightersReady().then(() => {
      if (!this.p1 || !this.p2 || !this.matchManager) return;
      this.screenManager.hideMatchLoader();
      if (hudRoot) hudRoot.style.visibility = 'visible';
      this.matchManager.startMatch(this.p1, this.p2);
      this.isMatchRunning = true;
    });
  }

  private waitForFightersReady(): Promise<void> {
    const started = performance.now();
    const TIMEOUT_MS = 45000;

    return new Promise((resolve) => {
      const tick = () => {
        const p1m = this.p1?.mesh;
        const p2m = this.p2?.mesh;
        const p1Ready = !p1m || p1m.isModelReady();
        const p2Ready = !p2m || p2m.isModelReady();
        const p1p = p1m?.loadProgress ?? 1;
        const p2p = p2m?.loadProgress ?? 1;
        const avg = (p1p + p2p) * 0.5;

        let hint = 'Preparing fighters…';
        if (!p1Ready && !p2Ready) hint = 'Loading both fighters…';
        else if (!p1Ready) hint = `Loading ${this.p1?.profile.name ?? 'P1'}…`;
        else if (!p2Ready) hint = `Loading ${this.p2?.profile.name ?? 'P2'}…`;

        this.screenManager.updateMatchLoader(avg, hint);

        if (p1Ready && p2Ready) {
          this.screenManager.updateMatchLoader(1, 'Ready!');
          resolve();
          return;
        }
        if (performance.now() - started > TIMEOUT_MS) {
          console.warn('[Match] Fighter load timeout — starting anyway');
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /** Drive mixer/pose without advancing fighter sim (hitstop + same-frame react) */
  private syncFighterMeshes(dt: number): void {
    for (const f of [this.p1, this.p2]) {
      if (!f?.mesh) continue;
      const moveProgress = f.currentMoveExecutor ? f.currentMoveExecutor.getProgress() : 0;
      const activeMoveId = f.currentMoveExecutor ? f.currentMoveExecutor.move.id : '';
      const moveDurationSec = f.currentMoveExecutor
        ? f.currentMoveExecutor.totalFrames / 60
        : 0;
      const stateDurationSec = f.stateFramesTarget > 0 ? f.stateFramesTarget / 60 : 0;
      f.mesh.updateAnimation(
        f.state,
        f.stateTimer,
        f.facingRight,
        moveProgress,
        activeMoveId,
        dt,
        f.y,
        moveDurationSec,
        stateDurationSec,
        f.animReactNonce,
        f.isGuarding,
        f.profile.walkSpeedFwd,
        f.profile.walkSpeedBack,
        f.profile.dashSpeed
      );
      f.mesh.root.position.set(f.x, f.y, 0);
    }
  }

  /** Mech QA snapshot — clip counts, state, guard */
  public debugFighters(): unknown {
    const snap = (f: Fighter | null) => {
      if (!f || !f.mesh) return null;
      const m = f.mesh as unknown as {
        modelReady?: boolean;
        hasSkinnedAnims?: boolean;
        clipActions?: Map<string, unknown>;
        activeClipName?: string;
        hipsBone?: { name: string } | null;
      };
      return {
        id: f.profile.id,
        state: f.state,
        x: +f.x.toFixed(2),
        y: +f.y.toFixed(2),
        guarding: f.isGuarding,
        modelReady: !!m.modelReady,
        skinned: !!m.hasSkinnedAnims,
        clips: m.clipActions?.size ?? 0,
        active: m.activeClipName ?? '',
        hips: m.hipsBone?.name ?? null
      };
    };
    return { p1: snap(this.p1), p2: snap(this.p2) };
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
      // Freeze physics/input — still sync mesh so Hit_Knockback/Defend show during freeze
      this.syncFighterMeshes(0);
      return;
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

    // 5. Whoosh on active start + combat + projectiles
    if (this.matchManager.phase === 'FIGHTING') {
      for (const f of [this.p1, this.p2]) {
        if (f.needsWhoosh()) {
          const heavy = (f.currentMoveExecutor?.move.hitstop ?? 0) >= 9;
          this.audioManager.playWhoosh(heavy);
          f.markWhooshPlayed();
        }
        if (f.state === 'THROW_TECH' && f.stateFrames === 1) {
          this.audioManager.playThrowTech();
          this.vfxSystem.spawnHitSparks(f.x, f.y + 1.1, 'block');
        }
      }
      const projHits = this.projectileSystem.update(dt, this.p1, this.p2);
      if (projHits) {
        for (const h of projHits) {
          this.applyHitFeel(h.x, h.y, h.result, h.heavy);
        }
      }
      this.checkCombatCollisions(this.p1, this.p2);
      this.checkCombatCollisions(this.p2, this.p1);
      this.syncFighterMeshes(0);
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
    if (!attacker.currentMoveExecutor || attacker.currentMoveExecutor.hasHit) return;
    if (!attacker.canAttemptVisualStrike()) return;

    // --- Proximity gate: reject hits from too far away ---
    const dist = Math.abs(attacker.x - defender.x);
    const maxRange = (attacker.currentMoveExecutor.move.maxRange ?? 1.4) + (attacker.runUpActive ? 0.5 : 0);
    if (dist >= 0.3 && dist > maxRange) return;

    // Reject hits if attacker is facing completely away from defender
    const isFacingDefender = attacker.facingRight
      ? defender.x >= attacker.x - 0.25
      : defender.x <= attacker.x + 0.25;
    if (!isFacingDefender) return;

    const hurtWorld = this.hitboxSystem.toWorldBox(
      defender.getHurtbox(),
      defender.x,
      defender.y,
      defender.facingRight
    );

    let connected = false;

    // Tekken-style: fist/foot bone must touch hurtbox during contact anim window
    if (attacker.mesh?.usesVisualStrikes()) {
      const radius = attacker.mesh.getStrikeRadius() + (attacker.runUpActive ? 0.08 : 0);
      const points = attacker.mesh.getStrikePoints2D(attacker.currentMoveExecutor.move.id);
      for (const p of points) {
        if (this.hitboxSystem.pointHitsBox(p.x, p.y, radius, hurtWorld)) {
          connected = true;
          break;
        }
      }
    } else {
      // Stick-figure fallback: classic active-frame AABB
      const hitbox = attacker.getActiveHitbox();
      if (!hitbox) return;
      let hitWorld = this.hitboxSystem.toWorldBox(hitbox, attacker.x, attacker.y, attacker.facingRight);
      if (dist <= 0.6) {
        if (attacker.facingRight) hitWorld.minX = Math.min(hitWorld.minX, attacker.x - 0.25);
        else hitWorld.maxX = Math.max(hitWorld.maxX, attacker.x + 0.25);
      }
      connected = this.hitboxSystem.checkOverlap(hitWorld, hurtWorld);
    }

    if (!connected) return;

    attacker.currentMoveExecutor.hasHit = true;

    const isThrow = attacker.currentMoveExecutor.move.hitLevel === 'throw';
    const result = defender.takeHit(attacker, attacker.currentMoveExecutor.move, isThrow);

    const contactY = defender.y + (attacker.currentMoveExecutor.move.hitbox?.y ?? 1.1);
    const contactX = (attacker.x + defender.x) * 0.5;
    this.applyHitFeel(contactX, contactY, result, (attacker.currentMoveExecutor.move.hitstop ?? 0) >= 9, {
      sfxType: attacker.currentMoveExecutor.move.sfxType,
      isLauncher: !!attacker.currentMoveExecutor.move.isLauncher,
      vfxType: attacker.currentMoveExecutor.move.vfxType
    });
  }

  private applyHitFeel(
    x: number,
    y: number,
    result: { hit: boolean; blocked: boolean; counterHit: boolean; hitstop: number; damage: number },
    heavy: boolean,
    meta?: { sfxType?: string; isLauncher?: boolean; vfxType?: string }
  ): void {
    if (!result.hit && !result.blocked) return;

    this.vfxSystem.setHitstop(result.hitstop);

    if (result.blocked) {
      this.audioManager.playBlock();
      this.vfxSystem.spawnHitSparks(x, y, 'block');
      this.sceneManager.triggerScreenShake(0.04, 0.08);
      return;
    }

    if (result.counterHit) {
      this.audioManager.playCounterHit();
      this.vfxSystem.spawnHitSparks(x, y, 'counter');
      this.hud.flashCounter();
      this.sceneManager.triggerScreenShake(0.35, 0.22);
      this.sceneManager.punchCamera(3);
      return;
    }

    const sfx = meta?.sfxType;
    if (sfx === 'super') this.audioManager.playSuperFlash();
    else if (sfx === 'heavy_hit' || sfx === 'bat_hit' || heavy) this.audioManager.playHeavyHit();
    else this.audioManager.playLightHit();

    const sparkType =
      sfx === 'super' ? 'super' : heavy || meta?.isLauncher ? 'heavy' : result.damage >= 10 ? 'medium' : 'light';
    this.vfxSystem.spawnHitSparks(x, y, sparkType as 'light' | 'medium' | 'heavy' | 'super');

    const intensity =
      meta?.vfxType === 'super' ? 0.45 : meta?.isLauncher || heavy ? 0.28 : 0.1;
    this.sceneManager.triggerScreenShake(intensity, heavy ? 0.22 : 0.12);
    if (heavy || meta?.isLauncher) this.sceneManager.punchCamera(2.5);
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

    // Legacy AABB hitboxes (stick path) — still useful as reference
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

    // Tekken strike sensors (fist/foot) — magenta; bright when in contact window
    for (const f of [this.p1, this.p2]) {
      if (!f.mesh?.usesVisualStrikes() || f.state !== 'ATTACK' || !f.currentMoveExecutor) continue;
      const moveId = f.currentMoveExecutor.move.id;
      const hot = f.canAttemptVisualStrike();
      this.hitboxSystem.addDebugStrikePoints(
        f.mesh.getStrikePoints2D(moveId),
        f.mesh.getStrikeRadius(),
        hot
      );
    }
  }

  // --- RENDER ---

  private render(_alpha: number): void {
    this.sceneManager.render();
  }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  const game = new CricketClashGame();
  // ponytail: debug hook for mech QA — remove when tooling exists
  (window as unknown as { __clash?: CricketClashGame }).__clash = game;
});
