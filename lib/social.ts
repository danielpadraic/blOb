import { addHours } from 'date-fns';

import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';
import { fetchCorporateChallengeIds, fetchHiddenRailPostIds } from '@/lib/clipRail';
import { WAVE_CLIP_MS, type WaveClipWindow } from '@/lib/waveClips';
import type {
  Conversation,
  ConversationMember,
  FeedEvent,
  FeedEventType,
  FeedEventVisibility,
  Follow,
  Friendship,
  FriendshipStatus,
  Message,
  Reel,
  Story,
  StoryComment,
  StoryReaction,
  StoryReactionType,
} from '@/types/social';
import { DM_BLOCKED_COPY, DM_SELF_COPY } from '@/lib/dmOpen';
import { getDmOpenMessage, getErrorMessage, isMissingRelationError } from '@/utils/errors';

export const STORY_TTL_HOURS = 24;
export const SOCIAL_PAGE_SIZE = 40;

export const FOLLOW_COLUMNS = 'follower_id, following_id, created_at';
export const FRIENDSHIP_COLUMNS =
  'user_a_id, user_b_id, status, requested_by, created_at, accepted_at';
export const FEED_EVENT_COLUMNS =
  'id, actor_id, event_type, target_type, target_id, challenge_id, metadata, visibility, created_at';
export const STORY_COLUMNS =
  'id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at, sequence_id, sequence_index, clip_start_ms, clip_duration_ms, thumbnail_url, post_id';
export const STORY_REACTION_COLUMNS = 'id, story_id, user_id, reaction_type, created_at';
export const STORY_COMMENT_COLUMNS = 'id, story_id, user_id, body, created_at';
export const REEL_COLUMNS =
  'id, user_id, video_url, thumbnail_url, caption, challenge_id, duration_ms, created_at, post_id';
export const CONVERSATION_COLUMNS = 'id, is_group, challenge_id, created_at, updated_at';
export const CONVERSATION_MEMBER_COLUMNS =
  'conversation_id, user_id, joined_at, last_read_at';
export const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, body, media_url, created_at';
export const CHALLENGE_FEED_COLUMNS =
  'id, title, status, is_official, buy_in_amount, prize_pool, currency, cover_image_url, created_by, visibility';
const CHALLENGE_FEED_COLUMNS_SPONSOR = `${CHALLENGE_FEED_COLUMNS}, sponsor_name, sponsor_logo_url`;
const CHALLENGE_FEED_COLUMNS_LANE = `${CHALLENGE_FEED_COLUMNS_SPONSOR}, challenge_lane`;
const CHALLENGE_FEED_COLUMNS_EMBED = `${CHALLENGE_FEED_COLUMNS_LANE}, starts_at, ends_at, series_id, category, challenge_type, task, tasks, days_required, target_count, length_value`;

export type FollowEdge = Follow & { profile: PublicProfile | null };
export type FriendEdge = Friendship & { profile: PublicProfile | null };
export type ReelItem = Reel & { profile: PublicProfile | null };

export type FriendshipSnapshot = {
  status: FriendshipStatus | 'none';
  friendship: Friendship | null;
  incoming: boolean;
};

export type ConversationPreview = Conversation & {
  membership: ConversationMember;
  members: ConversationMember[];
  last_message: Message | null;
  unread: boolean;
  peer: PublicProfile | null;
  people: PublicProfile[];
};

export type CreateFeedEventInput = {
  event_type: FeedEventType | string;
  target_type?: string | null;
  target_id?: string | null;
  challenge_id?: string | null;
  metadata?: Record<string, any>;
  visibility?: FeedEventVisibility;
};

export type CreateStoryInput = {
  media_url: string;
  media_type: 'image' | 'video';
  challenge_id?: string | null;
  caption?: string | null;
  expires_at?: string;
  clips?: WaveClipWindow[];
  thumbnail_url?: string | null;
};

export type CreateReelInput = {
  video_url: string;
  thumbnail_url?: string | null;
  caption?: string | null;
  challenge_id?: string | null;
  duration_ms?: number | null;
  tagged_user_ids?: string[];
};

export type SendMessageInput = {
  conversation_id: string;
  body?: string | null;
  media_url?: string | null;
};

export type FeedChallengePreview = {
  id: string;
  title: string;
  status: string;
  is_official: boolean;
  buy_in_amount: number;
  prize_pool: number;
  currency: string | null;
  cover_image_url: string | null;
  created_by: string | null;
  sponsor_name?: string | null;
  sponsor_logo_url?: string | null;
  visibility?: string | null;
  challenge_lane?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  series_id?: string | null;
  category?: string | null;
  challenge_type?: string | null;
  task?: string | null;
  tasks?: Array<{ title?: string | null }> | null;
  days_required?: number | null;
  target_count?: number | null;
  length_value?: number | null;
};

export type FeedEventItem = FeedEvent & {
  actor: PublicProfile | null;
  challenge: FeedChallengePreview | null;
};

export type FriendRequestLists = {
  incoming: FriendEdge[];
  outgoing: FriendEdge[];
};

export type PeopleRelation =
  | 'self'
  | 'friends'
  | 'incoming'
  | 'requested'
  | 'following'
  | 'none';

export function personDisplayName(profile?: Pick<PublicProfile, 'display_name' | 'username'> | null) {
  if (!profile) {
    return 'Someone';
  }
  return profile.display_name?.trim() || profile.username;
}

