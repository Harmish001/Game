import * as THREE from 'three';
import { Box2D, CharacterProfile, FighterState, HitLevel, MoveFrameData, RawPlayerInput } from './types';
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
  public mesh: FighterMesh;

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

  // Combo tracking (damage scaling)
  public comboHitCount: number = 0;
  public comboTimer: number = 0;

  // Bounds
  private readonly stageMinX: number = -11.0;
  private readonly stageMaxX: number = 11.0;

  constructor(profile: CharacterProfile, playerIndex: 1 | 2, startX: number, scene: THREE.Scene) {
    this.profile = profile;
    this.playerIndex = playerIndex;
    this.x = startX;
    this.y = 0;
    this.facingRight = playerIndex === 1;
    this.maxHealth = profile.maxHealth;
    this.health = this.maxHealth;

    this.mesh = new FighterMesh(profile, playerIndex === 2);
    this.mesh.root.position.set(this.x, this.y, 0);
    scene.add(this.mesh.root);
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

    // Update current state logic
    this.updateState(input, motion, dt);

    // Apply gravity & physics
    this.applyPhysics(dt);

    // Update 3D mesh transforms & animations
    this.mesh.root.position.set(this.x, this.y, 0);
    const moveProgress = this.currentMoveExecutor ? this.currentMoveExecutor.getProgress() : 0;
    const activeMoveId = this.currentMoveExecutor ? this.currentMoveExecutor.move.id : '';
    this.mesh.updateAnimation(
      this.state,
      this.stateTimer,
      this.facingRight,
      moveProgress,
      activeMoveId,
      dt
    );
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

    // Vertical gravity & floor clamp
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= this.profile.gravity * dt;
      this.y += this.vy * dt;

      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        if (this.state === 'JUMPING') {
          this.changeState('JUMP_LAND');
        }
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
        if (input.hp) {
          this.tryExecuteMove(this.profile.moves.jump_hp);
        }
        break;
      }

      case 'JUMP_LAND': {
        if (this.stateFrames >= 3) {
          this.changeState('IDLE');
        }
        break;
      }

      case 'DASH_FWD': {
        this.vx = (this.facingRight ? 1 : -1) * this.profile.dashSpeed;
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

          // Check cancel into special or super
          if (this.currentMoveExecutor.hasHit) {
            this.handleAttackCancels(input, motion);
          }

          if (this.currentMoveExecutor.isFinished()) {
            this.currentMoveExecutor = null;
            this.changeState(this.y > 0 ? 'JUMPING' : 'IDLE');
          }
        } else {
          this.changeState('IDLE');
        }
        break;
      }

      case 'HIT_STUN': {
        // Decelerate friction
        this.vx *= 0.88;
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'BLOCK_STUN': {
        this.vx *= 0.85;
        if (this.stateFrames >= this.stateFramesTarget) {
          this.vx = 0;
          this.changeState('IDLE');
        }
        break;
      }

      case 'KNOCKDOWN': {
        this.vx *= 0.85;
        this.isInvincible = true;
        if (this.stateFrames >= 32) {
          this.changeState('GET_UP');
        }
        break;
      }

      case 'GET_UP': {
        this.isInvincible = true;
        if (this.stateFrames >= 14) {
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
    // 1. Super Move (Full Meter)
    if (input.super && this.meter >= 100 && this.profile.moves.super) {
      this.executeSuper();
      return;
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

    // 4. Throw / Grab (LP + LK)
    if (input.lp && input.lk && this.profile.moves.throw) {
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

    // 9. Walk Forward / Backward
    const wantsRight = input.right;
    const wantsLeft = input.left;

    if (wantsRight && !wantsLeft) {
      if (this.facingRight) {
        this.vx = this.profile.walkSpeedFwd;
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
        this.vx = -this.profile.walkSpeedFwd;
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

  public tryExecuteMove(move: MoveFrameData): boolean {
    if (!move) return false;
    this.currentMoveExecutor = new MoveExecutor(move);
    this.vx = 0;
    this.isArmored = !!move.isArmored;
    this.armorHitsLeft = move.isArmored ? 1 : 0;
    this.changeState('ATTACK');
    return true;
  }

  private executeSuper(): void {
    if (!this.profile.moves.super) return;
    this.meter = Math.max(0, this.meter - 100);
    this.currentMoveExecutor = new MoveExecutor(this.profile.moves.super);
    this.changeState('SUPER_CINEMATIC');
  }

  public changeState(newState: FighterState): void {
    this.state = newState;
    this.stateTimer = 0;
    this.stateFrames = 0;
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
      return this.currentMoveExecutor.getActiveHitbox();
    }
    return null;
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

    // 4. Blocking Check
    // Can block if holding backward or pressing the block button while in neutral (standing or crouching)
    const isHoldingAway = this.currentInput
      ? (this.facingRight ? this.currentInput.left : this.currentInput.right)
      : false;
    const isPressingBlock = this.currentInput ? !!this.currentInput.block : false;
    const canBlockState =
      this.state === 'IDLE' ||
      this.state === 'WALK_BACK' ||
      this.state === 'CROUCHING' ||
      this.state === 'CROUCH_START';
    const isDefending = (isHoldingAway || isPressingBlock) && canBlockState;

    let isBlocked = false;
    if (isDefending && !isThrow && move.hitLevel !== 'unblockable') {
      const isCrouching = this.state === 'CROUCHING' || this.state === 'CROUCH_START';

      if (move.hitLevel === 'high') {
        // High can be blocked standing or ducked under
        isBlocked = !isCrouching;
      } else if (move.hitLevel === 'mid') {
        // Mid can be blocked standing or crouching (standard 2D fighter mechanics)
        isBlocked = true;
      } else if (move.hitLevel === 'low') {
        // Low must be blocked crouching
        isBlocked = isCrouching;
      }
    }

    // Throw beats block!
    if (isThrow) {
      isBlocked = false;
    }

    // 5. Calculate Damage with Combo Scaling
    let finalDamage = 0;
    if (isBlocked) {
      finalDamage = move.chipDamage || 0;
      this.health = Math.max(1, this.health - finalDamage); // Chip cannot kill in v1
      this.stateFramesTarget = Math.max(6, 12 - move.onBlockFrameAdvantage);
      this.changeState('BLOCK_STUN');

      // Small pushback on block
      const dir = this.facingRight ? -1 : 1;
      this.vx = dir * 2.2;

      // Meter gain on block
      this.addMeter(move.meterGain * 0.5);
      attacker.addMeter(move.meterGain * 0.4);

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
    this.comboHitCount++;
    this.comboTimer = 1.6; // Combo resets after 1.6s

    // Combo damage scaling
    let damageScale = 1.0;
    if (this.comboHitCount === 2) damageScale = 0.85;
    else if (this.comboHitCount === 3) damageScale = 0.75;
    else if (this.comboHitCount >= 4) damageScale = 0.6;

    if (isCounter) {
      damageScale *= 1.25; // 25% Counter Hit Bonus!
    }

    finalDamage = Math.max(1, Math.round(move.damage * damageScale));
    this.health = Math.max(0, this.health - finalDamage);

    // Meter gains
    this.addMeter(move.meterGain * 0.6); // Meter for taking hit
    attacker.addMeter(move.meterGain); // Meter for landing hit

    // Knockback
    const dir = attacker.facingRight ? 1 : -1;
    const kbX = dir * move.knockback.x;
    const kbY = move.knockback.y;

    this.vx = kbX;
    this.vy = kbY;

    // Launch or knockdown or hitstun
    if (move.isLauncher) {
      this.vy = Math.max(4.5, kbY * 1.5);
      this.changeState('JUMPING');
    } else if (move.isHardKnockdown || this.health <= 0) {
      this.changeState('KNOCKDOWN');
    } else {
      this.stateFramesTarget = Math.max(10, 14 + move.onHitFrameAdvantage + (isCounter ? 4 : 0));
      this.changeState('HIT_STUN');
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
    this.meter = Math.min(100, this.meter + amount);
  }

  public resetForRound(startX: number, facingRight: boolean): void {
    this.x = startX;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facingRight = facingRight;
    this.health = this.maxHealth;
    this.isInvincible = false;
    this.isArmored = false;
    this.comboHitCount = 0;
    this.currentMoveExecutor = null;
    this.changeState('IDLE');
  }
}

