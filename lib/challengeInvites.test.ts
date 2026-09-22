import { afterEach, describe, expect, it } from 'vitest';

import {
  clearPendingInviteToken,
  peekPendingInviteToken,
  pendingInviteResumeHref,
  resetPendingInviteMemoryForTests,
  stashPendingInviteToken,
  takePendingInviteToken,
} from '@/lib/pendingInviteToken';

const WEB_KEY = 'blob:pending_invite_token';

function installWebStorage() {
  const data: Record<string, string> = {};
  const store = {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string) {
      data[key] = String(value);
    },
    removeItem(key: string) {
      delete data[key];
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: store });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: store });
  return data;
}

afterEach(async () => {
  await clearPendingInviteToken();
  resetPendingInviteMemoryForTests();
});

describe('pending invite token', () => {
  it('stashes, peeks without consuming, and survives a memory wipe via web storage', async () => {
    const data = installWebStorage();
    await stashPendingInviteToken('  pinnacle-token  ');
    expect(await peekPendingInviteToken()).toBe('pinnacle-token');
    expect(await peekPendingInviteToken()).toBe('pinnacle-token');
    expect(data[WEB_KEY]).toBe('pinnacle-token');

    resetPendingInviteMemoryForTests();
    expect(await peekPendingInviteToken()).toBe('pinnacle-token');
    expect(await takePendingInviteToken()).toBe('pinnacle-token');
    expect(await peekPendingInviteToken()).toBe('pinnacle-token');

    const resume = await pendingInviteResumeHref();
    expect(resume).toEqual({
      pathname: '/invite/[token]',
      params: { token: 'pinnacle-token' },
    });

    await stashPendingInviteToken('pinnacle-token', '16af3e82-aaaa-bbbb-cccc-ddddeeeeffff');
    expect(await pendingInviteResumeHref()).toBe(
      '/challenges/16af3e82-aaaa-bbbb-cccc-ddddeeeeffff?invite=pinnacle-token',
    );

    await clearPendingInviteToken();
    expect(await peekPendingInviteToken()).toBeNull();
    expect(data[WEB_KEY]).toBeUndefined();
    expect(await pendingInviteResumeHref()).toBeNull();
  });
});
