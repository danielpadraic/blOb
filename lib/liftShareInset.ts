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

/** Keyboard up: sit on the keys. Keyboard down: sheet safe pad only. Never tabBarLift. */
export function liftShareFooterPad(keyboardOpen: boolean, safeBottom: number): number {
  return keyboardOpen ? 0 : Math.max(0, Math.round(safeBottom));
}

export function liftShareNameMatches(
  person: { display_name?: string | null; username?: string | null },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return `${person.display_name ?? ''} ${person.username ?? ''}`.toLowerCase().includes(needle);
}
