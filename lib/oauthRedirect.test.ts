import { describe, expect, it } from 'vitest';

import {
  NATIVE_OAUTH_REDIRECT_URI,
  isNativeSafeOAuthRedirect,
  resolveOAuthRedirectUri,
} from '@/lib/oauthRedirect';

describe('resolveOAuthRedirectUri', () => {
  it('returns the blob scheme on iOS and Android', () => {
    expect(resolveOAuthRedirectUri({ platform: 'ios' })).toBe(NATIVE_OAUTH_REDIRECT_URI);
    expect(resolveOAuthRedirectUri({ platform: 'android' })).toBe(NATIVE_OAUTH_REDIRECT_URI);
  });

  it('discards an https Vercel URL from makeRedirectUri on native', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'ios',
        computedNative: 'https://aics-projects.vercel.app/auth/callback',
      }),
    ).toBe(NATIVE_OAUTH_REDIRECT_URI);
  });

  it('keeps a valid blob URI from makeRedirectUri', () => {
    expect(
      resolveOAuthRedirectUri({
        platform: 'ios',
        computedNative: 'blob://oauthredirect',
      }),
    ).toBe('blob://oauthredirect');
  });

  it('uses the current web origin and never aics-projects on native', () => {
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
});
