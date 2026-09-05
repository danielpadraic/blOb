import { isGeoGateDeny } from '@/lib/geo/eligibility';
import type { CashGateResult } from '@/lib/geo/eligibility';
import { GEO_UNAVAILABLE_COPY, type CashAction, type GeoBucket } from '@/lib/geo/regions';
import { supabase } from '@/lib/supabase';

function asBucket(value: unknown): GeoBucket {
  if (value === 'allow' || value === 'limited' || value === 'blocked') {
    return value;
  }
  return 'blocked';
}

export function parseCashGateResult(data: unknown): CashGateResult {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') {
    return {
      allowed: false,
      bucket: 'blocked',
      reason: 'blocked',
      copy: GEO_UNAVAILABLE_COPY,
    };
  }
  const record = row as Record<string, unknown>;
  return {
    allowed: record.allowed === true,
    bucket: asBucket(record.bucket),
    reason: String(record.reason ?? 'blocked'),
    copy: GEO_UNAVAILABLE_COPY,
  };
}

/** Client geo_cash_gate. Pass precise USPS when GPS ran. Deny is a result, not a toast. */
export async function requestGeoCashGate(input: {
  action: CashAction;
  challengeId?: string | null;
  preciseRegion?: string | null;
}): Promise<CashGateResult> {
  const { data, error } = await supabase.rpc('geo_cash_gate', {
    p_action: input.action,
    p_challenge_id: input.challengeId ?? null,
    p_precise_region: input.preciseRegion ?? null,
  });
  if (error) {
    if (isGeoGateDeny(error) || isGeoGateDeny(error.message)) {
      return {
        allowed: false,
        bucket: 'blocked',
        reason: 'blocked',
        copy: GEO_UNAVAILABLE_COPY,
      };
    }
    throw error;
  }
  return parseCashGateResult(data);
}
