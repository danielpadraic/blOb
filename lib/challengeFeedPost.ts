import { isInviteOnlyChallenge } from '@/lib/challengeLane';
import { challengeShareUrl } from '@/lib/officialShare';
import { DEFAULT_POST_AUDIENCE, type PostAudience } from '@/lib/postAudience';
import { resolvePostsSchema, type PostsSchema } from '@/lib/postsSelect';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export function challengeAnnounceCopy(title: string | null | undefined): string {
  const name = title?.trim() || 'this challenge';
  return `${name} Join.`;
}

export function feedAudienceForChallenge(input: {
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
}): PostAudience | null {
  if (!input.is_official && isInviteOnlyChallenge(input)) {
    return null;
  }
  const visibility = String(input.visibility ?? '').toLowerCase();
  if (visibility === 'invite' || visibility === 'private') {
    return null;
  }
  if (visibility === 'friends') {
    return 'friends';
  }
  return 'public';
}

function postInsertPayload(
  schema: PostsSchema,
  base: {
    author_id: string;
    challenge_id: string;
    content: string;
    audience: PostAudience;
    source?: Post['source'];
  },
) {
  const payload: Record<string, unknown> = {
    author_id: base.author_id,
    challenge_id: base.challenge_id,
    content: base.content,
    media_urls: [],
  };
  if (schema.hasAudience) {
    payload.audience = base.audience;
    payload.audience_user_ids = [];
  }
  if (schema.hasSource) {
    payload.source = base.source ?? 'feed';
  }
  return payload;
}

export async function insertChallengeFeedPost(input: {
  authorId: string;
  challengeId: string;
  title: string;
  audience: PostAudience;
  content?: string;
}): Promise<Post> {
  const schema = await resolvePostsSchema();
  const content = (input.content ?? challengeAnnounceCopy(input.title)).trim() || challengeAnnounceCopy(input.title);
  const created = await supabase
    .from('posts')
    .insert(
      postInsertPayload(schema, {
        author_id: input.authorId,
        challenge_id: input.challengeId,
        content,
        audience: input.audience || DEFAULT_POST_AUDIENCE,
        source: 'feed',
      }),
    )
    .select(schema.select)
    .single();
  if (created.error) {
    throw new Error(getErrorMessage(created.error));
  }
  return created.data as unknown as Post;
}

export async function announceCreatedChallenge(input: {
  authorId: string;
  challengeId: string;
  title: string;
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
}): Promise<Post | null> {
  const audience = feedAudienceForChallenge(input);
  if (!audience) {
    return null;
  }
  try {
    return await insertChallengeFeedPost({
      authorId: input.authorId,
      challengeId: input.challengeId,
      title: input.title,
      audience,
    });
  } catch (error) {
    console.log('[blob:create] feed announce skipped', getErrorMessage(error));
    return null;
  }
}

export function challengeInviteMessage(title: string, challengeId: string): string {
  return `${title.trim() || 'This challenge'}\n${challengeShareUrl(challengeId)}`;
}
