import { clipReactionNotifyCopy } from '@/lib/clipNotify';
import { circleNotificationPath } from '@/lib/circles';
import { collapseChallengeDigests } from '@/lib/notifyDigest';
import { postHref } from '@/lib/postShare';
import { challengeDetailHref, conversationHref, reelHref, storyHref } from '@/lib/routes';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { AppNotification, ChallengeInvite, NotificationData } from '@/lib/types';
import { getErrorMessage, isMissingRelationError, logPostgrestError } from '@/utils/errors';
import type { Href } from 'expo-router';

export function notificationChallengeId(data?: NotificationData | null): string | undefined {
  return data?.challenge_id ?? data?.challengeId;
}

export function notificationPostId(data?: NotificationData | null): string | undefined {
  return data?.post_id ?? data?.postId;
}

export function notificationCircleId(data?: NotificationData | null): string | undefined {
  return data?.circle_id ?? data?.circleId;
}

export function notificationActorId(data?: NotificationData | null): string | undefined {
  return data?.actor_id ?? data?.actorId ?? data?.from_user_id;
}

export function friendRequestFromUserId(item: AppNotification): string | undefined {
  return item.actor_id ?? item.data?.from_user_id ?? notificationActorId(item.data);
}

export async function notifyFriendsOfCreatedChallenge(challengeId: string): Promise<void> {
  try {
    const { error } = await supabase.rpc('notify_friends_of_new_challenge', {
      p_challenge_id: challengeId,
    });
    if (error) {
      console.log('[blob:notify] friend challenge skipped', error.message);
    }
  } catch (error) {
    console.log('[blob:notify] friend challenge skipped', error);
  }
}

/** SQL `posts_notify_checkin` is the only writer. Do not insert from the client. */
export async function notifyChallengeCheckinAfterPost(_input: {
  challengeId: string;
  actorId: string;
  postId?: string | null;
}): Promise<void> {
  return;
}

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

const STACKABLE_TYPES = new Set(['post_reaction', 'post_comment', 'tagged', 'mentioned']);

function interactionStackKey(item: AppNotification): string | null {
  if (!STACKABLE_TYPES.has(item.type)) {
    return null;
  }
  if (item.data.stack_key) {
    return `${item.type}:${item.data.stack_key}`;
  }
  const postId = notificationPostId(item.data);
  const commentId = item.data.comment_id;
  if (item.type === 'post_reaction') {
    if (commentId) {
      return `${item.type}:comment:${commentId}`;
    }
    return postId ? `${item.type}:post:${postId}` : null;
  }
  if (item.type === 'post_comment') {
    return postId ? `${item.type}:post:${postId}` : null;
  }
  if (item.type === 'tagged') {
    return postId ? `${item.type}:post:${postId}` : null;
  }
  if (item.type === 'mentioned' && commentId) {
    return `${item.type}:comment:${commentId}`;
  }
  return null;
}

function stackedSuffix(
  type: string,
  stackKey: string,
  data?: NotificationData,
): { one: string; many: string } {
  if (type === 'post_reaction') {
    if (stackKey.includes('comment:')) {
      return { one: 'reacted to your comment', many: 'reacted to your comment' };
    }
    return clipReactionNotifyCopy(data);
  }
  if (type === 'post_comment') {
    if (stackKey.includes('comment:')) {
      return { one: 'replied to your comment', many: 'replied to your comment' };
    }
    const href = typeof data?.href === 'string' ? data.href : '';
    if (data?.reel_id || href.startsWith('/round/')) {
      return { one: 'commented on your Round', many: 'commented on your Round' };
    }
    if (data?.story_id || href.startsWith('/wave/')) {
      return { one: 'commented on your Wave', many: 'commented on your Wave' };
    }
    return { one: 'commented on your post', many: 'commented on your post' };
  }
  if (type === 'mentioned') {
    return { one: 'tagged you', many: 'tagged you in a comment' };
  }
  return { one: 'tagged you', many: 'tagged you in a post' };
}

export { clipReactionNotifyCopy } from '@/lib/clipNotify';

export function stackedInteractionTitle(name: string, count: number, one: string, many: string): string {
  const display = name.trim() || 'Someone';
  if (count <= 1) {
    return `${display} ${one}`;
  }
  const others = count - 1;
  return others === 1
    ? `${display} and 1 other ${many}`
    : `${display} and ${others} others ${many}`;
}

