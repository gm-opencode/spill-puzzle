/**
 * Translation lookup (NFR-11). English only for now; Norwegian arrives in P1 (FR-6.3).
 */
import en from './en.json';

export type MessageKey = keyof typeof en;

const messages: Record<string, string> = en;

/**
 * Look up a UI string and fill `{name}` placeholders.
 * Unknown keys return the key itself, so a missing string is visible but not fatal.
 */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
