/**
 * Locale-aware formatting helpers for UI text.
 */

/**
 * Elapsed time as `m:ss`, or `h:mm:ss` from one hour (FR-3.8).
 * @param ms Duration in milliseconds; negative values count as 0.
 */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600_000],
  ['month', 30 * 24 * 3600_000],
  ['week', 7 * 24 * 3600_000],
  ['day', 24 * 3600_000],
  ['hour', 3600_000],
  ['minute', 60_000],
];

/**
 * "2 hours ago"-style text for a past timestamp (spec §1.1), or `null` for under a minute.
 * @param then Epoch ms.
 * @param now Epoch ms.
 */
export function formatRelative(then: number, now: number, locale = 'en'): string | null {
  const diff = now - then;
  for (const [unit, size] of UNITS) {
    if (diff >= size) {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
      return rtf.format(-Math.floor(diff / size), unit);
    }
  }
  return null;
}
