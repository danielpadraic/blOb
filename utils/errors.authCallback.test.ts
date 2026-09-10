import { describe, expect, it, vi } from 'vitest';

import { copy } from '@/lib/copy';
import {
  getAuthCallbackMessage,
  getAuthFormMessage,
  getErrorMessage,
  getProfileSetupSaveMessage,
  logDev,
  logPostgrestError,
  OS_SETTINGS_PERMISSION_COPY,
} from '@/utils/errors';

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

  it('never maps a geo 400 or a bare PostgREST 400 to photo-save copy', () => {
    expect(getErrorMessage(new Error('NEED_REGION'))).toBe(copy('geo.unavailable'));
    expect(getErrorMessage({ message: 'GEO_BLOCKED', code: 'P0001' })).toBe(copy('geo.unavailable'));
    expect(getErrorMessage(new Error('status code 400'))).not.toContain('photo');
  });
});

describe('profile setup save errors are not OS Settings copy', () => {
  it('does not tell people to open Settings for a column privilege error', () => {
    const denied = { code: '42501', message: 'permission denied for column gender' };
    expect(getErrorMessage(denied)).toBe(copy('error.saveDetails'));
    expect(getErrorMessage(denied)).not.toBe(OS_SETTINGS_PERMISSION_COPY);
    expect(getProfileSetupSaveMessage(denied)).toBe(copy('error.saveDetails'));
    expect(getProfileSetupSaveMessage(denied).toLowerCase()).not.toContain('settings');
  });

  it('does not tell people to open Settings for a generic permission denied', () => {
    const denied = new Error('permission denied');
    expect(getErrorMessage(denied)).toBe(copy('error.saveDetails'));
    expect(getErrorMessage(denied)).not.toBe(OS_SETTINGS_PERMISSION_COPY);
    expect(getProfileSetupSaveMessage(denied)).not.toBe(OS_SETTINGS_PERMISSION_COPY);
  });

  it('still uses Settings copy for a real OS camera/health denial', () => {
    expect(getErrorMessage(new Error('User denied camera permission'))).toBe(
      OS_SETTINGS_PERMISSION_COPY,
    );
    expect(getErrorMessage(new Error('HealthKit authorization denied'))).toBe(
      OS_SETTINGS_PERMISSION_COPY,
    );
    expect(getProfileSetupSaveMessage(new Error('HealthKit authorization denied'))).toBe(
      copy('error.saveDetails'),
    );
  });

  it('maps RATE_LIMITED people search to wait copy, not an empty match', () => {
    expect(getErrorMessage({ message: 'RATE_LIMITED', code: 'P0001' })).toBe(copy('friends.searchWait'));
    expect(getErrorMessage(new Error('RATE_LIMITED'))).toBe('Try that search again in a few minutes.');
  });
});

describe('production RPC logs', () => {
  it('does not dump PostgREST details, hint, or RPC objects', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logPostgrestError('rpc', {
      code: '42501',
      message: 'denied',
      details: 'email@example.com',
      hint: 'session.user.email',
    });
    logDev('[blob:lobby]', {
      code: 'PGRST116',
      message: 'fail',
      details: 'get_my_profile()',
      hint: 'session',
    });
    const dumped = JSON.stringify(spy.mock.calls);
    expect(spy).not.toHaveBeenCalled();
    expect(dumped).not.toContain('email@');
    expect(dumped).not.toContain('get_my_profile');
    spy.mockRestore();
  });
});
