-- Heart-rate signatures, so a handed-off workout can be seen.
--
-- The abuse this is for: a person who misses their workout hands their own watch to someone else to
-- finish it for them. The account, the device and the workout are all genuinely theirs, so nothing in
-- provenance can see it — source_bundle is identical because it is the same watch. The only witness is
-- the trace, because two bodies doing the same work produce different traces.
--
-- What this stores is derived statistics from a workout's own heart-rate trace: the same class of
-- reading as the hr_avg and hr_max already on health_workouts, plus how fast the rate rose and fell.
-- No body metrics, no timestamps of individual beats, no template that identifies a person — the
-- comparison below only ever measures an account against its own history, never against anybody else.

create table if not exists public.workout_hr_signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The vendor workout this describes. One signature per workout; a re-read updates rather than stacks.
  provider_workout_id text not null,
  activity_type text not null,
  activity_label text,
  -- Which device recorded it. Kept because a signature that shifts at the same moment the recording
  -- device changes is a different story than one that shifts on the same watch.
  source_id text,
  started_at timestamptz not null,
  duration_sec integer not null,
  points integer not null,
  hr_mean numeric not null,
  hr_peak numeric not null,
  hr_floor numeric not null,
  hr_sd numeric not null,
  onset_bpm_min numeric,
  recovery_bpm_min numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_workout_id)
);

create index if not exists workout_hr_signatures_user_activity_idx
  on public.workout_hr_signatures (user_id, activity_type, started_at desc);

alter table public.workout_hr_signatures enable row level security;

-- Owners insert their own and may read their own: these are statistics about their own heart, and
-- hiding a person's own health-derived data from them would be the wrong trade. The comparison and the
-- flag are what stay internal, and those live in the review function below.
drop policy if exists "Users insert own hr signatures" on public.workout_hr_signatures;
create policy "Users insert own hr signatures"
  on public.workout_hr_signatures for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users update own hr signatures" on public.workout_hr_signatures;
create policy "Users update own hr signatures"
  on public.workout_hr_signatures for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users read own hr signatures" on public.workout_hr_signatures;
create policy "Users read own hr signatures"
  on public.workout_hr_signatures for select
  to authenticated
  using (user_id = auth.uid() or public.is_official_viewer());

grant insert, update, select on public.workout_hr_signatures to authenticated;

comment on table public.workout_hr_signatures is
  'Per-workout heart-rate statistics, compared only against the same account''s own prior sessions to '
  'spot a workout completed by someone else on the owner''s device. Not shared with third parties.';

-- How far a session has to sit from an account's own baseline before it is worth a look.
--
-- Sigma floors matter more than the threshold. A handful of near-identical sessions produces a tiny
-- standard deviation, and without a floor every ordinary 4-bpm wobble afterwards would read as six
-- sigma. These floors are the honest noise in a wrist sensor plus a normal day: sleep, caffeine, heat,
-- illness, a strap worn tighter.
create or replace function public.hr_baseline_floor(p_feature text)
returns numeric
language sql
immutable
as $$
  select case p_feature
    when 'mean' then 5.0
    when 'peak' then 6.0
    when 'floor' then 5.0
    when 'recovery' then 3.0
    else 5.0
  end;
$$;

/**
 * Sessions that do not look like the account that logged them.
 *
 * For each recent signature, the baseline is that same user's earlier sessions in the same activity —
 * earlier only, so a suspect session never joins the baseline it is being measured against, and same
 * activity because one person's own average ran 98 to 130 across a single week of strength sessions
 * while their pickleball sat at 89. Comparing across activities would flag everybody.
 *
 * A session is flagged when at least three of the four features sit beyond the threshold together.
 * Any single feature drifting is a cold, a hot day, or a hard week. Three moving at once, on a body
 * that has been consistent for weeks, is the thing worth a human look — and a human look is all this
 * returns. Nothing here blocks a check-in or touches settlement.
 */
create or replace function public.hr_integrity_review(
  p_days integer default 30,
  p_min_history integer default 5,
  p_threshold numeric default 2.5
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.is_official_viewer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.off desc, x.started_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      s.user_id,
      p.username,
      p.display_name,
      s.provider_workout_id,
      s.activity_type,
      s.activity_label,
      s.started_at,
      s.duration_sec,
      s.source_id,
      b.sessions as baseline_sessions,
      -- The session, then what this account normally does, then how far apart they are.
      jsonb_build_object(
        'mean', s.hr_mean, 'peak', s.hr_peak, 'floor', s.hr_floor,
        'recovery', s.recovery_bpm_min
      ) as session,
      jsonb_build_object(
        'mean', round(b.mean_avg, 1), 'peak', round(b.peak_avg, 1), 'floor', round(b.floor_avg, 1),
        'recovery', round(b.recovery_avg, 1)
      ) as baseline,
      jsonb_build_object(
        'mean', round(z.mean_z, 2), 'peak', round(z.peak_z, 2), 'floor', round(z.floor_z, 2),
        'recovery', round(z.recovery_z, 2)
      ) as sigma,
      z.off
    from public.workout_hr_signatures s
    join public.profiles p on p.id = s.user_id
    cross join lateral (
      select
        count(*) as sessions,
        avg(h.hr_mean) as mean_avg,
        greatest(coalesce(stddev_samp(h.hr_mean), 0), public.hr_baseline_floor('mean')) as mean_sd,
        avg(h.hr_peak) as peak_avg,
        greatest(coalesce(stddev_samp(h.hr_peak), 0), public.hr_baseline_floor('peak')) as peak_sd,
        avg(h.hr_floor) as floor_avg,
        greatest(coalesce(stddev_samp(h.hr_floor), 0), public.hr_baseline_floor('floor')) as floor_sd,
        avg(h.recovery_bpm_min) as recovery_avg,
        greatest(coalesce(stddev_samp(h.recovery_bpm_min), 0), public.hr_baseline_floor('recovery'))
          as recovery_sd
      from public.workout_hr_signatures h
      where h.user_id = s.user_id
        and h.activity_type = s.activity_type
        and h.started_at < s.started_at
    ) b
    cross join lateral (
      select
        abs(s.hr_mean - b.mean_avg) / b.mean_sd as mean_z,
        abs(s.hr_peak - b.peak_avg) / b.peak_sd as peak_z,
        abs(s.hr_floor - b.floor_avg) / b.floor_sd as floor_z,
        case
          when s.recovery_bpm_min is null or b.recovery_avg is null then null
          else abs(s.recovery_bpm_min - b.recovery_avg) / b.recovery_sd
        end as recovery_z
    ) d
    cross join lateral (
      select
        d.mean_z, d.peak_z, d.floor_z, d.recovery_z,
        (case when d.mean_z >= p_threshold then 1 else 0 end)
          + (case when d.peak_z >= p_threshold then 1 else 0 end)
          + (case when d.floor_z >= p_threshold then 1 else 0 end)
          + (case when coalesce(d.recovery_z, 0) >= p_threshold then 1 else 0 end) as off
    ) z
    where s.started_at >= now() - make_interval(days => greatest(p_days, 1))
      and b.sessions >= greatest(p_min_history, 3)
      and z.off >= 3
  ) x;

  return v_rows;
end;
$$;

revoke all on function public.hr_integrity_review(integer, integer, numeric) from public;
grant execute on function public.hr_integrity_review(integer, integer, numeric) to authenticated, service_role;

notify pgrst, 'reload schema';
