/**
 * iOS "Add to Home Screen" hint (spec §8): iOS has no install prompt, so we explain
 * the Share → Add to Home Screen steps once, in iOS Safari outside standalone mode.
 */

export interface InstallHintEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.standalone` (iOS) or `display-mode: standalone`. */
  standalone: boolean;
  alreadyShown: boolean;
}

/** iPhone, iPod, or an iPad (which reports itself as a Mac with touch). */
export function isIos(
  env: Pick<InstallHintEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>,
): boolean {
  return (
    /iPad|iPhone|iPod/.test(env.userAgent) ||
    (env.platform === 'MacIntel' && env.maxTouchPoints > 1)
  );
}

/** Safari itself, not Chrome/Firefox/Edge/in-app browsers on iOS. */
export function isIosSafari(
  env: Pick<InstallHintEnv, 'userAgent' | 'platform' | 'maxTouchPoints'>,
): boolean {
  return (
    isIos(env) &&
    /Safari\//.test(env.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.userAgent)
  );
}

export function shouldShowInstallHint(env: InstallHintEnv): boolean {
  return !env.alreadyShown && !env.standalone && isIosSafari(env);
}

/** Read the environment from the browser. */
export function browserInstallEnv(alreadyShown: boolean): InstallHintEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone === true || matchMedia('(display-mode: standalone)').matches,
    alreadyShown,
  };
}
