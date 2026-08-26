/** Reversed iOS OAuth client ID for the Google Sign-In URL scheme (plugin iosUrlScheme). */
export function iosUrlSchemeFromClientId(clientId: string | undefined): string | null {
  const prefix = (clientId ?? '').trim().replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix || prefix.includes('://') || prefix === (clientId ?? '').trim()) {
    return null;
  }
  return `com.googleusercontent.apps.${prefix}`;
}
