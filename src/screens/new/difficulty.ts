/**
 * Difficulty presets (FR-2.1, spec §1.2).
 */

export const PRESETS = [12, 24, 48, 96, 150, 300] as const;
export const DESKTOP_PRESET = 500;
export const DEFAULT_PRESET = 48;

/** Piece-count options; 500 only on desktop. */
export function difficultyOptions(desktop: boolean): number[] {
  return desktop ? [...PRESETS, DESKTOP_PRESET] : [...PRESETS];
}

/** Desktop = a fine pointer and a viewport at least 1024 px wide (spec §1.2). */
export function isDesktop(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(pointer: fine)').matches &&
    window.innerWidth >= 1024
  );
}

/** Puzzle title from a file name: extension stripped, trimmed, at most 60 characters. */
export function titleFromFileName(name: string | undefined, fallback: string): string {
  const base = (name ?? '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim();
  return (base || fallback).slice(0, 60);
}

/** A random uint32 seed for a new puzzle. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}
