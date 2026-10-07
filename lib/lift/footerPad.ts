import { TAB_BAR_HEIGHT } from '@/lib/theme';

/**
 * Bottom pad for the Logging / saved-session row.
 *
 * The pill floats over the scene. TAB_ROOT_EDGES does not inset the bottom, so a
 * home-indicator pad leaves Play under the bar. Native seats the row on the bar:
 * bar height plus the home indicator. Web already ends on that bar, so its pad
 * stays the seat that is on screen today.
 *
 * Keyboard up is 0. The shell sits the row on the keys and must not keep this pad.
 */
export function liftLoggingClosedPad(
  bottomInset: number,
  platform: string,
  keyboardOpen = false,
): number {
  if (keyboardOpen) {
    return 0;
  }
  const home = Math.max(0, bottomInset);
  if (platform === 'web') {
    return Math.max(home, 12);
  }
  return TAB_BAR_HEIGHT + home;
}
