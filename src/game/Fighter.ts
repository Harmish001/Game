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
  private prevInputLp: boolean = false;
  private prevInputLk: boolean = false;

  // Combo tracking (damage scaling & juggles)
  public comboHitCount: number = 0;
  public comboTimer: number = 0;
  public juggleCount: number = 0;
  public wallBounceCount: number = 0;
  public wallBounceDamagePenalty: boolean = false;
  public comboStarterIsLight: boolean = false;

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
  private prevInputBlock: boolean = false;

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
    if (input.lp && !this.prevInputLp) this.lastLpSimFrame = this.simFrameCount;
    if (input.lk && !this.prevInputLk) this.lastLkSimFrame = this.simFrameCount;
    this.prevInputLp = input.lp;
    this.prevInputLk = input.lk;

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
    if (input.block && !this.prevInputBlock && this.blockLockTimer <= 0) {
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
    this.prevInputBlock = input.block;

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
        this.animReactNonce
      );
    }
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
          // Whiffed aerial attack landing penalty: 7 frames vs normal 3 frames
          this.stateFramesTarget = this.hadAirAttack ? 7 : 3;
          this.hadAirAttack = false;
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

      case 'CROUCH_START':
      case 'CROUCHING': {
        this.handleCrouchInputs(input, motion);
        break;
      }

      case 'JUMP_START': {
        if (this.stateFrames >= 4) {
          this.changeState('JUMPING');
          this.vy = this.profile.jumpVelocityY;
        }
        break;
      }

      case 'JUMPING': {
        // Air attacks
        if (input.hp && this.profile.moves.jump_hp) { this.tryExecuteMove(this.profile.moves.jump_hp); }
        else if (input.lp && this.profile.moves.lp) { this.tryExecuteMove(this.profile.moves.lp); }
        else if (input.lk && this.profile.moves.lk) { this.tryExecuteMove(this.profile.moves.lk); }
        else if (input.hk && this.profile.moves.hk) { this.tryExecuteMove(this.profile.moves.hk); }
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
        this.vx = (this.facingRight ? 1 : -1) * this.profile.dashSpeed;
        if (input.lp || input.hp || input.lk || input.hk) {
          const move = (input.lp && this.profile.moves.lp) ||
                       (input.hp && this.profile.moves.hp) ||
                       (input.lk && this.profile.moves.lk) ||
                       (input.hk && this.profile.moves.hk);
          if (move) {
            this.runUpActive = (this.profile.id === 'quickie');
            this.tryExecuteMove(move);
            return;
          }
        }
        if (this.stateFrames >= this.profile.dashFrames) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'DASH_BACK': {
        this.vx = (this.facingRight ? -1 : 1) * this.profile.dashSpeed * 0.85;
        if (this.stateFrames >= this.profile.dashFrames) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'ATTACK': {
        if (this.currentMoveExecutor) {
          this.currentMoveExecutor.tick();

          // Spawn projectile on startup completion (active start)
          if (
            this.currentMoveExecutor.currentFrame === this.currentMoveExecutor.move.startup &&
            this.currentMoveExecutor.move.projectileDef &&
            this.projectileSystem
          ) {
            this.projectileSystem.spawn(this, this.currentMoveExecutor.move.projectileDef);
          }

          // Ashwin Googly: startup feint cancel (costs 10% meter)
          if (
            this.profile.id === 'spinner' &&
            this.currentMoveExecutor.isStartup() &&
            this.meter >= 10 &&
            input
          ) {
            const m = this.currentMoveExecutor.move;
            const isPunch = m.input.includes('Punch') || m.id.includes('p');
            const isKick = m.input.includes('Kick') || m.id.includes('k');
            if ((isPunch && (input.lk || input.hk)) || (isKick && (input.lp || input.hp))) {
              this.meter -= 10;
              this.currentMoveExecutor = null;
              this.stateFramesTarget = 4;
              this.changeState('IDLE');
              return;
            }
          }

          // Check cancel into special or super
          if (this.currentMoveExecutor.hasHit) {
            this.handleAttackCancels(input, motion);
          } else {
            this.bufferAttack(input, motion);
          }

          if (this.currentMoveExecutor && this.currentMoveExecutor.isFinished()) {
            this.runUpActive = false;
            const finishedMove = this.currentMoveExecutor.move;
            const hadHit = this.currentMoveExecutor.hasHit;
            this.currentMoveExecutor = null;

            if (finishedMove.hitLevel === 'throw' && !hadHit) {
              // Whiffed throw gets 20 frames of punishable whiff recovery
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
        // Only get up if still alive; stay down if KO
        if (this.health > 0 && this.stateFrames >= 36) {
          this.changeState('GET_UP');
        }
        break;
      }

      case 'GET_UP': {
        // Invulnerable for frames 0-13, vulnerable for frames 14-20 (meaty / okizeme window)
        this.isInvincible = this.stateFrames < 14;
        this.bufferAttack(input, motion);
        if (this.stateFrames >= 20) {
          this.isInvincible = false;
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

  private stateFramesTarget: number = 0;

  private handleNeutralInputs(input: RawPlayerInput, motion: MotionCommand): void {
    // 0. Rohit Power Hit Charge (Finisher: hold heavy attack button in neutral)
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

    // 1. Super Move (Full Meter)
    if (input.super && this.meter >= 100 && this.profile.moves.super) {
      this.executeSuper();
      return;
    }

    // EX Specials (33% meter, simultaneous double-punch or double-kick)
    const isExMotion = (input.lp && input.hp) || (input.lk && input.hk);
    if (this.meter >= 33 && isExMotion) {
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

    // 2. Motion Specials
    if (motion === 'QCF' && (input.lp || input.hp) && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
    if (motion === 'QCB' && (input.lk || input.hk) && this.profile.moves.special_2) {
      this.tryExecuteMove(this.profile.moves.special_2);
      return;
    }
    if (motion === 'DP_FWD' && (input.lk || input.hk) && this.profile.moves.special_3) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }

    // 3. Mobile / Simple Special button
    if (input.special && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }

    // 4. Throw / Grab (LP + LK or simultaneous press within 3 frames)
    const isSimultaneousThrow =
      (input.lp && input.lk) ||
      (Math.abs(this.lastLpSimFrame - this.lastLkSimFrame) <= 3 && (input.lp || input.lk));

    if (isSimultaneousThrow && this.profile.moves.throw) {
      this.tryExecuteMove(this.profile.moves.throw);
      return;
    }

    // 5. Normal Attacks
    if (input.lp && this.profile.moves.lp) {
      this.tryExecuteMove(this.profile.moves.lp);
      return;
    }
    if (input.hp && this.profile.moves.hp) {
      this.tryExecuteMove(this.profile.moves.hp);
      return;
    }
    if (input.lk && this.profile.moves.lk) {
      this.tryExecuteMove(this.profile.moves.lk);
      return;
    }
    if (input.hk && this.profile.moves.hk) {
      this.tryExecuteMove(this.profile.moves.hk);
      return;
    }

    // 6. Dash double taps
    if (motion === 'DASH_FWD') {
      this.changeState('DASH_FWD');
      return;
    }
    if (motion === 'DASH_BACK') {
      this.changeState('DASH_BACK');
      return;
    }

    // 7. Jump
    if (input.up) {
      const isFwd = this.facingRight ? input.right : input.left;
      const isBack = this.facingRight ? input.left : input.right;
      this.vx = isFwd ? (this.facingRight ? 1 : -1) * 2.8 : isBack ? (this.facingRight ? -1 : 1) * 2.4 : 0;
      this.changeState('JUMP_START');
      return;
    }

    // 8. Crouch
    if (input.down) {
      this.vx = 0;
      this.changeState('CROUCHING');
      return;
    }

    // 9. Walk Forward / Backward (Chase Mode grants +10% forward walk speed)
    const wantsRight = input.right;
    const wantsLeft = input.left;
    const fwdSpeed = this.profile.walkSpeedFwd * (this.chaseModeTimer > 0 ? 1.1 : 1.0);

    if (wantsRight && !wantsLeft) {
      if (this.facingRight) {
        this.vx = fwdSpeed;
        this.changeState('WALK_FWD');
      } else {
        this.vx = this.profile.walkSpeedBack;
        this.changeState('WALK_BACK');
      }
    } else if (wantsLeft && !wantsRight) {
      if (this.facingRight) {
        this.vx = -this.profile.walkSpeedBack;
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

    // Crouch attacks
    if (input.lp && this.profile.moves.crouch_lp) {
      this.tryExecuteMove(this.profile.moves.crouch_lp);
      return;
    }
    if (input.hp && this.profile.moves.crouch_lp) {
      this.tryExecuteMove(this.profile.moves.crouch_lp);
      return;
    }
    if (input.lk && this.profile.moves.crouch_hk) {
      this.tryExecuteMove(this.profile.moves.crouch_hk);
      return;
    }
    if (input.hk && this.profile.moves.crouch_hk) {
      this.tryExecuteMove(this.profile.moves.crouch_hk);
      return;
    }
    if (input.special && this.profile.moves.special_3) {
      this.tryExecuteMove(this.profile.moves.special_3);
      return;
    }
    if (motion === 'QCF' && input.lp && this.profile.moves.special_1) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
  }

  private handleAttackCancels(input: RawPlayerInput, motion: MotionCommand): void {
    if (!this.currentMoveExecutor) return;

    // Super cancel
    if (input.super && this.meter >= 100 && this.currentMoveExecutor.canCancelInto('super')) {
      this.executeSuper();
      return;
    }

    // Special cancels
    if ((motion === 'QCF' || input.special) && this.currentMoveExecutor.canCancelInto('special_1')) {
      this.tryExecuteMove(this.profile.moves.special_1);
      return;
    }
    if (motion === 'QCB' && this.currentMoveExecutor.canCancelInto('special_2')) {
      this.tryExecuteMove(this.profile.moves.special_2);
      return;
    }
    if (input.hp && this.currentMoveExecutor.canCancelInto('hp')) {
      this.tryExecuteMove(this.profile.moves.hp);
      return;
    }
    if (input.hk && this.currentMoveExecutor.canCancelInto('hk')) {
      this.tryExecuteMove(this.profile.moves.hk);
      return;
    }
  }

  public tryExecuteMove(move: MoveFrameData, isEx: boolean = false): boolean {
    if (!move) return false;
    this.currentMoveExecutor = new MoveExecutor(move);
    if (this.state === 'DASH_FWD') {
      this.runUpActive = (this.profile.id === 'quickie');
    }
    // Ground attacks stop horizontal movement; air attacks preserve aerial momentum
    if (this.y <= 0) {
      this.vx = 0;
    } else {
      this.hadAirAttack = true;
    }
    this.isArmored = !!move.isArmored || isEx;
    this.armorHitsLeft = (move.isArmored || isEx) ? 1 : 0;
    if (isEx) {
      this.currentMoveExecutor.currentFrame = Math.min(2, move.startup - 1);
    }
    this.changeState('ATTACK');
    return true;
  }

  private executeSuper(): void {
    if (!this.profile.moves.super) return;
    this.meter = Math.max(0, this.meter - 100);
    this.currentMoveExecutor = new MoveExecutor(this.profile.moves.super);
    this.changeState('SUPER_CINEMATIC');
  }

  private bufferAttack(input: RawPlayerInput, motion: MotionCommand): void {
    if (input.super && this.meter >= 100 && this.profile.moves.super) {
      this.bufferedAttack = { moveKey: 'super', framesLeft: 5 };
      return;
    }
    if ((motion === 'DP_FWD' || input.special) && this.profile.moves.special_3) {
      this.bufferedAttack = { moveKey: 'special_3', framesLeft: 5 };
      return;
    }
    if ((motion === 'QCF' || input.special) && this.profile.moves.special_1) {
      this.bufferedAttack = { moveKey: 'special_1', framesLeft: 5 };
      return;
    }
    if (motion === 'QCB' && this.profile.moves.special_2) {
      this.bufferedAttack = { moveKey: 'special_2', framesLeft: 5 };
      return;
    }
    const isSimultaneousThrow =
      (input.lp && input.lk) ||
      (Math.abs(this.lastLpSimFrame - this.lastLkSimFrame) <= 3 && (input.lp || input.lk));
    if (isSimultaneousThrow && this.profile.moves.throw) {
      this.bufferedAttack = { moveKey: 'throw', framesLeft: 5 };
      return;
    }
    const isCrouch = !!input.down;
    if (input.hp) {
      this.bufferedAttack = { moveKey: isCrouch ? 'crouch_lp' : 'hp', framesLeft: 5 };
    } else if (input.hk) {
      this.bufferedAttack = { moveKey: isCrouch ? 'crouch_hk' : 'hk', framesLeft: 5 };
    } else if (input.lp) {
      this.bufferedAttack = { moveKey: isCrouch ? 'crouch_lp' : 'lp', framesLeft: 5 };
    } else if (input.lk) {
      this.bufferedAttack = { moveKey: isCrouch ? 'crouch_hk' : 'lk', framesLeft: 5 };
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
    if (this.state === 'ATTACK' && newState !== 'ATTACK') {
      this.currentMoveExecutor = null;
    }
    this.state = newState;
    this.stateTimer = 0;
    this.stateFrames = 0;

    // Check buffered attack on entering neutral state
    if (newState === 'IDLE' || newState === 'CROUCHING') {
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

    // 3. Counter Hit Check (was victim in attack startup?)
    const isCounter =
      this.state === 'ATTACK' &&
      this.currentMoveExecutor !== null &&
      this.currentMoveExecutor.isStartup();

    // 4. Blocking & Parry Check
    const attackerIsOnRight = attacker.x > this.x;
    const isHoldingAway = this.currentInput
      ? (attackerIsOnRight ? this.currentInput.left : this.currentInput.right)
      : false;
    const isPressingBlock = this.currentInput ? !!this.currentInput.block : false;
    const canBlockState =
      this.state === 'IDLE' ||
      this.state === 'WALK_BACK' ||
      this.state === 'CROUCHING' ||
      this.state === 'CROUCH_START' ||
      this.state === 'BLOCK_STUN';

    // Parry (Section 8: tap block within 5 frames, 0 blockstun, +2 frame adv, +5% meter, opponent -5% meter)
    const canParry = this.parryTimer > 0 && !isThrow && move.hitLevel !== 'unblockable' && move.id !== 'super';
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
        isBlocked = !isCrouching;
      } else if (move.hitLevel === 'mid') {
        isBlocked = true;
      } else if (move.hitLevel === 'low') {
        isBlocked = isCrouching;
      }
    }

    // Throws: Beat block, but cannot connect on airborne targets or targets in hitstun/knockdown/getup!
    if (isThrow) {
      if (this.y > 0 || this.state === 'HIT_STUN' || this.state === 'KNOCKDOWN' || this.state === 'GET_UP') {
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
      isBlocked = false;
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
      this.health = Math.max(1, this.health - finalDamage); // Chip cannot kill in v1
      this.stateFramesTarget = Math.max(6, 12 - move.onBlockFrameAdvantage);
      this.animReactNonce++;
      this.changeState('BLOCK_STUN');

      const dir = this.facingRight ? -1 : 1;
      this.vx = dir * 2.2;

      this.addMeter(move.meterGain * 0.05);
      attacker.addMeter(move.meterGain * 0.50);

      return {
        hit: false,
        blocked: true,
        counterHit: false,
        damage: finalDamage,
        hitstop: 5,
        knockback: { x: dir * 1.5, y: 0 },
        isLauncher: false,
        isKnockdown: false
      };
    }

    // CLEAN HIT
    attacker.hadAirAttack = false;
    if (this.comboHitCount === 0) {
      this.comboStarterIsLight = move.hitLevel === 'high' || move.damage <= 7;
    }
    this.comboHitCount++;
    this.comboTimer = 1.6;

    // Combo damage scaling
    let damageScale = 1.0;
    if (this.comboHitCount === 2) damageScale = 0.85;
    else if (this.comboHitCount === 3) damageScale = 0.75;
    else if (this.comboHitCount >= 4) damageScale = 0.60;

    // Starter scaling: heavy starters get scaled to 85%
    if (!this.comboStarterIsLight) damageScale *= 0.85;

    // Wall bounce scaling penalty (50% cap on next hit)
    if (this.wallBounceDamagePenalty) {
      damageScale = Math.min(damageScale, 0.50);
    }

    if (isCounter) {
      damageScale *= 1.25; // 25% Counter Hit Bonus!
    }

    const minDamage = Math.max(1, Math.floor(move.damage * 0.15));
    finalDamage = Math.max(minDamage, Math.round(move.damage * damageScale));
    this.health = Math.max(0, this.health - finalDamage);

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

    // Knockback
    const dir = attacker.facingRight ? 1 : -1;
    const kbX = dir * move.knockback.x;
    const kbY = move.knockback.y;

    this.vx = kbX;
    this.vy = kbY;

    // Wall bounce check: within 1.5 of stage bounds (±11.0 -> |x| >= 9.5)
    let triggeredWallBounce = false;
    if (
      (move.isLauncher || Math.abs(move.knockback.x) >= 3.0) &&
      Math.abs(this.x) >= 9.5 &&
      this.wallBounceCount === 0
    ) {
      this.wallBounceCount = 1;
      this.wallBounceDamagePenalty = true;
      triggeredWallBounce = true;
      const bounceDir = this.x > 0 ? -1 : 1;
      this.vx = bounceDir * 3.5;
      this.vy = 4.2;
      this.changeState('JUMPING');
    }

    if (!triggeredWallBounce) {
      // Launch or knockdown or hitstun with juggle limits
      if (this.y > 0) {
        this.juggleCount++;
        if (this.juggleCount >= 3) {
          // Juggle limit reached: force hard knockdown
          this.animReactNonce++;
          this.changeState('KNOCKDOWN');
          this.vy = -1.0;
        } else {
          this.animReactNonce++;
          this.changeState('JUMPING');
          this.vy = Math.max(2.5, kbY);
        }
      } else if (move.isLauncher) {
        this.juggleCount = 0;
        this.vy = Math.max(4.5, kbY * 1.5);
        this.animReactNonce++;
        this.changeState('JUMPING');
      } else if (move.isHardKnockdown || this.health <= 0) {
        if (this.y <= 0) {
          this.vy = Math.max(0.6, kbY);
        }
        this.animReactNonce++;
        this.changeState('KNOCKDOWN');
      } else {
        const chaseBonus = attacker.chaseModeTimer > 0 ? 1 : 0;
        this.stateFramesTarget = Math.max(
          10,
          14 + move.onHitFrameAdvantage + chaseBonus + (isCounter ? 4 : 0)
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
      hitstop: move.hitstop + (isCounter ? 3 : 0),
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

