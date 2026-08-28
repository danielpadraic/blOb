export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_LOGIN_PATH = '/(auth)/login';
export const NATIVE_EMAIL_CALLBACK = 'blob://auth/callback';

export function loginHrefWithAuthError(message: string, email?: string): string {
  const safe = message.replace(/\s+/g, ' ').trim().slice(0, 180);
  const query = [`authError=${encodeURIComponent(safe)}`];
  const trimmed = email?.trim();
  if (trimmed) {
    query.push(`email=${encodeURIComponent(trimmed)}`);
  }
  return `${AUTH_LOGIN_PATH}?${query.join('&')}`;
}

export function loginHrefAfterSignup(email: string): {
  pathname: '/(auth)/login';
  params: { email: string; inbox: string };
} {
  return {
    pathname: '/(auth)/login',
    params: { email: email.trim(), inbox: '1' },
  };
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
    const origin = String(window.location.origin).replace(/\/$/, '');
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

export function blobAuthCallbackDeepLink(session?: {
  access_token: string;
  refresh_token?: string | null;
} | null): string {
  if (!session?.access_token) {
    return NATIVE_EMAIL_CALLBACK;
  }
  const hash = new URLSearchParams();
  hash.set('access_token', session.access_token);
  if (session.refresh_token) {
    hash.set('refresh_token', session.refresh_token);
  }
  hash.set('type', 'signup');
  return `${NATIVE_EMAIL_CALLBACK}#${hash.toString()}`;
}
