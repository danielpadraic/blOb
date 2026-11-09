/**
 * Live / Circle lobby composer bottom inset.
 *
 * Stacked before (the ~200pt mint slab on TestFlight):
 *   keyboard height          (LiveThread marginBottom / KeyboardAvoidingView)
 *   + tab bar                (TAB_BAR_HEIGHT 70, still in flow)
 *   + home indicator         (safe-area paddingBottom on the tab bar)
 *   + leftover 88            (TAB_BAR_HEIGHT + TAB_BAR_SCENE_PEEK)
 * while iOS was already lifting the scene.
 *
 * One number. Never tabBarLift + keyboard + 88 + safe area together.
 */
export const LIVE_KEYBOARD_MIN = 100;
/** Hair of air on the keys. Not a second tab-bar pad. */
export const LIVE_KEYBOARD_AIR = 0;

export function liveComposerKeyboardOpen(keyboardHeight: number): boolean {
  return keyboardHeight > LIVE_KEYBOARD_MIN;
}

export function liveComposerInset(input: {
  keyboardHeight: number;
  closedPad: number;
  /** Android `resize` already shrank the window. Do not add keyboard height again. */
  layoutAlreadyAvoidsKeyboard?: boolean;
  /**
   * How far the keyboard actually covers the thread's bottom edge (see liveKeyboardOverlap).
   * Preferred over the raw keyboard height, which is only right when the thread ends at the
   * bottom of the window.
   */
  measuredOverlap?: number | null;
}): number {
  if (!liveComposerKeyboardOpen(input.keyboardHeight)) {
    return Math.max(0, Math.round(input.closedPad));
  }
  if (input.layoutAlreadyAvoidsKeyboard) {
    return 0;
  }
  if (input.measuredOverlap != null) {
    return Math.max(0, Math.round(input.measuredOverlap)) + LIVE_KEYBOARD_AIR;
  }
  return Math.max(0, Math.round(input.keyboardHeight) + LIVE_KEYBOARD_AIR);
}

/**
 * Pixels of the thread's bottom that sit under the keyboard. The composer pads by exactly this,
 * so it lands on the key tops whatever is (or was a frame ago) below the thread: the tab bar,
 * the home indicator, a header above it.
 */
export function liveKeyboardOverlap(input: {
  /** Window Y of the thread's bottom edge. Null until measured. */
  hostBottom: number | null;
  windowHeight: number;
  /** windowHeight minus the keyboard's top edge. */
  keyboardFromBottom: number;
}): number | null {
  if (input.hostBottom == null || !Number.isFinite(input.hostBottom)) {
    return null;
  }
  const keyboardTop = input.windowHeight - input.keyboardFromBottom;
  return Math.max(0, Math.round(input.hostBottom - keyboardTop));
}
