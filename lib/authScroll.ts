export function shouldRunScrollToTop(args: {
  stepKey: string | number | undefined;
  appliedKey: string | number | undefined;
  fieldFocused: boolean;
}): boolean {
  if (args.stepKey === undefined) {
    return false;
  }
  // Keystroke / focus on the same step must never jump to top (Bio under Gboard).
  if (args.appliedKey === args.stepKey) {
    return false;
  }
  if (args.fieldFocused) {
    return false;
  }
  return true;
}
