import { AIDifficulty, RawPlayerInput } from '../types';
import { Fighter } from '../Fighter';
import { PRNG } from '../../engine/PRNG';

export class CPUAI {
  private difficulty: AIDifficulty;
  private actionTimer: number = 0;
  private currentInput: RawPlayerInput = this.createEmptyInput();
  private rng: PRNG;

  // Difficulty parameters
  // Human visual reaction is ~150-200ms (9-12 frames). Expert reaction floors raised from 3 frames (50ms) to 10 frames (~160ms)
  private reactionDelay: number = 0.25; // seconds
  private blockRate: number = 0.5; // 0 to 1
  private comboSkill: number = 0.5;
  private executionErrorRate: number = 0.15; // chance to drop or miscue

  constructor(difficulty: AIDifficulty = 'normal', rng?: PRNG) {
    this.difficulty = difficulty;
    this.rng = rng || new PRNG(12345);
    this.setDifficulty(difficulty);
  }

  public setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
    switch (difficulty) {
      case 'easy':
        this.reactionDelay = 0.50; // ~30 frames
        this.blockRate = 0.20;
        this.comboSkill = 0.20;
        this.executionErrorRate = 0.30;
        break;
      case 'normal':
        this.reactionDelay = 0.35; // ~21 frames
        this.blockRate = 0.45;
        this.comboSkill = 0.55;
        this.executionErrorRate = 0.15;
        break;
      case 'hard':
        this.reactionDelay = 0.22; // ~13 frames
        this.blockRate = 0.70;
        this.comboSkill = 0.80;
        this.executionErrorRate = 0.08;
        break;
      case 'expert':
        this.reactionDelay = 0.16; // ~10 frames (realistic pro reaction, not 3 frames)
        this.blockRate = 0.85;
        this.comboSkill = 0.92;
        this.executionErrorRate = 0.04;
        break;
    }
  }

  public getDifficulty(): AIDifficulty {
    return this.difficulty;
  }

  public getReactionDelay(): number {
    return this.reactionDelay;
  }

  public setRng(rng: PRNG): void {
    this.rng = rng;
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

  public update(self: Fighter, opponent: Fighter, dt: number): RawPlayerInput {
    this.actionTimer += dt;

    // React periodically based on difficulty reaction delay
    if (this.actionTimer >= this.reactionDelay) {
      this.actionTimer = 0;
      this.currentInput = this.decideAction(self, opponent);
    }

    return this.currentInput;
  }

  private decideAction(self: Fighter, opponent: Fighter): RawPlayerInput {
    // Execution error check: AI occasionally drops action
    if (this.rng.chance(this.executionErrorRate)) {
      return this.createEmptyInput();
    }

    const input = this.createEmptyInput();
    const distance = Math.abs(self.x - opponent.x);
    const opponentIsAttacking = opponent.state === 'ATTACK';
    const opponentIsJumping = opponent.state === 'JUMPING';

    // 1. DEFENSE / BLOCKING DECISION
    if (opponentIsAttacking && this.rng.chance(this.blockRate) && distance < 2.5) {
      input.block = true;
      // Hold backward relative to opponent position
      if (self.x < opponent.x) {
        input.left = true;
      } else {
        input.right = true;
      }

      // Crouch block if opponent is attacking low or by probabilistic choice
      if (this.rng.chance(0.45)) {
        input.down = true;
      }
      return input;
    }

    // 2. ANTI-AIR REACTION
    if (opponentIsJumping && distance < 2.2 && this.rng.chance(this.comboSkill)) {
      // Anti-air with Heavy Punch or Special 2
      if (this.rng.chance(0.5)) {
        input.hp = true;
      } else {
        input.special = true;
      }
      return input;
    }

    // 3. SUPER ATTACK (When available and opponent close/recovering)
    if (self.meter >= 100 && distance < 2.8 && this.rng.chance(this.comboSkill * 0.7)) {
      input.super = true;
      return input;
    }

    // 4. CLOSE COMBAT RANGE (< 1.6m)
    if (distance < 1.6) {
      const roll = this.rng.next();

      if (roll < 0.25) {
        // Fast Light Punch poke
        input.lp = true;
      } else if (roll < 0.45) {
        // Heavy Bat Drive
        input.hp = true;
      } else if (roll < 0.65) {
        // Low kick sweep
        input.down = true;
        input.hk = true;
      } else if (roll < 0.8) {
        // Special move
        input.special = true;
      } else if (roll < 0.9) {
        // Grab / Throw
        input.lp = true;
        input.lk = true;
      } else {
        // Step back / spacing
        if (self.facingRight) input.left = true;
        else input.right = true;
      }
      return input;
    }

    // 5. MID / POKING RANGE (1.6m - 3.2m)
    if (distance >= 1.6 && distance <= 3.2) {
      const roll = this.rng.next();

      if (roll < 0.35) {
        // Special move poke (Cover Drive / Yorker Slide)
        input.special = true;
      } else if (roll < 0.6) {
        // Walk forward
        if (self.facingRight) input.right = true;
        else input.left = true;
      } else if (roll < 0.8) {
        // Jump in
        input.up = true;
        if (self.facingRight) input.right = true;
        else input.left = true;
      } else {
        // Stand and poke with LP / LK
        input.lk = true;
      }
      return input;
    }

    // 6. LONG DISTANCE (> 3.2m)
    // Approach opponent
    if (self.x < opponent.x) {
      input.right = true;
    } else {
      input.left = true;
    }

    // Occasionally jump or dash
    if (this.rng.chance(0.2)) {
      input.up = true;
    }

    return input;
  }
}
