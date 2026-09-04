const STEP_MS = 1000 / 60;
/** Never simulate more than this many ticks in one frame — prevents a spiral of death
 *  after the tab is backgrounded and returns with a huge accumulated delta. */
const MAX_STEPS = 5;

/**
 * Fixed-timestep game loop. `update` always sees exactly 1/60s; `render` gets an
 * interpolation alpha so motion stays smooth on high-refresh displays.
 */
export class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    this.accumulator += now - this.lastTime;
    this.lastTime = now;

    let steps = 0;
    while (this.accumulator >= STEP_MS && steps < MAX_STEPS) {
      this.update(STEP_MS / 1000);
      this.accumulator -= STEP_MS;
      steps++;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.render(this.accumulator / STEP_MS);
  };
}
