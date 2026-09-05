-- Fitness check-in posts carry a structured proof-stats payload for the feed chip row.
-- Caption stays user text only: checkin_post_caption is unchanged and still returns
-- "Check-in Complete" for an empty note. Nothing here invents "{Name} is {task}!".
--
-- Two payloads, two homes:
--   public  -> posts.checkin_stats, display-safe numbers only, no vendor id, no body metrics.
--   private -> health_workouts.raw_summary, already owner-only, now also readable by official
--              review. That table is never on the public profile.
--
-- save_checkin_proof and submit_checkin signatures and settlement math are unchanged.

alter table public.posts
  add column if not exists checkin_stats jsonb;

comment on column public.posts.checkin_stats is
  'Display-safe fitness check-in stats for post chips. Never a vendor workout id, never body metrics.';

-- Official review reads the owner-only raw HealthKit summary. Policies are OR-ed, so the
-- existing owner policy is left exactly as it is.
drop policy if exists "Official review reads health workouts" on public.health_workouts;
create policy "Official review reads health workouts"
  on public.health_workouts for select
  to authenticated
  using (public.is_official_viewer());

-- Positive numeric field out of a jsonb snapshot. Returns null for a missing key, a
-- non-number, or a zero, so callers can drop the row instead of printing 0.
create or replace function public.checkin_stat_number(p_snapshot jsonb, p_key text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when p_snapshot is null then null
    when jsonb_typeof(p_snapshot -> p_key) <> 'number' then null
    when (p_snapshot ->> p_key)::numeric > 0 then (p_snapshot ->> p_key)::numeric
    else null
  end;
$$;

-- Display-safe stats for a check-in, or null when the challenge is not fitness or the
-- check-in carries no Health snapshot. Prayer, honor and every non-fitness category get null.
create or replace function public.checkin_fitness_stats(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_category text;
  v_health jsonb;
  v_stats jsonb := '{}'::jsonb;
  v_value numeric;
begin
  if p_checkin_id is null then
    return null;
  end if;

  select c.challenge_id into v_challenge_id
  from public.challenge_checkins c
  where c.id = p_checkin_id;

  if v_challenge_id is null then
    return null;
  end if;

  select lower(btrim(coalesce(ch.category, ''))) into v_category
  from public.challenges ch
  where ch.id = v_challenge_id;

  if coalesce(v_category, '') <> 'fitness' then
    return null;
  end if;

  select part.value -> 'health' into v_health
  from public.challenge_checkins c
  cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
  where c.id = p_checkin_id
    and jsonb_typeof(part.value -> 'health') = 'object'
  limit 1;

  if v_health is null then
    return null;
  end if;

  if coalesce(btrim(v_health ->> 'activityType'), '') <> '' then
    v_stats := v_stats || jsonb_build_object('activity', btrim(v_health ->> 'activityType'));
  end if;

  v_value := public.checkin_stat_number(v_health, 'durationSec');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('duration_sec', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'activeEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('active_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'totalEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('total_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'minHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_min', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'avgHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_avg', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'maxHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_max', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'distanceMeters');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('distance_m', round(v_value));
  end if;

  -- Activity alone is not a stats line.
  if v_stats - 'activity' = '{}'::jsonb then
    return null;
  end if;

  return v_stats;
end;
$$;

-- Same body as the retake/dedupe version, plus checkin_stats on the staged post.
create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_media text[] := '{}';
  v_stats jsonb;
begin
  select id
    into v_id
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
  order by created_at asc, id asc
  limit 1;

  v_media := public.checkin_unique_urls(coalesce(p_media, '{}'));

  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(v_media, 1), 0) = 0 then
    return;
  end if;

  v_stats := public.checkin_fitness_stats(p_checkin_id);

  if v_id is not null then
    update public.posts
    set
      content = coalesce(nullif(btrim(p_content), ''), content),
      media_urls = v_media,
      checkin_stage = p_stage,
      source = 'checkin',
      challenge_id = coalesce(challenge_id, p_challenge_id),
      checkin_stats = coalesce(v_stats, checkin_stats)
    where id = v_id;
    return;
  end if;

  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage,
    source,
    checkin_stats
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    v_media,
    'public',
    '{}',
    p_checkin_id,
    p_stage,
    'checkin',
    v_stats
  );
end;
$$;

grant execute on function public.checkin_stat_number(jsonb, text) to authenticated, service_role;
grant execute on function public.checkin_fitness_stats(uuid) to authenticated, service_role;
