import { describe, expect, it } from 'vitest';

import { PUBLIC_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS_BASE } from '@/lib/constants';
import {
  DEFAULT_PAYOUT_COUNTRY,
  draftFromProfile,
  filterPayoutStates,
  hasPayoutAddress,
  parsePayoutState,
  payoutAddressPatch,
  payoutStateLabel,
} from '@/lib/payoutAddress';

describe('payout address', () => {
  it('accepts CO and Idaho as State', () => {
    expect(parsePayoutState('CO')).toBe('CO');
    expect(parsePayoutState('Idaho')).toBe('ID');
    expect(payoutStateLabel('CO')).toBe('Colorado');
  });

  it('does not treat Puerto Rico as a mailing State', () => {
    expect(parsePayoutState('PR')).toBeNull();
    expect(filterPayoutStates('').some((code) => code === 'PR')).toBe(false);
  });

  it('filters typeahead by code or name without wiping the typed value', () => {
    expect(filterPayoutStates('id').map((code) => code)).toContain('ID');
    expect(filterPayoutStates('Colorado')).toEqual(['CO']);
  });

  it('writes the private columns only, and never body metrics', () => {
    const { patch, error } = payoutAddressPatch({
      street: '123 Main',
      apt: '4B',
      city: 'Boise',
      stateText: 'Idaho',
      zip: '83702',
      country: '',
    });
    expect(error).toBeUndefined();
    expect(patch).toMatchObject({
      address_line1: '123 Main',
      address_line2: '4B',
      city: 'Boise',
      home_state: 'ID',
      declared_region: 'ID',
      postal_code: '83702',
      country: DEFAULT_PAYOUT_COUNTRY,
    });
    expect(patch).not.toHaveProperty('body_metrics_completed_at');
  });

  it('rejects a State that is not on the list instead of inventing one', () => {
    const { patch, error } = payoutAddressPatch({
      street: '1 Main',
      apt: '',
      city: 'Boise',
      stateText: 'Ontario',
      zip: '83702',
      country: DEFAULT_PAYOUT_COUNTRY,
    });
    expect(error).toBe('state');
    expect(patch).toEqual({});
  });

  it('allows an empty address so Settings can be left', () => {
    const { patch, error } = payoutAddressPatch({
      street: '',
      apt: '',
      city: '',
      stateText: '',
      zip: '',
      country: DEFAULT_PAYOUT_COUNTRY,
    });
    expect(error).toBeUndefined();
    expect(patch.address_line1).toBeNull();
    expect(patch).not.toHaveProperty('home_state');
    expect(hasPayoutAddress({ address_line1: null })).toBe(false);
    expect(hasPayoutAddress({ address_line1: '123 Main' })).toBe(true);
  });

  it('reloads the typed State from home_state', () => {
    expect(draftFromProfile({ home_state: 'CO', address_line1: '9 Pine' }).stateText).toBe('Colorado');
  });
});

describe('public profile never carries a street', () => {
  it('does not select mailing columns', () => {
    expect(PUBLIC_PROFILE_COLUMNS).not.toMatch(
      /address_line|postal_code|home_state|declared_region|\bcity\b|\bcountry\b/,
    );
    expect(PUBLIC_PROFILE_COLUMNS_BASE).not.toMatch(/address_line|postal_code/);
  });
});
