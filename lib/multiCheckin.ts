import { requiredChallengeProofs } from '@/lib/challenges';
import { parseProofParts, partSatisfies, proofDisplayName } from '@/lib/challengeProofs';
import type { CheckinPhase } from '@/lib/challengeCheckin';
import { isCheckinPost } from '@/lib/checkinPost';
import { checkinHidesHomeShare } from '@/lib/checkinShare';
import { usesPeriodCheckinGate } from '@/lib/loggable';
import { isClipSharePost } from '@/lib/roundShare';

type LoggableLike = {
  id: string;
  title: string;
  task?: string | null;
  taskLabel?: string | null;
  checkinPhase?: CheckinPhase | null;
  remainingProofLabels?: string[];
  proofParts?: unknown;
  proofs?: unknown;
  proof_type?: string | null;
  proof_requirements?: unknown;
  format?: string | null;
  challenge_type?: string | null;
  frequency?: string | null;
  cumulative_target?: number | string | null;
  cumulative_metric?: string | null;
  metrics?: unknown;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  target_count?: number | null;
};

export type MultiCheckinState = 'not_started' | 'in_progress' | 'complete';

export type MultiCheckinRow = {
  id: string;
  title: string;
  task: string;
  remainingProofLabels: string[];
  state: MultiCheckinState;
};

export const HOME_CHECKIN_STACK_WINDOW_MS = 2 * 60 * 1000;

/** Home never collapses two check-ins into one card. Each challenge keeps its own post. */
export const HOME_CHECKIN_STACK_SLICE = 0;

const hubSnapshots: Record<string, Pick<MultiCheckinRow, 'title' | 'task' | 'remainingProofLabels'>> = {};

export function rememberMultiCheckinSnapshot(
  row: Pick<MultiCheckinRow, 'id' | 'title' | 'task' | 'remainingProofLabels'>,
): void {
  hubSnapshots[row.id] = {
    title: row.title,
    task: row.task,
    remainingProofLabels: row.remainingProofLabels,
  };
}

export function multiCheckinSnapshots(): Record<
  string,
  Pick<MultiCheckinRow, 'title' | 'task' | 'remainingProofLabels'>
> {
  return hubSnapshots;
}

export function parseDoneIds(raw: string | string[] | null | undefined): string[] {
  const value = Array.isArray(raw) ? raw.join(',') : String(raw ?? '');
  return [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))];
}

/**
 * Chip from remaining required proofs — not from done= and not from a submitted stamp
 * on the first selfie. Remaining labels mean the period is not complete.
 */
export function hubRowState(
  phase?: CheckinPhase | null,
  done?: boolean,
  remaining?: readonly string[] | null,
  periodGate?: boolean,
): MultiCheckinState {
  const open = (remaining ?? []).map((label) => String(label ?? '').trim()).filter(Boolean);
  if (open.length > 0) {
    const started =
      Boolean(done) || phase === 'in_progress' || phase === 'ready' || phase === 'submitted';
    return started ? 'in_progress' : 'not_started';
  }
  if (periodGate === false) {
    if (done) {
      return 'complete';
    }
    if (phase === 'in_progress' || phase === 'ready') {
      return 'in_progress';
    }
    return 'not_started';
  }
  if (phase === 'submitted' || done) {
    return 'complete';
  }
  if (phase === 'in_progress' || phase === 'ready') {
    return 'in_progress';
  }
  return 'not_started';
}

export function remainingProofLabelsOf(
  challenge: Pick<LoggableLike, 'proofs' | 'proof_type' | 'proof_requirements' | 'taskLabel' | 'task'> | null | undefined,
  parts?: unknown,
  _phase?: CheckinPhase | null,
): string[] {
  const proofs = requiredChallengeProofs(challenge as never);
  const parsed = parseProofParts(parts);
  return proofs
    .filter((proof) => proof.method !== 'honor')
    .filter((proof) => !partSatisfies(proof, parsed[proof.id]))
    .map((proof) => proofDisplayName(proof));
}

export function mergeMultiCheckinRows(
  loggable: LoggableLike[],
  doneIds: string[],
  snapshots: Record<string, Pick<MultiCheckinRow, 'title' | 'task' | 'remainingProofLabels'>> = hubSnapshots,
): MultiCheckinRow[] {
  const done = new Set(doneIds);
  const rows: MultiCheckinRow[] = loggable.map((item) => {
    const remaining =
      item.remainingProofLabels ?? remainingProofLabelsOf(item, item.proofParts, item.checkinPhase);
    return {
      id: item.id,
      title: item.title,
      task: String(item.taskLabel ?? item.task ?? '').trim(),
      remainingProofLabels: remaining,
      state: hubRowState(
        item.checkinPhase,
        done.has(item.id),
        remaining,
        usesPeriodCheckinGate(item as never),
      ),
    };
  });
  const seen = new Set(rows.map((row) => row.id));
  for (const id of doneIds) {
    if (seen.has(id)) {
      continue;
    }
    const snap = snapshots[id];
    const remaining = snap?.remainingProofLabels ?? [];
    rows.push({
      id,
      title: snap?.title ?? 'Checked in',
      task: snap?.task ?? '',
      remainingProofLabels: remaining,
      state: remaining.length > 0 ? 'in_progress' : 'complete',
    });
  }
  return rows;
}

export function nextEmptyCheckinId(rows: MultiCheckinRow[], afterId?: string | null): string | null {
  const after = rows.findIndex((row) => row.id === afterId);
  const ordered = after >= 0 ? [...rows.slice(after + 1), ...rows.slice(0, after)] : rows;
  return ordered.find((row) => row.state === 'not_started' || row.state === 'in_progress')?.id ?? null;
}

export type HomeCheckinPost = {
  id: string;
  author_id?: string | null;
  created_at?: string | null;
  challenge_id?: string | null;
  hidden_from_home?: boolean | null;
  checkin_id?: string | null;
  checkin_stage?: string | null;
  source?: string | null;
  type?: string | null;
  kind?: string | null;
  media_urls?: string[] | null;
  privacy_mode?: string | null;
  author?: { display_name?: string | null; username?: string | null } | null;
  challenge?: { title?: string | null; privacy_mode?: string | null } | null;
};

export type HomeCheckinStackChild = {
  postId: string;
  challengeId: string;
  title: string;
};

export type HomeCheckinStack = {
  kind: 'stack';
  authorId: string;
  count: number;
  copy: string;
  titles: string[];
  firstPostId: string;
  postIds: string[];
  items: HomeCheckinStackChild[];
};

export function isHomeCheckinStack(
  item: HomeCheckinPost | HomeCheckinStack,
): item is HomeCheckinStack {
  return Boolean(item && 'kind' in item && item.kind === 'stack');
}

/** Public Home check-ins only. Hidden, private, corporate, Waves, and ordinary posts stay out. */
export function homeCheckinStackable(post: HomeCheckinPost): boolean {
  if (!post?.id || post.hidden_from_home || !post.challenge_id) {
    return false;
  }
  if (isClipSharePost(post)) {
    return false;
  }
  if (!isCheckinPost(post)) {
    return false;
  }
  if (checkinHidesHomeShare(post.challenge ?? { privacy_mode: post.privacy_mode })) {
    return false;
  }
  return true;
}

/** Home keeps one card per check-in. Never a “checked in to 2 challenges” mash-up. */
export function stackHomeCheckinPosts(posts: HomeCheckinPost[]): Array<HomeCheckinPost | HomeCheckinStack> {
  return posts.filter((post) => Boolean(post?.id));
}
