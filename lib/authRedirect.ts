export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Redirect target for password-recovery emails.
 *
 * Web uses the current origin so production Vercel, preview, and local
 * Expo/Next hosts each generate an allow-listed URL.
 * Native builds should set EXPO_PUBLIC_AUTH_REDIRECT_URL to the production
 * https callback — email clients cannot open blob:// links.
 * That env URL is for password-reset email only. Google Sign-In on iOS/Android
 * always uses blob://oauthredirect (see lib/oauthRedirect.ts).
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
