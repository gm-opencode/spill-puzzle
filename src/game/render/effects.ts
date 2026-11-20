/**
 * Visual feedback (spec §10, §9): lift and shadow on drag, snap animation, snap
 * highlight. Animations are ≤ 200 ms ease-out and are skipped under
 * `prefers-reduced-motion` (NFR-7).
 */
import { BlurFilter, Container, Sprite } from 'pixi.js';

/** Scale of a lifted (dragged) group (spec §10). */
export const LIFT_SCALE = 1.02;
/** Snap animation length in ms (spec §6.1 step 4). */
export const SNAP_MS = 120;
/** Snap highlight length in ms (spec §9). */
export const HIGHLIGHT_MS = 200;
/** Shadow offset under a dragged group, in screen CSS px. */
export const SHADOW_OFFSET_PX = 6;

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

interface Tween {
  elapsed: number;
  duration: number;
  update: (t: number) => void;
  done?: () => void;
}

/** A tiny tween runner driven by the Pixi ticker. */
export class Tweens {
  private readonly active = new Set<Tween>();

  /**
   * Run `update` with eased progress from 0 to 1 over `duration` ms. With a duration
   * of 0 (or reduced motion, decided by the caller) it jumps straight to the end.
   * Returns a function that cancels the tween without calling `done`.
   */
  add(duration: number, update: (t: number) => void, done?: () => void): () => void {
    if (duration <= 0) {
      update(1);
      done?.();
      return () => {};
    }
    const tween: Tween = { elapsed: 0, duration, update, done };
    this.active.add(tween);
    update(0);
    return () => this.active.delete(tween);
  }

  tick(dtMs: number): void {
    for (const tween of [...this.active]) {
      tween.elapsed += dtMs;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(easeOutCubic(t));
      if (t >= 1) {
        this.active.delete(tween);
        tween.done?.();
      }
    }
  }

  get size(): number {
    return this.active.size;
  }

  clear(): void {
    this.active.clear();
  }
}

/**
 * A soft shadow under a dragged group (spec §5 "Drop shadow"): copies of its sprites,
 * tinted black and blurred. The single filter is only ever on the dragged group.
 */
export function createShadow(sprites: readonly Sprite[], offsetWorld: number): Container {
  const shadow = new Container({ label: 'shadow', eventMode: 'none' });
  for (const s of sprites) {
    const copy = new Sprite(s.texture);
    copy.position.set(s.x + offsetWorld, s.y + offsetWorld);
    copy.tint = 0x000000;
    copy.alpha = 0.35;
    shadow.addChild(copy);
  }
  shadow.filters = [new BlurFilter({ strength: 8, quality: 2, resolution: 0.5 })];
  return shadow;
}

export function destroyShadow(shadow: Container): void {
  for (const f of [shadow.filters ?? []].flat()) f.destroy();
  shadow.filters = [];
  shadow.destroy({ children: true });
}

/**
 * White glow on the given sprites that fades out over {@link HIGHLIGHT_MS} (spec §9).
 * Additive copies so the photo brightens without changing its colours.
 */
export function highlight(tweens: Tweens, parent: Container, sprites: readonly Sprite[]): void {
  const glow = new Container({ label: 'highlight', eventMode: 'none' });
  for (const s of sprites) {
    const copy = new Sprite(s.texture);
    copy.position.copyFrom(s.position);
    copy.blendMode = 'add';
    glow.addChild(copy);
  }
  parent.addChild(glow);
  const duration = prefersReducedMotion() ? 0 : HIGHLIGHT_MS;
  tweens.add(
    duration,
    (t) => {
      glow.alpha = 0.45 * (1 - t);
    },
    () => glow.destroy({ children: true }),
  );
}
