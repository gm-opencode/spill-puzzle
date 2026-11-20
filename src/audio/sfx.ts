/**
 * Snap click and completion chime (FR-3.5, spec §9), synthesised with Web Audio so
 * there are no audio files to download or precache. The `AudioContext` is created
 * and resumed on the first user gesture (browsers block audio before that).
 */

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Call from a user gesture (pointerdown) so later sounds can play. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

function tone(c: AudioContext, freq: number, start: number, duration: number, gain: number): void {
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(amp).connect(c.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** A short, soft "click" (about 60 ms). */
export function playSnap(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const amp = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(500, t + 0.05);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(0.25, t + 0.003);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  osc.connect(amp).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.08);
}

/** A short rising three-note chime for completion. */
export function playChime(): void {
  const c = context();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => tone(c, f, t + i * 0.11, 0.5, 0.18));
}

/** A 10 ms vibration where supported (spec §9; iOS has no Vibration API, ignored silently). */
export function vibrate(): void {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Not available or blocked: ignore.
  }
}
