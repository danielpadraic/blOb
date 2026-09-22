import * as SecureStore from 'expo-secure-store';

import { inviteHref } from '@/lib/routes';

const PENDING_INVITE_KEY = 'pending_invite_token';
const WEB_PENDING_INVITE_KEY = 'blob:pending_invite_token';

let memoryToken: string | null = null;

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

function readWebToken(): string | null {
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

function writeWebToken(value: string): void {
  for (const store of webStores()) {
    try {
      store.setItem(WEB_PENDING_INVITE_KEY, value);
    } catch {
      // Best-effort on web.
    }
  }
}

function clearWebToken(): void {
  for (const store of webStores()) {
    try {
      store.removeItem(WEB_PENDING_INVITE_KEY);
    } catch {
      // Best-effort on web.
    }
  }
}

export async function stashPendingInviteToken(token: string): Promise<void> {
  const value = token.trim();
  if (!value) {
    return;
  }
  memoryToken = value;
  writeWebToken(value);
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, value);
  } catch {
    // Web / localStorage still hold the token through register and OAuth.
  }
}

export async function peekPendingInviteToken(): Promise<string | null> {
  const fromMemory = memoryToken?.trim() || null;
  if (fromMemory) {
    return fromMemory;
  }
  try {
    const stored = (await SecureStore.getItemAsync(PENDING_INVITE_KEY))?.trim() || null;
    if (stored) {
      memoryToken = stored;
      writeWebToken(stored);
      return stored;
    }
  } catch {
    // Fall through to web storage.
  }
  const fromWeb = readWebToken();
  if (fromWeb) {
    memoryToken = fromWeb;
    return fromWeb;
  }
  return null;
}

export async function clearPendingInviteToken(): Promise<void> {
  memoryToken = null;
  clearWebToken();
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

export async function pendingInviteResumeHref(): Promise<ReturnType<typeof inviteHref> | null> {
  const token = await peekPendingInviteToken();
  return token ? inviteHref(token) : null;
}

export function resetPendingInviteMemoryForTests(): void {
  memoryToken = null;
}
