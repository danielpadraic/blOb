-- Apple Health workouts as optional challenge proof.
-- Health evidence uses workout_submissions (same table as camera). No second proof system.
-- NOTIFY pgrst reloads PostgREST's schema cache so clients stop seeing PGRST204.

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  constraint health_connections_provider_check check (provider = 'apple_health'),
  constraint health_connections_status_check check (status in ('connected', 'disconnected'))
);

create table if not exists public.health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_workout_id text not null,
  activity_type text not null,
  activity_label text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null,
  calories_kcal numeric,
  distance_m numeric,
  hr_avg numeric,
  hr_max numeric,
  source_bundle text,
  confidence text not null,
  raw_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_workout_id),
  constraint health_workouts_provider_check check (provider = 'apple_health'),
  constraint health_workouts_confidence_check check (confidence in ('watch', 'phone', 'manual', 'unknown')),
  constraint health_workouts_duration_check check (duration_sec >= 0)
);

comment on table public.health_connections is 'Owner-only Apple Health connection flag. Disconnect stops future reads; existing proofs stay.';
comment on table public.health_workouts is 'Owner-only workout summaries used as challenge proof. No HR time series.';
comment on column public.health_workouts.raw_summary is 'Small summary only. Never store heart-rate samples.';

create index if not exists health_connections_user_idx
  on public.health_connections (user_id);
create index if not exists health_workouts_user_started_idx
  on public.health_workouts (user_id, started_at desc);

alter table public.workout_submissions
  add column if not exists proof_kind text;

alter table public.workout_submissions
  add column if not exists health_workout_id uuid references public.health_workouts(id);

comment on column public.workout_submissions.proof_kind is
  'camera | health_workout | existing values. Null camera rows stay valid.';
comment on column public.workout_submissions.health_workout_id is
  'Optional Health workout used as this day’s proof. Readable with the submission.';

alter table public.health_connections enable row level security;
alter table public.health_workouts enable row level security;

drop policy if exists "Owners manage their health connections" on public.health_connections;
create policy "Owners manage their health connections"
  on public.health_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage their health workouts" on public.health_workouts;
create policy "Owners manage their health workouts"
  on public.health_workouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.health_connections to authenticated;
grant select, insert, update, delete on public.health_workouts to authenticated;

create or replace function public.log_health_workout(
  p_challenge_id uuid,
  p_health_workout_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  hw public.health_workouts%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    p_submission_date := (timezone('utc', now()))::date;
  end if;

  select * into hw
  from public.health_workouts
  where id = p_health_workout_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'That workout is not available.';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.starts_at is not null and now() < ch.starts_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.official_started_at is not null and now() < ch.official_started_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Logging is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Logging is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;

  if exists (
    select 1
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = v_uid
      and s.submission_date = p_submission_date
  ) then
    raise exception 'You’ve already logged a workout for today.';
  end if;

  insert into public.workout_submissions (
    challenge_id,
    user_id,
    submission_date,
    pre_selfie_url,
    post_selfie_url,
    hr_monitor_url,
    notes,
    status,
    task_ids,
    proof_parts,
    proof_kind,
    health_workout_id
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    null,
    null,
    null,
    coalesce(p_notes, hw.activity_label),
    'pending_review',
    '[]'::jsonb,
    '{}'::jsonb,
    'health_workout',
    hw.id
  )
  returning id into v_id;

  v_days := public.refresh_participant_progress(p_challenge_id, v_uid);

  return (
    select jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'user_id', s.user_id,
      'submission_date', s.submission_date,
      'pre_selfie_url', s.pre_selfie_url,
      'post_selfie_url', s.post_selfie_url,
      'hr_monitor_url', s.hr_monitor_url,
      'notes', s.notes,
      'status', s.status,
      'created_at', s.created_at,
      'task_ids', s.task_ids,
      'proof_parts', s.proof_parts,
      'proof_kind', s.proof_kind,
      'health_workout_id', s.health_workout_id,
      'days_completed', v_days
    )
    from public.workout_submissions s
    where s.id = v_id
  );
exception
  when unique_violation then
    raise exception 'You’ve already logged a workout for today.';
end;
$$;

grant execute on function public.log_health_workout(uuid, uuid, date, text) to authenticated;

notify pgrst, 'reload schema';
