export function shouldRunScrollToTop(args: {
  stepKey: string | number | undefined;
  appliedKey: string | number | undefined;
  fieldFocused: boolean;
}): boolean {
  if (args.stepKey === undefined) {
    return false;
  }
  if (args.fieldFocused) {
    return false;
  }
  return args.appliedKey !== args.stepKey;
}
