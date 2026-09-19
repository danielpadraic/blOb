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
const missingPublishAuthorLogged = new Set<string>();

export function isPlaceholderLiveName(name?: string | null): boolean {
  const value = String(name ?? '').trim();
  return !value || value === 'Member';
}

/** True when the row still needs a profiles join on author_id. */
export function liveAuthorNeedsHydrate(
  author?: LiveAuthorLike,
  authorId?: string | null,
): boolean {
  const id = safeUserId(author, authorId);
  if (!id) {
    return false;
  }
  if (!author) {
    return true;
  }
  const name = author.display_name?.trim() || '';
  const username = author.username?.trim() || '';
  if (name === 'Member') {
    return true;
  }
  if (!name && !username) {
    return true;
  }
  if ((name === 'Someone' || !name) && (!username || username === 'blob')) {
    return true;
  }
  return false;
}

/** Live bubble / quote / compact row. Never throw when author is missing. */
export function resolveLiveAuthor(post?: LivePostAuthorLike): LiveAuthorView {
  const author = post?.author;
  const authorId = safeUserId(author, post?.author_id, post?.user_id);
  const raw = author?.display_name?.trim() || author?.username?.trim() || '';
  const name = raw && raw !== 'Member' ? raw : 'Someone';
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

/** Once per post. Only when the author join is missing after Wave / Feed / Round publish. */
export function logMissingPublishAuthor(input: {
  type?: string | null;
  postId?: string | null;
  hasAuthor?: boolean;
}): void {
  if (input.hasAuthor) {
    return;
  }
  const postId = String(input.postId ?? '').trim();
  if (!postId || missingPublishAuthorLogged.has(postId)) {
    return;
  }
  missingPublishAuthorLogged.add(postId);
  console.log('[blob:publish]', {
    type: input.type ?? null,
    postId,
    hasAuthor: false,
  });
}

export type SeedLiveAuthorOpts = {
  viewerId?: string | null;
  viewer?: LiveAuthorLike;
};

/**
 * Every Live row gets an author object. Missing profile after publish must not throw on .id.
 * Known author_id without a join is “Someone”. “Member” is never written.
 * When author_id is the signed-in viewer, use the session name + avatar.
 */
export function seedLiveAuthor<T extends LivePostAuthorLike>(row: T, opts?: SeedLiveAuthorOpts): T {
  if (!row || typeof row !== 'object') {
    return row;
  }
  const authorId = safeUserId(row.author, row.author_id, row.user_id);
  const existingName = row.author?.display_name?.trim() || row.author?.username?.trim() || '';
  const hasRealAuthor =
    Boolean(row.author && safeUserId(row.author)) &&
    Boolean(existingName) &&
    existingName !== 'Member';
  if (hasRealAuthor) {
    return row;
  }
  const viewerId = safeUserId(opts?.viewer, opts?.viewerId);
  if (authorId && viewerId && authorId === viewerId) {
    const session = sessionAuthor(opts?.viewer, authorId);
    if (session) {
      return {
        ...row,
        author_id: authorId,
        author: session,
      };
    }
  }
  if (authorId) {
    return {
      ...row,
      author_id: authorId,
      author: {
        id: authorId,
        display_name: existingName && existingName !== 'Member' ? existingName : 'Someone',
        username: row.author?.username ?? null,
        avatar_url: row.author?.avatar_url ?? null,
      },
    };
  }
  return {
    ...row,
    author_id: row.author_id ?? null,
    author: {
      id: `someone:${String(row.id ?? 'unknown')}`,
      display_name: 'Someone',
      username: null,
      avatar_url: null,
    },
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
