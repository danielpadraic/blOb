-- OCR screenshot backfill — LIST ONLY. No writes.
--
-- Paste this in Supabase → SQL Editor (project tguzdtwsajnnczdxjqyq) and click Run.
-- Send the checkin_id list if you cannot run Node.
--
-- A row is a candidate when ALL of:
--  1. Challenge is fitness-shaped OR required proofs include method hr or distance.
--  2. The check-in has a still URL in an hr or distance slot (not a selfie / Wave / Round).
--  3. That slot is not HealthKit / Health Connect (including legacy clocked health with no source).
--  4. The Live post has no duration / distance / calories / avg HR yet.
--  5. The still is not a video and is not a generated workout card (healthWorkoutId).
--
-- Prefer the oldest live check-in post for that checkin_id.

WITH live_posts AS (
  SELECT DISTINCT ON (p.checkin_id)
    p.checkin_id,
    p.id AS post_id,
    p.checkin_stats,
    p.created_at AS post_created_at
  FROM public.posts p
  WHERE p.checkin_id IS NOT NULL
    AND p.deleted_at IS NULL
  ORDER BY p.checkin_id, p.created_at ASC, p.id ASC
),
slot_rows AS (
  SELECT
    cc.id AS checkin_id,
    cc.created_at,
    cc.challenge_id,
    cc.user_id,
    cc.period_key,
    c.category,
    c.proofs,
    lp.post_id,
    lp.checkin_stats,
    kv.key AS slot_id,
    kv.value AS slot,
    lower(trim(COALESCE(
      kv.value->>'method',
      (
        SELECT p->>'method'
        FROM jsonb_array_elements(COALESCE(c.proofs, '[]'::jsonb)) p
        WHERE p->>'id' = kv.key
        LIMIT 1
      ),
      ''
    ))) AS slot_method,
    CASE
      WHEN COALESCE(kv.value->>'url', '') <> ''
        AND COALESCE(kv.value->>'url', '') NOT LIKE 'health:%'
        THEN NULLIF(trim(kv.value->>'url'), '')
      WHEN jsonb_typeof(kv.value->'urls') = 'array'
        AND jsonb_array_length(kv.value->'urls') > 0
        AND jsonb_typeof(kv.value->'urls'->0) = 'string'
        AND COALESCE(kv.value->'urls'->>0, '') NOT LIKE 'health:%'
        THEN NULLIF(trim(kv.value->'urls'->>0), '')
      WHEN jsonb_typeof(kv.value->'urls') = 'array'
        AND jsonb_array_length(kv.value->'urls') > 0
        AND jsonb_typeof(kv.value->'urls'->0) = 'object'
        AND COALESCE(kv.value->'urls'->0->>'url', '') NOT LIKE 'health:%'
        THEN NULLIF(trim(COALESCE(kv.value->'urls'->0->>'url', '')), '')
      ELSE NULL
    END AS still_url
  FROM public.challenge_checkins cc
  JOIN public.challenges c ON c.id = cc.challenge_id
  JOIN live_posts lp ON lp.checkin_id = cc.id
  CROSS JOIN LATERAL jsonb_each(COALESCE(cc.proof_parts, '{}'::jsonb)) kv
),
ranked AS (
  SELECT
    s.*,
    s.slot->'health' AS health,
    row_number() OVER (PARTITION BY s.checkin_id ORDER BY s.slot_id) AS slot_rank
  FROM slot_rows s
  WHERE s.slot_method IN ('hr', 'distance')
    AND s.still_url IS NOT NULL
    AND s.still_url NOT ILIKE '%.mp4'
    AND s.still_url NOT ILIKE '%.mov'
    AND s.still_url NOT ILIKE '%.webm'
    AND s.still_url NOT ILIKE '%.m4v'
    AND COALESCE(s.slot->>'mime', '') NOT ILIKE 'video/%'
    AND (
      s.category = 'fitness'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(s.proofs, '[]'::jsonb)) p
        WHERE lower(trim(COALESCE(p->>'method', ''))) IN ('hr', 'distance')
      )
    )
    AND COALESCE(s.slot->'health'->>'healthWorkoutId', '') = ''
    AND COALESCE(s.slot->'health'->>'source', '') NOT IN ('healthkit', 'health_connect')
    AND NOT (
      NULLIF(trim(COALESCE(s.slot->'health'->>'source', '')), '') IS NULL
      AND (
        (
          NULLIF(trim(COALESCE(s.slot->'health'->>'startedAt', '')), '') IS NOT NULL
          AND NULLIF(trim(COALESCE(s.slot->'health'->>'endedAt', '')), '') IS NOT NULL
        )
        OR NULLIF(trim(COALESCE(s.slot->'health'->>'healthWorkoutId', '')), '') IS NOT NULL
      )
    )
    AND COALESCE(public.checkin_stat_number(s.slot->'health', 'durationSec'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.slot->'health', 'activeEnergyKcal'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.slot->'health', 'totalEnergyKcal'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.slot->'health', 'distanceMeters'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.slot->'health', 'avgHrBpm'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.checkin_stats, 'duration_sec'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.checkin_stats, 'distance_m'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.checkin_stats, 'active_cal'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.checkin_stats, 'total_cal'), 0) <= 0
    AND COALESCE(public.checkin_stat_number(s.checkin_stats, 'hr_avg'), 0) <= 0
)
SELECT
  checkin_id,
  created_at,
  challenge_id,
  user_id,
  period_key,
  post_id,
  slot_id,
  slot_method,
  still_url
FROM ranked
WHERE slot_rank = 1
ORDER BY created_at ASC, checkin_id ASC;
