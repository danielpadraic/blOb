import { DEFAULT_POST_AUDIENCE } from '@/lib/postAudience';
import { resolvePostsSchema } from '@/lib/postsSelect';
import { supabase } from '@/lib/supabase';
import type { PostAudience, PostSource } from '@/lib/types';

export async function shareProfilePhotoPost(input: {
  userId: string;
  mediaUrl: string;
  audience?: PostAudience;
  kind: 'avatar' | 'cover';
}): Promise<boolean> {
  const audience = input.audience === 'public' ? 'public' : DEFAULT_POST_AUDIENCE;
  try {
    const schema = await resolvePostsSchema();
    const payload: Record<string, unknown> = {
      author_id: input.userId,
      challenge_id: null,
      content: input.kind === 'cover' ? 'Updated cover photo' : 'Updated profile photo',
      media_urls: [input.mediaUrl],
    };
    if (schema.hasAudience) {
      payload.audience = audience;
      payload.audience_user_ids = [];
    }
    if (schema.hasSource) {
      payload.source = 'profile_photo' satisfies PostSource;
    }
    const created = await supabase.from('posts').insert(payload).select('id').single();
    if (!created.error) {
      return true;
    }
    if (schema.hasSource && /source|profile_photo|check constraint/i.test(created.error.message)) {
      const retry = await supabase
        .from('posts')
        .insert({ ...payload, source: 'feed' })
        .select('id')
        .single();
      return !retry.error;
    }
    console.log('[blob:profile] photo post skipped', created.error.message);
    return false;
  } catch (error) {
    console.log('[blob:profile] photo post skipped', error);
    return false;
  }
}
