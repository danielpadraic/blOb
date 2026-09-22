import { searchPeople } from '@/lib/social';
import { resolvePostsSchema } from '@/lib/postsSelect';
import { corporateIdsFromLookup } from '@/lib/privacyMode';
import { supabase } from '@/lib/supabase';
import type { Challenge, Post, PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export type SearchChallenge = Pick<Challenge, 'id' | 'title' | 'is_official' | 'visibility' | 'status'>;

export type SearchHashtag = {
  tag: string;
  count: number;
};

export type GlobalSearchResults = {
  people: PublicProfile[];
  challenges: SearchChallenge[];
  hashtags: SearchHashtag[];
  posts: Post[];
};

const EMPTY: GlobalSearchResults = {
  people: [],
  challenges: [],
  hashtags: [],
  posts: [],
};

export function isSearchEmpty(results: GlobalSearchResults): boolean {
  return (
    results.people.length === 0 &&
    results.challenges.length === 0 &&
    results.hashtags.length === 0 &&
    results.posts.length === 0
  );
}

export async function searchGlobal(query: string, userId: string): Promise<GlobalSearchResults> {
  const term = query.trim();
  if (term.length < 2) {
    return EMPTY;
  }

  const tag = term.replace(/^#/, '').replace(/[^a-z0-9_]/gi, '');
  const like = `%${term.replace(/^#/, '').replace(/[%_]/g, '')}%`;
  const hashLike = tag ? `%#${tag}%` : like;

  const [people, challenges, tagged, keyword] = await Promise.all([
    searchPeople(term, userId).catch(() => [] as PublicProfile[]),
    searchChallenges(like),
    searchPosts(hashLike),
    term.startsWith('#') ? Promise.resolve([] as Post[]) : searchPosts(like),
  ]);

  const hashtags = countHashtags([...tagged, ...keyword], tag);

  return {
    people,
    challenges,
    hashtags,
    posts: dedupePosts([...keyword, ...tagged]).slice(0, 8),
  };
}

async function searchChallenges(like: string): Promise<SearchChallenge[]> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id, title, is_official, visibility, status')
    .ilike('title', like)
    .or('visibility.eq.public,visibility.eq.friends,visibility.is.null,is_official.eq.true')
    .neq('privacy_mode', 'private_corporate')
    .limit(8);
  if (error) {
    console.log('[blob:search] challenges', getErrorMessage(error));
    return [];
  }
  return (data ?? []) as SearchChallenge[];
}

async function searchPosts(like: string): Promise<Post[]> {
  const schema = await resolvePostsSchema();
  const { data, error } = await supabase
    .from('posts')
    .select(schema.select)
    .ilike('content', like)
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) {
    console.log('[blob:search] posts', getErrorMessage(error));
    return [];
  }
  const rows = (data ?? []) as unknown as Post[];
  const challengeIds = rows.map((row) => row.challenge_id).filter(Boolean) as string[];
  if (challengeIds.length === 0) {
    return rows;
  }
  const lookup = await supabase.from('challenges').select('id, privacy_mode').in('id', challengeIds);
  const hidden = corporateIdsFromLookup(challengeIds, lookup.data, Boolean(lookup.error));
  return rows.filter((row) => !row.challenge_id || !hidden.has(row.challenge_id));
}

function countHashtags(posts: Post[], preferred?: string): SearchHashtag[] {
  const counts = new Map<string, number>();
  for (const post of posts) {
    const matches = post.content?.match(/#([a-z0-9_]{2,40})/gi) ?? [];
    for (const raw of matches) {
      const tag = raw.replace(/^#/, '').toLowerCase();
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const rows = [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => {
      if (preferred && a.tag === preferred.toLowerCase()) {
        return -1;
      }
      if (preferred && b.tag === preferred.toLowerCase()) {
        return 1;
      }
      return b.count - a.count;
    });
  return rows.slice(0, 8);
}

function dedupePosts(posts: Post[]): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) {
      continue;
    }
    seen.add(post.id);
    out.push(post);
  }
  return out;
}
