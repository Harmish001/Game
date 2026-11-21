import * as THREE from 'three';
import { Box2D, CharacterProfile, FighterSimState, FighterState, HitLevel, MoveFrameData, RawPlayerInput } from './types';
import { FighterMesh } from './FighterMesh';
import { MoveExecutor } from './MoveExecutor';
import { MotionCommand } from '../engine/InputManager';

export interface HitResult {
  hit: boolean;
  blocked: boolean;
  counterHit: boolean;
  damage: number;
  hitstop: number;
  knockback: { x: number; y: number };
  isLauncher: boolean;
  isKnockdown: boolean;
}

export class Fighter {
  public profile: CharacterProfile;
  public playerIndex: 1 | 2;
  public mesh: FighterMesh | null = null;

  // Position & Physics (locked to Z=0)
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public facingRight: boolean = true;

  // Combat Stats
  public health: number = 100;
  public maxHealth: number = 100;
  public meter: number = 0; // 0 to 100
  public guardGauge: number = 100; // 0 to 100
  public maxGuardGauge: number = 100;
  public roundsWon: number = 0;

  // State Machine
  public state: FighterState = 'IDLE';
  public stateTimer: number = 0;
  public stateFrames: number = 0;
  public currentInput: RawPlayerInput | null = null;

  // Combat system
  public currentMoveExecutor: MoveExecutor | null = null;
  public isInvincible: boolean = false;
  public isArmored: boolean = false;
  public armorHitsLeft: number = 0;
  public hadAirAttack: boolean = false;

  // Attack Input Buffer (5 frames)
  private bufferedAttack: { moveKey: string; framesLeft: number } | null = null;
  private simFrameCount: number = 0;
  private lastLpSimFrame: number = -100;
  private lastLkSimFrame: number = -100;
  /** Rising-edge trackers — attacks fire on press, not hold (FG standard) */
  private prevBtns = {
    lp: false,
    hp: false,
    lk: false,
    hk: false,
    special: false,
    super: false,
    block: false
  };
  /** One air normal per jump */
  private airAttackUsed: boolean = false;

  // Combo tracking (damage scaling & juggles)
  public comboHitCount: number = 0;
  public comboDamageTotal: number = 0;
  public comboTimer: number = 0;
  public juggleCount: number = 0;
  public wallBounceCount: number = 0;
  public wallBounceDamagePenalty: boolean = false;
  public comboStarterIsLight: boolean = false;
  public lastCounterHit: boolean = false;

  // Throw tech
  public throwBreakTimer: number = 0;
  private pendingThrowMove: MoveFrameData | null = null;
  private pendingThrowAttacker: Fighter | null = null;

  // Wake-up: 0=quick, 1=delayed, 2=roll
  private getUpOption: 0 | 1 | 2 = 0;
  private whooshArmed: boolean = false;

  // Projectile System
  public projectileSystem: any = null;

  // Character-specific signature mechanics
  public runRateStacks: number = 0; // Virat: Chase mode stacks (0 to 3)
  public chaseModeTimer: number = 0; // Virat: Chase mode timer (frames)
  public chargeFrames: number = 0; // Rohit: Power Hit charge frames
  public isChargingHeavy: boolean = false;
  public runUpActive: boolean = false; // Bumrah: Run-Up (+0.5 reach)

  // Parry / Just-Defend
  public parryTimer: number = 0; // Active parry window (5 frames)
  public blockLockTimer: number = 0; // Whiffed parry penalty (12 frames)

  /** Bumps when hit/block/knockdown applied — mesh restarts react clip */
  public animReactNonce: number = 0;
  /** Holding back/block in neutral — mesh shows Defend */
  public isGuarding: boolean = false;

  // Bounds
  private readonly stageMinX: number = -11.0;
  private readonly stageMaxX: number = 11.0;

  constructor(profile: CharacterProfile, playerIndex: 1 | 2, startX: number, scene?: THREE.Scene) {
    this.profile = profile;
    this.playerIndex = playerIndex;
    this.x = startX;
    this.y = 0;
    this.facingRight = playerIndex === 1;
    this.maxHealth = profile.maxHealth;
    this.health = this.maxHealth;
    this.guardGauge = this.maxGuardGauge;

    if (scene) {
      this.mesh = new FighterMesh(profile, playerIndex === 2);
      this.mesh.root.position.set(this.x, this.y, 0);
      scene.add(this.mesh.root);
    }
  }

  // --- UPDATE (60 Hz FIXED TIMESTEP) ---

