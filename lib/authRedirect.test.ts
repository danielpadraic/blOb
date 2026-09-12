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
  loginHrefWithoutEmailQuery,
  ONBOARDING_HREF,
  postAuthLandingHref,
  registerHrefWithForm,
  registerStartsOnForm,
  stripWebAuthCallbackUrl,
} from '@/lib/authRedirect';
import { peekPendingAuthEmail, setPendingAuthEmail, takePendingAuthEmail } from '@/lib/authFormMemory';

const ENV_KEY = 'EXPO_PUBLIC_AUTH_REDIRECT_URL';

describe('emailAuthRedirectTo', () => {
  const previous = process.env[ENV_KEY];

  afterEach(() => {
    if (previous == null) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = previous;
    }
    setPendingAuthEmail(null);
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
        value: { location: { origin: 'https://www.blob.mobi' } },
      });
      expect(emailAuthRedirectTo()).toBe('https://blob.mobi/auth/callback');

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
    expect(loginHrefWithAuthError('This confirmation link didn’t finish.', 'ada@blob.app')).toBe(
      '/(auth)/login?authError=This%20confirmation%20link%20didn%E2%80%99t%20finish.',
    );
    expect(peekPendingAuthEmail()).toBe('ada@blob.app');
    takePendingAuthEmail();
    setPendingAuthEmail('keep@blob.app');
    expect(loginHrefWithAuthError('Code expired')).toBe(
      '/(auth)/login?authError=Code%20expired',
    );
    expect(peekPendingAuthEmail()).toBe('keep@blob.app');
    expect(loginHrefAfterSignup('ada@blob.app')).toEqual({
      pathname: '/(auth)/login',
      params: { inbox: '1' },
    });
    expect(peekPendingAuthEmail()).toBe('ada@blob.app');
    expect(loginHrefWithoutEmailQuery({ inbox: '1', authError: 'x' })).toEqual({
      pathname: '/(auth)/login',
      params: { authError: 'x', inbox: '1' },
    });
    expect(registerHrefWithForm()).toEqual({
      pathname: '/(auth)/register',
      params: { start: 'form' },
    });
    expect(registerStartsOnForm('form')).toBe(true);
    expect(registerStartsOnForm(['form'])).toBe(true);
    expect(registerStartsOnForm(undefined)).toBe(false);
    expect(registerStartsOnForm('gate')).toBe(false);
  });

  it('builds a blob deep link without using vercel.com', () => {
    expect(blobAuthCallbackDeepLink(null)).toBe('blob://auth/callback');
    expect(
      blobAuthCallbackDeepLink({ access_token: 'tok', refresh_token: 'ref' }),
    ).toBe('blob://auth/callback');
  });

  it('strips auth query and hash from the web address bar', () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const calls: string[] = [];
    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
          location: {
            pathname: '/auth/callback',
            search: '?code=abc&email=ada%40blob.app',
            hash: '#access_token=tok',
          },
          history: {
            state: {},
            replaceState: (_s: unknown, _t: string, url: string) => {
              calls.push(url);
            },
          },
        },
      });
      stripWebAuthCallbackUrl();
      expect(calls).toEqual(['/auth/callback']);
    } finally {
      if (previousWindow === undefined) {
        Reflect.deleteProperty(globalThis, 'window');
      } else {
        Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow });
      }
    }
  });
});

describe('postAuthLandingHref', () => {
  it('sends unnamed or booting sessions to onboarding, not Home', () => {
    expect(postAuthLandingHref('setup')).toBe(ONBOARDING_HREF);
    expect(postAuthLandingHref('boot')).toBe(ONBOARDING_HREF);
    expect(postAuthLandingHref('app')).toBe('/feed');
    expect(postAuthLandingHref('auth')).toBe('/(auth)/login');
  });
});
