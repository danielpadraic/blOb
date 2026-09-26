import { isEndedPrizeStatus } from '@/lib/challengePot';
import { isLiveOrUpcoming } from '@/lib/challengeDiscoverability';
import { fetchCompetingChallenges, fetchHostingChallenges } from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { isLobbyEndedChallenge } from '@/lib/lobbyChallenge';
import {
  calloutCardMetaLine,
  calloutPartyFaces,
  fetchCalloutCardParties,
  fetchWatchedCalloutChallenges,
  type CalloutCardParty,
} from '@/lib/callouts';
import { isCheckinPost } from '@/lib/checkinPost';
import { copy } from '@/lib/copy';
import { peekLiveLastRead } from '@/lib/liveLastRead';
import { liveCheckinLabel } from '@/lib/liveThread';
import { formatRelative } from '@/utils/format';
import { isEndedLobbyStatus } from '@/lib/lobbyChallenge';
import { officialCoinKind, type OfficialCoinKind } from '@/lib/officialCoin';
import { namedChallengeHref } from '@/lib/routes';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';

export const PULSE_CAP = 12;
export const PULSE_FACE_CAP = 3;
export const HOME_PULSE_KEY = 'home-pulse';
export const PULSE_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export type PulseFace = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export type PulseLobbyPost = {
  id?: string | null;
  challenge_id?: string | null;
  content?: string | null;
  media_urls?: string[] | null;
  source?: string | null;
  type?: string | null;
  kind?: string | null;
  checkin_id?: string | null;
  checkin_stage?: string | null;
  author?: { id?: string | null } | null;
  author_id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

function pulseAuthorId(post?: PulseLobbyPost | null): string {
  return String(post?.author?.id ?? post?.author_id ?? '').trim();
}

export type PulsePill = {
  id: string;
  title: string;
  snippet: string;
  faces: PulseFace[];
  lastAt: string | null;
  isCallout?: boolean;
  watching?: boolean;
  /** Standing house rooms lead the rail, weekly then monthly. */
  officialCoinKind?: OfficialCoinKind | null;
  /** Card skin: dark house field vs light peer card. */
  isOfficial?: boolean;
  coverUrl?: string | null;
  category?: string | null;
  privacyMode?: string | null;
  /** Room members beyond the faces shown. 0 hides the +N chip. */
  faceOverflow?: number;
  /** Check-ins since this viewer last opened the room's Live thread. */
  newCheckins?: number;
  /** Consistency rooms only: the viewer's own days. */
  progress?: { done: number; target: number } | null;
  /** One real line of activity, or '' when the room is simply live. */
  activityLine?: string;
};

export type PulseChallengeLike = {
  id?: string | null;
  title?: string | null;
  task?: string | null;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  duration_days?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  days_required?: number | null;
  is_unlimited?: boolean | null;
  is_callout?: boolean | null;
  watching?: boolean | null;
  joined?: boolean | null;
  hosting?: boolean | null;
  created_by?: string | null;
  official_kind?: string | null;
  is_official?: boolean | null;
  cover_image_url?: string | null;
  category?: string | null;
  privacy_mode?: string | null;
};

function pulseStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase();
}

/** Ended / Settled / judging never keep a Home Pulse pill. */
export function isPulseEndedStatus(status: string | null | undefined): boolean {
  const value = pulseStatus(status);
  return isEndedLobbyStatus(value) || isEndedPrizeStatus(value);
}

/**
 * Home Pulse membership lock:
 * 1. Joined participant + live/upcoming (product Active)
 * 2. Host + not Ended/Settled (Lobby Ended clock, including live + ends_at in the past)
 * 3. Observer on a Callout via callout_observers, not Ended
 * Never public Active the viewer did not join. Never Ended / settled / cancelled.
 */
export function isPulsePillEligible(row: PulseChallengeLike, viewerId?: string | null): boolean {
  const id = String(row?.id ?? '').trim();
  if (!id || isLobbyEndedChallenge(row) || isPulseEndedStatus(row.status) || !isLiveOrUpcoming(pulseStatus(row.status))) {
    return false;
  }
  const hosting = Boolean(row.hosting) || Boolean(viewerId && String(row.created_by ?? '') === viewerId);
  const joined = Boolean(row.joined);
  const watchingCallout = Boolean(row.watching) && Boolean(row.is_callout);
  return joined || hosting || watchingCallout;
}