  public update(
    input: RawPlayerInput,
    motion: MotionCommand,
    opponentX: number,
    dt: number = 1 / 60
  ): void {
    this.currentInput = input;
    this.stateTimer += dt;
    this.stateFrames++;
    this.simFrameCount++;

    // Track button press frames for simultaneous press leniency (LP + LK throw)
    if (this.pressed(input, 'lp')) this.lastLpSimFrame = this.simFrameCount;
    if (this.pressed(input, 'lk')) this.lastLkSimFrame = this.simFrameCount;

    // Decay buffered attack
    if (this.bufferedAttack) {
      this.bufferedAttack.framesLeft--;
      if (this.bufferedAttack.framesLeft <= 0) {
        this.bufferedAttack = null;
      }
    }

    // Guard gauge regeneration and dedicated block cost
    if (this.state !== 'BLOCK_STUN' && this.state !== 'GUARD_CRUSH') {
      if (input.block) {
        // Holding dedicated block button slowly drains guard gauge
        this.guardGauge = Math.max(0, this.guardGauge - 6 * dt);
      } else {
        // Naturally refills when not blocking
        this.guardGauge = Math.min(this.maxGuardGauge, this.guardGauge + 10 * dt);
      }
    }

    // Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboHitCount = 0;
        this.comboDamageTotal = 0;
        this.lastCounterHit = false;
      }
    }

    // Auto-turn facing direction when idle/walking/crouching
    if (
      this.state === 'IDLE' ||
      this.state === 'WALK_FWD' ||
      this.state === 'WALK_BACK' ||
      this.state === 'CROUCHING'
    ) {
      const shouldFaceRight = this.x < opponentX;
      this.facingRight = shouldFaceRight;
    }

    // Parry detection (tap block window) & block lock penalty
    if (this.pressed(input, 'block') && this.blockLockTimer <= 0) {
      this.parryTimer = 5;
    } else if (this.parryTimer > 0) {
      this.parryTimer--;
      if (this.parryTimer === 0 && input.block) {
        this.blockLockTimer = 12; // Missed parry whiff penalty
      }
    }
    if (this.blockLockTimer > 0) {
      this.blockLockTimer--;
    }

    // Guard pose: hold back or block in neutral (for mesh Defend clip)
    const holdingAway = this.facingRight ? input.left : input.right;
    this.isGuarding =
      (holdingAway || input.block) &&
      (this.state === 'IDLE' ||
        this.state === 'WALK_BACK' ||
        this.state === 'CROUCHING' ||
        this.state === 'CROUCH_START' ||
        this.state === 'BLOCK_STUN');

    // Burst / Combo Breaker (Break out of combo for 50% meter)
    const isBurstInput = (input.lp && input.lk && input.hp) || (input.block && input.special);
    if (this.state === 'HIT_STUN' && this.meter >= 50 && isBurstInput) {
      this.meter -= 50;
      this.comboHitCount = 0;
      this.juggleCount = 0;
      this.isInvincible = true;
      this.stateFramesTarget = 16;
      this.changeState('IDLE');
      this.vx = (this.facingRight ? -1 : 1) * 3.5;
      return;
    }

    // Virat Chase Mode countdown
    if (this.chaseModeTimer > 0) {
      this.chaseModeTimer--;
      if (this.chaseModeTimer === 0) {
        this.runRateStacks = 0;
      }
    }

    // Update current state logic
    this.updateState(input, motion, dt);

    // Apply gravity & physics
    this.applyPhysics(dt);

    // Update 3D mesh transforms & animations (if renderer attached)
    if (this.mesh) {
      this.mesh.root.position.set(this.x, this.y, 0);
      const moveProgress = this.currentMoveExecutor ? this.currentMoveExecutor.getProgress() : 0;
      const activeMoveId = this.currentMoveExecutor ? this.currentMoveExecutor.move.id : '';
      // Seconds so mesh can stretch punch/kick/hit-react across real frame data
      const moveDurationSec = this.currentMoveExecutor
        ? this.currentMoveExecutor.totalFrames / 60
        : 0;
      const stateDurationSec = this.stateFramesTarget > 0 ? this.stateFramesTarget / 60 : 0;
      this.mesh.updateAnimation(
        this.state,
        this.stateTimer,
        this.facingRight,
        moveProgress,
        activeMoveId,
        dt,
        this.y,
        moveDurationSec,
        stateDurationSec,
        this.animReactNonce,
        this.isGuarding,
        this.profile.walkSpeedFwd,
        this.profile.walkSpeedBack,
        this.profile.dashSpeed
      );
    }

    // Latch buttons AFTER state logic so rising-edge is correct next frame
    this.prevBtns.lp = input.lp;
    this.prevBtns.hp = input.hp;
    this.prevBtns.lk = input.lk;
    this.prevBtns.hk = input.hk;
    this.prevBtns.special = input.special;
    this.prevBtns.super = input.super;
    this.prevBtns.block = input.block;
  }

  /** True only on the frame a button goes from up → down */
  private pressed(
    input: RawPlayerInput,
    btn: 'lp' | 'hp' | 'lk' | 'hk' | 'special' | 'super' | 'block'
  ): boolean {
    return !!input[btn] && !this.prevBtns[btn];
  }

  private applyPhysics(dt: number): void {
    // Horizontal movement
    this.x += this.vx * dt;

    // Stage boundary clamp
    if (this.x < this.stageMinX) {
      this.x = this.stageMinX;
      this.vx = 0;
    } else if (this.x > this.stageMaxX) {
      this.x = this.stageMaxX;
      this.vx = 0;
    }

    // Vertical gravity & floor clamp with juggle scaling
    if (this.y > 0 || this.vy !== 0) {
      const gravityScale = 1.0 + 0.1 * Math.min(3, this.juggleCount);
      this.vy -= this.profile.gravity * gravityScale * dt;
      this.y += this.vy * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.juggleCount = 0;
        this.wallBounceCount = 0;
        this.wallBounceDamagePenalty = false;
        if (this.state === 'JUMPING' || this.state === 'ATTACK') {
          // Whiffed aerial attack landing penalty: 8 frames vs normal 4
          this.stateFramesTarget = this.hadAirAttack ? 8 : 4;
          this.hadAirAttack = false;
          this.airAttackUsed = false;
          this.changeState('JUMP_LAND');
        }
        // KNOCKDOWN stays KNOCKDOWN — handled by stateFrames timer in updateState
      }
    }
  }

  // --- STATE MACHINE ---

  private updateState(input: RawPlayerInput, motion: MotionCommand, _dt: number): void {
    switch (this.state) {
      case 'IDLE':
      case 'WALK_FWD':
      case 'WALK_BACK': {
        this.handleNeutralInputs(input, motion);
        break;
      }

      case 'CROUCH_START': {
        if (this.stateFrames >= 3) {
          this.changeState('CROUCHING');
        }
        this.handleCrouchInputs(input, motion);
        break;
      }

      case 'CROUCHING': {
        this.handleCrouchInputs(input, motion);
        break;
      }

      case 'JUMP_START': {
        // Pre-jump: lock airborne direction; launch after 3f startup
        this.vx *= 0.92;
        if (this.stateFrames >= 3) {
          this.changeState('JUMPING');
          this.vy = this.profile.jumpVelocityY;
          this.airAttackUsed = false;
        }
        break;
      }

      case 'JUMPING': {
        if (!this.airAttackUsed) {
          const air =
            (this.pressed(input, 'hp') && (this.profile.moves.jump_hp || this.profile.moves.hp)) ||
            (this.pressed(input, 'lp') && (this.profile.moves.jump_lp || this.profile.moves.lp)) ||
            (this.pressed(input, 'lk') && (this.profile.moves.jump_lk || this.profile.moves.lk)) ||
            (this.pressed(input, 'hk') && (this.profile.moves.jump_hk || this.profile.moves.hk)) ||
            null;
          if (air) {
            this.airAttackUsed = true;
            this.tryExecuteMove(air);
          }
        }
        break;
      }

      case 'JUMP_LAND': {
        this.bufferAttack(input, motion);
        if (this.stateFrames >= this.stateFramesTarget) {
          this.changeState('IDLE');
        }
        break;
      }

      case 'DASH_FWD': {
        const dashLen = this.profile.dashFrames;
        const cancelFrom = this.profile.dashCancelFrom ?? 10;
        const t = Math.min(1, this.stateFrames / Math.max(1, dashLen));
        const curve = 1 - t * t * 0.45;
        this.vx = (this.facingRight ? 1 : -1) * this.profile.dashSpeed * curve;
        this.isInvincible = false;
        if (
          this.stateFrames >= cancelFrom &&
          (this.pressed(input, 'lp') ||
            this.pressed(input, 'hp') ||
            this.pressed(input, 'lk') ||
            this.pressed(input, 'hk'))
        ) {
          const move = this.pickDirectionalNormal(input);
          if (move) {
            this.runUpActive = this.profile.id === 'quickie';
            this.tryExecuteMove(move);
            return;
          }
        }
        if (this.stateFrames >= dashLen) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'DASH_BACK': {
        const bdLen = this.profile.backdashFrames ?? this.profile.dashFrames + 4;
        const iFrames = this.profile.backdashInvulnFrames ?? 5;
        const t = Math.min(1, this.stateFrames / Math.max(1, bdLen));
        const curve = 1 - t * t * 0.35;
        this.vx = (this.facingRight ? -1 : 1) * this.profile.dashSpeed * 0.82 * curve;
        this.isInvincible = this.stateFrames > 0 && this.stateFrames <= iFrames;
        if (this.stateFrames >= bdLen) {
          this.vx = 0;
          this.isInvincible = false;
          this.changeState('IDLE');
        }
        break;
      }

      case 'ATTACK': {
        if (this.currentMoveExecutor) {
          this.currentMoveExecutor.tick();
          const mv = this.currentMoveExecutor.move;

          // Reversal / DP invuln during early startup
          if (mv.invincibleStartupFrames && this.currentMoveExecutor.isStartup()) {
            this.isInvincible =
              this.currentMoveExecutor.currentFrame <= mv.invincibleStartupFrames;
          } else if (!mv.invincibleStartupFrames && this.state === 'ATTACK') {
            // clear only if we set it for this move
          }

          const spawnAt = mv.projectileSpawnFrame ?? mv.startup;
          if (
            this.currentMoveExecutor.currentFrame === spawnAt &&
            mv.projectileDef &&
            this.projectileSystem
          ) {
            this.projectileSystem.spawn(this, mv.projectileDef);
          }

          // Ashwin Googly: startup feint cancel (costs 10% meter)
          if (
            this.profile.id === 'spinner' &&
            this.currentMoveExecutor.isStartup() &&
            this.meter >= 10 &&
            input
          ) {
            const m = this.currentMoveExecutor.move;
            const isPunch = m.input.includes('P') || m.id.includes('_lp') || m.id.includes('_hp') || m.id.includes('special_1') || m.id.includes('special_3');
            const isKick = m.input.includes('K') || m.id.includes('_lk') || m.id.includes('_hk') || m.id.includes('special_2');
            if ((isPunch && (input.lk || input.hk)) || (isKick && (input.lp || input.hp))) {
              this.meter -= 10;
              this.currentMoveExecutor = null;
              this.isInvincible = false;
              this.stateFramesTarget = 4;
              this.changeState('IDLE');
              return;
            }
          }

          if (this.currentMoveExecutor.hasHit) {
            this.handleAttackCancels(input, motion);
          } else {
            this.bufferAttack(input, motion);
          }

          if (this.currentMoveExecutor && this.currentMoveExecutor.isFinished()) {
            this.runUpActive = false;
            this.isInvincible = false;
            const finishedMove = this.currentMoveExecutor.move;
            const hadHit = this.currentMoveExecutor.hasHit;
            this.currentMoveExecutor = null;

            if (finishedMove.hitLevel === 'throw' && !hadHit) {
              this.stateFramesTarget = 20;
              this.changeState('THROW_WHIFF');
              return;
            }

            if (this.y > 0) {
              this.changeState('JUMPING');
            } else if (this.currentInput && this.currentInput.down) {
              this.changeState('CROUCHING');
            } else {
              this.changeState('IDLE');
            }
          }
        } else {
          this.changeState('IDLE');
        }
        break;
      }

      case 'THROW_START': {
        this.vx = 0;
        // Wait for defender tech resolution / throw resolve
        if (this.stateFrames >= 40) {
          this.changeState('IDLE');
        }
        break;
      }

      case 'BEING_THROWN': {
        this.vx = 0;
        this.throwBreakTimer--;
        const tech =
          this.pressed(input, 'lp') ||
          this.pressed(input, 'hp') ||
          this.pressed(input, 'lk') ||
          this.pressed(input, 'hk');
        if (tech && this.throwBreakTimer > 0) {
          this.resolveThrowTech();
          return;
        }
        if (this.throwBreakTimer <= 0) {
          this.resolveThrowConnect();
          return;
        }
        break;
      }

      case 'HIT_STUN': {
        // Decelerate friction
        this.vx *= 0.88;
        this.bufferAttack(input, motion);
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'BLOCK_STUN': {
        this.vx *= 0.85;
        this.bufferAttack(input, motion);
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'GUARD_CRUSH': {
        this.vx *= 0.85;
        this.isInvincible = false;
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'THROW_WHIFF': {
        this.vx = 0;
        this.isInvincible = false;
        if (this.stateFrames >= this.stateFramesTarget) {
          this.changeState('IDLE');
        }
        break;
      }

      case 'THROW_TECH': {
        this.vx *= 0.85;
        this.isInvincible = false;
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'KNOCKDOWN': {
        this.vx *= 0.85;
        this.isInvincible = true;
        // Wake-up option select while down
        if (this.pressed(input, 'lk') || this.pressed(input, 'lp')) this.getUpOption = 0; // quick
        if (this.pressed(input, 'hk') || this.pressed(input, 'hp')) this.getUpOption = 1; // delayed
        if (input.left || input.right) this.getUpOption = 2; // roll
        const kdWait = this.getUpOption === 1 ? 48 : this.getUpOption === 2 ? 30 : 36;
        if (this.health > 0 && this.stateFrames >= kdWait) {
          this.changeState('GET_UP');
        }
        break;
      }

      case 'GET_UP': {
        // quick: short invuln; delayed: longer invuln; roll: invuln + slide
        const invuln =
          this.getUpOption === 1 ? 18 : this.getUpOption === 2 ? 16 : 12;
        const total = this.getUpOption === 1 ? 26 : this.getUpOption === 2 ? 22 : 18;
        this.isInvincible = this.stateFrames < invuln;
        if (this.getUpOption === 2 && this.stateFrames < 10) {
          this.vx = (this.facingRight ? -1 : 1) * 2.4;
        }
        this.bufferAttack(input, motion);
        if (this.stateFrames >= total) {
          this.isInvincible = false;
          this.vx = 0;
          this.getUpOption = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'SUPER_CINEMATIC': {
        if (this.stateFrames >= 28) {
          this.changeState('ATTACK');
        }
        break;
      }

      case 'WIN':
      case 'LOSE': {
        this.vx = 0;
        break;
      }
    }
  }

  public stateFramesTarget: number = 0;

  private handleNeutralInputs(input: RawPlayerInput, motion: MotionCommand): void {
    // 0. Rohit Power Hit Charge (Finisher: hold heavy in neutral, release to fire)
    if (this.profile.id === 'finisher') {
      if (input.hp || input.hk) {
        this.chargeFrames = Math.min(40, this.chargeFrames + 1);
        this.isChargingHeavy = true;
        this.vx = 0;
        return;
      }
      if (this.isChargingHeavy && !input.hp && !input.hk) {
        const isFull = this.chargeFrames >= 30;
        this.chargeFrames = 0;
        this.isChargingHeavy = false;
        const heavyMove = this.profile.moves.hp || this.profile.moves.hk;
        if (heavyMove) {
          this.tryExecuteMove(heavyMove);
          if (isFull) {
            this.isArmored = true;
            this.armorHitsLeft = 1;
          }
          return;
        }
      }
    }

    const atk =
      this.pressed(input, 'lp') ||
      this.pressed(input, 'hp') ||
      this.pressed(input, 'lk') ||
      this.pressed(input, 'hk') ||
      this.pressed(input, 'special') ||
      this.pressed(input, 'super');

    // 1. Super (press)
    if (this.pressed(input, 'super') && this.meter >= 100 && this.profile.moves.super) {
      this.executeSuper();
      return;
    }

    // EX Specials — both heavies pressed same frame + motion
    const isExMotion =
      (this.pressed(input, 'lp') && input.hp) ||
      (this.pressed(input, 'hp') && input.lp) ||
      (this.pressed(input, 'lk') && input.hk) ||
      (this.pressed(input, 'hk') && input.lk);
    if (atk && this.meter >= 33 && isExMotion) {
      if (motion === 'QCF' && this.profile.moves.special_1) {
        this.meter -= 33;
        this.tryExecuteMove(this.profile.moves.special_1, true);
        return;
      }
      if (motion === 'QCB' && this.profile.moves.special_2) {
        this.meter -= 33;
        this.tryExecuteMove(this.profile.moves.special_2, true);
        return;
      }
      if (motion === 'DP_FWD' && this.profile.moves.special_3) {
        this.meter -= 33;
        this.tryExecuteMove(this.profile.moves.special_3, true);
        return;
      }
    }

    // 2. Motion Specials (button must be pressed this frame)
    if (motion === 'QCF' && (this.pressed(input, 'lp') || this.pressed(input, 'hp')) && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
    if (motion === 'QCB' && (this.pressed(input, 'lk') || this.pressed(input, 'hk')) && this.profile.moves.special_2) {
      this.tryExecuteMove(this.profile.moves.special_2);
      return;
    }
    if (motion === 'DP_FWD' && (this.pressed(input, 'lk') || this.pressed(input, 'hk')) && this.profile.moves.special_3) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }

    // 3. Special button
    if (this.pressed(input, 'special') && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }

    // 4. Throw — LP+LK same frame or within 3f window, at least one rising edge
    const throwEdge = this.pressed(input, 'lp') || this.pressed(input, 'lk');
    const isSimultaneousThrow =
      throwEdge &&
      ((input.lp && input.lk) ||
        Math.abs(this.lastLpSimFrame - this.lastLkSimFrame) <= 3);

    if (isSimultaneousThrow && this.profile.moves.throw) {
      this.tryExecuteMove(this.profile.moves.throw);
      return;
    }

    // 5. Normals — directional variants first (overhead / AA / far poke / heavy launch)
    const dirMove = this.pickDirectionalNormal(input);
    if (dirMove) {
      this.tryExecuteMove(dirMove);
      return;
    }

    // 6. Dash (double-tap)
    if (motion === 'DASH_FWD') {
      this.changeState('DASH_FWD');
      return;
    }
    if (motion === 'DASH_BACK') {
      this.changeState('DASH_BACK');
      return;
    }

    // 7. Jump — commit hop direction at start
    if (input.up) {
      const isFwd = this.facingRight ? input.right : input.left;
      const isBack = this.facingRight ? input.left : input.right;
      const hop = this.profile.jumpVelocityY * 0.38;
      this.vx = isFwd
        ? (this.facingRight ? 1 : -1) * hop
        : isBack
          ? (this.facingRight ? -1 : 1) * hop * 0.85
          : 0;
      this.airAttackUsed = false;
      this.changeState('JUMP_START');
      return;
    }

    // 8. Crouch — startup then hold
    if (input.down) {
      this.vx = 0;
      if (this.state !== 'CROUCH_START' && this.state !== 'CROUCHING') {
        this.changeState('CROUCH_START');
      }
      return;
    }

    // 9. Walk
    const wantsRight = input.right;
    const wantsLeft = input.left;
    const fwdSpeed = this.profile.walkSpeedFwd * (this.chaseModeTimer > 0 ? 1.1 : 1.0);
    const backSpeed = this.profile.walkSpeedBack;

    if (wantsRight && !wantsLeft) {
      if (this.facingRight) {
        this.vx = fwdSpeed;
        this.changeState('WALK_FWD');
      } else {
        this.vx = backSpeed;
        this.changeState('WALK_BACK');
      }
    } else if (wantsLeft && !wantsRight) {
      if (this.facingRight) {
        this.vx = -backSpeed;
        this.changeState('WALK_BACK');
      } else {
        this.vx = -fwdSpeed;
        this.changeState('WALK_FWD');
      }
    } else {
      this.vx = 0;
      this.changeState('IDLE');
    }
  }

  private handleCrouchInputs(input: RawPlayerInput, motion: MotionCommand): void {
    if (!input.down) {
      this.changeState('IDLE');
      return;
    }

    this.vx = 0;

    if (this.pressed(input, 'super') && this.meter >= 100 && this.profile.moves.super) {
      this.executeSuper();
      return;
    }
    if (motion === 'DP_FWD' && this.profile.moves.special_3) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }
    if (motion === 'QCF' && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
    if (this.pressed(input, 'lp') && this.profile.moves.crouch_lp) {
      this.tryExecuteMove(this.profile.moves.crouch_lp);
      return;
    }
    if (this.pressed(input, 'hp') && (this.profile.moves.crouch_hp || this.profile.moves.crouch_lp)) {
      this.tryExecuteMove(this.profile.moves.crouch_hp || this.profile.moves.crouch_lp);
      return;
    }
    if (this.pressed(input, 'lk') && (this.profile.moves.crouch_lk || this.profile.moves.crouch_hk)) {
      this.tryExecuteMove(this.profile.moves.crouch_lk || this.profile.moves.crouch_hk);
      return;
    }
    if (this.pressed(input, 'hk') && this.profile.moves.crouch_hk) {
      this.tryExecuteMove(this.profile.moves.crouch_hk);
      return;
    }
    if (this.pressed(input, 'special') && this.profile.moves.special_3) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }
  }

  /** Forward/back + button → overhead / AA / far poke / heavy launcher */
  private pickDirectionalNormal(input: RawPlayerInput): MoveFrameData | null {
    const fwd = this.facingRight ? input.right : input.left;
    const back = this.facingRight ? input.left : input.right;
    const m = this.profile.moves;

    if (this.pressed(input, 'hp')) {
      if (fwd && m.overhead) return m.overhead;
      if (back && m.anti_air) return m.anti_air;
      if (m.hp) return m.hp;
    }
    if (this.pressed(input, 'hk')) {
      if (fwd && m.heavy_launcher) return m.heavy_launcher;
      if (m.hk) return m.hk;
    }
    if (this.pressed(input, 'lp')) {
      if (fwd && m.far_hp) return m.far_hp;
      if (m.lp) return m.lp;
    }
    if (this.pressed(input, 'lk')) {
      if (fwd && m.approach) return m.approach;
      if (m.lk) return m.lk;
    }
    return null;
  }

  private handleAttackCancels(input: RawPlayerInput, motion: MotionCommand): void {
    if (!this.currentMoveExecutor) return;
    const ex = this.currentMoveExecutor;

    if (this.pressed(input, 'super') && this.meter >= 100 && ex.canCancelInto('super')) {
      this.executeSuper();
      return;
    }
    if ((motion === 'QCF' || this.pressed(input, 'special')) && ex.canCancelInto('special_1')) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
    if (motion === 'QCB' && ex.canCancelInto('special_2')) {
      this.tryExecuteMove(this.profile.moves.special_2);
      return;
    }
    if (motion === 'DP_FWD' && ex.canCancelInto('special_3')) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }
    // Gatling normals
    const gatling: Array<[keyof RawPlayerInput, string]> = [
      ['lp', 'lp_follow'],
      ['lp', 'lp'],
      ['hp', 'hp'],
      ['lk', 'lk'],
      ['hk', 'hk'],
      ['hp', 'crouch_hp']
    ];
    for (const [btn, key] of gatling) {
      if (this.pressed(input, btn as 'lp' | 'hp' | 'lk' | 'hk') && ex.canCancelInto(key) && this.profile.moves[key]) {
        this.tryExecuteMove(this.profile.moves[key]);
        return;
      }
    }
  }

  public tryExecuteMove(move: MoveFrameData, isEx: boolean = false): boolean {
    if (!move) return false;
    this.currentMoveExecutor = new MoveExecutor(move);
    this.whooshArmed = true;
    if (this.state === 'DASH_FWD') {
      this.runUpActive = this.profile.id === 'quickie';
    }
    if (this.y <= 0) {
      this.vx = 0;
    } else {
      this.hadAirAttack = true;
    }
    this.isArmored = !!move.isArmored || isEx;
    this.armorHitsLeft = move.isArmored || isEx ? 1 : 0;
    if (move.invincibleStartupFrames) {
      this.isInvincible = true;
    }
    if (isEx) {
      this.currentMoveExecutor.currentFrame = Math.min(2, move.startup - 1);
    }
    this.changeState('ATTACK');
    return true;
  }

  /** True on the frame strike becomes active — main plays whoosh */
  public consumeWhoosh(): boolean {
    if (!this.currentMoveExecutor?.isActive()) return false;
    if (!this.whooshArmed) return false;
    // whooshArmed cleared in ATTACK tick; arm a one-shot via flag flip
    return true;
  }

  public needsWhoosh(): boolean {
    return (
      !!this.currentMoveExecutor &&
      this.whooshArmed &&
      this.currentMoveExecutor.currentFrame === this.currentMoveExecutor.move.startup
    );
  }

  public markWhooshPlayed(): void {
    this.whooshArmed = false;
  }

  private resolveThrowTech(): void {
    const atk = this.pendingThrowAttacker;
    this.throwBreakTimer = 0;
    this.pendingThrowMove = null;
    this.pendingThrowAttacker = null;
    this.stateFramesTarget = 10; // defender +2-ish advantage vs attacker
    this.changeState('THROW_TECH');
    this.vx = (this.facingRight ? -1 : 1) * 2.2;
    if (atk) {
      atk.currentMoveExecutor = null;
      atk.stateFramesTarget = 14;
      atk.changeState('THROW_TECH');
      atk.vx = (atk.facingRight ? -1 : 1) * 2.2;
    }
  }

  private resolveThrowConnect(): void {
    const move = this.pendingThrowMove;
    const atk = this.pendingThrowAttacker;
    this.throwBreakTimer = 0;
    this.pendingThrowMove = null;
    this.pendingThrowAttacker = null;
    if (!move || !atk) {
      this.changeState('IDLE');
      return;
    }
    const dmg = move.damage;
    this.health = Math.max(0, this.health - dmg);
    this.comboHitCount = 1;
    this.comboDamageTotal = dmg;
    this.comboTimer = 1.6;
    this.addMeter(move.meterGain * 0.5);
    atk.addMeter(move.meterGain);
    const dir = atk.facingRight ? 1 : -1;
    this.vx = dir * move.knockback.x;
    this.vy = move.knockback.y;
    this.animReactNonce++;
    this.changeState('KNOCKDOWN');
    atk.currentMoveExecutor = null;
    atk.changeState('IDLE');
  }

  private executeSuper(): void {
    if (!this.profile.moves.super) return;
    this.meter = Math.max(0, this.meter - 100);
    this.currentMoveExecutor = new MoveExecutor(this.profile.moves.super);
    this.changeState('SUPER_CINEMATIC');
  }

  private bufferAttack(input: RawPlayerInput, motion: MotionCommand): void {
    const BUF = 6; // forgiving pre-actionable buffer (guide 4–6f)
    if (this.pressed(input, 'super') && this.meter >= 100 && this.profile.moves.super) {
      this.bufferedAttack = { moveKey: 'super', framesLeft: BUF };
      return;
    }
    if (motion === 'DP_FWD' && this.profile.moves.special_3) {
      this.bufferedAttack = { moveKey: 'special_3', framesLeft: BUF };
      return;
    }
    if ((motion === 'QCF' || this.pressed(input, 'special')) && this.profile.moves.special_1) {
      this.bufferedAttack = { moveKey: 'special_1', framesLeft: BUF };
      return;
    }
    if (motion === 'QCB' && this.profile.moves.special_2) {
      this.bufferedAttack = { moveKey: 'special_2', framesLeft: BUF };
      return;
    }
    const throwEdge = this.pressed(input, 'lp') || this.pressed(input, 'lk');
    if (throwEdge && input.lp && input.lk && this.profile.moves.throw) {
      this.bufferedAttack = { moveKey: 'throw', framesLeft: BUF };
      return;
    }
    const isCrouch = !!input.down;
    const fwd = this.facingRight ? input.right : input.left;
    const back = this.facingRight ? input.left : input.right;
    if (this.pressed(input, 'hp')) {
      let key = isCrouch ? 'crouch_hp' : fwd ? 'overhead' : back ? 'anti_air' : 'hp';
      if (!this.profile.moves[key]) key = isCrouch ? 'crouch_lp' : 'hp';
      this.bufferedAttack = { moveKey: key, framesLeft: BUF };
    } else if (this.pressed(input, 'hk')) {
      let key = isCrouch ? 'crouch_hk' : fwd ? 'heavy_launcher' : 'hk';
      if (!this.profile.moves[key]) key = 'hk';
      this.bufferedAttack = { moveKey: key, framesLeft: BUF };
    } else if (this.pressed(input, 'lp')) {
      let key = isCrouch ? 'crouch_lp' : fwd ? 'far_hp' : 'lp';
      if (!this.profile.moves[key]) key = 'lp';
      this.bufferedAttack = { moveKey: key, framesLeft: BUF };
    } else if (this.pressed(input, 'lk')) {
      let key = isCrouch ? 'crouch_lk' : 'lk';
      if (!this.profile.moves[key]) key = isCrouch ? 'crouch_hk' : 'lk';
      this.bufferedAttack = { moveKey: key, framesLeft: BUF };
    }
  }

  private consumeBufferedAttack(): boolean {
    if (!this.bufferedAttack || this.bufferedAttack.framesLeft <= 0) {
      this.bufferedAttack = null;
      return false;
    }
    const key = this.bufferedAttack.moveKey;
    this.bufferedAttack = null;
    const move = this.profile.moves[key];
    if (move) {
      return this.tryExecuteMove(move);
    }
    return false;
  }

  public changeState(newState: FighterState): void {
    // Same-state no-op (except ATTACK→ATTACK cancel). Stops per-frame timer reset.
    if (this.state === newState && newState !== 'ATTACK') {
      return;
    }

    if (this.state === 'ATTACK' && newState !== 'ATTACK') {
      this.currentMoveExecutor = null;
    }
    if (this.state === 'DASH_BACK' && newState !== 'DASH_BACK') {
      this.isInvincible = false;
    }
    this.state = newState;
    this.stateTimer = 0;
    this.stateFrames = 0;

    if (newState === 'IDLE' || newState === 'CROUCHING' || newState === 'CROUCH_START') {
      this.consumeBufferedAttack();
    }
  }

  // --- COLLISION BOXES ---

  public getHurtbox(): Box2D {
    if (this.state === 'CROUCHING' || this.state === 'CROUCH_START') {
      return { x: -0.35, y: 0, w: 0.7, h: 1.15 };
    }
    if (this.state === 'JUMPING') {
      return { x: -0.3, y: 0.2, w: 0.6, h: 1.3 };
    }
    if (this.state === 'KNOCKDOWN' || this.state === 'GET_UP') {
      return { x: -0.5, y: 0, w: 1.0, h: 0.35 };
    }
    // Default standing
    return { x: -0.32, y: 0, w: 0.64, h: 1.75 };
  }

  public getPushbox(): Box2D {
    return { x: -0.25, y: 0, w: 0.5, h: 1.5 };
  }

  public getActiveHitbox(): Box2D | null {
    if (this.state === 'ATTACK' && this.currentMoveExecutor) {
      const box = this.currentMoveExecutor.getActiveHitbox();
      if (box && this.runUpActive) {
        return { ...box, w: box.w + 0.3 };
      }
      return box;
    }
    return null;
  }

  /** Frame + anim window open for a possible visual strike connect */
  public canAttemptVisualStrike(): boolean {
    if (this.state !== 'ATTACK' || !this.currentMoveExecutor) return false;
    if (!this.currentMoveExecutor.isInVisualDamageWindow()) return false;
    if (!this.mesh?.usesVisualStrikes()) {
      return this.currentMoveExecutor.isActive();
    }
    return this.mesh.isInStrikeContactWindow(this.currentMoveExecutor.move.id);
  }

  // --- DAMAGE & BLOCKING ---

  public takeHit(
    attacker: Fighter,
    move: MoveFrameData,
    isThrow: boolean = false
  ): HitResult {
    // 1. Invincibility check (knockdown, get-up roll)
    if (this.isInvincible) {
      return {
        hit: false,
        blocked: false,
        counterHit: false,
        damage: 0,
        hitstop: 0,
        knockback: { x: 0, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    // 2. Armor check
    if (this.isArmored && this.armorHitsLeft > 0) {
      this.armorHitsLeft--;
      this.health = Math.max(1, this.health - move.damage * 0.5);
      return {
        hit: true,
        blocked: false,
        counterHit: false,
        damage: move.damage * 0.5,
        hitstop: 6,
        knockback: { x: 0.5, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    // 3. Counter Hit — startup OR recovery (whiff punish) OR throw whiff
    const isCounter =
      this.state === 'THROW_WHIFF' ||
      (this.state === 'ATTACK' &&
        this.currentMoveExecutor !== null &&
        (this.currentMoveExecutor.isStartup() || this.currentMoveExecutor.isRecovery()));

    // Strike beats throw startup → CH cancel throw
    if (
      !isThrow &&
      this.state === 'ATTACK' &&
      this.currentMoveExecutor?.move.hitLevel === 'throw' &&
      this.currentMoveExecutor.isStartup()
    ) {
      this.currentMoveExecutor = null;
    }

    // 4. Blocking & Parry Check
    const attackerIsOnRight = attacker.x > this.x;
    const isHoldingAway = this.currentInput
      ? attackerIsOnRight
        ? this.currentInput.left
        : this.currentInput.right
      : false;
    const isPressingBlock = this.currentInput ? !!this.currentInput.block : false;
    const canBlockState =
      this.state === 'IDLE' ||
      this.state === 'WALK_BACK' ||
      this.state === 'CROUCHING' ||
      this.state === 'CROUCH_START' ||
      this.state === 'BLOCK_STUN';

    const canParry =
      this.parryTimer > 0 &&
      !isThrow &&
      move.hitLevel !== 'unblockable' &&
      move.id !== 'super';
    if (canParry && canBlockState) {
      this.parryTimer = 0;
      this.addMeter(5);
      attacker.addMeter(-5);
      this.stateFramesTarget = 0;
      this.changeState('IDLE');
      return {
        hit: false,
        blocked: true,
        counterHit: false,
        damage: 0,
        hitstop: 8,
        knockback: { x: 0, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    const isDefending =
      (isHoldingAway || isPressingBlock) &&
      canBlockState &&
      this.state !== 'GUARD_CRUSH' &&
      this.blockLockTimer <= 0;

    let isBlocked = false;
    if (isDefending && !isThrow && move.hitLevel !== 'unblockable') {
      const isCrouching = this.state === 'CROUCHING' || this.state === 'CROUCH_START';
      if (move.hitLevel === 'high') {
        isBlocked = !isCrouching; // crouch under highs
      } else if (move.hitLevel === 'mid') {
        isBlocked = true;
      } else if (move.hitLevel === 'low') {
        isBlocked = isCrouching;
      } else if (move.hitLevel === 'overhead' || move.isOverhead) {
        isBlocked = !isCrouching; // must stand-block
      }
    }

    // Throws: beat block; open tech window (no instant damage)
    if (isThrow) {
      if (
        this.y > 0 ||
        this.state === 'HIT_STUN' ||
        this.state === 'KNOCKDOWN' ||
        this.state === 'GET_UP' ||
        this.state === 'BEING_THROWN'
      ) {
        return {
          hit: false,
          blocked: false,
          counterHit: false,
          damage: 0,
          hitstop: 0,
          knockback: { x: 0, y: 0 },
          isLauncher: false,
          isKnockdown: false
        };
      }
      this.pendingThrowMove = move;
      this.pendingThrowAttacker = attacker;
      this.throwBreakTimer = move.throwBreakWindow ?? 16;
      this.animReactNonce++;
      this.changeState('BEING_THROWN');
      attacker.currentMoveExecutor = null;
      attacker.changeState('THROW_START');
      return {
        hit: true,
        blocked: false,
        counterHit: false,
        damage: 0,
        hitstop: 6,
        knockback: { x: 0, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    // 5. Calculate Damage with Combo Scaling & Guard Gauge
    let finalDamage = 0;
    if (isBlocked) {
      const guardDrain = move.guardDamage ?? (move.hitLevel === 'high' ? 6 : move.chipDamage ? 20 : 12);
      this.guardGauge = Math.max(0, this.guardGauge - guardDrain);

      // Guard Crush when guard reaches 0: 40-frame stun, fully punishable
      if (this.guardGauge <= 0) {
        this.guardGauge = 50;
        this.stateFramesTarget = 40;
        this.animReactNonce++;
        this.changeState('GUARD_CRUSH');
        const dir = this.facingRight ? -1 : 1;
        this.vx = dir * 2.5;

        return {
          hit: false,
          blocked: true,
          counterHit: false,
          damage: move.chipDamage || 0,
          hitstop: 10,
          knockback: { x: dir * 2.0, y: 0 },
          isLauncher: false,
          isKnockdown: false
        };
      }

      finalDamage = move.chipDamage || 0;
      this.health = Math.max(1, this.health - finalDamage);
      // Blockstun from onBlockFrameAdvantage: more minus = more stun for defender? 
      // Advantage is attacker-relative: -10 means defender is +10 → longer blockstun.
      this.stateFramesTarget = Math.max(6, 10 - move.onBlockFrameAdvantage);
      this.animReactNonce++;
      this.changeState('BLOCK_STUN');

      const dir = this.facingRight ? -1 : 1;
      const push = move.pushbackOnBlock ?? (move.damage >= 14 ? 1.6 : 0.7);
      this.vx = dir * (1.4 + push);

      this.addMeter(move.meterGain * 0.05);
      attacker.addMeter(move.meterGain * 0.5);

      // Hitstop by strength on block (light 3 / med 5 / heavy 7)
      const blockStop =
        move.hitstop >= 12 ? 7 : move.hitstop >= 8 ? 5 : 3;

      return {
        hit: false,
        blocked: true,
        counterHit: false,
        damage: finalDamage,
        hitstop: blockStop,
        knockback: { x: dir * push, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    // CLEAN HIT
    attacker.hadAirAttack = false;
    if (this.comboHitCount === 0) {
      this.comboStarterIsLight = move.hitLevel === 'high' || move.damage <= 7;
      this.comboDamageTotal = 0;
    }
    this.comboHitCount++;
    this.comboTimer = 1.6;
    this.lastCounterHit = isCounter;

    // Guide scaling: 100 / 90 / 80 / 70 / 60 then floor 40%
    const scaleTable = [1, 0.9, 0.8, 0.7, 0.6];
    let damageScale =
      this.comboHitCount <= 5 ? scaleTable[this.comboHitCount - 1] : 0.4;

    if (this.wallBounceDamagePenalty) {
      damageScale = Math.min(damageScale, 0.5);
    }

    if (isCounter) {
      damageScale *= 1.35;
    }

    const minDamage = Math.max(1, Math.floor(move.damage * 0.15));
    finalDamage = Math.max(minDamage, Math.round(move.damage * damageScale));
    this.health = Math.max(0, this.health - finalDamage);
    this.comboDamageTotal += finalDamage;

    // Virat Chase Mode stacks (opener gains stack on clean hit, loses all when hit)
    if (attacker.profile.id === 'opener') {
      attacker.runRateStacks = Math.min(3, attacker.runRateStacks + 1);
      if (attacker.runRateStacks === 3) {
        attacker.chaseModeTimer = 300;
      }
    }
    if (this.profile.id === 'opener') {
      this.runRateStacks = 0;
      this.chaseModeTimer = 0;
    }

    // Meter gains
    this.addMeter(move.meterGain * 0.6);
    attacker.addMeter(move.meterGain);

    // Knockback + pushback
    const dir = attacker.facingRight ? 1 : -1;
    const pushHit = move.pushbackOnHit ?? move.knockback.x;
    const kbX = dir * Math.max(move.knockback.x, pushHit * 0.85);
    const kbY = move.knockback.y;
    // Corner: less attacker push-away (attacker sticks closer)
    const nearCorner = Math.abs(this.x) >= 9.5;
    this.vx = kbX * (nearCorner ? 0.65 : 1);
    this.vy = kbY;

    // One wall splat per combo
    let triggeredWallBounce = false;
    if (
      (move.isLauncher || Math.abs(move.knockback.x) >= 3.0) &&
      nearCorner &&
      this.wallBounceCount === 0
    ) {
      this.wallBounceCount = 1;
      this.wallBounceDamagePenalty = true;
      triggeredWallBounce = true;
      const bounceDir = this.x > 0 ? -1 : 1;
      this.vx = bounceDir * 3.5;
      this.vy = 4.2;
      this.animReactNonce++;
      this.changeState('JUMPING');
    }

    if (!triggeredWallBounce) {
      if (this.y > 0) {
        this.juggleCount++;
        // Juggle decay: faster fall each hit; drop after 5–6
        if (this.juggleCount >= 5) {
          this.animReactNonce++;
          this.changeState('KNOCKDOWN');
          this.vy = -1.2;
        } else {
          this.animReactNonce++;
          this.changeState('JUMPING');
          const decay = 1 - this.juggleCount * 0.12;
          this.vy = Math.max(1.6, kbY * decay);
        }
      } else if (move.isLauncher) {
        this.juggleCount = 0;
        this.vy = Math.max(4.2, kbY * 1.45);
        this.animReactNonce++;
        this.changeState('JUMPING');
      } else if (move.isHardKnockdown || this.health <= 0) {
        if (this.y <= 0) this.vy = Math.max(0.6, kbY);
        this.animReactNonce++;
        this.changeState('KNOCKDOWN');
      } else {
        const chaseBonus = attacker.chaseModeTimer > 0 ? 1 : 0;
        const chBonus = isCounter ? 5 : 0;
        this.stateFramesTarget = Math.max(
          10,
          12 + move.onHitFrameAdvantage + chaseBonus + chBonus
        );
        this.animReactNonce++;
        this.changeState('HIT_STUN');
      }
    }

    return {
      hit: true,
      blocked: false,
      counterHit: isCounter,
      damage: finalDamage,
      hitstop: move.hitstop + (isCounter ? 4 : 0),
      knockback: { x: kbX, y: kbY },
      isLauncher: !!move.isLauncher,
      isKnockdown: !!move.isHardKnockdown || this.health <= 0
    };
  }

  public addMeter(amount: number): void {
    this.meter = Math.max(0, Math.min(100, this.meter + amount));
  }

  public resetForRound(startX: number, facingRight: boolean): void {
    this.x = startX;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facingRight = facingRight;
    this.health = this.maxHealth;
    this.guardGauge = this.maxGuardGauge;
    this.isInvincible = false;
    this.isArmored = false;
    this.armorHitsLeft = 0;
    this.hadAirAttack = false;
    this.comboHitCount = 0;
    this.comboDamageTotal = 0;
    this.lastCounterHit = false;
    this.throwBreakTimer = 0;
    this.pendingThrowMove = null;
    this.pendingThrowAttacker = null;
    this.getUpOption = 0;
    this.juggleCount = 0;
    this.wallBounceCount = 0;
    this.wallBounceDamagePenalty = false;
    this.runRateStacks = 0;
    this.chaseModeTimer = 0;
    this.chargeFrames = 0;
    this.isChargingHeavy = false;
    this.runUpActive = false;
    this.parryTimer = 0;
    this.blockLockTimer = 0;
    this.currentMoveExecutor = null;
    this.bufferedAttack = null;
    this.changeState('IDLE');
    this.mesh?.playIntro();
  }

  public toSimState(): FighterSimState {
    return {
      playerIndex: this.playerIndex,
      characterId: this.profile.id,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      facingRight: this.facingRight,
      health: this.health,
      maxHealth: this.maxHealth,
      meter: this.meter,
      guardGauge: this.guardGauge,
      state: this.state,
      stateFrames: this.stateFrames,
      stateTimer: this.stateTimer,
      isInvincible: this.isInvincible,
      isArmored: this.isArmored,
      armorHitsLeft: this.armorHitsLeft,
      comboHitCount: this.comboHitCount,
      juggleCount: this.juggleCount,
      wallBounceCount: this.wallBounceCount,
      runRateStacks: this.runRateStacks,
      chaseModeTimer: this.chaseModeTimer,
      chargeFrames: this.chargeFrames,
      activeMoveId: this.currentMoveExecutor ? this.currentMoveExecutor.move.id : undefined,
      activeMoveFrame: this.currentMoveExecutor ? this.currentMoveExecutor.currentFrame : undefined,
      activeMoveHasHit: this.currentMoveExecutor ? this.currentMoveExecutor.hasHit : undefined
    };
  }

  public loadSimState(state: FighterSimState): void {
    this.x = state.x;
    this.y = state.y;
    this.vx = state.vx;
    this.vy = state.vy;
    this.facingRight = state.facingRight;
    this.health = state.health;
    this.maxHealth = state.maxHealth;
    this.meter = state.meter;
    this.guardGauge = state.guardGauge;
    this.state = state.state;
    this.stateFrames = state.stateFrames;
    this.stateTimer = state.stateTimer;
    this.isInvincible = state.isInvincible;
    this.isArmored = state.isArmored;
    this.armorHitsLeft = state.armorHitsLeft;
    this.comboHitCount = state.comboHitCount;
    this.juggleCount = state.juggleCount || 0;
    this.wallBounceCount = state.wallBounceCount || 0;
    this.runRateStacks = state.runRateStacks || 0;
    this.chaseModeTimer = state.chaseModeTimer || 0;
    this.chargeFrames = state.chargeFrames || 0;
    if (state.activeMoveId && this.profile.moves[state.activeMoveId]) {
      this.currentMoveExecutor = new MoveExecutor(this.profile.moves[state.activeMoveId]);
      this.currentMoveExecutor.currentFrame = state.activeMoveFrame || 0;
      this.currentMoveExecutor.hasHit = !!state.activeMoveHasHit;
    } else {
      this.currentMoveExecutor = null;
    }
  }
}

