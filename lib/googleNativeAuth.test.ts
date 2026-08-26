import { describe, expect, it } from 'vitest';

import { iosUrlSchemeFromClientId } from '@/lib/googleSignInConfig';

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
