import { highFiveDraft } from '@/lib/notifyDigest';
import { notificationChallengeId } from '@/lib/notifications';
import {
  createGroupConversation,
  getOrCreateDirectConversation,
} from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';
import type { Conversation } from '@/types/social';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

export function notificationHasHighFive(item: AppNotification): boolean {
  return Boolean(item.data?.high_five) && (item.data?.winner_ids?.length ?? 0) > 0;
}

export function highFiveMemberIds(item: AppNotification): string[] {
  return [...new Set((item.data?.winner_ids ?? []).filter(Boolean))];
}

export function highFivePrefill(item: AppNotification): string {
  return highFiveDraft(item.data?.challenge_title);
}

function asConversation(row: unknown): Conversation | null {
  const value = (Array.isArray(row) ? row[0] : row) as Conversation | null;
  return value?.id ? value : null;
}

export async function openHighFiveConversation(
  challengeId: string,
  memberIds: string[],
  viewerId?: string | null,
): Promise<Conversation> {
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (ids.length < 1) {
    throw new Error('Nobody to high-five yet.');
  }

  const rpc = await supabase.rpc('open_high_five_conversation', {
    p_challenge_id: challengeId,
    p_member_ids: ids,
  });
  const opened = asConversation(rpc.data);
  if (!rpc.error && opened) {
    return opened;
  }
  if (rpc.error && !isMissingRelationError(rpc.error) && !/could not find|does not exist|schema cache|404/i.test(getErrorMessage(rpc.error))) {
    throw new Error(getErrorMessage(rpc.error));
  }

  if (ids.length >= 2) {
    return createGroupConversation(ids);
  }
  if (!viewerId) {
    throw new Error('Sign in to send a high-five.');
  }
  return getOrCreateDirectConversation(viewerId, ids[0]);
}

export function highFiveChallengeId(item: AppNotification): string | undefined {
  return notificationChallengeId(item.data);
}
