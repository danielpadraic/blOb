/** One bottom inset for the Lift Share sheet. Never keyboard + tabBarLift + 88. */
export function liftShareSheetInset(keyboardHeight: number, safePad: number): number {
  if (keyboardHeight > 0) {
    return Math.max(0, Math.round(keyboardHeight));
  }
  return Math.max(0, Math.round(safePad));
}

export function liftShareKeyboardOpen(keyboardHeight: number): boolean {
  return keyboardHeight > 0;
}
