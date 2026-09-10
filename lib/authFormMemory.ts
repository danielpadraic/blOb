/** In-memory only. Never AsyncStorage, localStorage, or a query param. */

let pendingAuthEmail: string | null = null;

export function setPendingAuthEmail(email: string | null | undefined): void {
  const trimmed = String(email ?? '').trim();
  pendingAuthEmail = trimmed || null;
}

export function peekPendingAuthEmail(): string {
  return pendingAuthEmail ?? '';
}

export function takePendingAuthEmail(): string {
  const value = pendingAuthEmail ?? '';
  pendingAuthEmail = null;
  return value;
}
