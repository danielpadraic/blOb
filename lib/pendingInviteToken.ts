import * as SecureStore from 'expo-secure-store';

import { challengeInviteHref, inviteHref } from '@/lib/routes';

const PENDING_INVITE_KEY = 'pending_invite_token';
const WEB_PENDING_INVITE_KEY = 'blob:pending_invite_token';

let memoryPayload: string | null = null;

export type PendingInvite = {
  token: string;
  challengeId: string | null;
};

type WebStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function webStores(): WebStore[] {
  const stores: WebStore[] = [];
  try {
    if (typeof localStorage !== 'undefined' && localStorage) {
      stores.push(localStorage);
    }
  } catch {
    // Private mode / blocked storage.
  }
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) {
      stores.push(sessionStorage);
    }
  } catch {
    // Same-tab fallback only.
  }
  return stores;
}

function readWebPayload(): string | null {
  for (const store of webStores()) {
    try {
      const value = store.getItem(WEB_PENDING_INVITE_KEY)?.trim() || null;
      if (value) {
        return value;
      }
    } catch {
      // Keep scanning other stores.
    }
  }
  return null;
}

function writeWebPayload(value: string): void {
  for (const store of webStores()) {
    try {
      store.setItem(WEB_PENDING_INVITE_KEY, value);
    } catch {
      // Best-effort on web.
    }
  }
}

function clearWebPayload(): void {
  for (const store of webStores()) {
    try {
      store.removeItem(WEB_PENDING_INVITE_KEY);
    } catch {
      // Best-effort on web.
    }
  }
}

export function encodePendingInvite(token: string, challengeId?: string | null): string {
  const value = token.trim();
  const id = String(challengeId ?? '').trim();
  if (!value) {
    return '';
  }
  if (!id) {
    return value;
  }
  return JSON.stringify({ token: value, challengeId: id });
}

export function parsePendingInvite(raw?: string | null): PendingInvite | null {
  const value = String(raw ?? '').trim();
  if (!value) {
    return null;
  }
  if (value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as { token?: unknown; challengeId?: unknown };
      const token = String(parsed.token ?? '').trim();
      if (!token) {
        return null;
      }
      return { token, challengeId: String(parsed.challengeId ?? '').trim() || null };
    } catch {
      return { token: value, challengeId: null };
    }
  }
  return { token: value, challengeId: null };
}

async function persistPayload(payload: string): Promise<void> {
  memoryPayload = payload;
  writeWebPayload(payload);
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, payload);
  } catch {
    // Web / localStorage still hold the token through register and OAuth.
  }
}

export async function stashPendingInviteToken(
  token: string,
  challengeId?: string | null,
): Promise<void> {
  const payload = encodePendingInvite(token, challengeId);
  if (!payload) {
    return;
  }
  await persistPayload(payload);
}

export async function peekPendingInvite(): Promise<PendingInvite | null> {
  const fromMemory = parsePendingInvite(memoryPayload);
  if (fromMemory) {
    return fromMemory;
  }
  try {
    const stored = parsePendingInvite(await SecureStore.getItemAsync(PENDING_INVITE_KEY));
    if (stored) {
      memoryPayload = encodePendingInvite(stored.token, stored.challengeId);
      writeWebPayload(memoryPayload);
      return stored;
    }
  } catch {
    // Fall through to web storage.
  }
  const fromWeb = parsePendingInvite(readWebPayload());
  if (fromWeb) {
    memoryPayload = encodePendingInvite(fromWeb.token, fromWeb.challengeId);
    return fromWeb;
  }
  return null;
}

export async function peekPendingInviteToken(): Promise<string | null> {
  return (await peekPendingInvite())?.token ?? null;
}

export async function clearPendingInviteToken(): Promise<void> {
  memoryPayload = null;
  clearWebPayload();
  try {
    await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
  } catch {
    // Memory and web stores already cleared.
  }
}

/** Peek only. Clearing happens after accept succeeds — never on redirect. */
export async function takePendingInviteToken(): Promise<string | null> {
  return peekPendingInviteToken();
}

export async function pendingInviteResumeHref(): Promise<
  ReturnType<typeof inviteHref> | ReturnType<typeof challengeInviteHref> | null
> {
  const pending = await peekPendingInvite();
  if (!pending) {
    return null;
  }
  if (pending.challengeId) {
    return challengeInviteHref(pending.challengeId, pending.token);
  }
  return inviteHref(pending.token);
}

export function resetPendingInviteMemoryForTests(): void {
  memoryPayload = null;
}