export function conversationTitle(
  conversation: Pick<ConversationPreview, 'is_group' | 'peer' | 'people'>,
): string {
  if (conversation.is_group) {
    const names = conversation.people.map(personDisplayName).filter(Boolean);
    if (names.length === 0) {
      return 'Group';
    }
    if (names.length === 1) {
      return names[0];
    }
    if (names.length === 2) {
      return `${names[0]} and ${names[1]}`;
    }
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }
  return personDisplayName(conversation.peer);
}

export type PeopleSearchKind = 'name' | 'email' | 'phone';

export type PeopleSearchQuery = {
  kind: PeopleSearchKind;
  term: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_CHARS_RE = /^[+0-9().\-\s]+$/;

export function detectPeopleSearch(query: string): PeopleSearchQuery | null {
  const term = query.trim();
  if (!term) {
    return null;
  }
  if (EMAIL_RE.test(term)) {
    return { kind: 'email', term: term.toLowerCase() };
  }
  const digits = term.replace(/\D/g, '');
  if (digits.length >= 10 && PHONE_CHARS_RE.test(term)) {
    return { kind: 'phone', term: digits };
  }
  const name = term.replace(/^@/, '').replace(/[%_,()]/g, '');
  if (name.length < 2) {
    return null;
  }
  return { kind: 'name', term: name };
}

export function peopleRelation(input: {
  userId?: string | null;
  targetId: string;
  friendIds: Set<string>;
  incomingIds: Set<string>;
  outgoingIds: Set<string>;
  followingIds: Set<string>;
}): PeopleRelation {
  if (input.userId && input.userId === input.targetId) {
    return 'self';
  }
  if (input.friendIds.has(input.targetId)) {
    return 'friends';
  }
  if (input.incomingIds.has(input.targetId)) {
    return 'incoming';
  }
  if (input.outgoingIds.has(input.targetId)) {
    return 'requested';
  }
  if (input.followingIds.has(input.targetId)) {
    return 'following';
  }
  return 'none';
}

export function orderedFriendshipIds(userId: string, otherId: string): {
  user_a_id: string;
  user_b_id: string;
} {
  if (userId === otherId) {
    throw new Error('You can’t friend yourself.');
  }
  return userId < otherId
    ? { user_a_id: userId, user_b_id: otherId }
    : { user_a_id: otherId, user_b_id: userId };
}

export function friendshipRequestRow(fromUserId: string, toUserId: string): Pick<
  Friendship,
  'user_a_id' | 'user_b_id' | 'status' | 'requested_by'
> {
  return {
    ...orderedFriendshipIds(fromUserId, toUserId),
    status: 'pending',
    requested_by: fromUserId,
  };
}

export function otherFriendshipUserId(
  row: Pick<Friendship, 'user_a_id' | 'user_b_id'>,
  userId: string,
): string {
  return row.user_a_id === userId ? row.user_b_id : row.user_a_id;
}

export function isFriendshipStatus(value: string): value is FriendshipStatus {
  return value === 'pending' || value === 'accepted' || value === 'blocked';
}

export function isAcceptedFriend(row: Pick<Friendship, 'status'>): boolean {
  return row.status === 'accepted';
}

export function canRespondToFriendRequest(
  row: Pick<Friendship, 'status' | 'requested_by'>,
  userId: string,
): boolean {
  return row.status === 'pending' && row.requested_by !== userId;
}

export function isActiveStory(story: Pick<Story, 'expires_at'>, now = new Date()): boolean {
  const expires = Date.parse(story.expires_at);
  return Number.isFinite(expires) && expires > now.getTime();
}

export function otherConversationUserId(
  members: Pick<ConversationMember, 'user_id'>[],
  userId: string,
): string | null {
  return members.find((member) => member.user_id !== userId)?.user_id ?? null;
}

export function messagePreview(message: Pick<Message, 'body' | 'media_url' | 'sender_id'> | null, userId?: string | null): string {
  if (!message) {
    return 'No messages yet';
  }
  const body = message.body?.trim();
  const text = body || (message.media_url ? 'Sent a photo' : 'No messages yet');
  if (userId && message.sender_id === userId && (body || message.media_url)) {
    return `You: ${text}`;
  }
  return text;
}

export function conversationHasUnread(
  member: Pick<ConversationMember, 'last_read_at'>,
  lastMessage: Pick<Message, 'created_at' | 'sender_id'> | null,
  userId: string,
): boolean {
  if (!lastMessage || lastMessage.sender_id === userId) {
    return false;
  }
  if (!member.last_read_at) {
    return true;
  }
  return Date.parse(lastMessage.created_at) > Date.parse(member.last_read_at);
}

export function feedEventAction(event: Pick<FeedEvent, 'event_type'>): string {
  switch (event.event_type) {
    case 'challenge_created':
      return 'created a challenge';
    case 'challenge_joined':
      return 'joined a challenge';
    case 'result_submitted':
      return 'checked in';
    case 'challenge_won':
      return 'won a challenge';
    case 'story_posted':
      return copy('wave.posted');
    case 'reel_posted':
      return copy('round.posted');
    case 'friend_accepted':
      return 'made a new friend';
    case 'reaction_added':
      return 'reacted';
    case 'comment_added':
      return 'left a comment';
    default:
      return String(event.event_type).replace(/_/g, ' ');
  }
}

export function isChallengeFeedEvent(event: Pick<FeedEvent, 'event_type' | 'challenge_id'>): boolean {
  return Boolean(event.challenge_id) || event.event_type.startsWith('challenge_') || event.event_type === 'result_submitted';
}

export function storyTimeLeft(expiresAt: string): string {
  const ms = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) {
    return 'Expired';
  }
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) {
    return `${hours}h left`;
  }
  const minutes = Math.max(1, Math.floor(ms / 60_000));
  return `${minutes}m left`;
}

