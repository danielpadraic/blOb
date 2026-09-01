import { isLiveOrUpcoming } from '@/lib/challengeDiscoverability';
import { fetchActiveChallenges } from '@/lib/challenges';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { copy } from '@/lib/copy';
import { liveQuotePreview } from '@/lib/liveThread';
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
  author_id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

export type PulsePill = {
  id: string;
  title: string;
  snippet: string;
  faces: PulseFace[];
  lastAt: string | null;
};

export type PulseChallengeLike = {
  id?: string | null;
  title?: string | null;
  task?: string | null;
  status?: string | null;
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
  if (!post || post.deleted_at) {
    return copy('pulse.noChatter');
  }
  return liveQuotePreview(post) || copy('pulse.noChatter');
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
    const authorId = String(post.author_id ?? '').trim();
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
  for (const post of newestFirst) {
    const id = String(post.challenge_id ?? '');
    if (!latestByChallenge.has(id)) {
      latestByChallenge.set(id, post);
    }
  }
  const profiles = new Map((input.profiles ?? []).filter((row) => row?.id).map((row) => [row.id, row]));
  const pills = challenges.map((row) => {
    const id = String(row.id);
    const latest = latestByChallenge.get(id) ?? null;
    return {
      id,
      title: challengeDisplayTitle(row) || 'Challenge',
      snippet: pulseSnippet(latest),
      faces: collectPulseFaces(newestFirst, id, profiles),
      lastAt: latest?.created_at ?? null,
    };
  });
  return sortPulsePills(pills).slice(0, PULSE_CAP);
}

async function fetchPulseLobbyPosts(challengeIds: string[]): Promise<PulseLobbyPost[]> {
  const ids = [...new Set(challengeIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, challenge_id, content, media_urls, source, type, checkin_id, checkin_stage, author_id, created_at, deleted_at',
    )
    .in('challenge_id', ids)
    .in('source', ['challenge', 'checkin'])
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(ids.length * 8, 24), 120));
  if (error) {
    throw error;
  }
  return (data ?? []) as PulseLobbyPost[];
}

/** Joined ∪ hosted live/upcoming + last Live line the viewer can already see. */
export async function fetchHomePulsePills(userId?: string): Promise<PulsePill[]> {
  if (!userId) {
    return [];
  }
  const challenges = selectPulseChallenges(await fetchActiveChallenges(userId));
  if (challenges.length === 0) {
    return [];
  }
  let posts: PulseLobbyPost[] = [];
  try {
    posts = await fetchPulseLobbyPosts(challenges.map((row) => row.id));
  } catch {
    posts = [];
  }
  const allowed = new Set(challenges.map((row) => row.id));
  const authorIds: string[] = [];
  const seenAuthors = new Set<string>();
  const facesPerChallenge = new Map<string, number>();
  for (const post of posts) {
    const challengeId = String(post.challenge_id ?? '');
    const authorId = String(post.author_id ?? '').trim();
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
  return buildPulsePills({ challenges, posts, profiles });
}
