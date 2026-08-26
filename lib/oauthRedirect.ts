import { hasAuthCallbackPayload, parseAuthRedirectParams } from '@/lib/authRedirectParams';

/** Custom scheme from app.json. Do not change. */
export const NATIVE_OAUTH_SCHEME = 'blob';
/** Must match Supabase Redirect URLs and ASWebAuthenticationSession exactly. */
export const NATIVE_OAUTH_PATH = 'auth/callback';
export const NATIVE_OAUTH_REDIRECT_URI = `${NATIVE_OAUTH_SCHEME}://${NATIVE_OAUTH_PATH}`;

const BLOCKED_WEB_HOST = /aics-projects\.vercel\.app/i;

export function isNativeSafeOAuthRedirect(uri: string): boolean {
  return /^blob:\/\//i.test(uri.trim()) && !/^https?:\/\//i.test(uri.trim());
}

export function isBlockedOAuthHost(uri: string): boolean {
  return BLOCKED_WEB_HOST.test(uri);
}

/** True for blob://auth/callback (and Expo Router /oauthredirect aliases). Never https/Vercel. */
export function isNativeOAuthCallbackUrl(url: string | null | undefined): boolean {
  const value = (url ?? '').trim();
  if (!value || isBlockedOAuthHost(value)) {
    return false;
  }
  if (/^https?:\/\//i.test(value)) {
    return false;
  }
  const lower = value.toLowerCase();
  return (
    lower.startsWith('blob://auth/callback') ||
    lower.startsWith('blob:///auth/callback') ||
    lower.startsWith('blob://oauthredirect') ||
    /(?:^|\/)auth\/callback(?:\?|#|$)/i.test(value)
  );
}

export function nativeCallbackUrlFromParams(params: {
  code?: string | string[] | null;
  access_token?: string | string[] | null;
  refresh_token?: string | string[] | null;
  token_hash?: string | string[] | null;
  token?: string | string[] | null;
  email?: string | string[] | null;
  type?: string | string[] | null;
  error?: string | string[] | null;
  error_description?: string | string[] | null;
}): string | null {
  const query = new URLSearchParams();
  for (const key of [
    'code',
    'access_token',
    'refresh_token',
    'token_hash',
    'token',
    'email',
    'type',
    'error',
    'error_description',
  ] as const) {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value) {
      query.set(key, value);
    }
  }
  if ([...query.keys()].length === 0) {
    return null;
  }
  return `${NATIVE_OAUTH_REDIRECT_URI}?${query.toString()}`;
}

export function pickCanonicalAuthCallbackUrl(
  candidates: Array<string | null | undefined>,
): string | null {
  const urls = candidates.filter((url): url is string => Boolean(url && url.trim()));
  for (const url of urls) {
    const params = parseAuthRedirectParams(url);
    if (hasAuthCallbackPayload(params) || params.error) {
      return url;
    }
  }
  return urls[0] ?? null;
}

const GOOGLE_AUTH_HOST = /(?:^|\.)google\.com$/i;
const APPLE_AUTH_HOST = /(?:^|\.)apple\.com$/i;
const SUPABASE_AUTH_HOST = /\.supabase\.co$/i;
const PROVIDER_KEEP_PARAMS = new Set([
  'client_id',
  'redirect_uri',
  'response_type',
  'response_mode',
  'scope',
  'state',
  'code_challenge',
  'code_challenge_method',
  'access_type',
  'prompt',
  'nonce',
  'include_granted_scopes',
  'login_hint',
  'hd',
]);
const SUPABASE_AUTHORIZE_KEEP_PARAMS = new Set([
  'provider',
  'redirect_to',
  'scopes',
  'code_challenge',
  'code_challenge_method',
]);

function parseHttpUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null;
  } catch {
    return null;
  }
}