export type StoryGroup = {
  userId: string;
  name: string;
  avatar: string | null;
  isOwn: boolean;
  stories: Story[];
};

export function groupStories(input: {
  stories: Story[];
  userId?: string | null;
  profiles: Map<string, { display_name: string | null; username: string; avatar_url: string | null }>;
  circleIds?: Set<string>;
  includeEmptyOwn?: boolean;
}): StoryGroup[] {
  const buckets = new Map<string, Story[]>();
  for (const story of input.stories) {
    if (input.circleIds && !input.circleIds.has(story.user_id)) {
      continue;
    }
    const list = buckets.get(story.user_id) ?? [];
    list.push(story);
    buckets.set(story.user_id, list);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      const time = Date.parse(a.created_at) - Date.parse(b.created_at);
      if (time !== 0) {
        return time;
      }
      return (a.sequence_index ?? 0) - (b.sequence_index ?? 0);
    });
  }

  const groups: StoryGroup[] = [];
  if (input.userId) {
    const mine = buckets.get(input.userId) ?? [];
    if (mine.length > 0 || input.includeEmptyOwn) {
      const profile = input.profiles.get(input.userId);
      groups.push({
        userId: input.userId,
        name: copy('wave.yours'),
        avatar: profile?.avatar_url ?? null,
        isOwn: true,
        stories: mine,
      });
    }
  }
  for (const [userId, stories] of buckets) {
    if (userId === input.userId) {
      continue;
    }
    const profile = input.profiles.get(userId);
    groups.push({
      userId,
      name: personDisplayName(profile) || 'Blob',
      avatar: profile?.avatar_url ?? null,
      isOwn: false,
      stories,
    });
  }
  return groups;
}

function throwIfError(error: unknown) {
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export function asPublicProfile(row: PublicProfile): PublicProfile {
  const raw = row as PublicProfile & { gender?: unknown; pronoun?: unknown };
  delete raw.gender;
  delete raw.pronoun;
  return raw;
}

export async function fetchPublicProfilesByIds(ids: string[]): Promise<PublicProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .in('id', unique);
  throwIfError(error);
  return ((data ?? []) as PublicProfile[]).map(asPublicProfile);
}

export async function followUser(followerId: string, followingId: string): Promise<Follow> {
  if (followerId === followingId) {
    throw new Error('You can’t follow yourself.');
  }
  const { data: target, error: profileError } = await supabase
    .from('profiles')
    .select('is_creator')
    .eq('id', followingId)
    .maybeSingle();
  throwIfError(profileError);
  if (!target?.is_creator) {
    throw new Error('You can only follow Creators.');
  }
  const { data, error } = await supabase
    .from('follows')
    .insert({ follower_id: followerId, following_id: followingId })
    .select(FOLLOW_COLUMNS)
    .single();
  throwIfError(error);
  return data as Follow;
}

export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const { error } = await supabase
    .from('follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId);
  throwIfError(error);
}

export async function fetchFollowers(userId: string): Promise<FollowEdge[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(FOLLOW_COLUMNS)
    .eq('following_id', userId)
    .order('created_at', { ascending: false });
  throwIfError(error);
  const rows = (data ?? []) as Follow[];
  const profiles = await fetchPublicProfilesByIds(rows.map((row) => row.follower_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.map((row) => ({ ...row, profile: byId.get(row.follower_id) ?? null }));
}

export async function fetchFollowing(userId: string): Promise<FollowEdge[]> {
  const { data, error } = await supabase
    .from('follows')
    .select(FOLLOW_COLUMNS)
    .eq('follower_id', userId)
    .order('created_at', { ascending: false });
  throwIfError(error);
  const rows = (data ?? []) as Follow[];
  const profiles = await fetchPublicProfilesByIds(rows.map((row) => row.following_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.map((row) => ({ ...row, profile: byId.get(row.following_id) ?? null }));
}

export async function searchPeople(query: string, currentUserId: string): Promise<PublicProfile[]> {
  const parsed = detectPeopleSearch(query);
  if (!parsed) {
    return [];
  }

  const rpc = await supabase.rpc('search_people', { p_query: query.trim() });
  if (!rpc.error) {
    return ((rpc.data ?? []) as PublicProfile[])
      .filter((row) => row.id !== currentUserId)
      .map(asPublicProfile);
  }
  if (!isMissingSearchRpc(rpc.error)) {
    throwIfError(rpc.error);
  }

  // Fallback if the RPC isn't migrated yet: name/username only. Never partial-match email or phone.
  if (parsed.kind !== 'name') {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .or(`username.ilike.%${parsed.term}%,display_name.ilike.%${parsed.term}%`)
    .neq('id', currentUserId)
    .limit(16);
  throwIfError(error);
  return ((data ?? []) as PublicProfile[]).map(asPublicProfile);
}

function isMissingSearchRpc(error: unknown): boolean {
  if (isMissingRelationError(error)) {
    return true;
  }
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : String(error ?? '').toLowerCase();
  return raw.includes('search_people') || raw.includes('pgrst202') || raw.includes('could not find the function');
}

export async function fetchFriendRequests(userId: string): Promise<FriendRequestLists> {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_COLUMNS)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  throwIfError(error);
  const rows = (data ?? []) as Friendship[];
  const profiles = await fetchPublicProfilesByIds(
    rows.map((row) => otherFriendshipUserId(row, userId)),
  );
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const incoming: FriendEdge[] = [];
  const outgoing: FriendEdge[] = [];
  for (const row of rows) {
    const otherId = otherFriendshipUserId(row, userId);
    const edge: FriendEdge = { ...row, profile: byId.get(otherId) ?? null };
    if (row.requested_by === userId) {
      outgoing.push(edge);
    } else {
      incoming.push(edge);
    }
  }
  return { incoming, outgoing };
}

export async function fetchFriendCount(userId: string): Promise<number> {
  const { data, error } = await supabase.rpc('friend_count', { p_user_id: userId });
  if (error) {
    throw error;
  }
  const count = Number(data);
  return Number.isFinite(count) ? Math.max(count, 0) : 0;
}

export async function fetchFriends(userId: string): Promise<FriendEdge[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_COLUMNS)
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false });
  throwIfError(error);
  const rows = (data ?? []) as Friendship[];
  const profiles = await fetchPublicProfilesByIds(
    rows.map((row) => otherFriendshipUserId(row, userId)),
  );
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    profile: byId.get(otherFriendshipUserId(row, userId)) ?? null,
  }));
}

