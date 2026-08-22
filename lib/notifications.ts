import { challengeDetailHref, conversationHref, storyHref } from '@/lib/routes';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { AppNotification, ChallengeInvite, NotificationData } from '@/lib/types';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';
import type { Href } from 'expo-router';

const NOTIFICATION_COLUMNS =
  'id, user_id, actor_id, type, title, body, data, read_at, created_at';

export function asNotification(row: AppNotification): AppNotification {
  const data = (row.data ?? {}) as NotificationData;
  return {
    ...row,
    body: row.body ?? null,
    actor_id: row.actor_id ?? null,
    read_at: row.read_at ?? null,
    data,
  };
}

export async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(80);
  if (error) {
    if (isMissingRelationError(error)) {
      console.log('[blob:notifications] table missing', error.message);
      return [];
    }
    throw new Error(getErrorMessage(error));
  }
  const rows = ((data ?? []) as AppNotification[]).map(asNotification);
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter(Boolean))] as string[];
  if (actorIds.length === 0) {
    return rows;
  }
  try {
    const actors = await fetchPublicProfilesByIds(actorIds);
    const byId = new Map(actors.map((profile) => [profile.id, profile]));
    return rows.map((row) => ({
      ...row,
      actor: row.actor_id ? byId.get(row.actor_id) ?? null : null,
    }));
  } catch (error) {
    console.log('[blob:notifications] actor hydrate skipped', getErrorMessage(error));
    return rows;
  }
}

export function isCoinGrantAlert(item: AppNotification): boolean {
  if (item.type === 'bob_encouragement') {
    return false;
  }
  if (item.type === 'coin_grant' || item.type === 'badge_unlocked') {
    return true;
  }
  if (item.type === 'coins_received') {
    return item.data?.currency !== 'bucks';
  }
  if (item.data?.grant_key) {
    return item.data?.currency !== 'bucks';
  }
  return false;
}

export function isPersonAlert(item: AppNotification): boolean {
  return Boolean(item.actor_id) && !isCoinGrantAlert(item);
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) {
    if (isMissingRelationError(error)) {
      return 0;
    }
    throw new Error(getErrorMessage(error));
  }
  return count ?? 0;
}

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

