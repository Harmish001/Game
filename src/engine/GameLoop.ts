export class GameLoop {
  private readonly fixedDt: number = 1 / 60; // 60 Hz fixed timestep (~0.016667s)
  private readonly maxFrameTime: number = 0.25; // Prevents spiral of death if tab is backgrounded
  private accumulator: number = 0;
  private lastTime: number = 0;
  private animationFrameId: number | null = null;
  private isRunning: boolean = false;
  private isPaused: boolean = false;

  // Callbacks
  private onUpdate: (dt: number) => void;
  private onRender: (interpolationAlpha: number) => void;

  // Diagnostics
  private fpsUpdateInterval: number = 0.5; // Update every 500ms
  private fpsTimer: number = 0;
  private frameCount: number = 0;
  private currentFps: number = 60;
  private tickCount: number = 0;

  constructor(
    onUpdate: (dt: number) => void,
    onRender: (interpolationAlpha: number) => void
  ) {
    this.onUpdate = onUpdate;
    this.onRender = onRender;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.animationFrameId = requestAnimationFrame(this.step.bind(this));
  }

  public stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  public togglePause(): boolean {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
    return this.isPaused;
  }

  public getPaused(): boolean {
    return this.isPaused;
  }

  public getFps(): number {
    return Math.round(this.currentFps);
  }

  public getTickCount(): number {
    return this.tickCount;
  }

  private step(currentTime: number): void {
    if (!this.isRunning) return;

    let delta = (currentTime - this.lastTime) / 1000;
    this.lastTime = currentTime;

    // Clamp delta to prevent spiral of death
    if (delta > this.maxFrameTime) {
      delta = this.maxFrameTime;
    }

    // FPS calculation
    this.frameCount++;
    this.fpsTimer += delta;
    if (this.fpsTimer >= this.fpsUpdateInterval) {
      this.currentFps = this.frameCount / this.fpsTimer;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    if (!this.isPaused) {
      this.accumulator += delta;

      // Fixed timestep updates
      while (this.accumulator >= this.fixedDt) {
        this.onUpdate(this.fixedDt);
        this.tickCount++;
        this.accumulator -= this.fixedDt;
      }
    }

    // Render with interpolation factor
    const alpha = this.isPaused ? 0 : this.accumulator / this.fixedDt;
    this.onRender(alpha);

    this.animationFrameId = requestAnimationFrame(this.step.bind(this));
  }
}

