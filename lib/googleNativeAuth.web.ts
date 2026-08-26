/** Native Google SDK is not loaded on web. Web uses HTTPS signInWithOAuth. */
export { iosUrlSchemeFromClientId } from '@/lib/googleSignInConfig';

export const GOOGLE_CANCELLED = 'Sign-in was cancelled.';

export type GoogleNativeAuthDetail = {
  resultType: string;
  hasIdToken: boolean;
  hasCode: boolean;
  exchangeMessage?: string;
};

export class GoogleNativeAuthError extends Error {
  readonly resultType = 'web';
  readonly hasIdToken = false;
  readonly hasCode = false;
  readonly exchangeMessage?: string;
}

export async function signInWithNativeGoogle(): Promise<void> {
  throw new Error('Native Google sign-in is not used on web.');
}