export async function fetchFriendshipSnapshot(
  userId: string,
  targetUserId: string,
): Promise<FriendshipSnapshot> {
  if (userId === targetUserId) {
    return { status: 'none', friendship: null, incoming: false };
  }
  const pair = orderedFriendshipIds(userId, targetUserId);
  const { data, error } = await supabase
    .from('friendships')
    .select(FRIENDSHIP_COLUMNS)
    .eq('user_a_id', pair.user_a_id)
    .eq('user_b_id', pair.user_b_id)
    .maybeSingle();
  throwIfError(error);
  const friendship = (data as Friendship | null) ?? null;
  if (!friendship) {
    return { status: 'none', friendship: null, incoming: false };
  }
  return {
    status: friendship.status,
    friendship,
    incoming: friendship.status === 'pending' && friendship.requested_by !== userId,
  };
}

export async function sendFriendRequest(fromUserId: string, toUserId: string): Promise<Friendship> {
  const existing = await fetchFriendshipSnapshot(fromUserId, toUserId);
  if (existing.status === 'accepted') {
    throw new Error('You’re already friends.');
  }
  if (existing.status === 'blocked') {
    throw new Error('You can’t send that request.');
  }
  if (existing.status === 'pending') {
    throw new Error(existing.incoming ? 'They already sent you a request.' : 'Request already sent.');
  }
  const { data, error } = await supabase
    .from('friendships')
    .insert(friendshipRequestRow(fromUserId, toUserId))
    .select(FRIENDSHIP_COLUMNS)
    .single();
  throwIfError(error);
  try {
    const { error: notifyError } = await supabase.rpc('ensure_friend_request_notification', {
      p_to_user_id: toUserId,
    });
    if (notifyError) {
      console.log('[blob:notify] friend request skipped', notifyError.message);
    }
  } catch (notifyError) {
    console.log('[blob:notify] friend request skipped', notifyError);
  }
  const { requestPushAfterValue } = await import('@/lib/push');
  requestPushAfterValue();
  return data as Friendship;
}

export async function acceptFriendRequest(userId: string, fromUserId: string): Promise<Friendship> {
  const snapshot = await fetchFriendshipSnapshot(userId, fromUserId);
  if (!snapshot.friendship || !canRespondToFriendRequest(snapshot.friendship, userId)) {
    throw new Error('There’s no request to accept.');
  }
  const pair = orderedFriendshipIds(userId, fromUserId);
  const acceptedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('friendships')
    .update({ status: 'accepted', accepted_at: acceptedAt })
    .eq('user_a_id', pair.user_a_id)
    .eq('user_b_id', pair.user_b_id)
    .select(FRIENDSHIP_COLUMNS)
    .single();
  throwIfError(error);
  return data as Friendship;
}

