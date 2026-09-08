import { parseUspsRegion, USPS_REGION_LABELS, USPS_REGIONS, type UspsRegion } from '@/lib/geo/regions';
import type { Profile, ProfileUpdate } from '@/lib/types';

/** Mailing State: the 50 states plus DC. Not Puerto Rico. */
export const PAYOUT_STATES = USPS_REGIONS.filter((code) => code !== 'PR');

export type PayoutAddressDraft = {
  street: string;
  apt: string;
  city: string;
  stateText: string;
  zip: string;
  country: string;
};

export const DEFAULT_PAYOUT_COUNTRY = 'United States';

function trimOrEmpty(value?: string | null): string {
  return String(value ?? '').trim();
}

export function parsePayoutState(value?: string | null): UspsRegion | null {
  const parsed = parseUspsRegion(value);
  if (!parsed || parsed === 'PR') {
    return null;
  }
  return parsed;
}

export function payoutStateLabel(code?: string | null): string {
  const parsed = parsePayoutState(code);
  if (!parsed) {
    return trimOrEmpty(code);
  }
  return USPS_REGION_LABELS[parsed];
}

export function filterPayoutStates(query: string): UspsRegion[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [...PAYOUT_STATES];
  }
  return PAYOUT_STATES.filter((code) => {
    const label = USPS_REGION_LABELS[code];
    return code.toLowerCase().includes(needle) || label.toLowerCase().includes(needle);
  });
}

export function draftFromProfile(profile?: Pick<
  Profile,
  'address_line1' | 'address_line2' | 'city' | 'home_state' | 'postal_code' | 'country'
> | null): PayoutAddressDraft {
  return {
    street: trimOrEmpty(profile?.address_line1),
    apt: trimOrEmpty(profile?.address_line2),
    city: trimOrEmpty(profile?.city),
    stateText: payoutStateLabel(profile?.home_state),
    zip: trimOrEmpty(profile?.postal_code),
    country: trimOrEmpty(profile?.country) || DEFAULT_PAYOUT_COUNTRY,
  };
}

export function hasPayoutAddress(profile?: Pick<Profile, 'address_line1'> | null): boolean {
  return trimOrEmpty(profile?.address_line1).length > 0;
}

export function payoutAddressPatch(draft: PayoutAddressDraft): { patch: ProfileUpdate; error?: string } {
  const street = trimOrEmpty(draft.street);
  const apt = trimOrEmpty(draft.apt);
  const city = trimOrEmpty(draft.city);
  const zip = trimOrEmpty(draft.zip);
  const country = trimOrEmpty(draft.country) || DEFAULT_PAYOUT_COUNTRY;
  const typedState = trimOrEmpty(draft.stateText);
  const state = parsePayoutState(typedState);

  if (typedState && !state) {
    return { patch: {}, error: 'state' };
  }

  const patch: ProfileUpdate = {
    address_line1: street || null,
    address_line2: apt || null,
    city: city || null,
    postal_code: zip || null,
    country,
  };
  if (state) {
    patch.home_state = state;
    patch.declared_region = state;
  }
  return { patch };
}