function rebuildSearchParams(parsed: URL, keep: Set<string>) {
  const entries = [...parsed.searchParams.entries()].filter(
    ([key, value]) => keep.has(key) && typeof value === 'string' && value.length > 0,
  );
  const next = new URLSearchParams();
  for (const [key, value] of entries) {
    next.set(key, value);
  }
  parsed.search = next.toString();
}

/** Host only — never the query string (no codes or tokens). */
export function authorizeUrlHost(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  return parseHttpUrl(url)?.host ?? null;
}

/** True when Google would receive redirect_uri=blob:// — that hop must stay on Supabase HTTPS. */
export function authorizeUrlHasBlobRedirectUri(url: string | null | undefined): boolean {
  if (!url) {
    return false;
  }
  if (/[?&]redirect_uri=blob(?::|%3A)/i.test(url)) {
    return true;
  }
  const parsed = parseHttpUrl(url);
  const redirectUri = parsed?.searchParams.get('redirect_uri') ?? '';
  return /^blob:/i.test(redirectUri);
}

export function isExpectedOAuthStartUrl(url: string | null | undefined): boolean {
  const parsed = parseHttpUrl(url ?? '');
  if (!parsed) {
    return false;
  }
  const host = parsed.hostname;
  if (GOOGLE_AUTH_HOST.test(host) || APPLE_AUTH_HOST.test(host)) {
    return true;
  }
  return SUPABASE_AUTH_HOST.test(host) && /\/auth\/v1\/authorize\/?$/i.test(parsed.pathname);
}

export function isProviderAuthorizeUrl(url: string | null | undefined): boolean {
  const parsed = parseHttpUrl(url ?? '');
  if (!parsed) {
    return false;
  }
  return GOOGLE_AUTH_HOST.test(parsed.hostname) || APPLE_AUTH_HOST.test(parsed.hostname);
}

/**
 * Supabase forwards redirect_to onto accounts.google.com. Google 400s when that
 * extra param is blob://. Keep redirect_uri on https://*.supabase.co/auth/v1/callback.
 */
export function sanitizeOAuthBrowserUrl(url: string): string {
  const parsed = parseHttpUrl(url);
  if (!parsed || !isExpectedOAuthStartUrl(url)) {
    throw new Error('Sign-in did not start from Google or Supabase.');
  }

  if (GOOGLE_AUTH_HOST.test(parsed.hostname) || APPLE_AUTH_HOST.test(parsed.hostname)) {
    const redirectUri = parsed.searchParams.get('redirect_uri') ?? '';
    if (!redirectUri || /^blob:/i.test(redirectUri) || !/\.supabase\.co\/auth\/v1\/callback$/i.test(redirectUri)) {
      throw new Error('Google OAuth is misconfigured: redirect_uri must stay on Supabase HTTPS.');
    }
    rebuildSearchParams(parsed, PROVIDER_KEEP_PARAMS);
    return parsed.toString();
  }

  if (parsed.searchParams.get('redirect_uri')) {
    parsed.searchParams.delete('redirect_uri');
  }
  rebuildSearchParams(parsed, SUPABASE_AUTHORIZE_KEEP_PARAMS);
  return parsed.toString();
}

export function logOAuthAuthorizeUrl(url: string) {
  if (!__DEV__) {
    return;
  }
  console.log('[blob:oauth]', {
    host: authorizeUrlHost(url),
    hasBlobRedirectUri: authorizeUrlHasBlobRedirectUri(url),
  });
}

/**
 * Standalone iOS/Android must use blob://auth/callback.
 * makeRedirectUri can return exp://, https, triple-slash, or oauthredirect.
 */
export function preferNativeOAuthRedirect(_computed?: string | null): string {
  return NATIVE_OAUTH_REDIRECT_URI;
}

/**
 * Google / Apple OAuth return URL.
 * Native always uses blob://auth/callback — never EXPO_PUBLIC_AUTH_REDIRECT_URL or a Vercel host.
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

  return preferNativeOAuthRedirect(input.computedNative);
}