export async function rejectFriendRequest(userId: string, otherUserId: string): Promise<void> {
  const snapshot = await fetchFriendshipSnapshot(userId, otherUserId);
  if (!snapshot.friendship || snapshot.friendship.status !== 'pending') {
    throw new Error('There’s no request to decline.');
  }
  const pair = orderedFriendshipIds(userId, otherUserId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a_id', pair.user_a_id)
    .eq('user_b_id', pair.user_b_id);
  throwIfError(error);
}

export async function unfriendUser(userId: string, otherUserId: string): Promise<void> {
  const snapshot = await fetchFriendshipSnapshot(userId, otherUserId);
  if (!snapshot.friendship || snapshot.friendship.status !== 'accepted') {
    throw new Error('You’re not friends.');
  }
  const pair = orderedFriendshipIds(userId, otherUserId);
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('user_a_id', pair.user_a_id)
    .eq('user_b_id', pair.user_b_id);
  throwIfError(error);
}

export async function fetchFeedEvents(
  limit = SOCIAL_PAGE_SIZE,
  viewerId?: string,
): Promise<FeedEventItem[]> {
  const { data, error } = await supabase
    .from('feed_events')
    .select(FEED_EVENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  throwIfError(error);
  const events = (data ?? []) as FeedEvent[];
  if (events.length === 0) {
    return [];
  }

  const actorIds = events.map((event) => event.actor_id);
  const challengeIds = events
    .map((event) => event.challenge_id)
    .filter((id): id is string => Boolean(id));

  const [profiles, challenges, myChallengeIds] = await Promise.all([
    fetchPublicProfilesByIds(actorIds),
    fetchChallengePreviewsByIds(challengeIds),
    viewerId ? fetchMyChallengeIds(viewerId) : Promise.resolve(new Set<string>()),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const challengeById = new Map(challenges.map((challenge) => [challenge.id, challenge]));

  const items = events.map((event) => ({
    ...event,
    actor: profileById.get(event.actor_id) ?? null,
    challenge: event.challenge_id ? challengeById.get(event.challenge_id) ?? null : null,
  }));

  return items.sort((a, b) => {
    const aMine = a.challenge_id && myChallengeIds.has(a.challenge_id) ? 1 : 0;
    const bMine = b.challenge_id && myChallengeIds.has(b.challenge_id) ? 1 : 0;
    if (aMine !== bMine) {
      return bMine - aMine;
    }
    const aCompete = isChallengeFeedEvent(a) ? 1 : 0;
    const bCompete = isChallengeFeedEvent(b) ? 1 : 0;
    if (aCompete !== bCompete) {
      return bCompete - aCompete;
    }
    return Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}

export async function fetchChallengePreviewsByIds(ids: string[]): Promise<FeedChallengePreview[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }
  const withEmbed = await supabase
    .from('challenges')
    .select(CHALLENGE_FEED_COLUMNS_EMBED)
    .in('id', unique);
  if (!withEmbed.error) {
    return (withEmbed.data ?? []) as FeedChallengePreview[];
  }
  const withLane = await supabase
    .from('challenges')
    .select(CHALLENGE_FEED_COLUMNS_LANE)
    .in('id', unique);
  if (!withLane.error) {
    return (withLane.data ?? []) as FeedChallengePreview[];
  }
  const withSponsor = await supabase
    .from('challenges')
    .select(CHALLENGE_FEED_COLUMNS_SPONSOR)
    .in('id', unique);
  if (!withSponsor.error) {
    return (withSponsor.data ?? []) as FeedChallengePreview[];
  }
  const { data, error } = await supabase
    .from('challenges')
    .select(CHALLENGE_FEED_COLUMNS)
    .in('id', unique);
  throwIfError(error);
  return (data ?? []) as FeedChallengePreview[];
}

async function fetchMyChallengeIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id')
    .eq('user_id', userId);
  if (error) {
    return new Set();
  }
  return new Set((data ?? []).map((row) => row.challenge_id));
}

export async function createFeedEvent(
  actorId: string,
  input: CreateFeedEventInput,
): Promise<FeedEvent> {
  const { data, error } = await supabase
    .from('feed_events')
    .insert({
      actor_id: actorId,
      event_type: input.event_type,
      target_type: input.target_type ?? null,
      target_id: input.target_id ?? null,
      challenge_id: input.challenge_id ?? null,
      metadata: input.metadata ?? {},
      visibility: input.visibility ?? 'public',
    })
    .select(FEED_EVENT_COLUMNS)
    .single();
  throwIfError(error);
  return data as FeedEvent;
}

export async function fetchActiveStories(): Promise<Story[]> {
  const query = await supabase
    .from('stories')
    .select(STORY_COLUMNS)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(80);
  const result =
    query.error && /sequence_id|clip_start_ms|thumbnail_url|post_id|schema cache/i.test(query.error.message)
      ? await supabase
          .from('stories')
          .select('id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at, thumbnail_url')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(80)
      : query;
  if (result.error) {
    if (isMissingRelationError(result.error)) {
      return [];
    }
    throwIfError(result.error);
  }
  return ((result.data ?? []) as Story[]).filter((story) => isActiveStory(story));
}

export async function fetchStory(id: string): Promise<Story | null> {
  const query = await supabase.from('stories').select(STORY_COLUMNS).eq('id', id).maybeSingle();
  const { data, error } =
    query.error && /sequence_id|clip_start_ms|thumbnail_url|post_id|schema cache/i.test(query.error.message)
      ? await supabase
          .from('stories')
          .select('id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at, thumbnail_url')
          .eq('id', id)
          .maybeSingle()
      : query;
  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throwIfError(error);
  }
  return (data as Story | null) ?? null;
}

export async function fetchViewedStoryIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('viewer_id', userId);
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throwIfError(error);
  }
  return (data ?? []).map((row) => row.story_id);
}

export async function fetchStoryChallengeOptions(
  userId: string,
): Promise<{ id: string; title: string }[]> {
  const [hosted, joined] = await Promise.all([
    supabase.from('challenges').select('id, title').eq('created_by', userId).limit(20),
    supabase.from('challenge_participants').select('challenge_id').eq('user_id', userId),
  ]);
  const joinedIds = [...new Set((joined.data ?? []).map((row) => row.challenge_id))];
  const joinedRows =
    joinedIds.length > 0
      ? await supabase.from('challenges').select('id, title').in('id', joinedIds)
      : { data: [], error: null };
  const byId = new Map<string, { id: string; title: string }>();
  for (const row of [...(hosted.data ?? []), ...(joinedRows.data ?? [])] as {
    id: string;
    title: string;
  }[]) {
    byId.set(row.id, row);
  }
  return [...byId.values()];
}

export async function createStory(userId: string, input: CreateStoryInput): Promise<Story[]> {
  const mediaUrl = input.media_url.trim();
  if (!mediaUrl) {
    throw new Error('Add a photo or video first.');
  }
  const expiresAt = input.expires_at ?? addHours(new Date(), STORY_TTL_HOURS).toISOString();
  const clips =
    input.clips && input.clips.length > 0
      ? input.clips
      : [{ startMs: 0, durationMs: input.media_type === 'image' ? WAVE_CLIP_MS : 0 }];
  const sequenceId = clips.length > 1 ? (globalThis.crypto?.randomUUID?.() ?? `seq_${Date.now()}`) : null;
  const rows = clips.map((clip, index) => ({
    user_id: userId,
    media_url: mediaUrl,
    media_type: input.media_type,
    thumbnail_url: input.thumbnail_url ?? null,
    challenge_id: input.challenge_id ?? null,
    caption:
      clip.caption?.trim() ||
      (clips.length === 1 ? input.caption?.trim() || null : null),
    expires_at: expiresAt,
    sequence_id: sequenceId,
    sequence_index: index,
    clip_start_ms: clip.startMs,
    clip_duration_ms: clip.durationMs || null,
  }));
  const { data, error } = await supabase.from('stories').insert(rows).select(STORY_COLUMNS);
  if (error && /sequence_id|clip_start_ms|clip_duration_ms|thumbnail_url|post_id|schema cache/i.test(error.message)) {
    const fallback = await supabase
      .from('stories')
      .insert({
        user_id: userId,
        media_url: mediaUrl,
        media_type: input.media_type,
        thumbnail_url: input.thumbnail_url ?? null,
        challenge_id: input.challenge_id ?? null,
        caption: input.caption?.trim() || null,
        expires_at: expiresAt,
      })
      .select('id, user_id, media_url, media_type, challenge_id, caption, expires_at, created_at, thumbnail_url')
      .single();
    throwIfError(fallback.error);
    return [fallback.data as Story];
  }
  throwIfError(error);
  return ((data ?? []) as Story[]).sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
}

export async function persistStoryThumbnail(storyId: string, thumbnailUrl: string): Promise<void> {
  const { error } = await supabase
    .from('stories')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', storyId);
  if (error && !/thumbnail_url|schema cache/i.test(error.message)) {
    console.log('[blob:wave] poster save skipped', error.message);
  }
}

export async function persistReelThumbnail(reelId: string, thumbnailUrl: string): Promise<void> {
  const { error } = await supabase
    .from('reels')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', reelId);
  if (error) {
    console.log('[blob:round] poster save skipped', error.message);
  }
}

export async function attachClipPostId(
  kind: 'story' | 'reel',
  clipId: string,
  postId: string,
): Promise<void> {
  const table = kind === 'reel' ? 'reels' : 'stories';
  const { error } = await supabase.from(table).update({ post_id: postId }).eq('id', clipId);
  if (error && /post_id|schema cache/i.test(error.message)) {
    return;
  }
  throwIfError(error);
}

export async function viewStory(userId: string, storyId: string): Promise<void> {
  const { error } = await supabase.from('story_views').upsert(
    {
      story_id: storyId,
      viewer_id: userId,
      viewed_at: new Date().toISOString(),
    },
    { onConflict: 'story_id,viewer_id' },
  );
  throwIfError(error);
}

async function withReelProfiles(rows: Reel[]): Promise<ReelItem[]> {
  if (rows.length === 0) {
    return [];
  }
  const profiles = await fetchPublicProfilesByIds(rows.map((row) => row.user_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows.map((row) => ({
    ...row,
    profile: byId.get(row.user_id) ?? null,
  }));
}

const REEL_COLUMNS_FALLBACK =
  'id, user_id, video_url, thumbnail_url, caption, challenge_id, duration_ms, created_at';

async function selectReels(limit: number) {
  const query = await supabase
    .from('reels')
    .select(REEL_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (query.error && /post_id|schema cache/i.test(query.error.message)) {
    return supabase
      .from('reels')
      .select(REEL_COLUMNS_FALLBACK)
      .order('created_at', { ascending: false })
      .limit(limit);
  }
  return query;
}

export async function fetchReels(limit = SOCIAL_PAGE_SIZE): Promise<ReelItem[]> {
  const { data, error } = await selectReels(limit);
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throwIfError(error);
  }
  const items = await withReelProfiles((data ?? []) as Reel[]);
  const corporateIds = await fetchCorporateChallengeIds(
    items.map((reel) => reel.challenge_id).filter((id): id is string => Boolean(id)),
  );
  const hiddenPosts = await fetchHiddenRailPostIds(
    items.map((reel) => reel.post_id).filter((id): id is string => Boolean(id)),
  );
  return items.filter((reel) => {
    if (reel.challenge_id && corporateIds.has(reel.challenge_id)) {
      return false;
    }
    if (reel.post_id && hiddenPosts.has(reel.post_id)) {
      return false;
    }
    return true;
  });
}

async function fetchReelByColumn(column: 'id' | 'post_id', value: string): Promise<ReelItem | null> {
  const query = await supabase.from('reels').select(REEL_COLUMNS).eq(column, value).maybeSingle();
  const { data, error } =
    query.error && /post_id|schema cache/i.test(query.error.message)
      ? column === 'id'
        ? await supabase.from('reels').select(REEL_COLUMNS_FALLBACK).eq('id', value).maybeSingle()
        : query
      : query;
  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    if (column === 'post_id' && /post_id|schema cache/i.test(error.message)) {
      return null;
    }
    throwIfError(error);
  }
  if (!data) {
    return null;
  }
  const [item] = await withReelProfiles([data as Reel]);
  return item ?? null;
}

export async function fetchReel(id: string): Promise<ReelItem | null> {
  const byId = await fetchReelByColumn('id', id);
  if (byId) {
    return byId;
  }
  return fetchReelByColumn('post_id', id);
}

export async function createReel(userId: string, input: CreateReelInput): Promise<Reel> {
  const videoUrl = typeof input.video_url === 'string' ? input.video_url.trim() : '';
  if (!videoUrl) {
    throw new Error('Add a video first.');
  }
  const { data, error } = await supabase
    .from('reels')
    .insert({
      user_id: userId,
      video_url: videoUrl,
      thumbnail_url: input.thumbnail_url ?? null,
      caption: input.caption?.trim() || null,
      challenge_id: input.challenge_id ?? null,
      duration_ms: input.duration_ms ?? null,
    })
    .select(REEL_COLUMNS)
    .single();
  throwIfError(error);
  const reel = data as Reel;
  const tags = [...new Set((input.tagged_user_ids ?? []).filter((id) => id && id !== userId))];
  if (tags.length > 0) {
    const { error: tagError } = await supabase.from('reel_tags').insert(
      tags.map((tagged_user_id) => ({
        reel_id: reel.id,
        tagged_user_id,
      })),
    );
    throwIfError(tagError);
  }
  return reel;
}

export async function fetchConversations(userId: string): Promise<ConversationPreview[]> {
  const { data: memberships, error: memberError } = await supabase
    .from('conversation_members')
    .select(CONVERSATION_MEMBER_COLUMNS)
    .eq('user_id', userId);
  if (memberError) {
    if (isMissingRelationError(memberError)) {
      return [];
    }
    throwIfError(memberError);
  }
  const mine = (memberships ?? []) as ConversationMember[];
  const ids = mine.map((row) => row.conversation_id);
  if (ids.length === 0) {
    return [];
  }

  const [conversationsResult, membersResult, messagesResult] = await Promise.all([
    supabase.from('conversations').select(CONVERSATION_COLUMNS).in('id', ids),
    supabase.from('conversation_members').select(CONVERSATION_MEMBER_COLUMNS).in('conversation_id', ids),
    supabase
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(200),
  ]);
  throwIfError(conversationsResult.error);
  throwIfError(membersResult.error);
  throwIfError(messagesResult.error);

  const membershipById = new Map(mine.map((row) => [row.conversation_id, row]));
  const membersByConversation = new Map<string, ConversationMember[]>();
  for (const member of (membersResult.data ?? []) as ConversationMember[]) {
    const list = membersByConversation.get(member.conversation_id) ?? [];
    list.push(member);
    membersByConversation.set(member.conversation_id, list);
  }
  const lastByConversation = new Map<string, Message>();
  for (const message of (messagesResult.data ?? []) as Message[]) {
    if (!lastByConversation.has(message.conversation_id)) {
      lastByConversation.set(message.conversation_id, message);
    }
  }

  const previews = ((conversationsResult.data ?? []) as Conversation[])
    .map((conversation) => {
      const membership = membershipById.get(conversation.id);
      if (!membership) {
        return null;
      }
      const members = membersByConversation.get(conversation.id) ?? [membership];
      const lastMessage = lastByConversation.get(conversation.id) ?? null;
      return {
        ...conversation,
        membership,
        members,
        last_message: lastMessage,
        unread: conversationHasUnread(membership, lastMessage, userId),
        peer: null as PublicProfile | null,
        people: [] as PublicProfile[],
      };
    })
    .filter((row): row is ConversationPreview => Boolean(row))
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));

  const otherIds = [
    ...new Set(
      previews.flatMap((row) =>
        row.members.map((member) => member.user_id).filter((id) => id !== userId),
      ),
    ),
  ];
  const profiles = await fetchPublicProfilesByIds(otherIds);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return previews.map((row) => {
    const people = row.members
      .map((member) => member.user_id)
      .filter((id) => id !== userId)
      .map((id) => profileById.get(id))
      .filter((profile): profile is PublicProfile => Boolean(profile));
    const peerId = otherConversationUserId(row.members, userId);
    return {
      ...row,
      people,
      peer: peerId ? profileById.get(peerId) ?? people[0] ?? null : people[0] ?? null,
    };
  });
}

