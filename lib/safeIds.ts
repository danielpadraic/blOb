/** Missing author / user after publish or check-in must not throw. */
export function safeUserId(
  ...candidates: Array<{ id?: string | null } | string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const id = candidate.trim();
      if (id) {
        return id;
      }
      continue;
    }
    const id = candidate?.id?.trim();
    if (id) {
      return id;
    }
  }
  return null;
}

export function authorLabel(
  author?: { display_name?: string | null; username?: string | null } | null,
): string {
  return author?.display_name?.trim() || author?.username?.trim() || 'Someone';
}

export type LiveAuthorLike = {
  id?: string | null;
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
} | null;

export type LivePostAuthorLike = {
  id?: string | null;
  author?: LiveAuthorLike;
  author_id?: string | null;
  user_id?: string | null;
} | null;

export type LiveAuthorView = {
  authorId: string | null;
  name: string;
  username: string | null;
  avatarUrl: string | null;
};

const missingLiveAuthorLogged = new Set<string>();

/** Live bubble / quote / compact row. Never throw when author is missing. */
export function resolveLiveAuthor(post?: LivePostAuthorLike): LiveAuthorView {
  const author = post?.author;
  const authorId = safeUserId(author, post?.author_id, post?.user_id);
  const name = author?.display_name?.trim() || author?.username?.trim() || 'Someone';
  if (!author && post?.id && !missingLiveAuthorLogged.has(post.id)) {
    missingLiveAuthorLogged.add(post.id);
    console.log('[blob:live]', { postId: post.id, hasAuthor: false, authorId });
  }
  return {
    authorId,
    name,
    username: author?.username?.trim() || null,
    avatarUrl: author?.avatar_url ?? null,
  };
}

/** Session profile for an optimistic check-in / compose row. */
export function sessionAuthor(
  profile?: LiveAuthorLike,
  userId?: string | null,
): { id: string; username: string; display_name: string | null; avatar_url: string | null } | null {
  const id = safeUserId(profile, userId);
  if (!id) {
    return null;
  }
  return {
    id,
    username: profile?.username?.trim() || 'blob',
    display_name: profile?.display_name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };
}
