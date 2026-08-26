import { describe, expect, it } from 'vitest';

import {
  authSessionFlightKey,
  hasAuthCallbackPayload,
  isRecoveryRedirect,
  parseAuthRedirectParams,
} from '@/lib/authRedirectParams';
import { getPasswordUpdateMessage } from '@/utils/errors';

describe('parseAuthRedirectParams', () => {
  it('reads recovery tokens from the hash', () => {
    const params = parseAuthRedirectParams(
      'https://blob.example/auth/callback#access_token=aaa&refresh_token=bbb&type=recovery',
    );
    expect(params.type).toBe('recovery');
    expect(params.access_token).toBe('aaa');
    expect(params.refresh_token).toBe('bbb');
    expect(isRecoveryRedirect(params)).toBe(true);
  });

  it('reads recovery tokens from the query string', () => {
    const params = parseAuthRedirectParams(
      'blob://auth/callback?type=recovery&access_token=tok&refresh_token=ref',
    );
    expect(params.type).toBe('recovery');
    expect(params.access_token).toBe('tok');
    expect(isRecoveryRedirect(params)).toBe(true);
  });

  it('reads a PKCE code without crashing on a custom scheme', () => {
    const params = parseAuthRedirectParams('blob://auth/callback?code=abc123&type=recovery');
    expect(params.code).toBe('abc123');
    expect(params.type).toBe('recovery');
    expect(isRecoveryRedirect(params)).toBe(true);
  });

  it('reads signup and recovery token_hash links', () => {
    const signup = parseAuthRedirectParams(
      'blob://auth/callback?token_hash=abc&type=signup',
    );
    expect(signup.token_hash).toBe('abc');
    expect(signup.type).toBe('signup');
    expect(hasAuthCallbackPayload(signup)).toBe(true);
    expect(isRecoveryRedirect(signup)).toBe(false);

    const recovery = parseAuthRedirectParams(
      'blob://auth/callback#token_hash=def&type=recovery',
    );
    expect(recovery.token_hash).toBe('def');
    expect(isRecoveryRedirect(recovery)).toBe(true);
  });

  it('treats legacy token+type+email as a payload and ignores token without email', () => {
    const ready = parseAuthRedirectParams(
      'blob://auth/callback?token=otp&type=magiclink&email=a@b.com',
    );
    expect(ready.token).toBe('otp');
    expect(ready.email).toBe('a@b.com');
    expect(hasAuthCallbackPayload(ready)).toBe(true);
    expect(
      hasAuthCallbackPayload(
        parseAuthRedirectParams('blob://auth/callback?token=otp&type=magiclink'),
      ),
    ).toBe(false);
  });

  it('uses the same flight key for the same PKCE code on different URLs', () => {
    expect(authSessionFlightKey('blob://auth/callback?code=abc')).toBe(
      authSessionFlightKey('blob:///auth/callback?code=abc&type=signup'),
    );
  });

  it('returns empty params for missing or malformed URLs', () => {
    expect(parseAuthRedirectParams(null).access_token).toBeNull();
    expect(parseAuthRedirectParams('not a url').type).toBeNull();
    expect(isRecoveryRedirect(parseAuthRedirectParams('https://blob.example/feed'))).toBe(false);
  });
});

describe('getPasswordUpdateMessage', () => {
  it('asks the user to sign in again when Auth requires a recent login', () => {
    expect(
      getPasswordUpdateMessage({
        name: 'AuthSessionMissingError',
        message: 'Auth session missing!',
        code: 'session_not_found',
      }),
    ).toMatch(/sign out and sign in again/i);
    expect(
      getPasswordUpdateMessage({
        message: 'Reauthentication required',
        code: 'reauthentication_needed',
      }),
    ).toMatch(/sign out and sign in again/i);
  });

  it('surfaces the Auth error message instead of a generic try-again', () => {
    expect(
      getPasswordUpdateMessage({
        message: 'New password should be different from the old password.',
        status: 400,
      }),
    ).toMatch(/different password/i);
    expect(
      getPasswordUpdateMessage({
        message: 'Password is known to be weak and easy to guess',
        status: 400,
      }),
    ).toBe('Password is known to be weak and easy to guess');
  });
});