export async function fetchConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationPreview | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_COLUMNS)
    .eq('id', conversationId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throwIfError(error);
  }
  if (!data) {
    return null;
  }
  const conversation = data as Conversation;
  const { data: members, error: memberError } = await supabase
    .from('conversation_members')
    .select(CONVERSATION_MEMBER_COLUMNS)
    .eq('conversation_id', conversationId);
  if (memberError) {
    if (isMissingRelationError(memberError)) {
      return null;
    }
    throwIfError(memberError);
  }
  const memberRows = (members ?? []) as ConversationMember[];
  const membership = memberRows.find((row) => row.user_id === userId);
  if (!membership) {
    return null;
  }
  const otherIds = memberRows.map((row) => row.user_id).filter((id) => id !== userId);
  const profiles = otherIds.length > 0 ? await fetchPublicProfilesByIds(otherIds) : [];
  const { data: lastRows, error: lastError } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (lastError && !isMissingRelationError(lastError)) {
    throwIfError(lastError);
  }
  const lastMessage = ((lastRows ?? [])[0] as Message | undefined) ?? null;
  return {
    ...conversation,
    membership,
    members: memberRows,
    last_message: lastMessage,
    unread: conversationHasUnread(membership, lastMessage, userId),
    peer: profiles[0] ?? null,
    people: profiles,
  };
}

