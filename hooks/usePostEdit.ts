import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { parsePostEdits } from '@/lib/postEdit';
import { supabase } from '@/lib/supabase';
import type { Post } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const db = supabase as unknown as {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: Post | null; error: { message?: string } | null }>;
};

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
    mutationFn: async (input: {
      postId: string;
      caption: string;
      mediaUrls: string[];
      hiddenMediaUrls: string[];
      proofReplacements?: Record<string, string>;
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const { data, error } = await db.rpc('edit_post', {
        p_post_id: input.postId,
        p_caption: input.caption,
        p_media_urls: input.mediaUrls,
        p_hidden_media_urls: input.hiddenMediaUrls,
        p_proof_replacements:
          input.proofReplacements && Object.keys(input.proofReplacements).length > 0
            ? input.proofReplacements
            : null,
      });
      if (error) {
        const message = error.message ?? '';
        if (message.includes('REPLACE_PROOF')) {
          throw new Error('Replace this photo first.');
        }
        throw new Error(getErrorMessage(error));
      }
      return data as Post;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['post-edits'] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-checkin'] });
    },
  });
}
