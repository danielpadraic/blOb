import {
  fetchDiscoverChallenges,
  fetchHostingChallenges,
  fetchJoinedLobbyChallenges,
} from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { copy, type CopyTone } from '@/lib/copy';
import { isPrivateCorporate } from '@/lib/privacyMode';
import { circleDetailHref } from '@/lib/routes';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { Challenge, PublicProfile } from '@/lib/types';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

export const CIRCLE_PIN_CAP = 5;
export const CIRCLE_PIN_CAP_COPY = 'You can pin up to 5.';
export const CIRCLE_CORPORATE_BLOCK = 'Keep this in the company challenge.';

export const CIRCLE_ROLES = ['host', 'member'] as const;
export type CircleRole = (typeof CIRCLE_ROLES)[number];

export const CIRCLE_INVITE_STATUSES = ['pending', 'accepted', 'declined'] as const;
export type CircleInviteStatus = (typeof CIRCLE_INVITE_STATUSES)[number];

export const CIRCLE_VISIBILITIES = ['friends', 'friends_of_friends', 'public'] as const;
export type CircleVisibility = (typeof CIRCLE_VISIBILITIES)[number];

export type CircleRow = {
  id: string;
  created_by: string;
  name: string;
  focus: string;
  description: string | null;
  banner_url: string | null;
  visibility: CircleVisibility;
  created_at: string;
  updated_at: string;
};

export type CircleMemberRow = {
  circle_id: string;
  user_id: string;
  role: CircleRole;
  joined_at: string;
  profile?: PublicProfile | null;
};

export type CircleInviteRow = {
  id: string;
  circle_id: string;
  inviter_id: string;
  invitee_id: string;
  status: CircleInviteStatus;
  channel: 'feed' | 'dm' | 'push';
  created_at: string;
};

export type CircleCardModel = CircleRow & {
  member_count: number;
  my_role: CircleRole | null;
  preview_members: PublicProfile[];
};

export type CirclePageModel = CircleRow & {
  member_count: number;
  my_role: CircleRole | null;
  pending_invite: boolean;
  can_join: boolean;
  host: PublicProfile | null;
};

export type CirclePin = {
  circle_id: string;
  challenge_id: string;
  pinned_by: string;
  sort_index: number;
  pinned_at: string;
  title: string;
  cover_image_url: string | null;
  status: string;
  created_by: string | null;
  visibility: string | null;
  prize_pool: number | null;
  buy_in_amount: number | null;
  currency: string | null;
  is_official: boolean | null;
  starts_at: string | null;
  timezone: string | null;
};

const CIRCLE_COLUMNS =
  'id, created_by, name, focus, description, banner_url, visibility, created_at, updated_at';

export function asCircleRole(value: unknown): CircleRole | null {
  return value === 'host' || value === 'member' ? value : null;
}

export function asCircleVisibility(value: unknown): CircleVisibility {
  return value === 'friends_of_friends' || value === 'public' ? value : 'friends';
}

export function circleDisplayName(circle?: { name?: string | null } | null): string {
  return circle?.name?.trim() || 'this Circle';
}

/** Keep the line after the actor name at or under 100 characters. */
export function clipAfterName(name: string, rest: string, max = 100): string {
  const actor = name.trim() || 'Someone';
  const tail = rest.length > max ? `${rest.slice(0, Math.max(0, max - 1)).trimEnd()}…` : rest;
  return `${actor}${tail}`;
}

export function circleInvitePushCopy(name: string, circleName: string, tone: CopyTone = 'gentle'): string {
  const circle = circleDisplayName({ name: circleName });
  const rest = copy('circles.invitePush', tone, { name: '', circle }).replace(/^\s*/, ' ');
  return clipAfterName(name, rest.startsWith(' ') ? rest : ` ${rest}`);
}

export function circleJoinedNotifyCopy(name: string, circleName: string, tone: CopyTone = 'gentle'): string {
  const circle = circleDisplayName({ name: circleName });
  const rest = ` joined ${circle}.`;
  return clipAfterName(name, rest);
}

export function lastHostLeaveCopy(tone: CopyTone = 'neutral'): string {
  return copy('circles.lastHost', tone);
}

export function postHasCircleOrigin(post: { circle_id?: string | null; challenge_id?: string | null }): boolean {
  return Boolean(String(post.circle_id ?? '').trim()) && !String(post.challenge_id ?? '').trim();
}

