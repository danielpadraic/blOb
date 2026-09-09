/**
 * Backfill workout-screenshot OCR onto existing fitness check-ins.
 *
 * Reads HR / distance stills that never got HealthKit / Health Connect numbers, and writes
 * proof_parts[slot].health + posts.checkin_stats the same way a new OCR check-in does.
 * Does not create a second Live post. Does not change the photo or the caption.
 *
 * Needs live EXPO_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in local .env
 * (never commit the service role).
 *
 * From the blob-app repo:
 *
 *   npx tsx scripts/backfill-ocr-checkins.ts --dry-run
 *   npx tsx scripts/backfill-ocr-checkins.ts --apply --limit 25
 *
 * Resume a later batch:
 *
 *   npx tsx scripts/backfill-ocr-checkins.ts --apply --limit 25 --after <created_at> --after-id <checkin_id>
 *
 * One known check-in:
 *
 *   npx tsx scripts/backfill-ocr-checkins.ts --apply --only <checkin_id>
 *
 * If you cannot run Node, paste scripts/ocr-backfill-candidates.sql into Supabase → SQL Editor
 * (project tguzdtwsajnnczdxjqyq) and send the checkin_id list. That query lists only. It does not write.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { challengeClockTz } from '@/lib/checkinPeriod';
import { isAllowedOcrImageUrl } from '@/lib/health/ocrAllowlist';
import {
  challengeProofObjectPath,
  isVendorHealthSlot,
  pickOcrBackfillSlot,
  type OcrBackfillPart,
} from '@/lib/health/ocrBackfill';
import { buildOcrHealthProof, ocrFieldsFromParse } from '@/lib/health/ocrSession';
import { unionOcrFields } from '@/lib/health/ocrUnion';
import { hasOcrNumbers, parseWorkoutOcrText } from '@/lib/health/workoutOcr';

const ROOT = resolve(process.cwd());
const PAGE = 100;
const SAMPLE = 10;
const DEFAULT_APPLY_LIMIT = 25;
const PROOF_BUCKET = 'challenge-proofs';

type ChallengeRow = {
  id: string;
  category?: string | null;
  proofs?: Array<{ id?: string; method?: string | null }> | null;
  proof_type?: string | null;
  title?: string | null;
  task?: string | null;
  tasks?: unknown[] | null;
  rules?: string | null;
  description?: string | null;
  timezone?: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
};

type CheckinRow = {
  id: string;
  created_at: string;
  challenge_id: string;
  user_id: string;
  period_key?: string | null;
  proof_parts?: Record<string, OcrBackfillPart> | null;
};

type PostRow = {
  id: string;
  checkin_id: string;
  checkin_stats?: Record<string, unknown> | null;
  created_at: string;
};

type Candidate = {
  checkinId: string;
  createdAt: string;
  challengeId: string;
  periodKey: string;
  timeZone: string;
  slotId: string;
  method: 'hr' | 'distance';
  stillUrl: string;
  stillUrls: string[];
};

type Counts = {
  updated: number;
  skipped_not_workout: number;
  skipped_has_healthkit: number;
  failed_ocr: number;
};

function loadEnv(): void {
  const path = resolve(ROOT, '.env');
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === '') {
      process.env[key] = value;
    }
  }
}

function argValue(flag: string): string | null {
  const argv = process.argv.slice(2);
  const index = argv.indexOf(flag);
  if (index < 0) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function flag(name: string): boolean {
  return process.argv.slice(2).includes(name);
}

function logSkip(checkinId: string, reason: string): void {
  console.log('[blob:ocr-backfill]', { checkinId, reason });
}

function oldestLivePost(rows: PostRow[], checkinId: string): PostRow | null {
  const matches = rows
    .filter((row) => row.checkin_id === checkinId)
    .sort((a, b) => {
      const byTime = String(a.created_at).localeCompare(String(b.created_at));
      return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
    });
  return matches[0] ?? null;
}

function afterCursor(row: CheckinRow, after: string | null, afterId: string | null): boolean {
  if (!after) {
    return true;
  }
  if (row.created_at > after) {
    return true;
  }
  if (row.created_at === after && afterId && row.id > afterId) {
    return true;
  }
  return false;
}

async function fetchCandidates(
  supabase: SupabaseClient,
  opts: { after: string | null; afterId: string | null; only: string | null },
): Promise<Candidate[]> {
  const found: Candidate[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from('challenge_checkins')
      .select('id, created_at, challenge_id, user_id, period_key, proof_parts')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (opts.only) {
      query = query.eq('id', opts.only);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`challenge_checkins: ${error.message}`);
    }
    const page = (data ?? []) as CheckinRow[];
    if (page.length === 0) {
      break;
    }

    const challengeIds = [...new Set(page.map((row) => row.challenge_id))];
    const checkinIds = page.map((row) => row.id);
    const [{ data: challengeRows, error: challengeError }, { data: postRows, error: postError }] =
      await Promise.all([
        supabase
          .from('challenges')
          .select(
            'id, category, proofs, proof_type, title, task, tasks, rules, description, timezone, is_official, series_id',
          )
          .in('id', challengeIds),
        supabase
          .from('posts')
          .select('id, checkin_id, checkin_stats, created_at')
          .in('checkin_id', checkinIds)
          .is('deleted_at', null),
      ]);
    if (challengeError) {
      throw new Error(`challenges: ${challengeError.message}`);
    }
    if (postError) {
      throw new Error(`posts: ${postError.message}`);
    }

    const challenges = new Map(
      ((challengeRows ?? []) as ChallengeRow[]).map((row) => [row.id, row]),
    );
    const posts = (postRows ?? []) as PostRow[];

    for (const row of page) {
      if (!afterCursor(row, opts.after, opts.afterId)) {
        continue;
      }
      const challenge = challenges.get(row.challenge_id);
      const post = oldestLivePost(posts, row.id);
      if (!post) {
        continue;
      }
      const slot = pickOcrBackfillSlot({
        challenge,
        proofs: challenge?.proofs ?? null,
        parts: row.proof_parts ?? null,
        postStats: post.checkin_stats as { duration_sec?: number | null } | null,
      });
      if (!slot) {
        continue;
      }
      found.push({
        checkinId: row.id,
        createdAt: row.created_at,
        challengeId: row.challenge_id,
        periodKey: String(row.period_key ?? '').trim(),
        timeZone: challengeClockTz(challenge),
        slotId: slot.slotId,
        method: slot.method,
        stillUrl: slot.url,
        stillUrls: slot.urls.length ? slot.urls : [slot.url],
      });
    }

    if (page.length < PAGE) {
      break;
    }
    from += PAGE;
  }
  return found;
}

async function signedStillUrl(
  supabase: SupabaseClient,
  supabaseUrl: string,
  raw: string,
): Promise<string | null> {
  if (!isAllowedOcrImageUrl(raw, supabaseUrl) && !challengeProofObjectPath(raw, supabaseUrl)) {
    return null;
  }
  const path = challengeProofObjectPath(raw, supabaseUrl);
  if (!path) {
    return isAllowedOcrImageUrl(raw, supabaseUrl) ? raw : null;
  }
  const { data, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(path, 180);
  if (error || !data?.signedUrl) {
    return isAllowedOcrImageUrl(raw, supabaseUrl) ? raw : null;
  }
  return data.signedUrl;
}

function isHtmlOrAuthFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /\b401\b/.test(message) ||
    /could not fetch image \(401\)/i.test(message) ||
    /html/i.test(message) ||
    /doctype/i.test(message)
  );
}

async function applyOne(
  supabase: SupabaseClient,
  supabaseUrl: string,
  row: Candidate,
  counts: Counts,
): Promise<void> {
  const { data: live, error: liveError } = await supabase
    .from('challenge_checkins')
    .select('proof_parts')
    .eq('id', row.checkinId)
    .maybeSingle();
  if (liveError) {
    counts.failed_ocr += 1;
    logSkip(row.checkinId, 'reload_failed');
    return;
  }
  const parts = (live?.proof_parts ?? {}) as Record<string, OcrBackfillPart>;
  const part = parts[row.slotId];
  if (isVendorHealthSlot(part ?? {})) {
    counts.skipped_has_healthkit += 1;
    logSkip(row.checkinId, 'has_healthkit');
    return;
  }

  const stills = row.stillUrls.length ? row.stillUrls : [row.stillUrl];
  const reads: Array<{
    fields: ReturnType<typeof ocrFieldsFromParse>;
    clockRange: ReturnType<typeof parseWorkoutOcrText>['clockRange'];
    activityLabel: string | null;
  }> = [];
  let sawWorkout = false;
  for (const still of stills) {
    const imageUrl = await signedStillUrl(supabase, supabaseUrl, still);
    if (!imageUrl || !isAllowedOcrImageUrl(imageUrl, supabaseUrl)) {
      continue;
    }
    try {
      const { downloadImageBytes } = await import('../api/_lib/ocrRunner');
      const { ocrWorkoutFromBuffer } = await import('../api/ocr-workout');
      const bytes = await downloadImageBytes(imageUrl);
      const read = await ocrWorkoutFromBuffer(bytes);
      if (!read.isWorkoutScreen) {
        continue;
      }
      sawWorkout = true;
      if (!hasOcrNumbers(read.parsed)) {
        continue;
      }
      reads.push({
        fields: ocrFieldsFromParse(read.parsed),
        clockRange: read.parsed?.clockRange ?? null,
        activityLabel: read.parsed?.activityLabel ?? null,
      });
    } catch (error) {
      if (isHtmlOrAuthFailure(error)) {
        counts.failed_ocr += 1;
        logSkip(row.checkinId, 'ocr_http');
        return;
      }
      continue;
    }
  }
  if (reads.length === 0) {
    counts.skipped_not_workout += 1;
    logSkip(row.checkinId, sawWorkout ? 'no_numbers' : 'blocked_url');
    return;
  }
  const union = unionOcrFields(reads);

  const snapshot = buildOcrHealthProof({
    fields: union.fields,
    source: 'ocr',
    activityLabel: union.activityLabel,
    clockRange: union.clockRange,
    periodKey: row.periodKey || null,
    timeZone: row.timeZone || null,
  });
  if (!snapshot) {
    counts.skipped_not_workout += 1;
    logSkip(row.checkinId, 'empty_snapshot');
    return;
  }

  const { error } = await supabase.rpc('backfill_ocr_checkin_health', {
    p_checkin_id: row.checkinId,
    p_proof_id: row.slotId,
    p_health: JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>,
  });
  if (error) {
    const code = String(error.message ?? '');
    if (code.includes('HAS_VENDOR')) {
      counts.skipped_has_healthkit += 1;
      logSkip(row.checkinId, 'has_healthkit');
      return;
    }
    if (code.includes('HAS_METRICS') || code.includes('HAS_WORKOUT_CARD') || code.includes('NOT_HR_DISTANCE')) {
      counts.skipped_not_workout += 1;
      logSkip(row.checkinId, code);
      return;
    }
    counts.failed_ocr += 1;
    logSkip(row.checkinId, 'rpc_failed');
    return;
  }

  counts.updated += 1;
  console.log('[blob:ocr-backfill]', { checkinId: row.checkinId, reason: 'updated', slotId: row.slotId });
}

async function main(): Promise<void> {
  loadEnv();
  const apply = flag('--apply') && !flag('--dry-run');
  const limitRaw = argValue('--limit');
  const limit = apply
    ? Math.max(1, Number(limitRaw ?? DEFAULT_APPLY_LIMIT) || DEFAULT_APPLY_LIMIT)
    : Math.max(0, Number(limitRaw ?? 0) || 0);
  const after = argValue('--after');
  const afterId = argValue('--after-id');
  const only = argValue('--only');

  const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/$/, '');
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl) {
    console.error('Missing EXPO_PUBLIC_SUPABASE_URL in local .env');
    process.exit(1);
  }
  if (!serviceKey) {
    console.error(
      'Missing SUPABASE_SERVICE_ROLE_KEY in local .env. Add the service_role secret from Supabase → Project Settings → API. Never commit it.',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const candidates = await fetchCandidates(supabase, { after, afterId, only });
  const sample = candidates.slice(0, SAMPLE);

  if (!apply) {
    console.log(`candidates: ${candidates.length}`);
    console.log('sample:');
    for (const row of sample) {
      console.log(`  ${row.checkinId}  ${row.createdAt}  ${row.method}  ${row.slotId}`);
    }
    if (candidates.length > 0) {
      const last = candidates[candidates.length - 1];
      console.log(
        `resume cursor (end of list): --after ${last.createdAt} --after-id ${last.checkinId}`,
      );
    }
    return;
  }

  const batch = candidates.slice(0, limit);
  const counts: Counts = {
    updated: 0,
    skipped_not_workout: 0,
    skipped_has_healthkit: 0,
    failed_ocr: 0,
  };

  console.log(`apply ${batch.length} of ${candidates.length} candidates (limit ${limit})`);
  for (const row of batch) {
    await applyOne(supabase, supabaseUrl, row, counts);
  }

  const last = batch[batch.length - 1];
  console.log({
    updated: counts.updated,
    skipped_not_workout: counts.skipped_not_workout,
    skipped_has_healthkit: counts.skipped_has_healthkit,
    failed_ocr: counts.failed_ocr,
  });
  if (last) {
    console.log(`resume: --after ${last.createdAt} --after-id ${last.checkinId}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
