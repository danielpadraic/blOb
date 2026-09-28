import { requiredChallengeProofs } from '@/lib/challenges';
import { distanceProofIsSessionLog } from '@/lib/challengeExperience';
import {
  parseProofParts,
  partSatisfies,
  proofDisplayName,
  proofSlotPart,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import type { CheckinPhase } from '@/lib/challengeCheckin';
import { isCheckinPost } from '@/lib/checkinPost';
import { checkinHidesHomeShare } from '@/lib/checkinShare';
import {
  challengeClockTz,
  checkinPeriodKeyCandidates,
  normalizePeriodKey,
  periodKeyFor,
} from '@/lib/checkinPeriod';
import { allowsMultiCheckin, usesPeriodCheckinGate } from '@/lib/loggable';
import { dateStampInZone } from '@/lib/officialDays';
import { isOfficialCoinChallenge } from '@/lib/officialCoin';
import { isClipSharePost } from '@/lib/roundShare';

type LoggableLike = {
  id: string;
  title: string;
  task?: string | null;
  taskLabel?: string | null;
  checkinPhase?: CheckinPhase | null;
  remainingProofLabels?: string[];
  filledProofCount?: number;
  requiredProofCount?: number;
  proofParts?: unknown;
  official_kind?: string | null;
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
 * Chip from remaining required proofs on this period.
 * A `done=` id and a submitted row do not close a period that still has an open slot.
 * `filledSlots` / `requiredCount` are omitted by older callers; when present, a slot
 * counts only if it is actually stored.
 */
export function hubRowState(
  phase?: CheckinPhase | null,
  done?: boolean,
  remaining?: readonly string[] | null,
  periodGate?: boolean,
  filledSlots?: number,
  requiredCount?: number,
): MultiCheckinState {
  const open = (remaining ?? []).map((label) => String(label ?? '').trim()).filter(Boolean);
  const filled = typeof filledSlots === 'number' ? Math.max(0, filledSlots) : null;
  const required = typeof requiredCount === 'number' ? Math.max(0, requiredCount) : null;
  if (required === 0) {
    // No required slots to read — a submitted row is not Complete.
    if (phase === 'in_progress' || phase === 'ready') {
      return 'in_progress';
    }
    return 'not_started';
  }
  if (open.length > 0) {
    const started =
      filled != null
        ? filled > 0
        : Boolean(done) || phase === 'in_progress' || phase === 'ready' || phase === 'submitted';
    return started ? 'in_progress' : 'not_started';
  }
  if (required != null && filled != null && filled < required) {
    return filled > 0 ? 'in_progress' : 'not_started';
  }
  if (periodGate === false) {
    if (filled != null) {
      // A submitted miles log is the previous send. The next log starts empty.
      if (phase === 'submitted') {
        return 'not_started';
      }
      if (filled > 0 || phase === 'in_progress' || phase === 'ready') {
        return 'in_progress';
      }
      return 'not_started';
    }
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

export type ProofLegacyUrls = {
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
};

export type CheckinSlotSnapshot = {
  remaining: string[];
  filled: number;
  required: number;
  parts: Record<string, ChallengeProofPart>;
};

/** Required slots for this period, using the same part the composer shows. */
export function checkinSlotSnapshot(
  challenge: Pick<LoggableLike, 'proofs' | 'proof_type' | 'proof_requirements' | 'taskLabel' | 'task'> | null | undefined,
  parts?: unknown,
  legacy?: ProofLegacyUrls | null,
): CheckinSlotSnapshot {
  const proofs = requiredChallengeProofs(challenge as never).filter((proof) => proof.method !== 'honor');
  const parsed = parseProofParts(parts);
  const opts = { sessionDistance: distanceProofIsSessionLog(challenge as never) };
  const folded: Record<string, ChallengeProofPart> = { ...parsed };
  const remaining: string[] = [];
  let filled = 0;
  for (const proof of proofs) {
    const slot = proofSlotPart(proof, parsed, legacy);
    if (slot) {
      folded[proof.id] = slot;
    }
    if (partSatisfies(proof, slot, opts)) {
      filled += 1;
    } else {
      remaining.push(proofDisplayName(proof));
    }
  }
  return { remaining, filled, required: proofs.length, parts: folded };
}

export function remainingProofLabelsOf(
  challenge: Pick<LoggableLike, 'proofs' | 'proof_type' | 'proof_requirements' | 'taskLabel' | 'task'> | null | undefined,
  parts?: unknown,
  _phase?: CheckinPhase | null,
  legacy?: ProofLegacyUrls | null,
): string[] {
  return checkinSlotSnapshot(challenge, parts, legacy).remaining;
}

export const OFFICIAL_PAIR_PROGRESS =
  'Pre-workout in. Still need post-workout selfie and 30-min HR.';
export const OFFICIAL_PAIR_STAMPED = 'Weekly and Monthly are both stamped for today.';
export const OFFICIAL_PAIR_IDLE = 'Fills the Weekly and Monthly rooms in one go.';

export type OfficialRoomSlots = {
  remaining: readonly string[];
  filled: number;
} | null;

function cleanLabels(labels: readonly string[] | null | undefined): string[] {
  return [...new Set((labels ?? []).map((label) => String(label ?? '').trim()).filter(Boolean))];
}

/** Pre is stored and the only open slots are the post selfie and the HR proof. */
function preOnlyRemainder(labels: readonly string[]): boolean {
  const lower = cleanLabels(labels).map((label) => label.toLowerCase());
  if (lower.length === 0) {
    return false;
  }
  const pre = lower.some((label) => label.includes('pre-workout') || label.includes('pre-selfie'));
  const post = lower.filter(
    (label) =>
      label.includes('post-workout') ||
      label.includes('post-selfie') ||
      (label.includes('post') && label.includes('selfie')),
  );
  const hr = lower.filter((label) => label.includes('heart rate') || label.includes('elevated heart'));
  const known = new Set([...post, ...hr]);
  const other = lower.filter((label) => !known.has(label));
  return !pre && post.length > 0 && hr.length > 0 && other.length === 0;
}

/**
 * Official weekly + monthly share one proof. Complete only when both rooms
 * have every required slot. A pre selfie alone is In progress.
 */
export function officialPairChip(weekly: OfficialRoomSlots, monthly: OfficialRoomSlots): {
  state: MultiCheckinState;
  line: string;
} {
  const present = [weekly, monthly].filter((side): side is { remaining: readonly string[]; filled: number } =>
    Boolean(side),
  );
  const filled = present.reduce((sum, side) => sum + Math.max(0, Number(side.filled) || 0), 0);
  const weeklyDone =
    weekly != null && weekly.filled > 0 && cleanLabels(weekly.remaining).length === 0;
  const monthlyDone =
    monthly != null && monthly.filled > 0 && cleanLabels(monthly.remaining).length === 0;
  if (weekly != null && monthly != null && weeklyDone && monthlyDone) {
    return { state: 'complete', line: OFFICIAL_PAIR_STAMPED };
  }
  if (filled < 1) {
    return { state: 'not_started', line: OFFICIAL_PAIR_IDLE };
  }
  const labels = cleanLabels(
    present.filter((side) => side.filled > 0).flatMap((side) => cleanLabels(side.remaining)),
  );
  if (preOnlyRemainder(labels)) {
    return { state: 'in_progress', line: OFFICIAL_PAIR_PROGRESS };
  }
  return { state: 'in_progress', line: labels.join(' · ') };
}

export type StoredPeriodCheckin = {
  challenge_id: string;
  period_key?: string | null;
  status?: string | null;
  submitted_at?: string | null;
  proof_parts?: unknown;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
};

function rowIsSubmitted(row: StoredPeriodCheckin): boolean {
  return Boolean(row.submitted_at) || row.status === 'submitted';
}

function rowMatchesThisPeriod(challenge: LoggableLike, row: StoredPeriodCheckin, now: Date): boolean {
  let candidates: string[] = [];
  try {
    candidates = checkinPeriodKeyCandidates(challenge as never, now).map((key) => normalizePeriodKey(key));
  } catch {
    const key = periodKeyFor(challenge as never, now);
    candidates = key ? [normalizePeriodKey(key)] : [];
  }
  const stored = normalizePeriodKey(row.period_key);
  if (stored && candidates.includes(stored)) {
    return true;
  }
  if (!row.submitted_at) {
    return false;
  }
  const submitted = new Date(row.submitted_at);
  if (Number.isNaN(submitted.getTime())) {
    return false;
  }
  const period = periodKeyFor(challenge as never, now);
  if (!period) {
    return false;
  }
  try {
    return dateStampInZone(submitted, challengeClockTz(challenge as never)) === period;
  } catch {
    return false;
  }
}

function mergeStoredParts(rows: StoredPeriodCheckin[]): {
  parts: Record<string, ChallengeProofPart>;
  legacy: ProofLegacyUrls;
} {
  const parts: Record<string, ChallengeProofPart> = {};
  const legacy: ProofLegacyUrls = {
    pre_selfie_url: null,
    post_selfie_url: null,
    hr_monitor_url: null,
  };
  for (const row of rows) {
    for (const [id, part] of Object.entries(parseProofParts(row.proof_parts))) {
      const prev = parts[id];
      if (!prev) {
        parts[id] = part;
        continue;
      }
      parts[id] = {
        ...prev,
        ...part,
        method: prev.method || part.method,
        url: prev.url || part.url,
        urls: [...new Set([...(prev.urls ?? []), prev.url, ...(part.urls ?? []), part.url].filter(Boolean) as string[])],
        text: prev.text?.trim() ? prev.text : part.text,
        health: prev.health ?? part.health ?? null,
        healthWorkoutId: prev.healthWorkoutId || part.healthWorkoutId || null,
        distanceMeters: Number(prev.distanceMeters) > 0 ? prev.distanceMeters : part.distanceMeters,
      };
    }
    legacy.pre_selfie_url = legacy.pre_selfie_url || row.pre_selfie_url || null;
    legacy.post_selfie_url = legacy.post_selfie_url || row.post_selfie_url || null;
    legacy.hr_monitor_url = legacy.hr_monitor_url || row.hr_monitor_url || null;
  }
  return { parts, legacy };
}

function phaseFromRows(rows: StoredPeriodCheckin[]): CheckinPhase {
  if (rows.length === 0) {
    return 'none';
  }
  if (rows.some((row) => rowIsSubmitted(row))) {
    return 'submitted';
  }
  if (rows.some((row) => row.status === 'ready')) {
    return 'ready';
  }
  return 'in_progress';
}

/**
 * Check-in rows for THIS period, the same window the composer reads.
 * A repeating miles log ignores an already-submitted row so the next log starts empty.
 * Official keeps a submitted pre selfie — that period is not closed.
 */
export function resolveOpenPeriodCheckin(
  challenge: LoggableLike,
  rows: StoredPeriodCheckin[],
  now = new Date(),
): { phase: CheckinPhase; snapshot: CheckinSlotSnapshot } {
  const matched = rows.filter(
    (row) => String(row.challenge_id) === String(challenge.id) && rowMatchesThisPeriod(challenge, row, now),
  );
  const repeating = allowsMultiCheckin(challenge as never) && !isOfficialCoinChallenge(challenge as never);
  const openRows = repeating ? matched.filter((row) => !rowIsSubmitted(row)) : matched;
  const { parts, legacy } = mergeStoredParts(openRows);
  return {
    phase: phaseFromRows(openRows),
    snapshot: checkinSlotSnapshot(challenge, parts, legacy),
  };
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
        item.filledProofCount,
        item.requiredProofCount,
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