export function circleIdFromPost(post: { circle_id?: string | null }): string | null {
  const id = String(post.circle_id ?? '').trim();
  return id || null;
}

export function challengeIdFromPost(post: { challenge_id?: string | null }): string | null {
  const id = String(post.challenge_id ?? '').trim();
  return id || null;
}

/** Origin links use this row only. Never a last-open snapshot. */
export function circleHrefFromPost(post: { circle_id?: string | null }) {
  const id = circleIdFromPost(post);
  return id ? circleDetailHref(id) : null;
}

export function circleNotificationPath(
  type: string,
  circleId?: string | null,
  postId?: string | null,
): string | null {
  const id = String(circleId ?? '').trim();
  if (!id) {
    return null;
  }
  if (type === 'circle_invite') {
    return `/circles/${id}?tab=details`;
  }
  if (type === 'circle_post' || type === 'circle_challenge_share') {
    const post = String(postId ?? '').trim();
    return post ? `/circles/${id}?tab=feed&postId=${post}` : `/circles/${id}?tab=feed`;
  }
  if (type === 'circle_invite_accepted' || type === 'circle_join') {
    return `/circles/${id}`;
  }
  return null;
}

export function isCircleJoinPost(post: { type?: string | null }): boolean {
  return post.type === 'circle_join';
}

export function isCircleInvitePost(post: { type?: string | null }): boolean {
  return post.type === 'circle_invite';
}

export function isCircleChallengeShare(post: { type?: string | null }): boolean {
  return post.type === 'circle_challenge_share';
}

export function circleShareNotifyCopy(
  name: string,
  challengeName: string,
  circleName: string,
): string {
  const challenge = challengeName.trim() || 'a challenge';
  const circle = circleDisplayName({ name: circleName });
  return clipAfterName(name, ` shared ${challenge} in ${circle}.`);
}

export function circleCorporateBlockCopy(): string {
  return CIRCLE_CORPORATE_BLOCK;
}

export function circlePinCapCopy(): string {
  return CIRCLE_PIN_CAP_COPY;
}

/** Home: members always. Friends visibility stays members-only. FoF / public widen. */
export function viewerCanSeeHomeCirclePost(input: {
  circleId?: string | null;
  type?: string | null;
  hiddenFromHome?: boolean | null;
  visibility?: CircleVisibility | string | null;
  authorId: string;
  viewerId: string;
  viewerIsMember: boolean;
  friendsWithAuthor: boolean;
  friendsOfFriendsWithAuthor?: boolean;
}): boolean {
  if (!String(input.circleId ?? '').trim()) {
    return true;
  }
  if (input.hiddenFromHome) {
    return false;
  }
  if (input.type === 'circle_invite') {
    return input.authorId === input.viewerId || input.friendsWithAuthor;
  }
  if (input.viewerIsMember || input.authorId === input.viewerId) {
    return true;
  }
  const visibility = asCircleVisibility(input.visibility);
  if (visibility === 'public') {
    return true;
  }
  if (visibility === 'friends_of_friends') {
    return input.friendsWithAuthor || Boolean(input.friendsOfFriendsWithAuthor);
  }
  return false;
}

/** Viewer and author share at least one accepted friend (not each other). */
export function sharesAcceptedFriend(input: {
  viewerId?: string | null;
  authorId?: string | null;
  viewerFriendIds: Iterable<string>;
  authorFriendIds: Iterable<string>;
}): boolean {
  const viewerId = String(input.viewerId ?? '').trim();
  const authorId = String(input.authorId ?? '').trim();
  if (!viewerId || !authorId || viewerId === authorId) {
    return false;
  }
  const viewerFriends = new Set(input.viewerFriendIds);
  viewerFriends.delete(viewerId);
  viewerFriends.delete(authorId);
  for (const id of input.authorFriendIds) {
    if (id && id !== viewerId && id !== authorId && viewerFriends.has(id)) {
      return true;
    }
  }
  return false;
}

