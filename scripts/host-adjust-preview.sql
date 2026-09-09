-- PREVIEW ONLY. No writes.
-- SQL Editor → project blOb-app (tguzdtwsajnnczdxjqyq) → Run.

-- 1. challenge_checkins
select column_name, ordinal_position, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'challenge_checkins'
order by ordinal_position;

-- 2. challenge_participants
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'challenge_participants'
order by ordinal_position;

-- 3. Miss store (no miss_count on participants)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'challenge_period_misses'
order by ordinal_position;

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.challenge_checkins'::regclass
  and contype = 'c';

-- 4. Honor rows (Meredith-style key vs photo notes that mention honor)
select 'checkins_honor_key' as kind, count(*) as n
from public.challenge_checkins
where proof_parts ? 'honor'
union all
select 'checkins_submitted', count(*)
from public.challenge_checkins
where status = 'submitted'
union all
select 'submissions_proof_kind_honor', count(*)
from public.workout_submissions
where proof_kind = 'honor';

select proof_parts
from public.challenge_checkins
where proof_parts ? 'honor'
limit 3;

select proof_kind, status, count(*)
from public.workout_submissions
group by 1, 2
order by 3 desc;

-- 5. Moderator table (expect missing before WRITE)
select to_regclass('public.challenge_moderators') as challenge_moderators;
select to_regclass('public.host_adjust_audit') as host_adjust_audit;
select to_regclass('public.host_adjust_checkin') as host_adjust_checkin_reg;

-- 6. Host / official columns used by the RPC
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'challenges'
  and column_name in (
    'created_by', 'is_official', 'series_id', 'host_budget', 'privacy_mode',
    'status', 'timezone', 'starts_at', 'ends_at', 'days_required', 'length_value',
    'misses_allowed', 'format', 'challenge_type', 'scoring_method', 'frequency'
  )
order by column_name;
