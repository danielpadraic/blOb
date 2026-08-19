import { supabase } from '@/lib/supabase';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

export type GrantClaim = {
  ok?: boolean;
  granted?: boolean;
  grant_key?: string;
  amount?: number;
  title?: string;
};

export type TickGrantsResult = {
  ok: boolean;
  grants: GrantClaim[];
  streak: number;
};

function isMissingRpc(error: unknown): boolean {
  const raw = getErrorMessage(error).toLowerCase();
  return (
    isMissingRelationError(error) ||
    raw.includes('could not find') ||
    raw.includes('does not exist') ||
    raw.includes('schema cache') ||
    raw.includes('404')
  );
}

export async function tickUserGrants(): Promise<TickGrantsResult> {
  const { data, error } = await supabase.rpc('tick_user_grants');
  if (error) {
    if (isMissingRpc(error)) {
      return { ok: false, grants: [], streak: 0 };
    }
    throw new Error(getErrorMessage(error));
  }
  const row = (data as unknown as TickGrantsResult | null) ?? { ok: true, grants: [], streak: 0 };
  return {
    ok: row.ok !== false,
    grants: Array.isArray(row.grants) ? row.grants : [],
    streak: Number(row.streak ?? 0),
  };
}
