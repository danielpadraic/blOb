import { afterEach, describe, expect, it } from 'vitest';

import { AUTH_CALLBACK_PATH, authRedirectUrl, loginHrefWithAuthError } from '@/lib/authRedirect';

const ENV_KEY = 'EXPO_PUBLIC_AUTH_REDIRECT_URL';

describe('authRedirectUrl', () => {
  const previous = process.env[ENV_KEY];

  afterEach(() => {
    if (previous == null) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('uses a production env callback on native', () => {
    process.env[ENV_KEY] = 'https://blob.example/auth/callback';
    expect(authRedirectUrl()).toBe('https://blob.example/auth/callback');
  });

  it('never returns an aics-projects env URL', () => {
    process.env[ENV_KEY] = 'https://aics-projects.vercel.app/auth/callback';
    expect(authRedirectUrl()).toBeNull();
  });

  it('keeps the callback path constant', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
  });

  it('encodes a safe login error query', () => {
    expect(loginHrefWithAuthError('Code expired\ntry again')).toBe(
      '/(auth)/login?authError=Code%20expired%20try%20again',
    );
  });
});
