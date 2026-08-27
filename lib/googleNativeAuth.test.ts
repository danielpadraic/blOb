import { afterEach, describe, expect, it } from 'vitest';

import {
  GOOGLE_NOT_CONFIGURED,
  GOOGLE_SIGN_IN_RETRY,
  googleLiveSignInMessage,
  googleNativeConfigureKeysPresent,
  googleNativeSignInConfig,
  googleNotConfiguredUserMessage,
  googleWebClientIdPrefix,
  iosUrlSchemeFromClientId,
  isGoogleDeveloperError,
  peekGoogleIdTokenClaims,
} from '@/lib/googleSignInConfig';
import { getAuthFormMessage } from '@/utils/errors';

function unsignedJwt(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, 'utf8').toString('base64url');
  return `eyJhbGciOiJub25lIn0.${b64}.sig`;
}

const previousWeb = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const previousIos = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const previousAndroid = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

afterEach(() => {
  if (previousWeb === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = previousWeb;
  }
  if (previousIos === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = previousIos;
  }
  if (previousAndroid === undefined) {
    delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  } else {
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = previousAndroid;
  }
});

describe('iosUrlSchemeFromClientId', () => {
  it('reverses the iOS OAuth client ID into the Google URL scheme', () => {
    expect(iosUrlSchemeFromClientId('123456789-abcdef.apps.googleusercontent.com')).toBe(
      'com.googleusercontent.apps.123456789-abcdef',
    );
  });

  it('returns null when the client ID is missing or not a Google client', () => {
    expect(iosUrlSchemeFromClientId('')).toBeNull();
    expect(iosUrlSchemeFromClientId('not-a-client')).toBeNull();
  });
});

describe('googleNativeSignInConfig', () => {
  it('requires the Web client as webClientId (server / id token aud)', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()).toBeNull();
    expect(googleNativeConfigureKeysPresent()).toEqual({ webClientId: false, iosClientId: true });
  });

  it('sets webClientId from the Web env and iosClientId from the iOS env', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()).toEqual({
      webClientId: 'web-client.apps.googleusercontent.com',
      iosClientId: 'ios-client.apps.googleusercontent.com',
    });
    expect(googleNativeConfigureKeysPresent()).toEqual({ webClientId: true, iosClientId: true });
  });

  it('does not hide Google when the Web env matches a native client id', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()).toEqual({
      webClientId: 'ios-client.apps.googleusercontent.com',
      iosClientId: 'ios-client.apps.googleusercontent.com',
    });
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'android-client.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'android-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()?.webClientId).toBe('android-client.apps.googleusercontent.com');
  });
});

describe('peekGoogleIdTokenClaims', () => {
  it('reads aud, azp, and iss without exposing the token', () => {
    const claims = peekGoogleIdTokenClaims(
      unsignedJwt({
        aud: 'web-client.apps.googleusercontent.com',
        azp: 'ios-client.apps.googleusercontent.com',
        iss: 'https://accounts.google.com',
        email: 'hidden@example.com',
      }),
    );
    expect(claims).toEqual({
      aud: 'web-client.apps.googleusercontent.com',
      azp: 'ios-client.apps.googleusercontent.com',
      iss: 'https://accounts.google.com',
    });
    expect(JSON.stringify(claims)).not.toContain('eyJ');
  });

  it('returns nulls when the payload is not a JWT', () => {
    expect(peekGoogleIdTokenClaims('not-a-jwt')).toEqual({ aud: null, azp: null, iss: null });
  });
});

describe('Google client config errors', () => {
  it('maps invalid_client and tap failures to try-again, not the configured banner', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
    expect(
      getAuthFormMessage(new Error('Unacceptable audience in id_token: [49251028054-abc.apps.googleusercontent.com]')),
    ).toBe(GOOGLE_SIGN_IN_RETRY);
    expect(
      getAuthFormMessage(new Error('Access blocked: The OAuth client was not found. 401 invalid_client')),
    ).toBe(GOOGLE_SIGN_IN_RETRY);
    expect(getAuthFormMessage(new Error(GOOGLE_NOT_CONFIGURED))).toBe(GOOGLE_SIGN_IN_RETRY);
  });

  it('maps Android DEVELOPER_ERROR / code 10 to try-again', () => {
    const raw = Object.assign(new Error('10: '), { code: '10', message: '10 DEVELOPER_ERROR' });
    expect(isGoogleDeveloperError(raw)).toBe(true);
    expect(getAuthFormMessage(raw)).toBe(GOOGLE_SIGN_IN_RETRY);
    expect(getAuthFormMessage(Object.assign(new Error('DEVELOPER_ERROR'), { code: 'DEVELOPER_ERROR' }))).toBe(
      GOOGLE_SIGN_IN_RETRY,
    );
    expect(getAuthFormMessage(new Error('10 10 DEVELOPER_ERROR'))).toBe(GOOGLE_SIGN_IN_RETRY);
  });

  it('shows the configured banner only when the Web client env is empty on native', () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    expect(googleNotConfiguredUserMessage('web')).toBeNull();
    expect(googleNotConfiguredUserMessage('ios')).toBe(GOOGLE_NOT_CONFIGURED);
    expect(googleNotConfiguredUserMessage('android')).toBe(GOOGLE_NOT_CONFIGURED);
    expect(googleLiveSignInMessage('web')).toBe(GOOGLE_SIGN_IN_RETRY);
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'web-client.apps.googleusercontent.com';
    expect(googleNotConfiguredUserMessage('ios')).toBeNull();
    expect(googleLiveSignInMessage('android')).toBe(GOOGLE_SIGN_IN_RETRY);
  });

  it('prefixes the Web client id to 20 characters for diagnostics', () => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID =
      '49251028054-d21t852ji7nh32m3dhghafk533tpsp3e.apps.googleusercontent.com';
    expect(googleWebClientIdPrefix()).toBe('49251028054-d21t852j');
    expect(googleWebClientIdPrefix()?.length).toBe(20);
  });
});
