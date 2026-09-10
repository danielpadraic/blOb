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
}): number {
  if (!liveComposerKeyboardOpen(input.keyboardHeight)) {
    return Math.max(0, Math.round(input.closedPad));
  }
  if (input.layoutAlreadyAvoidsKeyboard) {
    return 0;
  }
  return Math.max(0, Math.round(input.keyboardHeight) + LIVE_KEYBOARD_AIR);
}
