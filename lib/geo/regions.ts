/** Wave-1 USPS region matrix. Frozen. Precise GPS is not required to browse. */

export const GEO_UNAVAILABLE_COPY = 'Sorry, this Challenge isn’t available in your State.';

export type GeoBucket = 'allow' | 'limited' | 'blocked';

export type CashAction =
  | 'join_hybrid'
  | 'join_host'
  | 'create_hybrid'
  | 'create_host'
  | 'cashout'
  | 'create_pool'
  | 'join_pool'
  | 'call';

export const USPS_REGIONS = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'DC',
  'PR',
] as const;

export type UspsRegion = (typeof USPS_REGIONS)[number];

export const GEO_BUCKET_BY_REGION: Record<UspsRegion, GeoBucket> = {
  AL: 'allow',
  AK: 'allow',
  AZ: 'blocked',
  AR: 'limited',
  CA: 'allow',
  CO: 'limited',
  CT: 'blocked',
  DE: 'blocked',
  FL: 'allow',
  GA: 'allow',
  HI: 'limited',
  ID: 'allow',
  IL: 'allow',
  IN: 'limited',
  IA: 'limited',
  KS: 'allow',
  KY: 'allow',
  LA: 'blocked',
  ME: 'blocked',
  MD: 'limited',
  MA: 'allow',
  MI: 'blocked',
  MN: 'allow',
  MS: 'allow',
  MO: 'allow',
  MT: 'blocked',
  NE: 'limited',
  NV: 'blocked',
  NH: 'allow',
  NJ: 'limited',
  NM: 'allow',
  NY: 'limited',
  NC: 'allow',
  ND: 'limited',
  OH: 'allow',
  OK: 'allow',
  OR: 'allow',
  PA: 'allow',
  RI: 'allow',
  SC: 'limited',
  SD: 'blocked',
  TN: 'blocked',
  TX: 'allow',
  UT: 'limited',
  VT: 'allow',
  VA: 'allow',
  WA: 'limited',
  WV: 'allow',
  WI: 'allow',
  WY: 'allow',
  DC: 'allow',
  PR: 'blocked',
};

export const GEO_DENY_REASONS = ['need_region', 'product_off', 'blocked', 'limited', 'GEO_BLOCKED'] as const;

export type GeoDenyReason = (typeof GEO_DENY_REASONS)[number];

export function normalizeRegion(value: string | null | undefined): string | null {
  const code = String(value ?? '')
    .trim()
    .toUpperCase();
  if (!code) {
    return null;
  }
  return code;
}

export function bucketForRegion(value: string | null | undefined): GeoBucket {
  const code = normalizeRegion(value);
  if (!code) {
    return 'blocked';
  }
  if (code in GEO_BUCKET_BY_REGION) {
    return GEO_BUCKET_BY_REGION[code as UspsRegion];
  }
  return 'blocked';
}
