import { buildLiftSnapshot } from '@/lib/lift/snapshot';
import { supabase } from '@/lib/supabase';
import type { LiftSessionDraft } from '@/lib/lift/types';

function isMissingColumn(error: { message?: string; code?: string } | null): boolean {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes('lift_snapshot') && (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('pgrst204') ||
    text.includes('42703')
  );
}

/**
 * Writes the frozen session onto the post. Missing column is fine — the card still opens from
 * `lift_session_id` when the viewer can read the live row.
 */
export async function persistLiftSnapshotOnPost(
  postId: string | null | undefined,
  draft: LiftSessionDraft | null | undefined,
): Promise<void> {
  const id = String(postId ?? '').trim();
  if (!id || !draft) {
    return;
  }
  const { error } = await supabase
    .from('posts')
    .update({ lift_snapshot: buildLiftSnapshot(draft) })
    .eq('id', id);
  if (error && !isMissingColumn(error)) {
    console.warn('Could not store the lift snapshot on that post', error.message);
  }
}
