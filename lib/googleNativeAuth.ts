import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import { iosUrlSchemeFromClientId } from '@/lib/googleSignInConfig';
import { logOAuthStage } from '@/lib/oauthRedirect';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

export { iosUrlSchemeFromClientId };

export const GOOGLE_CANCELLED = 'Sign-in was cancelled.';
export const GOOGLE_NO_TOKEN = 'Google did not return a sign-in token. Try again.';
export const GOOGLE_PLAY_SERVICES =
  'Google Play Services is missing or out of date. Update Play Services and try again.';
export const GOOGLE_NOT_CONFIGURED =
  'Google sign-in is not configured. Add the Web and iOS client IDs and rebuild.';

export type GoogleNativeAuthDetail = {
  resultType: string;
  hasIdToken: boolean;
  hasCode: boolean;
  exchangeMessage?: string;
};

export class GoogleNativeAuthError extends Error {
  readonly resultType: string;
  readonly hasIdToken: boolean;
  readonly hasCode: boolean;
  readonly exchangeMessage?: string;
  readonly code?: string;

  constructor(message: string, detail: GoogleNativeAuthDetail & { code?: string }) {
    super(message);
    this.name = 'GoogleNativeAuthError';
    this.resultType = detail.resultType;
    this.hasIdToken = detail.hasIdToken;
    this.hasCode = detail.hasCode;
    this.exchangeMessage = detail.exchangeMessage;
    this.code = detail.code;
  }
}

/**
 * Public @react-native-google-signin/google-signin signIn() only accepts loginHint.
 * Custom nonce (digest → Google, raw → signInWithIdToken) needs Universal Sign-In.
 * Do not pass rawNonce to Supabase unless Google received the SHA-256 digest.
 */
export async function googleIdTokenNonce(): Promise<{ rawNonce: string; nonceDigest: string }> {
  const rawNonce = randomUUID().replace(/-/g, '');
  const nonceDigest = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);
  return { rawNonce, nonceDigest };
}

function configuredClientIds(): { webClientId: string; iosClientId?: string } {
  const webClientId = (process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '').trim();
  const iosClientId = (process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '').trim();
  if (!webClientId) {
    throw new GoogleNativeAuthError(GOOGLE_NOT_CONFIGURED, {
      resultType: 'config',
      hasIdToken: false,
      hasCode: false,
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  return { webClientId, iosClientId: iosClientId || undefined };
}

let configured = false;

function ensureConfigured() {
  if (configured) {
    return;
  }
  const { webClientId, iosClientId } = configuredClientIds();
  GoogleSignin.configure({
    webClientId,
    iosClientId,
    scopes: ['openid', 'profile', 'email'],
    offlineAccess: false,
  });
  configured = true;
}

function logNativeGoogle(detail: GoogleNativeAuthDetail) {
  if (!__DEV__) {
    return;
  }
  logOAuthStage('error', { name: detail.resultType });
  console.log('[blob:oauth]', {
    stage: 'native google',
    resultType: detail.resultType,
    hasIdToken: detail.hasIdToken,
    hasCode: detail.hasCode,
    exchangeMessage: detail.exchangeMessage ?? null,
  });
}

export async function signInWithNativeGoogle(): Promise<void> {
  ensureConfigured();

  if (Platform.OS === 'android') {
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    } catch (error) {
      const detail: GoogleNativeAuthDetail = {
        resultType: 'play-services',
        hasIdToken: false,
        hasCode: false,
        exchangeMessage: getErrorMessage(error),
      };
      logNativeGoogle(detail);
      throw new GoogleNativeAuthError(GOOGLE_PLAY_SERVICES, {
        ...detail,
        code: isErrorWithCode(error) ? error.code : statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      });
    }
  }

  // Public GoogleSignin.signIn() has no nonce param (Universal Sign-In does).
  // Do not send rawNonce to signInWithIdToken without a matching digest on the ID token.

  let response;
  try {
    response = await GoogleSignin.signIn();
  } catch (error) {
    if (isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new GoogleNativeAuthError(GOOGLE_CANCELLED, {
        resultType: 'cancelled',
        hasIdToken: false,
        hasCode: false,
        code: statusCodes.SIGN_IN_CANCELLED,
      });
    }
    if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new GoogleNativeAuthError(GOOGLE_PLAY_SERVICES, {
        resultType: 'play-services',
        hasIdToken: false,
        hasCode: false,
        code: error.code,
      });
    }
    throw error;
  }

  if (isCancelledResponse(response)) {
    throw new GoogleNativeAuthError(GOOGLE_CANCELLED, {
      resultType: 'cancelled',
      hasIdToken: false,
      hasCode: false,
      code: statusCodes.SIGN_IN_CANCELLED,
    });
  }

  if (!isSuccessResponse(response)) {
    const detail: GoogleNativeAuthDetail = {
      resultType: 'type' in response ? String(response.type) : 'unknown',
      hasIdToken: false,
      hasCode: false,
    };
    logNativeGoogle(detail);
    throw new GoogleNativeAuthError(GOOGLE_NO_TOKEN, detail);
  }

  const idToken = response.data.idToken;
  const hasCode = Boolean(response.data.serverAuthCode);
  if (!idToken) {
    const detail: GoogleNativeAuthDetail = {
      resultType: 'success',
      hasIdToken: false,
      hasCode,
    };
    logNativeGoogle(detail);
    throw new GoogleNativeAuthError(GOOGLE_NO_TOKEN, detail);
  }

  logOAuthStage('got google host', { host: 'native-id-token' });
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) {
    const detail: GoogleNativeAuthDetail = {
      resultType: 'success',
      hasIdToken: true,
      hasCode,
      exchangeMessage: getErrorMessage(error),
    };
    logNativeGoogle(detail);
    throw new GoogleNativeAuthError(
      getErrorMessage(error) || 'Google sign-in was rejected. Try again.',
      detail,
    );
  }
}
