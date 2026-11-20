import { describe, expect, it, vi } from 'vitest';
import { Autosave, PlayTimer, type Timers } from '../../../src/screens/play/session';

describe('PlayTimer (FR-3.8)', () => {
  it('only counts while running', () => {
    let now = 1000;
    const timer = new PlayTimer(5000, () => now);
    expect(timer.elapsedMs).toBe(5000);
    expect(timer.running).toBe(false);
    timer.start();
    now += 2000;
    expect(timer.elapsedMs).toBe(7000);
    timer.pause();
    now += 10_000; // hidden: doesn't count
    expect(timer.elapsedMs).toBe(7000);
    timer.start();
    timer.start(); // idempotent
    now += 500;
    expect(timer.elapsedMs).toBe(7500);
    timer.pause();
    timer.pause();
    expect(timer.elapsedMs).toBe(7500);
  });

  it('ignores negative initial values', () => {
    expect(new PlayTimer(-5, () => 0).elapsedMs).toBe(0);
  });
});

/** Manual timers: `fire()` runs the pending callback. */
function manualTimers() {
  let cb: (() => void) | null = null;
  const timers: Timers & { fire(): void; pending: boolean } = {
    set: (fn) => {
      cb = fn;
      return 1;
    },
    clear: () => {
      cb = null;
    },
    fire() {
      const f = cb;
      cb = null;
      f?.();
    },
    get pending() {
      return cb !== null;
    },
  };
  return timers;
}

describe('Autosave (spec §7)', () => {
  it('debounces changes into one save', async () => {
    const save = vi.fn(async () => {});
    const timers = manualTimers();
    const autosave = new Autosave(save, undefined, 1000, timers);
    autosave.schedule();
    autosave.schedule();
    autosave.schedule();
    expect(save).not.toHaveBeenCalled();
    expect(autosave.dirty).toBe(true);
    timers.fire();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(autosave.dirty).toBe(false);
  });

  it('flushes immediately and only when dirty', async () => {
    const save = vi.fn(async () => {});
    const timers = manualTimers();
    const autosave = new Autosave(save, undefined, 1000, timers);
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
    autosave.schedule();
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(timers.pending).toBe(false);
    autosave.markDirty();
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('never runs saves concurrently and saves again if changed meanwhile', async () => {
    let release!: () => void;
    let active = 0;
    let maxActive = 0;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active++;
          maxActive = Math.max(maxActive, active);
          release = () => {
            active--;
            resolve();
          };
        }),
    );
    const autosave = new Autosave(save, undefined, 1000, manualTimers());
    autosave.markDirty();
    const first = autosave.flush();
    autosave.markDirty();
    const second = autosave.flush();
    release();
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    release();
    await Promise.all([first, second]);
    expect(maxActive).toBe(1);
  });

  it('reports errors and stays dirty so the next flush retries', async () => {
    const onError = vi.fn();
    const save = vi.fn().mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    const autosave = new Autosave(save, onError, 1000, manualTimers());
    autosave.markDirty();
    await autosave.flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(autosave.dirty).toBe(true);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.dirty).toBe(false);
  });

  it('dispose cancels the pending debounce', () => {
    const save = vi.fn(async () => {});
    const timers = manualTimers();
    const autosave = new Autosave(save, undefined, 1000, timers);
    autosave.schedule();
    autosave.dispose();
    expect(timers.pending).toBe(false);
    autosave.dispose();
  });
});
