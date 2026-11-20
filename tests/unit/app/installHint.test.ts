import { describe, expect, it } from 'vitest';
import {
  isIos,
  isIosSafari,
  shouldShowInstallHint,
  type InstallHintEnv,
} from '../../../src/app/installHint';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

const env = (over: Partial<InstallHintEnv>): InstallHintEnv => ({
  userAgent: IPHONE_SAFARI,
  platform: 'iPhone',
  maxTouchPoints: 5,
  standalone: false,
  alreadyShown: false,
  ...over,
});

describe('install hint (spec §8)', () => {
  it('detects iOS, including iPads that pretend to be Macs', () => {
    expect(isIos(env({}))).toBe(true);
    expect(
      isIos(env({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 5 })),
    ).toBe(true);
    expect(
      isIos(env({ userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 })),
    ).toBe(false);
    expect(isIos(env({ userAgent: ANDROID, platform: 'Linux armv8l' }))).toBe(false);
  });

  it('shows only in iOS Safari, outside standalone, once', () => {
    expect(shouldShowInstallHint(env({}))).toBe(true);
    expect(isIosSafari(env({ userAgent: IPHONE_CHROME }))).toBe(false);
    expect(shouldShowInstallHint(env({ userAgent: IPHONE_CHROME }))).toBe(false);
    expect(shouldShowInstallHint(env({ standalone: true }))).toBe(false);
    expect(shouldShowInstallHint(env({ alreadyShown: true }))).toBe(false);
    expect(shouldShowInstallHint(env({ userAgent: ANDROID, platform: 'Linux' }))).toBe(false);
  });
});
