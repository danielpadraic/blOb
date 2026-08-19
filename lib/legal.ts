import { LEGAL_PRIVACY_VERSION, LEGAL_TOS_VERSION, SKILL_ATTESTATION } from '@/copy/legalDocs';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

export { LEGAL_PRIVACY_VERSION, LEGAL_TOS_VERSION, SKILL_ATTESTATION };

export async function acceptLegal(): Promise<void> {
  const { data, error } = await supabase.rpc('accept_legal', {
    p_tos: true,
    p_privacy: true,
    p_skill: true,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data || (data as { ok?: boolean }).ok === false) {
    throw new Error('Could not record legal acceptance.');
  }
}

export async function completeTutorial(): Promise<void> {
  const { error } = await supabase.rpc('complete_tutorial');
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function replayTutorial(): Promise<void> {
  const { error } = await supabase.rpc('replay_tutorial');
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function setCreateTourOptOut(optOut: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_create_tour_opt_out', { p_opt_out: optOut });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  queryClient.setQueriesData({ queryKey: ['profile'] }, (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }
    return {
      ...current,
      create_tour_opt_out_at: optOut ? new Date().toISOString() : null,
    };
  });
}
