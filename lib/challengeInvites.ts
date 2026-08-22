import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';

import { supabase } from '@/lib/supabase';
import type {
  AcceptChallengeInviteResult,
  ChallengeInviteWithInvitee,
  CreateChallengeInviteResult,
  PublicProfile,
} from '@/lib/types';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

const PENDING_INVITE_KEY = 'pending_invite_token';

let memoryToken: string | null = null;

export function inviteLinkForToken(token: string): string {
  return Linking.createURL(`invite/${token}`);
}

export async function stashPendingInviteToken(token: string): Promise<void> {
  const value = token.trim();
  if (!value) {
    return;
  }
  memoryToken = value;
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, value);
  } catch {
    // In-memory is enough for the same session (sign-in then accept).
  }
}

export async function takePendingInviteToken(): Promise<string | null> {
  const fromMemory = memoryToken?.trim() || null;
  memoryToken = null;
  try {
    const stored = (await SecureStore.getItemAsync(PENDING_INVITE_KEY))?.trim() || null;
    await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
    return fromMemory ?? stored;
  } catch {
    return fromMemory;
  }
}

export async function createChallengeInvite(
  challengeId: string,
): Promise<CreateChallengeInviteResult> {
  const { data, error } = await supabase.rpc('create_challenge_invite', {
    p_challenge_id: challengeId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = (Array.isArray(data) ? data[0] : data) as CreateChallengeInviteResult | null;
  if (!row?.token) {
    throw new Error('Couldn’t create an invite link.');
  }
  return row;
}

export async function acceptChallengeInvite(token: string): Promise<AcceptChallengeInviteResult> {
  const { data, error } = await supabase.rpc('accept_challenge_invite', {
    p_token: token.trim(),
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = (Array.isArray(data) ? data[0] : data) as AcceptChallengeInviteResult | null;
  if (!row?.challenge_id) {
    throw new Error('That invite link is not valid.');
  }
  return row;
}

type InviteRow = {
  id: string;
  challenge_id: string;
  inviter_id: string;
  invitee_id: string | null;
  status: string | null;
  created_at: string;
  accepted_at: string | null;
  invitee?: PublicProfile | PublicProfile[] | null;
};

export async function fetchPendingChallengeInvites(
  challengeId: string,
): Promise<ChallengeInviteWithInvitee[]> {
  const query = await supabase
    .from('challenge_invites')
    .select(
      'id, challenge_id, inviter_id, invitee_id, status, created_at, accepted_at, invitee:profiles!challenge_invites_invitee_id_fkey(id, username, display_name, avatar_url)',
    )
    .eq('challenge_id', challengeId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(40);
  let rows: InviteRow[] | null = null;
  let error = query.error;
  if (!error) {
    rows = (query.data ?? []) as unknown as InviteRow[];
  } else if (!isMissingRelationError(error)) {
    const fallback = await supabase
      .from('challenge_invites')
      .select('id, challenge_id, inviter_id, invitee_id, status, created_at, accepted_at')
      .eq('challenge_id', challengeId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(40);
    error = fallback.error;
    rows = (fallback.data ?? []) as InviteRow[];
  }
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw new Error(getErrorMessage(error));
  }
  return (rows ?? []).map((row) => {
    const invitee = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
    return {
      id: row.id,
      challenge_id: row.challenge_id,
      inviter_id: row.inviter_id,
      invitee_id: row.invitee_id,
      status: row.status ?? 'pending',
      created_at: row.created_at,
      accepted_at: row.accepted_at,
      invitee: invitee ?? null,
    };
  });
}
