-- Live: one post per checkin_id. PREVIEW first, then WRITE.
-- Challenge: 30-Day Consistency
-- f28b5591-6c32-4d82-8218-a13b3cafe8a1
--
-- Paste into Supabase → SQL Editor for project tguzdtwsajnnczdxjqyq.
-- Run STEP 1. If it returns rows, run STEP 2. Do not invent check-ins.
--
-- The unique index posts_one_live_checkin_idx already exists in migrations:
--   UNIQUE (checkin_id) WHERE checkin_id IS NOT NULL AND deleted_at IS NULL
-- Tonight's extras are rows that slipped through (or have a null checkin_id).

-- ========== STEP 1 — PREVIEW ONLY. No writes. ==========
-- Duplicate live posts that share a checkin_id
SELECT
  p.checkin_id,
  count(*) AS row_count,
  array_agg(p.id ORDER BY p.created_at ASC, p.id ASC) AS post_ids,
  array_agg(coalesce(array_length(p.media_urls, 1), 0) ORDER BY p.created_at ASC, p.id ASC) AS media_counts,
  min(p.created_at) AS oldest_at,
  max(p.created_at) AS newest_at
FROM public.posts p
WHERE p.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND p.checkin_id IS NOT NULL
  AND p.deleted_at IS NULL
GROUP BY p.checkin_id
HAVING count(*) > 1
ORDER BY newest_at DESC;

-- Empty "Check-in Complete" bubbles that share a checkin_id with a row that HAS media
SELECT
  empty.id AS empty_post_id,
  keep.id AS keep_post_id,
  empty.checkin_id,
  empty.author_id,
  empty.created_at AS empty_at,
  empty.content AS empty_content,
  coalesce(array_length(keep.media_urls, 1), 0) AS keep_media_count
FROM public.posts empty
JOIN public.posts keep
  ON keep.checkin_id = empty.checkin_id
 AND keep.id <> empty.id
 AND keep.deleted_at IS NULL
 AND coalesce(array_length(keep.media_urls, 1), 0) > 0
WHERE empty.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND empty.deleted_at IS NULL
  AND empty.checkin_id IS NOT NULL
  AND coalesce(array_length(empty.media_urls, 1), 0) = 0
  AND coalesce(empty.content, '') ILIKE 'Check-in Complete%'
ORDER BY empty.created_at DESC;

-- Tonight's empty Check-in Complete rows with no checkin_id (index cannot catch these)
SELECT
  p.id,
  p.author_id,
  p.checkin_id,
  p.created_at,
  p.content,
  coalesce(array_length(p.media_urls, 1), 0) AS media_count
FROM public.posts p
WHERE p.challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
  AND p.deleted_at IS NULL
  AND p.source = 'checkin'
  AND p.checkin_id IS NULL
  AND coalesce(array_length(p.media_urls, 1), 0) = 0
  AND coalesce(p.content, '') ILIKE 'Check-in Complete%'
  AND p.created_at >= timestamptz '2026-09-08 00:00:00-06'
ORDER BY p.created_at DESC;

-- ========== STEP 2 — WRITE. Run only after STEP 1 looks right. ==========
-- Merge extras onto the oldest live post for that checkin_id, then hide the extras.
DO $$
DECLARE
  rec record;
  v_keep uuid;
  v_media text[] := '{}';
  v_url text;
  v_stats jsonb;
  v_stage text;
  v_content text;
  v_row record;
BEGIN
  FOR rec IN
    SELECT checkin_id
    FROM public.posts
    WHERE challenge_id = 'f28b5591-6c32-4d82-8218-a13b3cafe8a1'
      AND checkin_id IS NOT NULL
      AND deleted_at IS NULL
    GROUP BY checkin_id
    HAVING count(*) > 1
  LOOP
    v_media := '{}';
    v_keep := NULL;
    v_stage := NULL;
    v_content := NULL;
    v_stats := NULL;
    FOR v_row IN
      SELECT id, media_urls, checkin_stage, content, checkin_stats, created_at
      FROM public.posts
      WHERE checkin_id = rec.checkin_id
        AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
    LOOP
      IF v_keep IS NULL THEN
        v_keep := v_row.id;
        v_content := v_row.content;
        v_stage := v_row.checkin_stage;
        v_stats := v_row.checkin_stats;
      END IF;
      IF v_row.media_urls IS NOT NULL THEN
        FOREACH v_url IN ARRAY v_row.media_urls LOOP
          IF coalesce(v_url, '') <> '' AND NOT (v_url = ANY (v_media)) THEN
            v_media := v_media || v_url;
          END IF;
        END LOOP;
      END IF;
      IF v_row.checkin_stage IN ('submitted', 'complete') THEN
        v_stage := v_row.checkin_stage;
        IF coalesce(v_row.content, '') <> '' THEN
          v_content := v_row.content;
        END IF;
      END IF;
      IF v_row.checkin_stats IS NOT NULL AND (
        v_stats IS NULL
        OR jsonb_typeof(v_row.checkin_stats) = 'object'
           AND (
             coalesce((v_row.checkin_stats->>'duration_sec')::numeric, 0)
             + coalesce((v_row.checkin_stats->>'hr_avg')::numeric, 0)
             + coalesce((v_row.checkin_stats->>'distance_m')::numeric, 0)
           )
           >=
           (
             coalesce((v_stats->>'duration_sec')::numeric, 0)
             + coalesce((v_stats->>'hr_avg')::numeric, 0)
             + coalesce((v_stats->>'distance_m')::numeric, 0)
           )
      ) THEN
        v_stats := v_row.checkin_stats;
      END IF;
    END LOOP;

    UPDATE public.posts
    SET
      media_urls = v_media,
      checkin_stage = coalesce(v_stage, checkin_stage),
      content = coalesce(v_content, content),
      checkin_stats = coalesce(v_stats, checkin_stats),
      source = 'checkin'
    WHERE id = v_keep;

    UPDATE public.posts
    SET deleted_at = now()
    WHERE checkin_id = rec.checkin_id
      AND id IS DISTINCT FROM v_keep
      AND deleted_at IS NULL;
  END LOOP;
END;
$$;