/** One pill per challenge. Membership required — live/upcoming alone is not enough. */
export function selectPulseChallenges<T extends PulseChallengeLike>(
  rows: T[],
  viewerId?: string | null,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row?.id ?? '').trim();
    if (!id || seen.has(id) || !isPulsePillEligible(row, viewerId)) {
      continue;
    }
    seen.add(id);
    out.push(row);
  }
  return out;
}

export function pulseSnippet(post?: PulseLobbyPost | null): string {
  if (!post || post.deleted_at || !isCheckinPost(post)) {
    return copy('pulse.noChatter');
  }
  return liveCheckinLabel(post);
}

export function pulseChallengeHref(id: string) {
  return namedChallengeHref(String(id).trim(), { tab: 'live' });
}

/** `Private` on private / corporate rooms. Public peer rooms wear no chip. */
export function pulsePrivacyLabel(privacyMode?: string | null): string {
  const mode = String(privacyMode ?? '').trim().toLowerCase();
  return mode === 'private' || mode === 'private_corporate' ? 'Private' : '';
}

export function sortPulsePills<
  T extends { lastAt: string | null; officialCoinKind?: OfficialCoinKind | null },
>(pills: T[]): T[] {
  return [...pills].sort((a, b) => {
    // The house rooms are home base — they hold the front of the rail whether
    // or not anyone has posted in them today.
    const house = officialCoinPillRank(a.officialCoinKind) - officialCoinPillRank(b.officialCoinKind);
    if (house !== 0) {
      return house;
    }
    const left = a.lastAt ? Date.parse(a.lastAt) : 0;
    const right = b.lastAt ? Date.parse(b.lastAt) : 0;
    const aTime = Number.isFinite(left) ? left : 0;
    const bTime = Number.isFinite(right) ? right : 0;
    return bTime - aTime;
  });
}

function officialCoinPillRank(kind?: OfficialCoinKind | null): number {
  if (kind === 'coin_weekly') {
    return 0;
  }
  if (kind === 'coin_monthly') {
    return 1;
  }
  return 2;
}

export function isOfficialPulsePill(pill: { officialCoinKind?: OfficialCoinKind | null }): boolean {
  return officialCoinPillRank(pill.officialCoinKind) < 2;
}

/** Live / check-in / honor chatter on this pill is younger than 7 days. */
export function isPulseRecent(lastAt: string | null | undefined, now = Date.now()): boolean {
  const at = Date.parse(String(lastAt ?? ''));
  return Number.isFinite(at) && now - at < PULSE_RECENT_MS;
}

export function partitionPulsePills<T extends { lastAt: string | null; officialCoinKind?: OfficialCoinKind | null }>(
  pills: T[],
  now = Date.now(),
): { visible: T[]; aged: T[] } {
  const sorted = sortPulsePills(pills);
  const visible: T[] = [];
  const aged: T[] = [];
  for (const pill of sorted) {
    if (isOfficialPulsePill(pill) || isPulseRecent(pill.lastAt, now)) {
      visible.push(pill);
    } else {
      aged.push(pill);
    }
  }
  return {
    visible: visible.slice(0, PULSE_CAP),
    aged,
  };
}

type PulseProfile = Pick<PublicProfile, 'id' | 'display_name' | 'username' | 'avatar_url'>;