/** Authors who share an accepted friend with the viewer. Soft-fails to none. */
export async function fetchAuthorsSharingAcceptedFriend(
  viewerId: string,
  viewerFriendIds: Set<string>,
  authorIds: string[],
): Promise<Set<string>> {
  const shared = new Set<string>();
  const candidates = [...new Set(authorIds.filter((id) => id && id !== viewerId && !viewerFriendIds.has(id)))];
  if (!viewerId || viewerFriendIds.size === 0 || candidates.length === 0) {
    return shared;
  }
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id')
    .eq('status', 'accepted')
    .or(`user_a_id.in.(${candidates.join(',')}),user_b_id.in.(${candidates.join(',')})`);
  if (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:feed] circle FoF lookup skipped', error.message);
    }
    return shared;
  }
  const authorFriends = new Map<string, Set<string>>();
  for (const id of candidates) {
    authorFriends.set(id, new Set());
  }
  for (const row of (data ?? []) as { user_a_id: string; user_b_id: string }[]) {
    if (candidates.includes(row.user_a_id)) {
      authorFriends.get(row.user_a_id)?.add(row.user_b_id);
    }
    if (candidates.includes(row.user_b_id)) {
      authorFriends.get(row.user_b_id)?.add(row.user_a_id);
    }
  }
  for (const [authorId, friends] of authorFriends) {
    if (sharesAcceptedFriend({ viewerId, authorId, viewerFriendIds, authorFriendIds: friends })) {
      shared.add(authorId);
    }
  }
  return shared;
}

function asCircle(row: CircleRow): CircleRow {
  return {
    ...row,
    name: row.name?.trim() || 'Circle',
    focus: row.focus?.trim() || '',
    description: row.description?.trim() || null,
    banner_url: row.banner_url || null,
    visibility: asCircleVisibility(row.visibility),
  };
}

