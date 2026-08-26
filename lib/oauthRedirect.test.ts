import { describe, expect, it } from 'vitest';

import {
  NATIVE_OAUTH_REDIRECT_URI,
  authorizeUrlHasBlobRedirectUri,
  authorizeUrlHost,
  isExpectedOAuthStartUrl,
  isNativeOAuthCallbackUrl,
  isNativeSafeOAuthRedirect,
  nativeCallbackUrlFromParams,
  pickCanonicalAuthCallbackUrl,
  preferNativeOAuthRedirect,
  resolveOAuthRedirectUri,
  sanitizeOAuthBrowserUrl,
} from '@/lib/oauthRedirect';

describe('resolveOAuthRedirectUri', () => {
  it('returns blob://auth/callback on iOS and Android', () => {
    expect(resolveOAuthRedirectUri({ platform: 'ios' })).toBe('blob://auth/callback');
    expect(resolveOAuthRedirectUri({ platform: 'android' })).toBe('blob://auth/callback');
    expect(NATIVE_OAUTH_REDIRECT_URI).toBe('blob://auth/callback');
  });

  it('discards an https Vercel URL from makeRedirectUri on native', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'ios',
        computedNative: 'https://aics-projects.vercel.app/auth/callback',
      }),
    ).toBe('blob://auth/callback');
  });

  it('replaces blob://oauthredirect and exp:// with the allow-listed callback', () => {
    expect(preferNativeOAuthRedirect('blob://oauthredirect')).toBe('blob://auth/callback');
    expect(preferNativeOAuthRedirect('exp://192.168.1.4:8081/--/auth/callback')).toBe(
      'blob://auth/callback',
    );
    expect(preferNativeOAuthRedirect('blob:///auth/callback')).toBe('blob://auth/callback');
  });

  it('keeps the exact allow-listed callback from makeRedirectUri', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'ios',
        computedNative: 'blob://auth/callback',
      }),
    ).toBe('blob://auth/callback');
  });

  it('uses the current web origin and never aics-projects', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'web',
        webOrigin: 'https://blob-zeta-three.vercel.app',
      }),
    ).toBe('https://blob-zeta-three.vercel.app/auth/callback');
    expect(isNativeSafeOAuthRedirect('https://aics-projects.vercel.app/auth/callback')).toBe(false);
  });

  it('refuses an aics-projects web origin', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'web',
        webOrigin: 'https://aics-projects.vercel.app',
      }),
    ).toBe('/auth/callback');
  });

  it('logs authorize host without query params', () => {
    expect(authorizeUrlHost('https://abcd.supabase.co/auth/v1/authorize?foo=1')).toBe(
      'abcd.supabase.co',
    );
    expect(authorizeUrlHost('not-a-url')).toBeNull();
  });
});

describe('isNativeOAuthCallbackUrl', () => {
  it('accepts the allow-listed native callback and aliases', () => {
    expect(isNativeOAuthCallbackUrl('blob://auth/callback?code=abc')).toBe(true);
    expect(isNativeOAuthCallbackUrl('blob:///auth/callback?code=abc')).toBe(true);
    expect(isNativeOAuthCallbackUrl('blob://oauthredirect?code=abc')).toBe(true);
  });

  it('rejects https / Vercel callbacks on native', () => {
    expect(isNativeOAuthCallbackUrl('https://blob-zeta-three.vercel.app/auth/callback?code=abc')).toBe(
      false,
    );
    expect(isNativeOAuthCallbackUrl('https://tguzdtwsajnnczdxjqyq.supabase.co/auth/v1/callback?code=abc')).toBe(
      false,
    );
  });

  it('accepts an Expo Router path callback', () => {
    expect(isNativeOAuthCallbackUrl('/auth/callback?code=abc')).toBe(true);
  });

  it('rebuilds blob://auth/callback from route params', () => {
    expect(nativeCallbackUrlFromParams({ code: 'abc' })).toBe('blob://auth/callback?code=abc');
    expect(
      nativeCallbackUrlFromParams({ token_hash: 'hash', type: 'recovery' }),
    ).toBe('blob://auth/callback?token_hash=hash&type=recovery');
    expect(nativeCallbackUrlFromParams({})).toBeNull();
  });

  it('picks one callback URL with a payload instead of an empty alias', () => {
    expect(
      pickCanonicalAuthCallbackUrl([
        'blob://auth/callback',
        'blob://auth/callback?code=abc',
        'blob://auth/callback?code=abc',
      ]),
    ).toBe('blob://auth/callback?code=abc');
  });
});

describe('sanitizeOAuthBrowserUrl', () => {
  const googleUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?client_id=49251028054-example.apps.googleusercontent.com&redirect_to=blob%3A%2F%2Fauth%2Fcallback&redirect_uri=https%3A%2F%2Ftguzdtwsajnnczdxjqyq.supabase.co%2Fauth%2Fv1%2Fcallback&response_type=code&scope=email+profile&state=abc&prompt=';

  it('strips blob redirect_to from the Google hop and keeps the Supabase HTTPS redirect_uri', () => {
    const cleaned = sanitizeOAuthBrowserUrl(googleUrl);
    expect(authorizeUrlHasBlobRedirectUri(cleaned)).toBe(false);
    expect(cleaned).not.toMatch(/redirect_to=/);
    expect(cleaned).toContain(
      'redirect_uri=https%3A%2F%2Ftguzdtwsajnnczdxjqyq.supabase.co%2Fauth%2Fv1%2Fcallback',
    );
    expect(cleaned).not.toMatch(/[?&]prompt=/);
  });

  it('rejects a Google hop whose redirect_uri is blob://', () => {
    expect(() =>
      sanitizeOAuthBrowserUrl(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=x&redirect_uri=blob%3A%2F%2Fauth%2Fcallback&response_type=code&state=abc',
      ),
    ).toThrow(/Supabase HTTPS/);
    expect(
      authorizeUrlHasBlobRedirectUri(
        'https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=blob%3A%2F%2Fauth%2Fcallback',
      ),
    ).toBe(true);
  });

  it('accepts the Supabase authorize URL and drops a leaked redirect_uri', () => {
    const cleaned = sanitizeOAuthBrowserUrl(
      'https://tguzdtwsajnnczdxjqyq.supabase.co/auth/v1/authorize?provider=google&redirect_to=blob%3A%2F%2Fauth%2Fcallback&redirect_uri=blob%3A%2F%2Fauth%2Fcallback&skip_http_redirect=true',
    );
    expect(isExpectedOAuthStartUrl(cleaned)).toBe(true);
    expect(authorizeUrlHasBlobRedirectUri(cleaned)).toBe(false);
    expect(cleaned).toContain('redirect_to=blob');
    expect(cleaned).not.toContain('redirect_uri=');
    expect(cleaned).not.toContain('skip_http_redirect');
  });
});