export function collapseStackedNotifications(items: AppNotification[]): AppNotification[] {
  const seen = new Map<string, AppNotification>();
  const out: AppNotification[] = [];
  for (const item of items) {
    const key = interactionStackKey(item);
    if (!key) {
      out.push(item);
      continue;
    }
    const current = seen.get(key);
    if (!current) {
      seen.set(key, item);
      out.push(item);
      continue;
    }
    const ids = new Set<string>();
    for (const id of current.data.actor_ids ?? []) {
      if (id) {
        ids.add(id);
      }
    }
    for (const id of item.data.actor_ids ?? []) {
      if (id) {
        ids.add(id);
      }
    }
    if (current.actor_id) {
      ids.add(current.actor_id);
    }
    if (item.actor_id) {
      ids.add(item.actor_id);
    }
    const count = Math.max(ids.size, Number(current.data.count) || 1, Number(item.data.count) || 1);
    const suffix = stackedSuffix(current.type, key, current.data);
    const name = current.actor?.display_name || current.actor?.username || 'Someone';
    current.data = {
      ...current.data,
      actor_ids: [...ids],
      count,
    };
    current.title = stackedInteractionTitle(name, count, suffix.one, suffix.many);
    if (!current.read_at || (item.read_at && item.read_at < current.read_at)) {
      current.read_at = item.read_at ?? current.read_at;
    }
    if (item.read_at == null) {
      current.read_at = null;
    }
  }
  return collapseChallengeDigests(out);
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
    return collapseStackedNotifications(rows);
  }
  try {
    const actors = await fetchPublicProfilesByIds(actorIds);
    const byId = new Map(actors.map((profile) => [profile.id, profile]));
    return collapseStackedNotifications(
      rows.map((row) => ({
        ...row,
        actor: row.actor_id ? byId.get(row.actor_id) ?? null : null,
      })),
    );
  } catch (error) {
    console.log('[blob:notifications] actor hydrate skipped', getErrorMessage(error));
    return collapseStackedNotifications(rows);
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
    logPostgrestError('invite-to-challenge', error);
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Invite sent, but we couldn’t load the receipt.');
  }
  const { requestPushAfterValue } = await import('@/lib/push');
  requestPushAfterValue();
  return row as ChallengeInvite;
}

export function notificationHref(item: AppNotification): Href | null {
  const data = item.data ?? {};
  if (
    item.type === 'challenge_checkin_reminder' ||
    item.type === 'health_begin' ||
    item.type === 'health_checkout'
  ) {
    const reminderChallengeId = notificationChallengeId(data);
    if (reminderChallengeId) {
      return challengeDetailHref(reminderChallengeId, 'lobby', null, { tab: 'overview' });
    }
  }
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
  if (data.reel_id) {
    return reelHref(data.reel_id);
  }
  const circlePath = circleNotificationPath(item.type, notificationCircleId(data), notificationPostId(data));
  if (circlePath) {
    return circlePath as Href;
  }
  if (item.type === 'friend_request') {
    return { pathname: '/friends', params: { segment: 'requests' } };
  }
  if (item.type === 'friend_accepted' || item.type === 'follow') {
    if (data.username) {
      return { pathname: '/friends/u/[username]', params: { username: data.username } };
    }
    return '/friends';
  }
  if (item.type === 'friend_challenge') {
    const friendChallengeId = notificationChallengeId(data);
    if (friendChallengeId) {
      return challengeDetailHref(friendChallengeId, 'lobby');
    }
  }
  if (item.type === 'profile_incomplete') {
    return '/profile/body-metrics';
  }
  if (item.type === 'payout_received') {
    const payoutChallengeId = notificationChallengeId(data);
    if (payoutChallengeId) {
      return challengeDetailHref(payoutChallengeId, 'lobby', null, { tab: 'overview' });
    }
    return '/profile';
  }
  if (item.type === 'challenge_settled') {
    const settledId = notificationChallengeId(data);
    if (settledId) {
      return challengeDetailHref(settledId, 'lobby', notificationPostId(data), {
        tab: 'overview',
      });
    }
  }
  if (item.type === 'coins_received' || item.type === 'coin_grant' || item.type === 'badge_unlocked') {
    return '/profile';
  }
  if (item.type === 'proof_flagged' && notificationPostId(data)) {
    return postHref(notificationPostId(data)!);
  }
  if (data.callout_id) {
    return `/challenges/callout/${data.callout_id}`;
  }
  const challengeId = notificationChallengeId(data);
  const postId = notificationPostId(data);
  if (
    postId &&
    challengeId &&
    (item.type === 'challenge_checkin' ||
      item.type === 'tagged' ||
      item.type === 'mentioned' ||
      item.type === 'post_comment' ||
      item.type === 'post_reaction')
  ) {
    return challengeDetailHref(challengeId, 'feed', postId);
  }
  if (challengeId) {
    return challengeDetailHref(challengeId, 'lobby');
  }
  if (postId) {
    return postHref(postId);
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
    case 'circle_invite':
    case 'circle_invite_accepted':
    case 'circle_join':
    case 'circle_post':
    case 'circle_challenge_share':
      return '🟠';
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
    case 'friend_challenge':
      return '🏁';
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
