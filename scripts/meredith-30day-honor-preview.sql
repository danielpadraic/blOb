-- Meredith Dickson honor days on 30-Day Consistency.
-- PREVIEW first. WRITE only if Sept 1–5 submitted rows are missing.
-- Do NOT delete challenge_checkins, challenge_participants, or posts.
-- Do NOT charge buy-in again if a participant row already exists.

-- challenge: 30-Day Consistency  f28b5591-6c32-4d82-8218-a13b3cafe8a1
-- profile:   Meredith Dickson    e251a503-ac60-46ea-b153-b470e409519c
-- This table uses period_key (date), not period_date.
-- proof_kind lives on workout_submissions; honor lives in proof_parts.

-- ========== STEP 1 — PREVIEW ONLY. No writes. ==========

-- Participant already joined? (do not insert buy-in if this returns a row)
SELECT id, user_id, status, days_completed, joined_at
FROM public.challenge_participants
WHERE challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND user_id = 'e251a503-ac60-46ea-b153-b470e409519c';

-- Every Meredith check-in on this challenge (honor + later real days)
SELECT
  period_key,
  status,
  submitted_at,
  proof_parts,
  coalesce(proof_parts::text, '') ILIKE '%honor%' AS looks_honor
FROM public.challenge_checkins
WHERE challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
ORDER BY period_key;

-- Sept 1–5 must exist as submitted (honor). Missing dates need STEP 2.
SELECT d::date AS period_key
FROM generate_series(date '2026-09-01', date '2026-09-05', interval '1 day') AS d
WHERE NOT EXISTS (
  SELECT 1
  FROM public.challenge_checkins cc
  WHERE cc.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
    AND cc.user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
    AND cc.period_key = d::date
    AND cc.status = 'submitted'
);

-- Her Live posts. Empty Check-in Complete extras sharing a checkin_id with media
-- are feed dupes — hide those posts in live-dedupe-tonight.sql STEP 2, never the check-in.
SELECT
  p.id,
  p.checkin_id,
  p.created_at,
  p.content,
  coalesce(array_length(p.media_urls, 1), 0) AS media_count,
  p.deleted_at
FROM public.posts p
WHERE p.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND p.author_id = 'e251a503-ac60-46ea-b153-b470e409519c'
  AND p.deleted_at IS NULL
ORDER BY p.created_at;

-- Honor days on the Board come from workout_submissions (days_completed).
SELECT submission_date, status, proof_kind
FROM public.workout_submissions
WHERE challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
  AND submission_date BETWEEN date '2026-09-01' AND date '2026-09-05'
ORDER BY submission_date;

-- ========== STEP 2 — WRITE. Run only if STEP 1 listed missing Sept 1–5 dates. ==========
-- Inserts honor submitted rows for missing days only.
-- Does not insert a participant. Does not charge buy-in. Does not delete anything.

INSERT INTO public.challenge_checkins (
  user_id,
  challenge_id,
  period_key,
  status,
  proof_parts,
  notes,
  started_at,
  submitted_at
)
SELECT
  'e251a503-ac60-46ea-b153-b470e409519c'::uuid,
  'f28b5591-6c32-4d82-8218-a13b3cafe8a1'::uuid,
  d::date,
  'submitted',
  jsonb_build_object('honor', jsonb_build_object('method', 'honor')),
  'Honor check-in (ops)',
  (d::date + time '12:00') AT TIME ZONE 'America/Chicago',
  (d::date + time '12:00') AT TIME ZONE 'America/Chicago'
FROM generate_series(date '2026-09-01', date '2026-09-05', interval '1 day') AS d
WHERE EXISTS (
  SELECT 1
  FROM public.challenge_participants cp
  WHERE cp.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
    AND cp.user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.challenge_checkins cc
  WHERE cc.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
    AND cc.user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
    AND cc.period_key = d::date
);

-- Missing Board days only. Existing progress trigger recounts days_completed.
INSERT INTO public.workout_submissions (
  challenge_id,
  user_id,
  submission_date,
  notes,
  status,
  proof_parts,
  proof_kind
)
SELECT
  'f28b5591-6c32-4d82-8218-a13b3cafe8a1'::uuid,
  'e251a503-ac60-46ea-b153-b470e409519c'::uuid,
  d::date,
  'Honor check-in (ops)',
  'approved',
  jsonb_build_object('honor', jsonb_build_object('method', 'honor')),
  'honor'
FROM generate_series(date '2026-09-01', date '2026-09-05', interval '1 day') AS d
WHERE EXISTS (
  SELECT 1
  FROM public.challenge_participants cp
  WHERE cp.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
    AND cp.user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
)
AND NOT EXISTS (
  SELECT 1
  FROM public.workout_submissions s
  WHERE s.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
    AND s.user_id = 'e251a503-ac60-46ea-b153-b470e409519c'
    AND s.submission_date = d::date
);
