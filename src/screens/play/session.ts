/**
 * Play-session helpers with injectable clocks, so they can be unit-tested:
 * the visible-only timer (FR-3.8) and debounced autosave (FR-4.1, spec §7).
 */

/** Autosave debounce after each change, in ms (spec §7). */
export const AUTOSAVE_DELAY_MS = 1000;

/**
 * Elapsed play time that only advances while running (the Play screen is mounted
 * and the page is visible).
 */
export class PlayTimer {
  private base: number;
  private startedAt: number | null = null;

  /**
   * @param initialMs Time already played (from `PuzzleMeta.elapsedMs`).
   * @param now Monotonic clock in ms.
   */
  constructor(
    initialMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.base = Math.max(0, initialMs);
  }

  get running(): boolean {
    return this.startedAt !== null;
  }

  get elapsedMs(): number {
    return this.base + (this.startedAt === null ? 0 : this.now() - this.startedAt);
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = this.now();
  }

  pause(): void {
    if (this.startedAt === null) return;
    this.base += this.now() - this.startedAt;
    this.startedAt = null;
  }
}

export interface Timers {
  set(cb: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimers: Timers = {
  set: (cb, ms) => setTimeout(cb, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Debounced saving: `schedule()` after each change saves once things settle;
 * `flush()` saves right away if anything is pending (page hidden, leaving the screen).
 * Saves never overlap: a flush during a save waits for it, then saves again if needed.
 */
export class Autosave {
  private timer: unknown = null;
  private pending = false;
  private running: Promise<void> | null = null;

  constructor(
    private readonly save: () => Promise<void>,
    private readonly onError: (error: unknown) => void = () => {},
    private readonly delayMs: number = AUTOSAVE_DELAY_MS,
    private readonly timers: Timers = browserTimers,
  ) {}

  /** True if a change has not been saved yet. */
  get dirty(): boolean {
    return this.pending;
  }

  /** Mark the state changed and (re)start the debounce. */
  schedule(): void {
    this.pending = true;
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = this.timers.set(() => {
      this.timer = null;
      void this.flush();
    }, this.delayMs);
  }

  /** Mark the state changed without waiting for the debounce, e.g. the timer advanced. */
  markDirty(): void {
    this.pending = true;
  }

  /** Save now if there are unsaved changes. Resolves when everything is written. */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
    }
    if (this.running) await this.running;
    if (!this.pending) return;
    this.pending = false;
    this.running = this.save()
      .catch((error: unknown) => {
        this.pending = true;
        this.onError(error);
      })
      .finally(() => {
        this.running = null;
      });
    await this.running;
  }

  /** Stop the debounce timer without saving. */
  dispose(): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.timer = null;
  }
}
