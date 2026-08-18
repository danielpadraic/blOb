import type { QuoteSnapshot } from '@/lib/types';

export type { QuoteSnapshot };

export function asQuoteSnapshot(raw: unknown): QuoteSnapshot | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const authorId = typeof row.author_id === 'string' ? row.author_id : '';
  const username = typeof row.username === 'string' ? row.username : 'blob';
  if (!authorId && !username) {
    return null;
  }
  return {
    author_id: authorId,
    display_name: typeof row.display_name === 'string' ? row.display_name : username,
    username,
    avatar_url: typeof row.avatar_url === 'string' ? row.avatar_url : null,
    body: typeof row.body === 'string' ? row.body : '',
    media_preview_url: typeof row.media_preview_url === 'string' ? row.media_preview_url : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : '',
    audience: typeof row.audience === 'string' ? row.audience : null,
  };
}

export function snapshotFromPost(post: {
  author_id: string;
  content?: string | null;
  media_urls?: string[] | null;
  created_at: string;
  audience?: string | null;
  author?: {
    display_name?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  } | null;
}): QuoteSnapshot {
  const username = post.author?.username ?? 'blob';
  const media = (post.media_urls ?? []).find(Boolean) ?? null;
  return {
    author_id: post.author_id,
    display_name: post.author?.display_name?.trim() || username,
    username,
    avatar_url: post.author?.avatar_url ?? null,
    body: (post.content ?? '').trim().slice(0, 140),
    media_preview_url: media,
    created_at: post.created_at,
    audience: post.audience ?? null,
  };
}
