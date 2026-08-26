export const AUTH_CALLBACK_PATH = '/auth/callback';
export const AUTH_LOGIN_PATH = '/(auth)/login';

export function loginHrefWithAuthError(message: string): string {
  const safe = message.replace(/\s+/g, ' ').trim().slice(0, 180);
  return `${AUTH_LOGIN_PATH}?authError=${encodeURIComponent(safe)}`;
}

/**
 * HTTPS callback used when a web origin is available, or as an optional
 * EXPO_PUBLIC_AUTH_REDIRECT_URL fallback for the thin web harness.
 *
 * Native sign-up and password-reset emails use blob://auth/callback
 * (see resolveOAuthRedirectUri) so the app can complete the session.
 * Do not set Site URL to blob://. Google’s redirect_uri must stay
 * https://<project>.supabase.co/auth/v1/callback.
 *
 * Supabase Dashboard → Authentication → URL Configuration must include:
 * - Site URL: production https origin
 * - Redirect URLs: production + preview /auth/callback, local /auth/callback,
 *   blob://oauthredirect, and blob://auth/callback
 */
export function authRedirectUrl(): string | null {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin.replace(/\/$/, '');
      if (origin && !/aics-projects\.vercel\.app/i.test(origin)) {
        return `${origin}${AUTH_CALLBACK_PATH}`;
      }
    }
  } catch {
    // Fall through to env / native email redirect.
  }
  const fromEnv = (
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ||
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
    ''
  ).trim();
  if (fromEnv && !/aics-projects\.vercel\.app/i.test(fromEnv)) {
    return fromEnv;
  }
  return null;
}