export async function fetchMessages(
  conversationId: string,
  limit = 80,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throwIfError(error);
  }
  return (data ?? []) as Message[];
}

export async function sendMessage(senderId: string, input: SendMessageInput): Promise<Message> {
  const body = input.body?.trim() || null;
  const mediaUrl = input.media_url?.trim() || null;
  if (!body && !mediaUrl) {
    throw new Error('Write a message, or attach something first.');
  }
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: input.conversation_id,
      sender_id: senderId,
      body,
      media_url: mediaUrl,
    })
    .select(MESSAGE_COLUMNS)
    .single();
  throwDmOpen(error);
  const now = new Date().toISOString();
  await supabase
    .from('conversations')
    .update({ updated_at: now })
    .eq('id', input.conversation_id);
  await supabase
    .from('conversation_members')
    .update({ last_read_at: now })
    .eq('conversation_id', input.conversation_id)
    .eq('user_id', senderId);
  return data as Message;
}

export async function markConversationRead(userId: string, conversationId: string): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
  if (error && isMissingRelationError(error)) {
    return;
  }
  throwIfError(error);
}

function throwDmOpen(error: unknown) {
  if (error) {
    throw new Error(getDmOpenMessage(error));
  }
}

export async function fetchBlockedPeerIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id, status')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .eq('status', 'blocked');
  if (error) {
    if (isMissingRelationError(error)) {
      return new Set();
    }
    throwIfError(error);
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const other = row.user_a_id === userId ? row.user_b_id : row.user_a_id;
    if (other) {
      ids.add(other);
    }
  }
  return ids;
}

