import type { CommentWithAuthor } from '@/lib/types';

export type CommentEditHistoryRow = {
  body: string;
  created_at: string;
};

export function isLiveComment(
  comment: { deleted_at?: string | null } | null | undefined,
): boolean {
  return Boolean(comment) && !comment?.deleted_at;
}

export function visibleCommentCount(
  comments?: Array<{ deleted_at?: string | null }> | null,
): number {
  return (comments ?? []).filter(isLiveComment).length;
}

export function commentsForThread<
  T extends { id: string; parent_id?: string | null; deleted_at?: string | null },
>(comments: T[]): T[] {
  const parentsWithChildren = new Set(
    comments.map((row) => row.parent_id).filter((id): id is string => Boolean(id)),
  );
  return comments.filter((row) => isLiveComment(row) || parentsWithChildren.has(row.id));
}

export function commentHasStoredReplies(
  comments: Array<{ id?: string | null; parent_id?: string | null }>,
  commentId: string,
): boolean {
  return comments.some((row) => row.parent_id === commentId && row.id !== commentId);
}

export function parseCommentEdits(rows: unknown): CommentEditHistoryRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const body = String((row as { body?: unknown }).body ?? '');
      const created = String((row as { created_at?: unknown }).created_at ?? '').trim();
      if (!created) {
        return null;
      }
      return { body, created_at: created };
    })
    .filter((row): row is CommentEditHistoryRow => Boolean(row))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export function mapCommentInList(
  comments: CommentWithAuthor[] | undefined,
  commentId: string,
  updater: (comment: CommentWithAuthor) => CommentWithAuthor | null,
): CommentWithAuthor[] {
  return (comments ?? []).flatMap((comment) => {
    if (comment.id !== commentId) {
      return [comment];
    }
    const next = updater(comment);
    return next ? [next] : [];
  });
}
