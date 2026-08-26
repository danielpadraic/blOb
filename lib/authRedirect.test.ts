import { afterEach, describe, expect, it } from 'vitest';

import {
  AUTH_CALLBACK_PATH,
  authRedirectUrl,
  blobAuthCallbackDeepLink,
  emailAuthRedirectTo,
  isHttpsAuthCallback,
  isVercelComHost,
  loginHrefAfterSignup,
  loginHrefWithAuthError,
} from '@/lib/authRedirect';

const ENV_KEY = 'EXPO_PUBLIC_AUTH_REDIRECT_URL';

describe('emailAuthRedirectTo', () => {
  const previous = process.env[ENV_KEY];

  afterEach(() => {
    if (previous == null) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
  });

  it('uses a production https /auth/callback env on native', () => {
    process.env[ENV_KEY] = 'https://blob.example/auth/callback';
    expect(emailAuthRedirectTo()).toBe('https://blob.example/auth/callback');
    expect(authRedirectUrl()).toBe('https://blob.example/auth/callback');
  });

  it('allows the Expo web host on vercel.app', () => {
    process.env[ENV_KEY] = 'https://blob-zeta-three.vercel.app/auth/callback';
    expect(emailAuthRedirectTo()).toBe('https://blob-zeta-three.vercel.app/auth/callback');
  });

  it('uses the current origin on web and ignores env', () => {
    const previousDocument = (globalThis as { document?: unknown }).document;
    const previousWindow = (globalThis as { window?: unknown }).window;
    try {
      Object.defineProperty(globalThis, 'document', { value: {}, configurable: true });
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: { origin: 'https://blob.example' } },
      });
      process.env[ENV_KEY] = 'https://other.example/auth/callback';
      expect(emailAuthRedirectTo()).toBe('https://blob.example/auth/callback');

      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: { location: { origin: 'https://vercel.com' } },
      });
      expect(emailAuthRedirectTo()).toBeNull();
    } finally {
      if (previousDocument === undefined) {
        Reflect.deleteProperty(globalThis, 'document');
      } else {
        Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
      }
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      } else {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      }
    }
  });

  it('never returns vercel.com, blob://, empty, or a non-callback path', () => {
    process.env[ENV_KEY] = 'https://vercel.com/auth/callback';
    expect(emailAuthRedirectTo()).toBeNull();
    process.env[ENV_KEY] = 'https://www.vercel.com/login';
    expect(emailAuthRedirectTo()).toBeNull();
    process.env[ENV_KEY] = 'blob://auth/callback';
    expect(emailAuthRedirectTo()).toBeNull();
    process.env[ENV_KEY] = 'https://blob.example/login';
    expect(emailAuthRedirectTo()).toBeNull();
    delete process.env[ENV_KEY];
    expect(emailAuthRedirectTo()).toBeNull();
  });

  it('keeps the callback path constant', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
    expect(isHttpsAuthCallback('https://blob.example/auth/callback')).toBe(true);
    expect(isVercelComHost('https://vercel.com')).toBe(true);
    expect(isVercelComHost('https://blob-zeta-three.vercel.app')).toBe(false);
  });

  it('encodes a safe login error query and a post-signup Sign in href', () => {
    expect(loginHrefWithAuthError('Code expired\ntry again')).toBe(
      '/(auth)/login?authError=Code%20expired%20try%20again',
    );
    expect(loginHrefAfterSignup('ada@blob.app')).toEqual({
      pathname: '/(auth)/login',
      params: { email: 'ada@blob.app', inbox: '1' },
    });
  });

  it('builds a blob deep link without using vercel.com', () => {
    expect(blobAuthCallbackDeepLink(null)).toBe('blob://auth/callback');
    expect(
      blobAuthCallbackDeepLink({ access_token: 'tok', refresh_token: 'ref' }),
    ).toBe('blob://auth/callback#access_token=tok&refresh_token=ref&type=signup');
  });
});