export async function fetchMyCircles(userId: string): Promise<CircleCardModel[]> {
  const { data: memberships, error } = await supabase
    .from('circle_members')
    .select('circle_id, role')
    .eq('user_id', userId);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const ids = [...new Set((memberships ?? []).map((row) => row.circle_id).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const roleByCircle = new Map(
    (memberships ?? []).map((row) => [row.circle_id, asCircleRole(row.role)]),
  );
  const { data: circles, error: circleError } = await supabase
    .from('circles')
    .select(CIRCLE_COLUMNS)
    .in('id', ids)
    .order('updated_at', { ascending: false });
  if (circleError) {
    throw new Error(getErrorMessage(circleError));
  }
  const { data: memberRows, error: memberError } = await supabase
    .from('circle_members')
    .select('circle_id, user_id, role, joined_at')
    .in('circle_id', ids)
    .order('joined_at', { ascending: true });
  if (memberError) {
    throw new Error(getErrorMessage(memberError));
  }
  const peopleIds = [...new Set((memberRows ?? []).map((row) => row.user_id))];
  const profiles = peopleIds.length > 0 ? await fetchPublicProfilesByIds(peopleIds) : [];
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const membersByCircle = new Map<string, CircleMemberRow[]>();
  for (const row of memberRows ?? []) {
    const list = membersByCircle.get(row.circle_id) ?? [];
    list.push({
      circle_id: row.circle_id,
      user_id: row.user_id,
      role: asCircleRole(row.role) ?? 'member',
      joined_at: row.joined_at,
      profile: byId.get(row.user_id) ?? null,
    });
    membersByCircle.set(row.circle_id, list);
  }
  return ((circles ?? []) as CircleRow[]).map((row) => {
    const members = membersByCircle.get(row.id) ?? [];
    const hosts = members.filter((member) => member.role === 'host');
    const rest = members.filter((member) => member.role !== 'host');
    const ordered = [...hosts, ...rest];
    return {
      ...asCircle(row),
      member_count: members.length,
      my_role: roleByCircle.get(row.id) ?? null,
      preview_members: ordered
        .map((member) => member.profile)
        .filter((profile): profile is PublicProfile => Boolean(profile))
        .slice(0, 3),
    };
  });
}

export async function fetchCirclePage(circleId: string, userId?: string): Promise<CirclePageModel | null> {
  const { data, error } = await supabase.from('circles').select(CIRCLE_COLUMNS).eq('id', circleId).maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data) {
    return null;
  }
  const circle = asCircle(data as CircleRow);
  const [countResult, membership, invite, host] = await Promise.all([
    supabase.rpc('circle_member_count', { p_circle_id: circleId }),
    userId
      ? supabase.from('circle_members').select('role').eq('circle_id', circleId).eq('user_id', userId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? supabase
          .from('circle_invites')
          .select('id')
          .eq('circle_id', circleId)
          .eq('invitee_id', userId)
          .eq('status', 'pending')
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchPublicProfilesByIds([circle.created_by]),
  ]);
  if (countResult.error) {
    throw new Error(getErrorMessage(countResult.error));
  }
  const myRole = asCircleRole((membership.data as { role?: string } | null)?.role);
  const pendingInvite = Boolean(invite.data);
  let canJoin = pendingInvite && !myRole;
  if (!canJoin && !myRole && userId) {
    const join = await supabase.rpc('can_join_circle', { p_circle_id: circleId, p_user_id: userId });
    canJoin = Boolean(join.data) && !join.error;
  }
  return {
    ...circle,
    member_count: Number(countResult.data) || 0,
    my_role: myRole,
    pending_invite: pendingInvite,
    can_join: canJoin,
    host: host[0] ?? null,
  };
}

export async function fetchCircleMembers(circleId: string): Promise<CircleMemberRow[]> {
  const { data, error } = await supabase
    .from('circle_members')
    .select('circle_id, user_id, role, joined_at')
    .eq('circle_id', circleId);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const rows = (data ?? []) as Omit<CircleMemberRow, 'profile'>[];
  const profiles = await fetchPublicProfilesByIds(rows.map((row) => row.user_id));
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return rows
    .map((row) => ({
      ...row,
      role: asCircleRole(row.role) ?? 'member',
      profile: byId.get(row.user_id) ?? null,
    }))
    .sort((a, b) => {
      if (a.role === b.role) {
        return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime();
      }
      return a.role === 'host' ? -1 : 1;
    });
}

export type MentionCircleHit = {
  id: string;
  name: string;
  focus: string;
  visibility: CircleVisibility;
};

export async function searchMentionCircles(query: string, userId: string): Promise<MentionCircleHit[]> {
  const needle = query.trim().replace(/^@/, '');
  if (needle.length < 2) {
    return [];
  }
  const safe = needle.replace(/[%_,]/g, '').slice(0, 40);
  if (!safe) {
    return [];
  }
  const [circles, memberships, invites] = await Promise.all([
    supabase
      .from('circles')
      .select('id, name, focus, visibility')
      .or(`name.ilike.%${safe}%,focus.ilike.%${safe}%`)
      .limit(12),
    supabase.from('circle_members').select('circle_id').eq('user_id', userId),
    supabase
      .from('circle_invites')
      .select('circle_id')
      .eq('invitee_id', userId)
      .eq('status', 'pending'),
  ]);
  if (circles.error) {
    return [];
  }
  const memberIds = new Set((memberships.data ?? []).map((row) => row.circle_id));
  const invitedIds = new Set((invites.data ?? []).map((row) => row.circle_id));
  return (circles.data ?? [])
    .filter((row) => {
      const visibility = asCircleVisibility(row.visibility);
      return memberIds.has(row.id) || invitedIds.has(row.id) || visibility === 'public';
    })
    .map((row) => ({
      id: row.id,
      name: String(row.name ?? '').trim() || 'Circle',
      focus: String(row.focus ?? '').trim(),
      visibility: asCircleVisibility(row.visibility),
    }));
}

export async function fetchCirclePreviews(
  ids: string[],
): Promise<Map<string, { id: string; name: string; visibility: CircleVisibility }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  try {
    const { data, error } = await supabase.from('circles').select('id, name, visibility').in('id', unique);
    if (error) {
      if (!isMissingRelationError(error)) {
        console.log('[blob:circles] preview skipped', error.message);
      }
      return new Map();
    }
    return new Map(
      (data ?? []).map((row) => [
        row.id,
        {
          id: row.id,
          name: String(row.name ?? '').trim() || 'Circle',
          visibility: asCircleVisibility(row.visibility),
        },
      ]),
    );
  } catch (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:circles] preview skipped', getErrorMessage(error));
    }
    return new Map();
  }
}

