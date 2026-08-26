/** Shown when the Web client ID is missing or a native client was used as webClientId. */
export const GOOGLE_NOT_CONFIGURED = 'Google Sign-In isn’t configured in this build.';

/** Reversed iOS OAuth client ID for the Google Sign-In URL scheme (plugin iosUrlScheme). */
export function iosUrlSchemeFromClientId(clientId: string | undefined): string | null {
  const prefix = (clientId ?? '').trim().replace(/\.apps\.googleusercontent\.com$/i, '');
  if (!prefix || prefix.includes('://') || prefix === (clientId ?? '').trim()) {
    return null;
  }
  return `com.googleusercontent.apps.${prefix}`;
}

export function googleWebClientId(): string {
  return (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
}

/** First 20 characters only — enough to confirm which Web client was inlined. Never log the full ID. */
export function googleWebClientIdPrefix(): string | null {
  const id = googleWebClientId();
  return id ? id.slice(0, 20) : null;
}

export function googleIosClientId(): string {
  return (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
}

export function googleAndroidClientId(): string {
  return (process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ?? '').trim();
}

function sameClientId(a: string, b: string): boolean {
  return Boolean(a) && Boolean(b) && a === b;
}

/** True when webClientId is actually the iOS or Android native OAuth client. */
export function webClientIdIsNativeClient(webClientId: string): boolean {
  const web = webClientId.trim();
  if (!web) {
    return false;
  }
  return sameClientId(web, googleIosClientId()) || sameClientId(web, googleAndroidClientId());
}

/**
 * Native GoogleSignin.configure() input.
 * `webClientId` is the Web application client ONLY (ID token `aud` / Supabase secret).
 * Never the iOS or Android client. `iosClientId` is iOS-only.
 * Android error 10 (DEVELOPER_ERROR) = package + SHA-1 of THIS apk must match an
 * Android OAuth client in GCP project 49251028054.
 */
export function googleNativeSignInConfig(): { webClientId: string; iosClientId?: string } | null {
  const webClientId = googleWebClientId();
  if (!webClientId || webClientIdIsNativeClient(webClientId)) {
    return null;
  }
  const iosClientId = googleIosClientId();
  return {
    webClientId,
    ...(iosClientId ? { iosClientId } : {}),
  };
}

export function googleNativeConfigureKeysPresent(): { webClientId: boolean; iosClientId: boolean } {
  return {
    webClientId: Boolean(googleWebClientId()),
    iosClientId: Boolean(googleIosClientId()),
  };
}

/** Decode ID token payload only. No verify. Never return the raw token. */
export function peekGoogleIdTokenClaims(idToken: string): {
  aud: string | null;
  azp: string | null;
  iss: string | null;
} {
  const payload = idToken.split('.')[1];
  if (!payload) {
    return { aud: null, azp: null, iss: null };
  }
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const json = globalThis.atob(normalized + pad);
    const claims = JSON.parse(json) as Record<string, unknown>;
    return {
      aud: claimString(claims.aud),
      azp: claimString(claims.azp),
      iss: claimString(claims.iss),
    };
  } catch {
    return { aud: null, azp: null, iss: null };
  }
}

export function isGoogleClientConfigError(message: string): boolean {
  const blob = message.toLowerCase();
  return (
    blob.includes('unacceptable audience') ||
    blob.includes('audience in id_token') ||
    blob.includes('invalid_client') ||
    blob.includes('invalid client') ||
    blob.includes('oauth client was not found') ||
    blob.includes('oauth client not found') ||
    blob.includes('isn’t configured in this build') ||
    blob.includes("isn't configured in this build") ||
    blob.includes('isn’t set up for this app build') ||
    blob.includes("isn't set up for this app build") ||
    blob.includes('google sign-in is not configured') ||
    blob.includes('developer_error')
  );
}

/** Play Services status 10 / DEVELOPER_ERROR — do not show the raw "10 10 DEVELOPER_ERROR" text. */
export function isGoogleDeveloperError(error: unknown): boolean {
  if (typeof error === 'object' && error) {
    const code = 'code' in error ? String((error as { code: unknown }).code) : '';
    if (code === '10' || code.toUpperCase() === 'DEVELOPER_ERROR') {
      return true;
    }
  }
  const text =
    error instanceof Error
      ? `${'code' in error ? String((error as { code?: unknown }).code ?? '') : ''} ${error.message}`
      : String(error ?? '');
  return /developer_error/i.test(text);
}

function claimString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) {
    return value[0].trim();
  }
  return null;
}
