export const AUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Redirect target for password-recovery emails.
 *
 * Web uses the current origin so production Vercel, preview, and local
 * Expo/Next hosts each generate an allow-listed URL.
 * Native builds should set EXPO_PUBLIC_AUTH_REDIRECT_URL to the production
 * https callback — email clients cannot open blob:// links.
 *
 * Supabase Dashboard → Authentication → URL Configuration must include:
 * - Site URL: production https origin
 * - Redirect URLs: production + preview /auth/callback, local /auth/callback,
 *   and blob://auth/callback
 */
export function authRedirectUrl(): string | null {
  const fromEnv = (
    process.env.EXPO_PUBLIC_AUTH_REDIRECT_URL ||
    process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
    ''
  ).trim();
  if (fromEnv) {
    return fromEnv;
  }
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
    }
  } catch {
    return null;
  }
  return null;
}
