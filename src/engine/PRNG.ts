/**
 * Mulberry32 seeded Pseudo-Random Number Generator.
 * Deterministic across all JS engines.
 */
export class PRNG {
  private state: number;

  constructor(seed: number = 1337) {
    this.state = seed >>> 0;
  }

  public getSeed(): number {
    return this.state;
  }

  public setSeed(seed: number): void {
    this.state = seed >>> 0;
  }

  /**
   * Returns pseudo-random float in [0, 1)
   */
  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns pseudo-random integer in [min, max] (inclusive)
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Returns true with given probability [0, 1]
   */
  public chance(prob: number): boolean {
    return this.next() < prob;
  }
}

export const defaultRng = new PRNG(424242);

