import { Box2D, MoveFrameData } from './types';

export class MoveExecutor {
  public move: MoveFrameData;
  public currentFrame: number = 0;
  public totalFrames: number;
  public hasHit: boolean = false;
  public hasBlocked: boolean = false;

  constructor(move: MoveFrameData) {
    this.move = move;
    this.totalFrames = move.startup + move.active + move.recovery;
    this.currentFrame = 0;
  }

  public tick(): void {
    this.currentFrame++;
  }

  public isStartup(): boolean {
    return this.currentFrame < this.move.startup;
  }

  public isActive(): boolean {
    return (
      this.currentFrame >= this.move.startup &&
      this.currentFrame < this.move.startup + this.move.active
    );
  }

  public isRecovery(): boolean {
    return (
      this.currentFrame >= this.move.startup + this.move.active &&
      this.currentFrame < this.totalFrames
    );
  }

  public isFinished(): boolean {
    return this.currentFrame >= this.totalFrames;
  }

  public getProgress(): number {
    return Math.min(1.0, this.currentFrame / (this.totalFrames || 1));
  }

  public getActiveHitbox(): Box2D | null {
    if (this.isActive() && !this.hasHit && this.move.hitbox) {
      return this.move.hitbox;
    }
    return null;
  }

  /**
   * Frame gate for Tekken-style visual strikes:
   * skip pure windup, allow through active + recovery until move ends.
   * Actual connect still needs limb-vs-body contact in the mesh layer.
   */
  public isInVisualDamageWindow(): boolean {
    if (this.hasHit || !this.move.hitbox) return false;
    if (this.isFinished()) return false;
    // Allow connect from late startup through active (+ a bit of recovery for slow kicks)
    const windupEnd = Math.max(1, Math.floor(this.move.startup * 0.45));
    const activeEnd = this.move.startup + this.move.active + Math.max(1, Math.floor(this.move.recovery * 0.15));
    return this.currentFrame >= windupEnd && this.currentFrame < activeEnd;
  }

  public canCancelInto(nextMoveId: string): boolean {
    if (!this.hasHit) return false;
    if (!this.move.cancelInto) return false;
    // Can cancel during active or recovery
    if (this.currentFrame >= this.move.startup) {
      return this.move.cancelInto.includes(nextMoveId);
    }
    return false;
  }
}

