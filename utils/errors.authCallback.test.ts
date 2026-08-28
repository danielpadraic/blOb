import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy';
import { getAuthCallbackMessage, getAuthFormMessage, getErrorMessage } from '@/utils/errors';

const PHOTO_SAVE = 'We couldn’t save that photo. Check your connection and try again.';
const PKCE = 'AuthPKCE: code verifier not found in storage';

describe('getAuthCallbackMessage', () => {
  it('maps a missing PKCE verifier to confirmPkce and never says photo', () => {
    const message = getAuthCallbackMessage(new Error(PKCE));
    expect(message).toBe(copy('auth.confirmPkce'));
    expect(message.toLowerCase()).not.toContain('photo');
  });

  it('maps otp_expired to confirmExpired', () => {
    expect(getAuthCallbackMessage(new Error('otp_expired'))).toBe(copy('auth.confirmExpired'));
    expect(getAuthCallbackMessage(Object.assign(new Error('Token has expired'), { code: 'otp_expired' }))).toBe(
      copy('auth.confirmExpired'),
    );
  });

  it('maps network failures to auth.network', () => {
    expect(getAuthCallbackMessage(new Error('Failed to fetch'))).toBe(copy('auth.network'));
    expect(getAuthCallbackMessage(new Error('Load failed'))).toBe(copy('auth.network'));
  });

  it('uses confirmFailed plus same-browser help for a generic callback error', () => {
    expect(getAuthCallbackMessage(new Error('something went wrong'))).toBe(
      `${copy('auth.confirmFailed')} ${copy('auth.confirmSameBrowser')}`,
    );
  });

  it('never returns photo-save copy', () => {
    for (const error of [
      new Error(PKCE),
      new Error('otp_expired'),
      new Error('Failed to fetch'),
      new Error('storage'),
      { code: 'access_denied', message: 'access_denied' },
    ]) {
      expect(getAuthCallbackMessage(error).toLowerCase()).not.toContain('photo');
    }
  });
});

describe('humanize storage vs photo', () => {
  it('does not map PKCE verifier storage to photo copy', () => {
    expect(getErrorMessage(new Error(PKCE))).not.toContain('photo');
    expect(getAuthFormMessage(new Error(PKCE)).toLowerCase()).not.toContain('photo');
    expect(getErrorMessage(new Error(PKCE))).not.toBe(PHOTO_SAVE);
  });

  it('still maps a real media upload storage error to photo copy', () => {
    expect(getErrorMessage(new Error('Supabase storage could not upload image jpeg'))).toBe(PHOTO_SAVE);
    expect(getErrorMessage(new Error('bucket photo write failed'))).toBe(PHOTO_SAVE);
  });
});