export async function createCircle(input: {
  name: string;
  focus: string;
  description?: string;
  bannerUrl?: string | null;
  visibility?: CircleVisibility;
}): Promise<CircleRow> {
  const { data, error } = await supabase.rpc('create_circle', {
    p_name: input.name.trim(),
    p_focus: input.focus.trim(),
    p_description: input.description?.trim() || null,
    p_banner_url: input.bannerUrl?.trim() || null,
    p_visibility: asCircleVisibility(input.visibility),
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = (Array.isArray(data) ? data[0] : data) as CircleRow | null;
  if (!row?.id) {
    throw new Error('Couldn’t create that Circle.');
  }
  return asCircle(row);
}

export async function updateCircleVisibility(
  circleId: string,
  visibility: CircleVisibility,
): Promise<void> {
  const { error } = await supabase
    .from('circles')
    .update({ visibility: asCircleVisibility(visibility) })
    .eq('id', circleId);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function inviteToCircle(input: {
  circleId: string;
  inviteeIds: string[];
  postToFeed?: boolean;
}): Promise<number> {
  const { data, error } = await supabase.rpc('invite_to_circle', {
    p_circle_id: input.circleId,
    p_invitee_ids: input.inviteeIds,
    p_post_to_feed: Boolean(input.postToFeed),
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return Number(data) || 0;
}

export async function acceptCircleInvite(circleId: string): Promise<void> {
  const { error } = await supabase.rpc('accept_circle_invite', { p_circle_id: circleId });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function declineCircleInvite(circleId: string): Promise<void> {
  const { error } = await supabase.rpc('decline_circle_invite', { p_circle_id: circleId });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function leaveCircle(circleId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_circle', { p_circle_id: circleId });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export async function removeCircleMember(circleId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_circle_member', {
    p_circle_id: circleId,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

function mapCircleRpcError(error: unknown): Error {
  const message = getErrorMessage(error);
  if (/pin up to 5/i.test(message)) {
    return new Error(CIRCLE_PIN_CAP_COPY);
  }
  if (/company challenge/i.test(message)) {
    return new Error(CIRCLE_CORPORATE_BLOCK);
  }
  return new Error(message);
}

export async function fetchCirclePins(circleId: string): Promise<CirclePin[]> {
  const { data, error } = await supabase.rpc('list_circle_pins', { p_circle_id: circleId });
  if (error) {
    throw mapCircleRpcError(error);
  }
  return (data ?? []).map((row) => ({
    circle_id: row.circle_id,
    challenge_id: row.challenge_id,
    pinned_by: row.pinned_by,
    sort_index: Number(row.sort_index) || 0,
    pinned_at: row.pinned_at,
    title: challengeDisplayTitle({ title: row.title }),
    cover_image_url: row.cover_image_url,
    status: row.status ?? 'open',
    created_by: row.created_by,
    visibility: row.visibility,
    prize_pool: row.prize_pool == null ? null : Number(row.prize_pool),
    buy_in_amount: row.buy_in_amount == null ? null : Number(row.buy_in_amount),
    currency: row.currency,
    is_official: row.is_official,
    starts_at: row.starts_at,
    timezone: row.timezone,
  }));
}

export async function fetchCirclePinCandidates(userId: string): Promise<Challenge[]> {
  const [hosting, joined, discover] = await Promise.all([
    fetchHostingChallenges(userId),
    fetchJoinedLobbyChallenges(userId),
    fetchDiscoverChallenges(userId),
  ]);
  const seen = new Set<string>();
  const rows: Challenge[] = [];
  for (const row of [...hosting, ...joined, ...discover]) {
    if (!row?.id || seen.has(row.id) || isPrivateCorporate(row)) {
      continue;
    }
    seen.add(row.id);
    rows.push(row);
  }
  return rows;
}

export async function pinChallengeToCircle(circleId: string, challengeId: string): Promise<void> {
  const { error } = await supabase.rpc('pin_challenge_to_circle', {
    p_circle_id: circleId,
    p_challenge_id: challengeId,
  });
  if (error) {
    throw mapCircleRpcError(error);
  }
}

export async function unpinCircleChallenge(circleId: string, challengeId: string): Promise<void> {
  const { error } = await supabase.rpc('unpin_circle_challenge', {
    p_circle_id: circleId,
    p_challenge_id: challengeId,
  });
  if (error) {
    throw mapCircleRpcError(error);
  }
}

export async function reorderCirclePins(circleId: string, challengeIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_circle_pins', {
    p_circle_id: circleId,
    p_challenge_ids: challengeIds,
  });
  if (error) {
    throw mapCircleRpcError(error);
  }
}

export async function shareChallengeToCircle(input: {
  circleId: string;
  challengeId: string;
  caption?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc('share_challenge_to_circle', {
    p_circle_id: input.circleId,
    p_challenge_id: input.challengeId,
    p_caption: input.caption?.trim() || null,
  });
  if (error) {
    throw mapCircleRpcError(error);
  }
  return String(data ?? '');
}
