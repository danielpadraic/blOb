import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { patchFeedPosts } from '@/hooks/useFeed';
import type { ChallengeProofPart } from '@/lib/challengeProofs';
import { uniqueProofUrls } from '@/lib/challengeProofs';
import { parsePostEdits } from '@/lib/postEdit';
import { resetPostsSchemaCache } from '@/lib/postsSelect';
import { supabase } from '@/lib/supabase';
import type { Post, PostWithMeta } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const db = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => Promise<{
          data: { proof_parts?: Record<string, ChallengeProofPart> | null } | null;
          error: { message?: string } | null;
        }>;
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => {
        select: (columns: string) => {
          single: () => Promise<{ data: Post | null; error: { message?: string } | null }>;
        };
        then?: unknown;
      };
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Post | null; error: { message?: string } | null }>;
};

export type EditPostInput = {
  postId: string;
  caption?: string | null;
  mediaUrls?: string[] | null;
  hiddenMediaUrls: string[];
  proofReplacements?: Record<string, string>;
  checkinId?: string | null;
};

export function applyEditedPostToFeeds(
  queryClient: ReturnType<typeof useQueryClient>,
  post: Pick<Post, 'id'> & Partial<Post>,
) {
  patchFeedPosts(queryClient, post.id, (row) => ({
    ...row,
    content: post.content !== undefined ? post.content : row.content,
    media_urls: post.media_urls ?? row.media_urls,
    hidden_media_urls: post.hidden_media_urls ?? row.hidden_media_urls ?? [],
    edited_at: post.edited_at !== undefined ? post.edited_at : row.edited_at,
  }));
}

function rowFromEdit(input: EditPostInput, row?: Post | null): Post {
  return {
    ...(row ?? { id: input.postId, author_id: '', challenge_id: null, content: null, media_urls: [], created_at: '' }),
    id: input.postId,
    content: input.caption !== undefined && input.caption !== null ? input.caption : row?.content ?? null,
    media_urls: input.mediaUrls ? uniqueProofUrls(input.mediaUrls) : row?.media_urls ?? [],
    hidden_media_urls: uniqueProofUrls(input.hiddenMediaUrls),
    edited_at: row?.edited_at ?? new Date().toISOString(),
  };
}

async function stampCheckinHidden(checkinId: string, hidden: string[]) {
  const { data, error } = await db
    .from('challenge_checkins')
    .select('proof_parts')
    .eq('id', checkinId)
    .maybeSingle();
  if (error || !data?.proof_parts) {
    return;
  }
  const skip = new Set(uniqueProofUrls(hidden));
  const next: Record<string, ChallengeProofPart> = {};
  for (const [key, part] of Object.entries(data.proof_parts)) {
    const urls = uniqueProofUrls([part?.url, ...(part?.urls ?? [])]);
    next[key] = {
      ...part,
      hidden_urls: urls.filter((url) => skip.has(url)),
    };
  }
  await supabase.from('challenge_checkins').update({ proof_parts: next }).eq('id', checkinId);
}

async function persistEditedPost(input: EditPostInput): Promise<Post> {
  resetPostsSchemaCache();
  const hidden = uniqueProofUrls(input.hiddenMediaUrls);
  const { data, error } = await db.rpc('edit_post', {
    p_post_id: input.postId,
    p_caption: input.caption ?? null,
    p_media_urls: input.mediaUrls ?? null,
    p_hidden_media_urls: hidden,
    p_proof_replacements:
      input.proofReplacements && Object.keys(input.proofReplacements).length > 0
        ? input.proofReplacements
        : null,
  });
  if (!error && data) {
    if (input.checkinId) {
      await stampCheckinHidden(input.checkinId, hidden);
    }
    return rowFromEdit(input, data);
  }

  const now = new Date().toISOString();
  const values: Partial<Post> = {
    hidden_media_urls: hidden,
    edited_at: now,
    ...(input.caption != null ? { content: input.caption } : {}),
    ...(input.mediaUrls ? { media_urls: uniqueProofUrls(input.mediaUrls) } : {}),
  };
  const fallback = await supabase
    .from('posts')
    .update(values)
    .eq('id', input.postId)
    .select('*')
    .single();
  if (fallback.error || !fallback.data) {
    const message = error?.message ?? fallback.error?.message ?? '';
    if (message.includes('REPLACE_PROOF')) {
      throw new Error('Replace this photo first.');
    }
    throw new Error(getErrorMessage(fallback.error ?? error));
  }
  if (input.checkinId) {
    await stampCheckinHidden(input.checkinId, hidden);
  }
  return rowFromEdit(input, fallback.data as Post);
}

export function usePostEdits(postId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['post-edits', postId, user?.id],
    enabled: Boolean(postId && user?.id),
    queryFn: async () => {
      const { data, error } = await db
        .from('post_edits')
        .select('caption, created_at')
        .eq('post_id', postId as string)
        .order('created_at', { ascending: false });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return parsePostEdits(data);
    },
  });
}

export function useEditPost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: EditPostInput) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return persistEditedPost(input);
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      applyEditedPostToFeeds(queryClient, {
        id: input.postId,
        content: input.caption ?? undefined,
        media_urls: input.mediaUrls ?? undefined,
        hidden_media_urls: uniqueProofUrls(input.hiddenMediaUrls),
        edited_at: new Date().toISOString(),
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (row, input) => {
      applyEditedPostToFeeds(queryClient, rowFromEdit(input, row));
      void queryClient.invalidateQueries({ queryKey: ['post-edits'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['edit-checkin'] });
    },
  });
}

export function useHidePostMedia() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      postId: string;
      hiddenMediaUrls: string[];
      checkinId?: string | null;
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      return persistEditedPost({
        postId: input.postId,
        hiddenMediaUrls: input.hiddenMediaUrls,
        checkinId: input.checkinId,
      });
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      applyEditedPostToFeeds(queryClient, {
        id: input.postId,
        hidden_media_urls: uniqueProofUrls(input.hiddenMediaUrls),
        edited_at: new Date().toISOString(),
      });
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (row, input) => {
      applyEditedPostToFeeds(queryClient, rowFromEdit({
        postId: input.postId,
        hiddenMediaUrls: input.hiddenMediaUrls,
        checkinId: input.checkinId,
      }, row));
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
      void queryClient.invalidateQueries({ queryKey: ['edit-checkin'] });
    },
  });
}
