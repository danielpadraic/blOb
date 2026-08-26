import { afterEach, describe, expect, it } from 'vitest';

import {
  GOOGLE_NOT_CONFIGURED,
  googleNativeConfigureKeysPresent,
  googleNativeSignInConfig,
  iosUrlSchemeFromClientId,
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

  it('refuses to use the iOS or Android client as webClientId', () => {
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'ios-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()).toBeNull();
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'android-client.apps.googleusercontent.com';
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = 'android-client.apps.googleusercontent.com';
    expect(googleNativeSignInConfig()).toBeNull();
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
  it('maps invalid_client and unacceptable audience to configure copy', () => {
    expect(
      getAuthFormMessage(new Error('Unacceptable audience in id_token: [49251028054-abc.apps.googleusercontent.com]')),
    ).toBe(GOOGLE_NOT_CONFIGURED);
    expect(
      getAuthFormMessage(new Error('Access blocked: The OAuth client was not found. 401 invalid_client')),
    ).toBe(GOOGLE_NOT_CONFIGURED);
    expect(getAuthFormMessage(new Error(GOOGLE_NOT_CONFIGURED))).toBe(GOOGLE_NOT_CONFIGURED);
  });
});