export async function getOrCreateDirectConversation(
  userId: string,
  otherUserId: string,
): Promise<Conversation> {
  if (userId === otherUserId) {
    throw new Error(DM_SELF_COPY);
  }

  const snapshot = await fetchFriendshipSnapshot(userId, otherUserId);
  if (snapshot.status === 'blocked') {
    throw new Error(DM_BLOCKED_COPY);
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'get_or_create_direct_conversation',
    { p_other_user_id: otherUserId },
  );
  const rpcRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as Conversation | null;
  if (!rpcError && rpcRow?.id) {
    return rpcRow;
  }
  if (rpcError && !isMissingRelationError(rpcError)) {
    throwDmOpen(rpcError);
  }

  const { data: mine, error: mineError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', userId);
  throwDmOpen(mineError);
  const myIds = (mine ?? []).map((row) => row.conversation_id);

  if (myIds.length > 0) {
    const { data: shared, error: sharedError } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', otherUserId)
      .in('conversation_id', myIds);
    throwDmOpen(sharedError);
    const sharedIds = [...new Set((shared ?? []).map((row) => row.conversation_id))];
    if (sharedIds.length > 0) {
      const { data: existing, error: existingError } = await supabase
        .from('conversations')
        .select(CONVERSATION_COLUMNS)
        .in('id', sharedIds)
        .eq('is_group', false)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      throwDmOpen(existingError);
      if (existing) {
        return existing as Conversation;
      }
    }
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ is_group: false, challenge_id: null })
    .select(CONVERSATION_COLUMNS)
    .single();
  throwDmOpen(createError);
  const conversation = created as Conversation;
  const { error: selfError } = await supabase.from('conversation_members').insert({
    conversation_id: conversation.id,
    user_id: userId,
  });
  throwDmOpen(selfError);
  const { error: otherError } = await supabase.from('conversation_members').insert({
    conversation_id: conversation.id,
    user_id: otherUserId,
  });
  throwDmOpen(otherError);
  return conversation;
}

export async function createGroupConversation(memberIds: string[]): Promise<Conversation> {
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (ids.length < 2) {
    throw new Error('Pick at least two friends for a group.');
  }
  const { data, error } = await supabase.rpc('create_group_conversation', {
    p_member_ids: ids,
  });
  if (error) {
    throwIfError(error);
  }
  const row = (Array.isArray(data) ? data[0] : data) as Conversation | null;
  if (!row?.id) {
    throw new Error('Couldn’t start that group chat.');
  }
  return row;
}

export async function fetchStoryReactions(storyId: string): Promise<StoryReaction[]> {
  const { data, error } = await supabase
    .from('story_reactions')
    .select(STORY_REACTION_COLUMNS)
    .eq('story_id', storyId);
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throwIfError(error);
  }
  return (data ?? []) as StoryReaction[];
}

export async function fetchStoryComments(storyId: string): Promise<StoryComment[]> {
  const { data, error } = await supabase
    .from('story_comments')
    .select(STORY_COMMENT_COLUMNS)
    .eq('story_id', storyId)
    .order('created_at', { ascending: true })
    .limit(80);
  if (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throwIfError(error);
  }
  return (data ?? []) as StoryComment[];
}

export async function toggleStoryReaction(
  userId: string,
  storyId: string,
  type: StoryReactionType,
): Promise<void> {
  const existing = await supabase
    .from('story_reactions')
    .select('id')
    .eq('story_id', storyId)
    .eq('user_id', userId)
    .eq('reaction_type', type)
    .maybeSingle();
  if (existing.data?.id) {
    const { error } = await supabase.from('story_reactions').delete().eq('id', existing.data.id);
    throwIfError(error);
    return;
  }
  const { error } = await supabase.from('story_reactions').insert({
    story_id: storyId,
    user_id: userId,
    reaction_type: type,
  });
  throwIfError(error);
}

export async function createStoryComment(
  userId: string,
  storyId: string,
  body: string,
): Promise<StoryComment> {
  const text = body.trim();
  if (!text) {
    throw new Error('Write a comment first.');
  }
  const { data, error } = await supabase
    .from('story_comments')
    .insert({ story_id: storyId, user_id: userId, body: text })
    .select(STORY_COMMENT_COLUMNS)
    .single();
  throwIfError(error);
  return data as StoryComment;
}

export async function notifyStoryShared(storyId: string, recipientId: string): Promise<void> {
  const { error } = await supabase.rpc('notify_story_shared', {
    p_story_id: storyId,
    p_recipient_id: recipientId,
  });
  if (error && !isMissingRelationError(error)) {
    throwIfError(error);
  }
}
