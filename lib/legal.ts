import { LEGAL_PRIVACY_VERSION, LEGAL_TOS_VERSION, SKILL_ATTESTATION } from '@/copy/legalDocs';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { getErrorMessage } from '@/utils/errors';

export { LEGAL_PRIVACY_VERSION, LEGAL_TOS_VERSION, SKILL_ATTESTATION };

function stubUsername(userId: string, extra = ''): string {
  const hex = userId.replace(/-/g, '');
  return `blob_${hex.slice(0, extra ? 12 : 10)}${extra}`.replace(/[^a-z0-9_]/g, '').slice(0, 24);
}

function rawErrorText(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    return [record.code, record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
  }
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }
  return String(error ?? '').toLowerCase();
}

function isProfileMissingError(error: unknown): boolean {
  return rawErrorText(error).includes('profile_missing');
}

async function ensureMinProfile(userId: string): Promise<void> {
  const first = await supabase
    .from('profiles')
    .upsert({ id: userId, username: stubUsername(userId) }, { onConflict: 'id', ignoreDuplicates: true });
  if (!first.error) {
    return;
  }
  const retry = await supabase
    .from('profiles')
    .upsert({ id: userId, username: stubUsername(userId, 'x') }, { onConflict: 'id', ignoreDuplicates: true });
  if (retry.error) {
    throw retry.error;
  }
}

export async function acceptLegal(): Promise<void> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getUser();
  if (sessionError) {
    throw new Error(getErrorMessage(sessionError));
  }
  const userId = sessionData.user?.id;
  if (!userId) {
    throw new Error('Sign in to continue.');
  }

  await ensureMinProfile(userId).catch(() => undefined);

  const run = () =>
    supabase.rpc('accept_legal', {
      p_tos: true,
      p_privacy: true,
      p_skill: true,
    });

  let { data, error } = await run();
  if (error && isProfileMissingError(error)) {
    await ensureMinProfile(userId);
    ({ data, error } = await run());
  }
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
