-- Workout session ledger.
--
-- Column names map 1:1 onto the CheckinHealthProof jsonb already stored on
-- challenge_checkins.proof_parts[slot].health, so OCR does not introduce a second vocabulary for
-- the same numbers. Layering, so there is one place to look for each job:
--   proof_parts[slot].health  the proof record for that check-in (authoritative for its numbers)
--   posts.checkin_stats       the display projection the feeds already render
--   workout_sessions          per-session ledger for ops, audit, and OCR results
--
-- health_workouts stays exactly as it is: it mirrors what HealthKit told us and its NOT NULL
-- columns back the Begin-nudge logic. An OCR'd screenshot has no vendor id and usually no
-- absolute clock times, so it cannot live there without loosening those invariants.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid references public.challenges (id) on delete set null,
  checkin_id uuid references public.challenge_checkins (id) on delete cascade,
  post_id uuid references public.posts (id) on delete set null,

  source text not null check (source in ('healthkit', 'health_connect', 'ocr', 'manual')),

  activity_type text,
  activity_label text,
  started_at timestamptz,
  ended_at timestamptz,

  -- Ranges match the client clamps in lib/health/workoutOcr.ts. A value outside them is a
  -- misread, not a workout, and must never reach a post.
  duration_sec integer check (duration_sec is null or (duration_sec >= 60 and duration_sec <= 28800)),
  active_kcal numeric check (active_kcal is null or (active_kcal >= 0 and active_kcal <= 5000)),
  total_kcal numeric check (total_kcal is null or (total_kcal >= 0 and total_kcal <= 5000)),
  distance_m numeric check (distance_m is null or (distance_m >= 0 and distance_m <= 500000)),
  hr_min numeric check (hr_min is null or (hr_min >= 30 and hr_min <= 230)),
  hr_avg numeric check (hr_avg is null or (hr_avg >= 30 and hr_avg <= 230)),
  hr_max numeric check (hr_max is null or (hr_max >= 30 and hr_max <= 230)),

  vendor_workout_id text,
  proof_url text,

  ocr_confidence numeric check (ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 1)),
  ocr_raw text,
  ocr_skip_reason text,
  backfilled boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workout_sessions is
  'Per-session workout ledger for HealthKit attaches and OCR reads. Owner-visible and official-review only. Never a public profile field and never a leaderboard source.';
comment on column public.workout_sessions.ocr_raw is
  'Raw OCR text for debugging a misread. Do not select in the app client outside __DEV__ submit debug.';
comment on column public.workout_sessions.backfilled is
  'True when the row came from the backfill job rather than a live check-in.';

-- One live session per check-in. This is what makes the backfill re-runnable.
create unique index if not exists workout_sessions_checkin_key
  on public.workout_sessions (checkin_id)
  where checkin_id is not null;

-- Historical extras that predate check-in ids key on the proof image instead.
create unique index if not exists workout_sessions_user_proof_key
  on public.workout_sessions (user_id, proof_url)
  where checkin_id is null and proof_url is not null;

create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);
create index if not exists workout_sessions_challenge_idx
  on public.workout_sessions (challenge_id)
  where challenge_id is not null;

alter table public.workout_sessions enable row level security;

-- Owner reads their own sessions. Official review reads all, matching the predicate already used
-- for health_workouts. anon is never granted anything on this table.
drop policy if exists "Owner or official reads workout sessions" on public.workout_sessions;
create policy "Owner or official reads workout sessions"
  on public.workout_sessions for select
  to authenticated
  using (user_id = auth.uid() or public.is_official_viewer());

drop policy if exists "Owner inserts own workout sessions" on public.workout_sessions;
create policy "Owner inserts own workout sessions"
  on public.workout_sessions for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owner updates own workout sessions" on public.workout_sessions;
create policy "Owner updates own workout sessions"
  on public.workout_sessions for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy on purpose: a check-in's proof record is not user-deletable.

revoke all on public.workout_sessions from anon;
grant select, insert, update on public.workout_sessions to authenticated;
grant all on public.workout_sessions to service_role;

-- Operator readout. security_invoker means these views honour the policies above, so a normal
-- user sees only their own rows and only official review sees everyone.

drop view if exists public.ops_user_workout_totals;
create view public.ops_user_workout_totals
with (security_invoker = true) as
select
  s.user_id,
  p.username,
  p.display_name,
  count(*) as session_count,
  sum(s.duration_sec) as total_duration_sec,
  sum(s.active_kcal) as total_active_kcal,
  sum(s.distance_m) as total_distance_m,
  count(*) filter (where s.source = 'healthkit') as sessions_from_healthkit,
  count(*) filter (where s.source = 'ocr') as sessions_from_ocr,
  min(coalesce(s.started_at, s.created_at)) as first_session,
  max(coalesce(s.started_at, s.created_at)) as last_session
from public.workout_sessions s
left join public.profiles p on p.id = s.user_id
group by s.user_id, p.username, p.display_name;

drop view if exists public.ops_user_workout_sessions;
create view public.ops_user_workout_sessions
with (security_invoker = true) as
select
  s.id,
  s.user_id,
  p.username,
  p.display_name,
  c.title as challenge_title,
  coalesce(s.started_at, s.created_at) as session_at,
  s.source,
  s.activity_label,
  s.duration_sec,
  s.active_kcal,
  s.hr_avg,
  s.hr_max,
  s.distance_m,
  s.ocr_confidence,
  s.proof_url,
  s.backfilled
from public.workout_sessions s
left join public.profiles p on p.id = s.user_id
left join public.challenges c on c.id = s.challenge_id;

revoke all on public.ops_user_workout_totals from anon;
revoke all on public.ops_user_workout_sessions from anon;
grant select on public.ops_user_workout_totals to authenticated, service_role;
grant select on public.ops_user_workout_sessions to authenticated, service_role;
