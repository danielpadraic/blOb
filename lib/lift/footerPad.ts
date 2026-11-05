/** Air between the row and the pill, matching the 10px the shell puts above the row. */
export const LIFT_FOOTER_SEAT_GAP = 10;

/**
 * Bottom pad for the Logging / saved-session row.
 *
 * The pill tab bar is in layout flow under the scene and already reserves
 * TAB_BAR_HEIGHT plus the home indicator, so the row ends right above it. Adding
 * TAB_BAR_HEIGHT again would leave the row floating over an empty strip, which is
 * the gap this replaces.
 *
 * Keyboard up is 0: the bar steps aside and the shell sits the row on the keys.
 * A wide Web window has no bottom bar, so it keeps a home-indicator pad.
 */
export function liftLoggingClosedPad(
  bottomInset: number,
  barShown: boolean,
  keyboardOpen = false,
): number {
  if (keyboardOpen) {
    return 0;
  }
  if (barShown) {
    return LIFT_FOOTER_SEAT_GAP;
  }
  return Math.max(Math.max(0, bottomInset), 12);
}
