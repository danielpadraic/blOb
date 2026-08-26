/** Native Google SDK is not loaded on web. Web uses HTTPS signInWithOAuth. */
export { GOOGLE_NOT_CONFIGURED, iosUrlSchemeFromClientId } from '@/lib/googleSignInConfig';

export const GOOGLE_CANCELLED = 'Sign-in was cancelled.';

export type GoogleNativeAuthDetail = {
  resultType: string;
  hasIdToken: boolean;
  hasCode: boolean;
  exchangeMessage?: string;
  idTokenAud?: string | null;
  idTokenAzp?: string | null;
  idTokenIss?: string | null;
};

export class GoogleNativeAuthError extends Error {
  readonly resultType = 'web';
  readonly hasIdToken = false;
  readonly hasCode = false;
  readonly exchangeMessage?: string;
  readonly idTokenAud = null;
  readonly idTokenAzp = null;
  readonly idTokenIss = null;
}

export function googleAuthErrorPayload(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      platform: 'web',
      hasWebClientId: false,
      hasIosClientId: false,
      resultType: 'unknown',
      hasIdToken: false,
      tokenAud: null,
      supabaseMessage: null,
    };
  }
  return {
    platform: 'web',
    hasWebClientId: false,
    hasIosClientId: false,
    resultType: 'resultType' in error ? String(error.resultType) : error.name,
    hasIdToken: 'hasIdToken' in error ? Boolean(error.hasIdToken) : false,
    tokenAud: null,
    supabaseMessage:
      'exchangeMessage' in error && typeof error.exchangeMessage === 'string'
        ? error.exchangeMessage
        : error.message,
  };
}

export async function signInWithNativeGoogle(): Promise<void> {
  throw new Error('Native Google sign-in is not used on web.');
}
