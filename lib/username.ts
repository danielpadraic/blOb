export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, '');
}

export function usernameHandleLabel(value: string): string | null {
  const handle = normalizeUsername(value);
  return handle ? `@${handle}` : null;
}
