import {
  GoogleSignin,
  isCancelledResponse,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';

import {
  GOOGLE_NOT_CONFIGURED,
  googleNativeConfigureKeysPresent,
  googleNativeSignInConfig,
  googleWebClientIdPrefix,
  iosUrlSchemeFromClientId,
  isGoogleClientConfigError,
  isGoogleDeveloperError,
  peekGoogleIdTokenClaims,
} from '@/lib/googleSignInConfig';
import { reportAppError } from '@/lib/appErrors';
import { logOAuthStage } from '@/lib/oauthRedirect';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

export { iosUrlSchemeFromClientId };

export const GOOGLE_CANCELLED = 'Sign-in was cancelled.';
export const GOOGLE_NO_TOKEN = 'Google did not return a sign-in token. Try again.';
export const GOOGLE_PLAY_SERVICES =
  'Google Play Services is missing or out of date. Update Play Services and try again.';
export { GOOGLE_NOT_CONFIGURED };

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
  readonly resultType: string;
  readonly hasIdToken: boolean;
  readonly hasCode: boolean;
  readonly exchangeMessage?: string;
  readonly code?: string;
  readonly idTokenAud?: string | null;
  readonly idTokenAzp?: string | null;
  readonly idTokenIss?: string | null;

  constructor(message: string, detail: GoogleNativeAuthDetail & { code?: string }) {
    super(message);
    this.name = 'GoogleNativeAuthError';
    this.resultType = detail.resultType;
    this.hasIdToken = detail.hasIdToken;
    this.hasCode = detail.hasCode;
    this.exchangeMessage = detail.exchangeMessage;
    this.code = detail.code;
    this.idTokenAud = detail.idTokenAud ?? null;
    this.idTokenAzp = detail.idTokenAzp ?? null;
    this.idTokenIss = detail.idTokenIss ?? null;
  }
}

export function googleAuthLogFields(detail: {
  resultType: string;
  hasIdToken: boolean;
  tokenAud?: string | null;
  supabaseMessage?: string | null;
}): Record<string, unknown> {
  const keys = googleNativeConfigureKeysPresent();
  return {
    platform: Platform.OS,
    hasWebClientId: keys.webClientId,
    hasIosClientId: keys.iosClientId,
    webClientIdPrefix: googleWebClientIdPrefix(),
    ...(Platform.OS === 'android' ? { package: 'app.blob.mobile' } : {}),
    resultType: detail.resultType,
    hasIdToken: detail.hasIdToken,
    tokenAud: detail.tokenAud ?? null,
    supabaseMessage: detail.supabaseMessage ?? null,
  };
}

export function googleAuthErrorPayload(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return googleAuthLogFields({
      resultType: 'unknown',
      hasIdToken: false,
    });
  }
  const detail = error as GoogleNativeAuthError;
  return googleAuthLogFields({
    resultType: typeof detail.resultType === 'string' ? detail.resultType : error.name,
    hasIdToken: Boolean(detail.hasIdToken),
    tokenAud: detail.idTokenAud ?? null,
    supabaseMessage:
      typeof detail.exchangeMessage === 'string' ? detail.exchangeMessage : error.message,
  });
}

function reportAndroidGoogleFailure(resultType: string, error: unknown) {
  if (Platform.OS !== 'android') {
    return;
  }
  reportAppError({
    route: 'auth/login-google',
    error,
    payload: googleAuthLogFields({
      resultType,
      hasIdToken: false,
      supabaseMessage: getErrorMessage(error),
    }),
  });
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

function requireNativeConfig(): { webClientId: string; iosClientId?: string } {
  const config = googleNativeSignInConfig();
  if (!config?.webClientId) {
    throw new GoogleNativeAuthError(GOOGLE_NOT_CONFIGURED, {
      resultType: 'config',
      hasIdToken: false,
      hasCode: false,
      code: 'GOOGLE_NOT_CONFIGURED',
    });
  }
  return config;
}

let configured = false;

function ensureConfigured() {
  if (configured) {
    return;
  }
  const { webClientId, iosClientId } = requireNativeConfig();
  GoogleSignin.configure({
    webClientId,
    ...(Platform.OS === 'ios' && iosClientId ? { iosClientId } : {}),
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
      reportAndroidGoogleFailure('play-services', error);
      throw new GoogleNativeAuthError(GOOGLE_NOT_CONFIGURED, {
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
      reportAndroidGoogleFailure('play-services', error);
      throw new GoogleNativeAuthError(GOOGLE_NOT_CONFIGURED, {
        resultType: 'play-services',
        hasIdToken: false,
        hasCode: false,
        code: error.code,
      });
    }
    const message = getErrorMessage(error);
    const developerError =
      isGoogleDeveloperError(error) ||
      (isErrorWithCode(error) &&
        (error.code === '10' || String(error.code).toUpperCase() === 'DEVELOPER_ERROR')) ||
      /developer_error/i.test(message);
    const userMessage =
      developerError || isGoogleClientConfigError(message)
        ? GOOGLE_NOT_CONFIGURED
        : message || GOOGLE_NOT_CONFIGURED;
    reportAndroidGoogleFailure('sign-in', error);
    throw new GoogleNativeAuthError(userMessage, {
      resultType: 'sign-in',
      hasIdToken: false,
      hasCode: false,
      exchangeMessage: message,
      code: isErrorWithCode(error) ? error.code : undefined,
    });
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

  const claims = peekGoogleIdTokenClaims(idToken);
  reportAppError({
    route: 'auth/login-google',
    message: 'google id token claims',
    payload: googleAuthLogFields({
      resultType: 'id-token-claims',
      hasIdToken: true,
      tokenAud: claims.aud,
    }),
  });
  logOAuthStage('got google host', { host: 'native-id-token' });
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });

  if (error) {
    const exchangeMessage = getErrorMessage(error);
    const detail: GoogleNativeAuthDetail = {
      resultType: 'success',
      hasIdToken: true,
      hasCode,
      exchangeMessage,
      idTokenAud: claims.aud,
      idTokenAzp: claims.azp,
      idTokenIss: claims.iss,
    };
    logNativeGoogle(detail);
    reportAppError({
      route: 'auth/login-google',
      error,
      payload: googleAuthLogFields({
        resultType: 'id-token-exchange',
        hasIdToken: true,
        tokenAud: claims.aud,
        supabaseMessage: exchangeMessage,
      }),
    });
    throw new GoogleNativeAuthError(
      isGoogleClientConfigError(exchangeMessage) ? GOOGLE_NOT_CONFIGURED : exchangeMessage || GOOGLE_NOT_CONFIGURED,
      detail,
    );
  }
}