export function collectPulseFaces(
  posts: PulseLobbyPost[],
  challengeId: string,
  profiles: Map<string, PulseProfile>,
): PulseFace[] {
  const seen = new Set<string>();
  const faces: PulseFace[] = [];
  for (const post of posts) {
    if (String(post.challenge_id ?? '') !== challengeId || post.deleted_at) {
      continue;
    }
    const authorId = pulseAuthorId(post);
    if (!authorId || seen.has(authorId)) {
      continue;
    }
    seen.add(authorId);
    const profile = profiles.get(authorId);
    faces.push({
      id: authorId,
      name: personDisplayName(profile),
      avatarUrl: profile?.avatar_url ?? null,
    });
    if (faces.length >= PULSE_FACE_CAP) {
      break;
    }
  }
  return faces;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Distinct authors who posted in this room, from the window we fetched. */
function authorCount(posts: PulseLobbyPost[], challengeId: string): number {
  const seen = new Set<string>();
  for (const post of posts) {
    if (String(post.challenge_id ?? '') !== challengeId || post.deleted_at) {
      continue;
    }
    const authorId = pulseAuthorId(post);
    if (authorId) {
      seen.add(authorId);
    }
  }
  return seen.size;
}

/**
 * Check-ins the viewer has not seen. Falls back to the last day when they have
 * never opened the room, so a brand-new member is never told "52 new".
 */
export function countNewCheckins(
  posts: PulseLobbyPost[],
  challengeId: string,
  lastReadAt?: string | null,
  now = Date.now(),
): number {
  const read = Date.parse(String(lastReadAt ?? ''));
  const since = Number.isFinite(read) ? read : now - DAY_MS;
  let count = 0;
  for (const post of posts) {
    if (String(post.challenge_id ?? '') !== challengeId || post.deleted_at || !isCheckinPost(post)) {
      continue;
    }
    const at = Date.parse(String(post.created_at ?? ''));
    if (Number.isFinite(at) && at > since) {
      count += 1;
    }
  }
  return count;
}

/** The one real line under a peer card. Empty means the card just says Live now. */
export function pulseActivityLine(input: {
  latestCheckin?: PulseLobbyPost | null;
  latestPost?: PulseLobbyPost | null;
  authorName?: string;
  progress?: { done: number; target: number } | null;
  relative?: (at: string) => string;
}): string {
  const name = String(input.authorName ?? '').trim();
  const at = String(input.latestCheckin?.created_at ?? '').trim();
  if (name && at && input.relative) {
    return `${name} checked in ${input.relative(at)}`;
  }
  if (input.progress && input.progress.target > 0) {
    return `${input.progress.done}/${input.progress.target} days`;
  }
  return '';
}

export function buildPulsePills(input: {
  challenges: PulseChallengeLike[];
  posts: PulseLobbyPost[];
  profiles?: PulseProfile[];
  calloutParties?: Map<string, CalloutCardParty> | CalloutCardParty[];
  viewerId?: string | null;
  /** challenge_id -> members, so +N means people in the room. */
  memberCounts?: Record<string, number>;
  /** challenge_id -> the viewer's Live read cursor. */
  lastReadAt?: Record<string, string | null>;
  /** challenge_id -> the viewer's consistency progress. */
  progress?: Record<string, { done: number; target: number }>;
  relative?: (at: string) => string;
  now?: number;
}): PulsePill[] {
  const challenges = selectPulseChallenges(input.challenges, input.viewerId);
  const newestFirst = [...input.posts]
    .filter((post) => Boolean(post?.challenge_id) && !post.deleted_at)
    .sort((a, b) => {
      const left = Date.parse(a.created_at ?? '') || 0;
      const right = Date.parse(b.created_at ?? '') || 0;
      return right - left;
    });
  const latestByChallenge = new Map<string, PulseLobbyPost>();
  const latestCheckinByChallenge = new Map<string, PulseLobbyPost>();
  for (const post of newestFirst) {
    const id = String(post.challenge_id ?? '');
    if (!latestByChallenge.has(id)) {
      latestByChallenge.set(id, post);
    }
    if (isCheckinPost(post) && !latestCheckinByChallenge.has(id)) {
      latestCheckinByChallenge.set(id, post);
    }
  }
  const profiles = new Map((input.profiles ?? []).filter((row) => row?.id).map((row) => [row.id, row]));
  const parties =
    input.calloutParties instanceof Map
      ? input.calloutParties
      : new Map((input.calloutParties ?? []).map((row) => [row.challengeId, row]));
  const pills = challenges.map((row) => {
    const id = String(row.id);
    const latest = latestByChallenge.get(id) ?? null;
    const latestCheckin = latestCheckinByChallenge.get(id) ?? null;
    const isCallout = Boolean(row.is_callout);
    const party = isCallout ? parties.get(id) ?? null : null;
    const fighterFaces = calloutPartyFaces(party);
    const calloutLine = isCallout ? calloutCardMetaLine(party, input.viewerId) : '';
    const faces =
      isCallout && fighterFaces.length > 0
        ? fighterFaces
        : collectPulseFaces(newestFirst, id, profiles);
    // Room size when we have it, else the people we actually saw post.
    const members = Math.max(
      input.memberCounts?.[id] ?? authorCount(newestFirst, id),
      0,
    );
    const progress = input.progress?.[id] ?? null;
    const latestCheckinAuthor = latestCheckin ? pulseAuthorId(latestCheckin) : '';
    const latestCheckinName = latestCheckinAuthor
      ? personDisplayName(profiles.get(latestCheckinAuthor))
      : '';
    return {
      id,
      title: challengeDisplayTitle(row) || 'Challenge',
      snippet: isCallout
        ? calloutLine || (row.watching ? 'Watching' : pulseSnippet(latestCheckin))
        : latestCheckin
          ? pulseSnippet(latestCheckin)
          : row.watching
            ? 'Watching'
            : pulseSnippet(null),
      faces,
      lastAt: latest?.created_at ?? latestCheckin?.created_at ?? null,
      isCallout,
      watching: Boolean(row.watching),
      officialCoinKind: officialCoinKind(row),
      isOfficial: Boolean(row.is_official) || officialCoinKind(row) != null,
      coverUrl: String(row.cover_image_url ?? '').trim() || null,
      category: row.category ?? null,
      privacyMode: row.privacy_mode ?? null,
      faceOverflow: Math.max(members - faces.length, 0),
      newCheckins: countNewCheckins(newestFirst, id, input.lastReadAt?.[id], input.now),
      progress,
      activityLine: isCallout
        ? calloutLine
        : pulseActivityLine({
            latestCheckin,
            latestPost: latest,
            authorName: profiles.has(latestCheckinAuthor) ? latestCheckinName : '',
            progress,
            relative: input.relative,
          }),
    };
  });
  return sortPulsePills(pills);
}

async function fetchPulseLobbyPosts(challengeIds: string[]): Promise<PulseLobbyPost[]> {
  const ids = [...new Set(challengeIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const limit = Math.min(Math.max(ids.length * 8, 24), 120);
  const full = await supabase
    .from('posts')
    .select(
      'id, challenge_id, content, media_urls, source, type, checkin_id, checkin_stage, author_id, created_at, deleted_at',
    )
    .in('challenge_id', ids)
    .in('source', ['challenge', 'checkin'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (!full.error) {
    return (full.data ?? []) as PulseLobbyPost[];
  }
  // Isolate like stories.sequence_id: a missing column must not empty Home.
  const slim = await supabase
    .from('posts')
    .select('id, challenge_id, content, author_id, created_at')
    .in('challenge_id', ids)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (slim.error) {
    throw slim.error;
  }
  return (slim.data ?? []) as PulseLobbyPost[];
}

/** Joined live/upcoming ∪ non-ended hosting ∪ observer Callout. Never public Active. Never Ended. */
export async function fetchHomePulsePills(userId?: string): Promise<PulsePill[]> {
  if (!userId) {
    return [];
  }
  let challenges: PulseChallengeLike[] = [];
  try {
    const [joined, hosted] = await Promise.all([
      fetchCompetingChallenges(userId),
      fetchHostingChallenges(userId),
    ]);
    challenges = selectPulseChallenges(
      [
        ...joined.map((row) => ({ ...row, joined: true, hosting: String(row.created_by ?? '') === userId })),
        ...hosted.map((row) => ({ ...row, hosting: true, joined: false })),
      ],
      userId,
    );
  } catch {
    return [];
  }
  try {
    // Observer Callout pills read callout_observers. No extra table.
    const watched = selectPulseChallenges(
      (await fetchWatchedCalloutChallenges(userId)).map((row) => ({
        ...row,
        watching: true,
        is_callout: true,
      })),
      userId,
    );
    const seen = new Set(challenges.map((row) => String(row.id)));
    for (const row of watched) {
      const id = String(row.id ?? '').trim();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      challenges.push(row);
    }
  } catch {
    // Fighters keep their pills if the watch list fails.
  }
  if (challenges.length === 0) {
    return [];
  }
  let posts: PulseLobbyPost[] = [];
  try {
    posts = await fetchPulseLobbyPosts(
      challenges.map((row) => String(row.id ?? '').trim()).filter(Boolean),
    );
  } catch {
    posts = [];
  }
  const allowed = new Set(challenges.map((row) => row.id));
  const authorIds: string[] = [];
  const seenAuthors = new Set<string>();
  const facesPerChallenge = new Map<string, number>();
  for (const post of posts) {
    const challengeId = String(post.challenge_id ?? '');
    const authorId = pulseAuthorId(post);
    if (!allowed.has(challengeId) || !authorId || seenAuthors.has(`${challengeId}:${authorId}`)) {
      continue;
    }
    const count = facesPerChallenge.get(challengeId) ?? 0;
    if (count >= PULSE_FACE_CAP) {
      continue;
    }
    seenAuthors.add(`${challengeId}:${authorId}`);
    facesPerChallenge.set(challengeId, count + 1);
    authorIds.push(authorId);
  }
  let profiles: PublicProfile[] = [];
  try {
    profiles = authorIds.length > 0 ? await fetchPublicProfilesByIds(authorIds) : [];
  } catch {
    profiles = [];
  }
  let calloutParties = new Map<string, CalloutCardParty>();
  try {
    calloutParties = await fetchCalloutCardParties(
      challenges.filter((row) => row.is_callout).map((row) => String(row.id ?? '').trim()).filter(Boolean),
    );
  } catch {
    calloutParties = new Map();
  }
  const ids = challenges.map((row) => String(row.id ?? '').trim()).filter(Boolean);
  const [memberCounts, progress] = await Promise.all([
    fetchPulseMemberCounts(ids),
    fetchPulseProgress(userId, ids, challenges),
  ]);
  const lastReadAt: Record<string, string | null> = {};
  for (const id of ids) {
    lastReadAt[id] = peekLiveLastRead(userId, id);
  }
  return buildPulsePills({
    challenges,
    posts,
    profiles,
    calloutParties,
    viewerId: userId,
    memberCounts,
    lastReadAt,
    progress,
    relative: formatRelative,
  });
}

/** Room size for the +N beside the face pile. A miss just hides the chip. */
async function fetchPulseMemberCounts(ids: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (ids.length === 0) {
    return counts;
  }
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, status')
      .in('challenge_id', ids);
    if (error) {
      return counts;
    }
    for (const row of (data ?? []) as { challenge_id?: string | null; status?: string | null }[]) {
      const id = String(row.challenge_id ?? '');
      const status = String(row.status ?? 'joined');
      if (!id || status === 'refunded_pre_start' || status === 'withdrawn') {
        continue;
      }
      counts[id] = (counts[id] ?? 0) + 1;
    }
  } catch {
    return counts;
  }
  return counts;
}

/** The viewer's own day count, for the "15/30 days" line on consistency rooms. */
async function fetchPulseProgress(
  userId: string,
  ids: string[],
  challenges: PulseChallengeLike[],
): Promise<Record<string, { done: number; target: number }>> {
  const out: Record<string, { done: number; target: number }> = {};
  if (ids.length === 0) {
    return out;
  }
  const targets = new Map(
    challenges.map((row) => [
      String(row.id ?? ''),
      Math.max(
        Math.trunc(Number(row.days_required ?? row.duration_days ?? row.length_value ?? 0)) || 0,
        0,
      ),
    ]),
  );
  try {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, days_completed')
      .eq('user_id', userId)
      .in('challenge_id', ids);
    if (error) {
      return out;
    }
    for (const row of (data ?? []) as {
      challenge_id?: string | null;
      days_completed?: number | null;
    }[]) {
      const id = String(row.challenge_id ?? '');
      const target = targets.get(id) ?? 0;
      if (!id || target <= 0) {
        continue;
      }
      out[id] = { done: Math.max(Math.trunc(Number(row.days_completed) || 0), 0), target };
    }
  } catch {
    return out;
  }
  return out;
}
