import type { CommentWithAuthor } from '@/lib/types';

export function nestComments(comments: CommentWithAuthor[]): CommentWithAuthor[] {
  const nodes = new Map<string, CommentWithAuthor>();
  for (const comment of comments) {
    nodes.set(comment.id, { ...comment, replies: [] });
  }

  const roots: CommentWithAuthor[] = [];
  for (const node of nodes.values()) {
    const parentId = node.parent_id;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent && parent.id !== node.id && !createsCycle(node.id, parentId, nodes)) {
      parent.replies = [...(parent.replies ?? []), node];
    } else {
      roots.push(node);
    }
  }

  sortTree(roots);
  return roots;
}

function createsCycle(
  childId: string,
  parentId: string | null | undefined,
  nodes: Map<string, CommentWithAuthor>,
): boolean {
  let current = parentId ?? null;
  const seen = new Set<string>();
  while (current) {
    if (current === childId) {
      return true;
    }
    if (seen.has(current)) {
      return true;
    }
    seen.add(current);
    current = nodes.get(current)?.parent_id ?? null;
  }
  return false;
}

function sortTree(nodes: CommentWithAuthor[]) {
  nodes.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  for (const node of nodes) {
    if (node.replies && node.replies.length > 0) {
      sortTree(node.replies);
    }
  }
}
