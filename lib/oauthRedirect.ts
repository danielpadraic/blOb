/** Custom scheme from app.json. Do not change. */
export const NATIVE_OAUTH_SCHEME = 'blob';
export const NATIVE_OAUTH_PATH = 'oauthredirect';
/** Exact URI ASWebAuthenticationSession and Supabase must use on iOS/Android. */
export const NATIVE_OAUTH_REDIRECT_URI = `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_PATH}`;

const BLOCKED_WEB_HOST = /aics-projects\.vercel\.app/i;

export function isNativeSafeOAuthRedirect(uri: string): boolean {
  return /^blob:\/\//i.test(uri.trim()) && !/^https?:\/\//i.test(uri.trim());
}

export function isBlockedOAuthHost(uri: string): boolean {
  return BLOCKED_WEB_HOST.test(uri);
}

/**
 * Google / Apple OAuth return URL.
 * Native always uses the blob scheme — never EXPO_PUBLIC_AUTH_REDIRECT_URL or a Vercel host.
 * `computedNative` is whatever makeRedirectUri returned; https / Vercel values are discarded.
 */
export function resolveOAuthRedirectUri(input: {
  platform: string;
  webOrigin?: string | null;
  computedNative?: string | null;
}): string {
  if (input.platform === 'web') {
    const origin = (input.webOrigin ?? '').replace(/\/$/, '');
    if (origin && !isBlockedOAuthHost(origin)) {
      return `${origin}/auth/callback`;
    }
    return '/auth/callback';
  }

  const computed = (input.computedNative ?? '').trim();
  if (computed && isNativeSafeOAuthRedirect(computed) && !isBlockedOAuthHost(computed)) {
    return computed;
  }
  return NATIVE_OAUTH_REDIRECT_URI;
}
