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

export const PRECISE_MAX_AGE_MS = 15 * 60 * 1000;

export const USPS_REGION_LABELS: Record<UspsRegion, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
  PR: 'Puerto Rico',
};

const REGION_ALIASES: Record<string, UspsRegion> = {
  'WASHINGTON DC': 'DC',
  'WASHINGTON D.C.': 'DC',
  'WASHINGTON D C': 'DC',
  'DISTRICT OF COLUMBIA': 'DC',
  'D.C.': 'DC',
  'D.C': 'DC',
  'PUERTO RICO': 'PR',
};

function aliasKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ');
}

export function isUspsRegion(value: string | null | undefined): value is UspsRegion {
  const code = normalizeRegion(value);
  return Boolean(code && (USPS_REGIONS as readonly string[]).includes(code));
}

export function regionLabel(value: string | null | undefined): string | null {
  const code = normalizeRegion(value);
  if (!code || !isUspsRegion(code)) {
    return null;
  }
  return USPS_REGION_LABELS[code];
}

export function parseUspsRegion(value: string | null | undefined): UspsRegion | null {
  const code = normalizeRegion(value);
  if (!code) {
    return null;
  }
  if (isUspsRegion(code)) {
    return code;
  }
  const compact = aliasKey(value ?? '');
  if (isUspsRegion(compact)) {
    return compact;
  }
  const alias = REGION_ALIASES[compact];
  if (alias) {
    return alias;
  }
  const name = aliasKey(value ?? '');
  for (const [usps, label] of Object.entries(USPS_REGION_LABELS) as Array<[UspsRegion, string]>) {
    if (aliasKey(label) === name) {
      return usps;
    }
  }
  return null;
}

export function isPreciseFresh(lastPreciseAt: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastPreciseAt) {
    return false;
  }
  const at = Date.parse(lastPreciseAt);
  if (!Number.isFinite(at)) {
    return false;
  }
  return nowMs - at < PRECISE_MAX_AGE_MS;
}

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
