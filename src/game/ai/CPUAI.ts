import { AIDifficulty, RawPlayerInput } from '../types';
import { Fighter } from '../Fighter';

export class CPUAI {
  private difficulty: AIDifficulty;
  private reactionTimer: number = 0;
  private actionTimer: number = 0;
  private currentInput: RawPlayerInput = this.createEmptyInput();

  // Difficulty parameters
  private reactionDelay: number = 0.25; // seconds
  private blockRate: number = 0.5; // 0 to 1
  private comboSkill: number = 0.5;

  constructor(difficulty: AIDifficulty = 'normal') {
    this.difficulty = difficulty;
    this.setDifficulty(difficulty);
  }

  public setDifficulty(difficulty: AIDifficulty): void {
    this.difficulty = difficulty;
    switch (difficulty) {
      case 'easy':
        this.reactionDelay = 0.5;
        this.blockRate = 0.2;
        this.comboSkill = 0.2;
        break;
      case 'normal':
        this.reactionDelay = 0.25;
        this.blockRate = 0.5;
        this.comboSkill = 0.6;
        break;
      case 'hard':
        this.reactionDelay = 0.1;
        this.blockRate = 0.78;
        this.comboSkill = 0.85;
        break;
      case 'expert':
        this.reactionDelay = 0.05;
        this.blockRate = 0.92;
        this.comboSkill = 0.98;
        break;
    }
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
    this.reactionTimer += dt;
    this.actionTimer += dt;

    // React periodically based on difficulty
    if (this.actionTimer >= this.reactionDelay) {
      this.actionTimer = 0;
      this.currentInput = this.decideAction(self, opponent);
    }

    return this.currentInput;
  }

  private decideAction(self: Fighter, opponent: Fighter): RawPlayerInput {
    const input = this.createEmptyInput();
    const distance = Math.abs(self.x - opponent.x);
    const opponentIsAttacking = opponent.state === 'ATTACK';
    const opponentIsJumping = opponent.state === 'JUMPING';
    const isFacingOpponent = (self.x < opponent.x && self.facingRight) || (self.x > opponent.x && !self.facingRight);

    // 1. DEFENSE / BLOCKING DECISION
    if (opponentIsAttacking && Math.random() < this.blockRate && distance < 2.5) {
      // Hold backward to block
      if (self.facingRight) {
        input.left = true;
      } else {
        input.right = true;
      }

      // Crouch block if opponent is attacking low or by random choice
      if (Math.random() < 0.45) {
        input.down = true;
      }
      return input;
    }

    // 2. ANTI-AIR REACTION
    if (opponentIsJumping && distance < 2.2 && Math.random() < this.comboSkill) {
      // Anti-air with Heavy Punch or Special 2
      if (Math.random() < 0.5) {
        input.hp = true;
      } else {
        input.special = true;
      }
      return input;
    }

    // 3. SUPER ATTACK (When available and opponent whiffs or close)
    if (self.meter >= 100 && distance < 2.8 && Math.random() < this.comboSkill * 0.7) {
      input.super = true;
      return input;
    }

    // 4. CLOSE COMBAT RANGE (< 1.6m)
    if (distance < 1.6) {
      const roll = Math.random();

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
        // Step back / space
        if (self.facingRight) input.left = true;
        else input.right = true;
      }
      return input;
    }

    // 5. MID / POKING RANGE (1.6m - 3.2m)
    if (distance >= 1.6 && distance <= 3.2) {
      const roll = Math.random();

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
    if (Math.random() < 0.2) {
      input.up = true;
    }

    return input;
  }
}
