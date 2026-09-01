import { requiredChallengeProofs } from '@/lib/challenges';
import { parseProofParts, partSatisfies, proofDisplayName } from '@/lib/challengeProofs';
import type { CheckinPhase } from '@/lib/challengeCheckin';

type LoggableLike = {
  id: string;
  title: string;
  task?: string | null;
  taskLabel?: string | null;
  checkinPhase?: CheckinPhase | null;
  remainingProofLabels?: string[];
  proofs?: unknown;
  proof_type?: string | null;
  proof_requirements?: unknown;
};

export type MultiCheckinState = 'empty' | 'started' | 'complete';

export type MultiCheckinRow = {
  id: string;
  title: string;
  task: string;
  remainingProofLabels: string[];
  state: MultiCheckinState;
};

export const HOME_CHECKIN_STACK_WINDOW_MS = 2 * 60 * 1000;

/** Slice 2: Home can collapse 2+ check-in posts from one author in this window. Not wired to FeedList yet. */
export const HOME_CHECKIN_STACK_SLICE = 2;

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

export function hubRowState(phase?: CheckinPhase | null, done?: boolean): MultiCheckinState {
  if (done || phase === 'submitted') {
    return 'complete';
  }
  if (phase === 'in_progress' || phase === 'ready') {
    return 'started';
  }
  return 'empty';
}

export function remainingProofLabelsOf(
  challenge: Pick<LoggableLike, 'proofs' | 'proof_type' | 'proof_requirements' | 'taskLabel' | 'task'> | null | undefined,
  parts?: unknown,
  phase?: CheckinPhase | null,
): string[] {
  if (phase === 'submitted') {
    return [];
  }
  const proofs = requiredChallengeProofs(challenge as never);
  const parsed = parseProofParts(parts);
  const remaining = proofs
    .filter((proof) => proof.method !== 'honor')
    .filter((proof) => !partSatisfies(proof, parsed[proof.id]))
    .map((proof) => proofDisplayName(proof));
  if (remaining.length > 0) {
    return remaining;
  }
  const fallback = String(challenge?.taskLabel ?? challenge?.task ?? '').trim();
  return fallback ? [fallback] : [];
}

export function mergeMultiCheckinRows(
  loggable: LoggableLike[],
  doneIds: string[],
  snapshots: Record<string, Pick<MultiCheckinRow, 'title' | 'task' | 'remainingProofLabels'>> = hubSnapshots,
): MultiCheckinRow[] {
  const done = new Set(doneIds);
  const rows: MultiCheckinRow[] = loggable.map((item) => ({
    id: item.id,
    title: item.title,
    task: String(item.taskLabel ?? item.task ?? '').trim(),
    remainingProofLabels: item.remainingProofLabels ?? remainingProofLabelsOf(item, null, item.checkinPhase),
    state: hubRowState(item.checkinPhase, done.has(item.id)),
  }));
  const seen = new Set(rows.map((row) => row.id));
  for (const id of doneIds) {
    if (seen.has(id)) {
      continue;
    }
    const snap = snapshots[id];
    rows.push({
      id,
      title: snap?.title ?? 'Checked in',
      task: snap?.task ?? '',
      remainingProofLabels: [],
      state: 'complete',
    });
  }
  return rows;
}

export function nextEmptyCheckinId(rows: MultiCheckinRow[], afterId?: string | null): string | null {
  const after = rows.findIndex((row) => row.id === afterId);
  const ordered = after >= 0 ? [...rows.slice(after + 1), ...rows.slice(0, after)] : rows;
  return ordered.find((row) => row.state === 'empty')?.id ?? null;
}

export type HomeCheckinPost = {
  id: string;
  author_id?: string | null;
  created_at?: string | null;
  challenge_id?: string | null;
  hidden_from_home?: boolean | null;
  checkin_id?: string | null;
  source?: string | null;
  author?: { display_name?: string | null; username?: string | null } | null;
  challenge?: { title?: string | null } | null;
};

export type HomeCheckinStack = {
  kind: 'stack';
  authorId: string;
  count: number;
  copy: string;
  titles: string[];
  firstPostId: string;
  postIds: string[];
};

/** Groups 2+ Home-visible check-in posts from the same author within ~2 minutes. Lobby feeds stay unstacked. */
export function stackHomeCheckinPosts(posts: HomeCheckinPost[]): Array<HomeCheckinPost | HomeCheckinStack> {
  const out: Array<HomeCheckinPost | HomeCheckinStack> = [];
  const used = new Set<string>();
  for (let i = 0; i < posts.length; i += 1) {
    const post = posts[i];
    if (!post?.id || used.has(post.id) || post.hidden_from_home) {
      if (post?.id && !used.has(post.id) && post.hidden_from_home) {
        out.push(post);
        used.add(post.id);
      }
      continue;
    }
    const author = String(post.author_id ?? '');
    const at = Date.parse(String(post.created_at ?? ''));
    const cluster = posts.filter((other) => {
      if (!other?.id || used.has(other.id) || other.hidden_from_home) {
        return false;
      }
      if (String(other.author_id ?? '') !== author) {
        return false;
      }
      const otherAt = Date.parse(String(other.created_at ?? ''));
      return Number.isFinite(at) && Number.isFinite(otherAt) && Math.abs(otherAt - at) <= HOME_CHECKIN_STACK_WINDOW_MS;
    });
    if (cluster.length >= 2) {
      cluster.forEach((item) => used.add(item.id));
      const name =
        cluster[0]?.author?.display_name?.trim() ||
        (cluster[0]?.author?.username ? `@${cluster[0].author.username}` : 'Someone');
      const titles = cluster
        .map((item) => item.challenge?.title?.trim())
        .filter((title): title is string => Boolean(title));
      out.push({
        kind: 'stack',
        authorId: author,
        count: cluster.length,
        copy: `${name} checked in to ${cluster.length} challenges`,
        titles,
        firstPostId: cluster[0]!.id,
        postIds: cluster.map((item) => item.id),
      });
      continue;
    }
    used.add(post.id);
    out.push(post);
  }
  return out;
}
