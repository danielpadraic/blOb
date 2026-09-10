import { peekPostsSchema, postsSchemaForWrite, type PostsSchema } from '@/lib/postsSelect';
import type { ComposeInput } from '@/lib/types';

export const CREATE_POST_TIMEOUT_MS = 12_000;
export const CREATE_POST_FAIL = 'Couldn’t post. Try again.';

export type CreatePostStage = 'upload' | 'insert' | 'mentions' | 'done' | 'fail';

export type CreatePostLog = {
  stage: CreatePostStage;
  ms: number;
  media: number;
  hasUrl: boolean;
};

export function logCreatePost(entry: CreatePostLog): void {
  if (!__DEV__) {
    return;
  }
  console.log('[blob:post]', entry);
}

export type FeedMentionTargets = {
  users: string[];
  challenges: string[];
  circles: string[];
};

export function feedMentionTargets(
  input: Pick<ComposeInput, 'mentionedEntities' | 'mentionedUserIds'>,
  authorId: string,
): FeedMentionTargets {
  const entities = (input.mentionedEntities ?? []).filter((row) => row.id);
  const users = [
    ...new Set(
      (entities.length > 0
        ? entities.filter((row) => row.kind === 'user').map((row) => row.id)
        : (input.mentionedUserIds ?? [])
      ).filter((id) => id && id !== authorId),
    ),
  ];
  return {
    users,
    challenges: [...new Set(entities.filter((row) => row.kind === 'challenge').map((row) => row.id))],
    circles: [...new Set(entities.filter((row) => row.kind === 'circle').map((row) => row.id))],
  };
}

export function hasFeedMentions(targets: FeedMentionTargets): boolean {
  return targets.users.length > 0 || targets.challenges.length > 0 || targets.circles.length > 0;
}

export function withCreatePostTimeout<T>(work: PromiseLike<T>, ms = CREATE_POST_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(CREATE_POST_FAIL)), ms);
    Promise.resolve(work).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function createPostFail(error?: unknown): Error {
  if (error instanceof Error && error.message === CREATE_POST_FAIL) {
    return error;
  }
  return new Error(CREATE_POST_FAIL);
}

export function schemaForFeedInsert(): PostsSchema {
  return peekPostsSchema() ?? postsSchemaForWrite();
}

export function mentionInsertRows(
  postId: string,
  authorId: string,
  targets: FeedMentionTargets,
): Array<Record<string, string>> {
  return [
    ...targets.users.map((mentioned_user_id) => ({
      post_id: postId,
      mentioned_user_id,
      author_id: authorId,
    })),
    ...targets.challenges.map((challenge_id) => ({
      post_id: postId,
      challenge_id,
      author_id: authorId,
    })),
    ...targets.circles.map((circle_id) => ({
      post_id: postId,
      circle_id,
      author_id: authorId,
    })),
  ];
}

export function mediaUrlCount(urls?: Array<string | null | undefined> | null): {
  media: number;
  hasUrl: boolean;
} {
  const media = (urls ?? []).filter((url) => Boolean(String(url ?? '').trim())).length;
  return { media, hasUrl: media > 0 };
}
