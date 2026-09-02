import { isLiveOrUpcoming } from '@/lib/challengeDiscoverability';
import { fetchActiveChallenges } from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import {
  calloutCardMetaLine,
  calloutPartyFaces,
  fetchCalloutCardParties,
  fetchWatchedCalloutChallenges,
  type CalloutCardParty,
} from '@/lib/callouts';
import { isCheckinPost } from '@/lib/checkinPost';
import { copy } from '@/lib/copy';
import { liveCheckinLabel } from '@/lib/liveThread';
import { challengeDetailHref } from '@/lib/routes';
import { fetchPublicProfilesByIds, personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';

export const PULSE_CAP = 12;
export const PULSE_FACE_CAP = 3;
export const HOME_PULSE_KEY = 'home-pulse';

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
};

export type PulseChallengeLike = {
  id?: string | null;
  title?: string | null;
  task?: string | null;
  status?: string | null;
  is_callout?: boolean | null;
  watching?: boolean | null;
};

/** Live / upcoming only. Ended and Settled never become pills. */
export function selectPulseChallenges<T extends PulseChallengeLike>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = String(row?.id ?? '').trim();
    if (!id || seen.has(id) || !isLiveOrUpcoming(row.status)) {
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
  return challengeDetailHref(String(id).trim(), 'feed', null, { tab: 'feed' });
}

export function sortPulsePills<T extends { lastAt: string | null }>(pills: T[]): T[] {
  return [...pills].sort((a, b) => {
    const left = a.lastAt ? Date.parse(a.lastAt) : 0;
    const right = b.lastAt ? Date.parse(b.lastAt) : 0;
    const aTime = Number.isFinite(left) ? left : 0;
    const bTime = Number.isFinite(right) ? right : 0;
    return bTime - aTime;
  });
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

export function buildPulsePills(input: {
  challenges: PulseChallengeLike[];
  posts: PulseLobbyPost[];
  profiles?: PulseProfile[];
  calloutParties?: Map<string, CalloutCardParty> | CalloutCardParty[];
  viewerId?: string | null;
}): PulsePill[] {
  const challenges = selectPulseChallenges(input.challenges);
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
      faces: isCallout && fighterFaces.length > 0 ? fighterFaces : collectPulseFaces(newestFirst, id, profiles),
      lastAt: latestCheckin?.created_at ?? (isCallout ? latest?.created_at ?? null : null),
      isCallout,
      watching: Boolean(row.watching),
    };
  });
  return sortPulsePills(pills).slice(0, PULSE_CAP);
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

/** Joined ∪ hosted live/upcoming + last check-in state the viewer can already see. */
export async function fetchHomePulsePills(userId?: string): Promise<PulsePill[]> {
  if (!userId) {
    return [];
  }
  let challenges: PulseChallengeLike[] = [];
  try {
    challenges = selectPulseChallenges(await fetchActiveChallenges(userId));
  } catch {
    return [];
  }
  try {
    const watched = selectPulseChallenges(
      (await fetchWatchedCalloutChallenges(userId)).map((row) => ({ ...row, watching: true })),
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
  return buildPulsePills({ challenges, posts, profiles, calloutParties, viewerId: userId });
}