export async function markNotificationRead(id: string): Promise<void> {
  const named = await supabase.rpc('mark_notification_read', { p_id: id });
  if (!named.error) {
    return;
  }
  if (!isMissingRpc(named.error)) {
    throw new Error(getErrorMessage(named.error));
  }
  const fallback = await supabase.rpc('mark_notifications_read', { p_ids: [id] });
  if (fallback.error && !isMissingRelationError(fallback.error)) {
    throw new Error(getErrorMessage(fallback.error));
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const named = await supabase.rpc('mark_all_notifications_read');
  if (!named.error) {
    return;
  }
  if (!isMissingRpc(named.error)) {
    throw new Error(getErrorMessage(named.error));
  }
  const fallback = await supabase.rpc('mark_notifications_read', { p_ids: null });
  if (fallback.error && !isMissingRelationError(fallback.error)) {
    throw new Error(getErrorMessage(fallback.error));
  }
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
  if (ids && ids.length === 1) {
    await markNotificationRead(ids[0]);
    return;
  }
  if (!ids || ids.length === 0) {
    await markAllNotificationsRead();
    return;
  }
  const { error } = await supabase.rpc('mark_notifications_read', { p_ids: ids });
  if (error && !isMissingRelationError(error)) {
    throw new Error(getErrorMessage(error));
  }
}

export async function inviteToChallenge(
  challengeId: string,
  inviteeId: string,
): Promise<ChallengeInvite> {
  const { data, error } = await supabase.rpc('invite_to_challenge', {
    p_challenge_id: challengeId,
    p_invitee_id: inviteeId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Invite sent, but we couldn’t load the receipt.');
  }
  const { maybeRequestPushPermission } = await import('@/lib/push');
  void maybeRequestPushPermission();
  return row as ChallengeInvite;
}

export function notificationHref(item: AppNotification): Href | null {
  const data = item.data ?? {};
  if (item.type === 'bob_encouragement') {
    if (data.href) {
      return data.href as Href;
    }
    if (data.challenge_id) {
      return challengeDetailHref(data.challenge_id, 'lobby');
    }
    return '/feed';
  }
  if (data.href) {
    return data.href as Href;
  }
  if (data.conversation_id || item.type === 'message') {
    const conversationId = data.conversation_id;
    if (conversationId) {
      return conversationHref(conversationId);
    }
    return '/messages';
  }
  if (data.story_id) {
    return storyHref(data.story_id);
  }
  if (
    item.type === 'friend_request' ||
    item.type === 'friend_accepted' ||
    item.type === 'follow'
  ) {
    if (data.username) {
      return { pathname: '/friends/u/[username]', params: { username: data.username } };
    }
    return '/friends';
  }
  if (item.type === 'profile_incomplete') {
    return '/profile/body-metrics';
  }
  if (item.type === 'coins_received' || item.type === 'coin_grant' || item.type === 'badge_unlocked' || item.type === 'payout_received') {
    return '/profile';
  }
  if (item.type === 'proof_flagged' && data.post_id) {
    return { pathname: '/feed/p/[id]', params: { id: data.post_id } };
  }
  if (data.callout_id) {
    return `/challenges/callout/${data.callout_id}`;
  }
  if (item.type === 'health_begin' || item.type === 'health_checkout') {
    if (data.challenge_id) {
      return `/challenges/${data.challenge_id}/submit`;
    }
  }
  if (data.challenge_id) {
    return challengeDetailHref(data.challenge_id, 'lobby');
  }
  if (data.post_id) {
    return { pathname: '/feed/p/[id]', params: { id: data.post_id } };
  }
  if (
    item.type === 'tagged' ||
    item.type === 'mentioned' ||
    item.type === 'profile_wall' ||
    item.type === 'post_comment' ||
    item.type === 'post_reaction' ||
    item.type === 'post_reposted' ||
    item.type === 'story_reaction' ||
    item.type === 'story_comment' ||
    item.type === 'story_shared'
  ) {
    return '/feed';
  }
  return null;
}

export function notificationGlyph(type: string, data?: NotificationData): string {
  switch (type) {
    case 'challenge_invite':
      return '🏁';
    case 'challenge_starting':
    case 'challenge_checkin_reminder':
      return '⏰';
    case 'challenge_checkin':
      return '✅';
    case 'challenge_new':
      return '✨';
    case 'tagged':
    case 'mentioned':
      return '🏷️';
    case 'profile_wall':
      return '📝';
    case 'challenge_joined':
    case 'challenge_join_confirmed':
      return '🤝';
    case 'friend_request':
    case 'friend_accepted':
    case 'follow':
      return '👋';
    case 'story_reaction':
      return '❤️';
    case 'story_comment':
      return '💬';
    case 'story_shared':
      return '📤';
    case 'post_reposted':
      return '🔁';
    case 'coins_received':
    case 'coin_grant':
    case 'payout_received':
      return data?.currency === 'bucks' ? '💵' : '🪙';
    case 'message':
      return '💬';
    case 'official_started':
      return '🏁';
    case 'start_rolled':
      return '📅';
    case 'proof_flagged':
      return '⚠️';
    case 'callout_received':
    case 'callout_accepted':
      return '⚔️';
    case 'callout_resolved':
      return '🏆';
    case 'callout_disputed':
      return '⚠️';
    case 'callout_cancelled':
      return '↩️';
    case 'badge_unlocked':
      return '🏅';
    case 'challenge_settled':
    case 'challenge_won':
      return '🏆';
    case 'challenge_placed':
      return '🥇';
    case 'challenge_eliminated':
    case 'challenge_lost':
    case 'competitor_dropped':
      return '💔';
    case 'challenge_cancelled':
      return '↩️';
    case 'profile_incomplete':
      return '📋';
    case 'bob_encouragement':
      return '👋';
    default:
      return '🔔';
  }
}
