import { setPendingAuthEmail } from '@/lib/authFormMemory';
import { apexBlobOrigin } from '@/lib/webHost';

export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_LOGIN_PATH = '/(auth)/login';
export const NATIVE_EMAIL_CALLBACK = 'blob://auth/callback';

export function loginHrefWithAuthError(message: string, email?: string): string {
  const safe = message.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (email?.trim()) {
    setPendingAuthEmail(email);
  }
  return `${AUTH_LOGIN_PATH}?authError=${encodeURIComponent(safe)}`;
}

export function loginHrefAfterSignup(email: string): {
  pathname: '/(auth)/login';
  params: { inbox: string };
} {
  setPendingAuthEmail(email);
  return {
    pathname: '/(auth)/login',
    params: { inbox: '1' },
  };
}

export function loginHrefWithoutEmailQuery(input: {
  authError?: string | string[] | null;
  inbox?: string | string[] | null;
}): { pathname: '/(auth)/login'; params?: { authError?: string; inbox?: string } } {
  const authError = Array.isArray(input.authError) ? input.authError[0] : input.authError;
  const inbox = Array.isArray(input.inbox) ? input.inbox[0] : input.inbox;
  const params: { authError?: string; inbox?: string } = {};
  if (authError?.trim()) {
    params.authError = authError;
  }
  if (inbox === '1') {
    params.inbox = '1';
  }
  if (!params.authError && !params.inbox) {
    return { pathname: '/(auth)/login' };
  }
  return { pathname: '/(auth)/login', params };
}

export function registerHrefWithForm(): {
  pathname: '/(auth)/register';
  params: { start: 'form' };
} {
  return {
    pathname: '/(auth)/register',
    params: { start: 'form' },
  };
}

export function registerStartsOnForm(start?: string | string[] | null): boolean {
  const value = Array.isArray(start) ? start[0] : start;
  return value === 'form';
}

function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${value.replace(/^\/\//, '')}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

/** vercel.com login / dashboard — not the Expo web app on *.vercel.app. */
export function isVercelComHost(value: string): boolean {
  const host = hostnameOf(value);
  if (!host) {
    return /(?:^|\.)vercel\.com(?:\/|$)/i.test(value);
  }
  return host === 'vercel.com' || host.endsWith('.vercel.com');
}

export function isHttpsAuthCallback(value: string): boolean {
  const raw = value.trim();
  if (!raw || /^blob:/i.test(raw)) {
    return false;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:') {
      return false;
    }
    if (isVercelComHost(raw)) {
      return false;
    }
    const path = parsed.pathname.replace(/\/$/, '') || '/';
    return path === AUTH_CALLBACK_PATH;
  } catch {
    return false;
  }
}

function isBrowserWeb(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

function webOriginCallback(): string | null {
  try {
    if (!isBrowserWeb() || !window.location?.origin) {
      return null;
    }
    const origin = apexBlobOrigin(String(window.location.origin).replace(/\/$/, ''));
    if (!origin || /^blob:/i.test(origin) || isVercelComHost(origin)) {
      return null;
    }
    if (!/^https?:\/\//i.test(origin)) {
      return null;
    }
    return `${origin}${AUTH_CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

/**
 * emailRedirectTo / redirectTo for signUp and resetPasswordForEmail.
 * Web: current origin + /auth/callback.
 * Native: EXPO_PUBLIC_AUTH_REDIRECT_URL only when it is https://…/auth/callback.
 * Never blob:// (mail clients cannot open it). Never vercel.com. No empty fallback.
 */
export function emailAuthRedirectTo(): string | null {
  if (isBrowserWeb()) {
    return webOriginCallback();
  }
  const fromEnv = (process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ?? '').trim();
  if (isHttpsAuthCallback(fromEnv)) {
    return fromEnv.replace(/\/$/, '');
  }
  return null;
}

/** @deprecated Use emailAuthRedirectTo — same rules, no vercel.com / blob:// fallback. */
export function authRedirectUrl(): string | null {
  return emailAuthRedirectTo();
}

/** Native already has SecureStore once setSession ran on that device. Never put bearer tokens in the URL. */
export function blobAuthCallbackDeepLink(_session?: {
  access_token: string;
  refresh_token?: string | null;
} | null): string {
  return NATIVE_EMAIL_CALLBACK;
}

const WEB_AUTH_QUERY_KEYS = new Set([
  'code',
  'access_token',
  'refresh_token',
  'token_hash',
  'token',
  'email',
  'type',
]);

/** After exchange, keep pathname only. Tokens and email must not stay in history. */
export function stripWebAuthCallbackUrl(): void {
  try {
    if (typeof window === 'undefined' || !window.location) {
      return;
    }
    const { pathname, search, hash } = window.location;
    if (!search && !hash) {
      return;
    }
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const hasAuthQuery = [...params.keys()].some((key) => WEB_AUTH_QUERY_KEYS.has(key));
    if (!hasAuthQuery && !hash) {
      return;
    }
    window.history.replaceState(window.history.state, '', pathname);
  } catch {
    // URL cleanup is best-effort on web.
  }
}
