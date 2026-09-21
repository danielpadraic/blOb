-- Comparable Points: window totals first, then score. Honor zeros stay.
-- extras_keep_adding / extra_factor 1 = full rate above parity.
-- extra_factor 0 = cap at parity. Multiplier tiers revalue the whole window.

create or replace function public.comparable_metric_slug(p_label text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(btrim(coalesce(p_label, ''))), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)',
      '',
      'g'
    ),
    ''
  );
$$;

create or replace function public.comparable_multiplier_key(p_label text)
returns text
language sql
immutable
as $$
  select case
    when public.comparable_metric_slug(p_label) is null then null
    else 'multiplier:' || public.comparable_metric_slug(p_label)
  end;
$$;

create or replace function public.comparable_qty(p_value numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_value is null or p_value < 0 then 0
    else round(p_value, 2)
  end;
$$;

create or replace function public.comparable_resolve_percent(p_activity jsonb, p_source numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_tier jsonb;
  v_percent numeric := 0;
  v_amount numeric := public.comparable_qty(p_source);
begin
  if coalesce((p_activity#>>'{multiplier,enabled}')::boolean, false) = false then
    return 100;
  end if;
  if jsonb_typeof(p_activity#>'{multiplier,tiers}') is distinct from 'array'
     or jsonb_array_length(p_activity#>'{multiplier,tiers}') = 0 then
    return 100;
  end if;
  for v_tier in
    select value
    from jsonb_array_elements(p_activity#>'{multiplier,tiers}')
    order by coalesce(nullif(value->>'threshold', '')::numeric, 0),
             coalesce(nullif(value->>'percent', '')::numeric, 0)
  loop
    if v_amount + 0.000000001 >= coalesce(nullif(v_tier->>'threshold', '')::numeric, 0) then
      v_percent := greatest(coalesce(nullif(v_tier->>'percent', '')::numeric, 0), 0);
    end if;
  end loop;
  return v_percent;
exception
  when others then
    return 0;
end;
$$;

create or replace function public.comparable_score_window(p_config jsonb, p_totals jsonb)
returns numeric
language plpgsql
immutable
as $$
declare
  v_parity numeric := greatest(coalesce(nullif(p_config->>'parity_points', '')::numeric, 0), 0);
  v_extras boolean := coalesce((p_config->>'extras_keep_adding')::boolean, true);
  v_activity jsonb;
  v_qty numeric;
  v_parity_qty numeric;
  v_factor numeric;
  v_keep boolean;
  v_scored numeric;
  v_base numeric;
  v_source numeric;
  v_label text;
  v_key text;
  v_sum numeric := 0;
begin
  if v_parity < 1 or jsonb_typeof(p_config->'activities') is distinct from 'array' then
    return 0;
  end if;
  for v_activity in select value from jsonb_array_elements(p_config->'activities')
  loop
    if btrim(coalesce(v_activity->>'name', '')) = '' then
      continue;
    end if;
    v_parity_qty := public.comparable_qty(nullif(v_activity->>'parity_qty', '')::numeric);
    if v_parity_qty <= 0 then
      continue;
    end if;
    v_qty := public.comparable_qty(nullif(p_totals->>(v_activity->>'id'), '')::numeric);
    if coalesce((v_activity#>>'{floor,enabled}')::boolean, false)
       and v_qty + 0.000000001 < public.comparable_qty(nullif(v_activity#>>'{floor,min_qty}', '')::numeric) then
      continue;
    end if;
    v_factor := coalesce(nullif(v_activity#>>'{multiplier,extra_factor}', '')::numeric, 1);
    v_keep := case
      when v_factor = 0 then false
      when v_factor = 1 then true
      else v_extras
    end;
    v_scored := case when v_keep then v_qty else least(v_qty, v_parity_qty) end;
    if v_scored <= 0 then
      continue;
    end if;
    v_base := (v_scored / v_parity_qty) * v_parity;
    v_label := nullif(btrim(coalesce(v_activity#>>'{multiplier,label}', '')), '');
    v_key := public.comparable_multiplier_key(v_label);
    v_source := public.comparable_qty(
      coalesce(
        nullif(p_totals->>v_key, '')::numeric,
        nullif(p_totals->>v_label, '')::numeric,
        0
      )
    );
    if coalesce((v_activity#>>'{multiplier,enabled}')::boolean, false)
       and jsonb_typeof(v_activity#>'{multiplier,tiers}') = 'array'
       and jsonb_array_length(v_activity#>'{multiplier,tiers}') > 0 then
      v_sum := v_sum + round((v_base * public.comparable_resolve_percent(v_activity, v_source)) / 100);
    else
      v_sum := v_sum + round(v_base);
    end if;
  end loop;
  return v_sum;
end;
$$;

create or replace function public.comparable_checkin_bucket(
  ch public.challenges,
  p_row public.challenge_checkins,
  p_window text
)
returns text
language plpgsql
stable
as $$
declare
  v_tz text := coalesce(nullif(btrim(ch.timezone), ''), 'UTC');
begin
  if p_window = 'period' then
    return coalesce(p_row.period_key::text, '');
  end if;
  if p_window = 'day' then
    return to_char(
      timezone(v_tz, coalesce(p_row.submitted_at, p_row.started_at, p_row.created_at)),
      'YYYY-MM-DD'
    );
  end if;
  return 'challenge';
end;
$$;

create or replace function public.score_comparable_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_config jsonb;
  v_window text;
  v_bucket text;
  v_totals jsonb;
  v_sum numeric := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or coalesce(ch.scoring_method, '') is distinct from 'comparable_points' then
    return 0;
  end if;
  v_config := coalesce(ch.scoring_config, ch.comparable_points_config, '{}'::jsonb);
  v_window := case
    when coalesce(v_config->>'window', '') in ('period', 'day') then v_config->>'window'
    else 'challenge'
  end;
  for v_bucket in
    select distinct public.comparable_checkin_bucket(ch, c, v_window)
    from public.challenge_checkins c
    where c.challenge_id = p_challenge_id
      and c.user_id = p_user_id
  loop
    select coalesce(jsonb_object_agg(e.key, e.total), '{}'::jsonb)
      into v_totals
    from (
      select e.key, sum(e.value::numeric) as total
      from public.challenge_checkins x
      cross join lateral jsonb_each_text(coalesce(x.metric_values, '{}'::jsonb)) as e(key, value)
      where x.challenge_id = p_challenge_id
        and x.user_id = p_user_id
        and public.comparable_checkin_bucket(ch, x, v_window) = v_bucket
      group by e.key
    ) e;
    v_sum := v_sum + public.comparable_score_window(v_config, coalesce(v_totals, '{}'::jsonb));
  end loop;
  return coalesce(v_sum, 0);
end;
$$;

create or replace function public.apply_comparable_points(
  p_challenge_id uuid,
  p_user_id uuid,
  p_checkin_id uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_points numeric := 0;
  v_other numeric := 0;
begin
  perform public.sync_participant_metric_totals(p_challenge_id, p_user_id);
  v_points := public.score_comparable_participant(p_challenge_id, p_user_id);
  update public.challenge_participants
    set points = v_points
    where challenge_id = p_challenge_id
      and user_id = p_user_id;
  if p_checkin_id is not null then
    select coalesce(sum(coalesce(points_awarded, 0)), 0)
      into v_other
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and id is distinct from p_checkin_id;
    update public.challenge_checkins
      set points_awarded = v_points - v_other
      where id = p_checkin_id;
  end if;
  return v_points;
end;
$$;

create or replace function public.save_checkin_metric_values(
  p_challenge_id uuid,
  p_metric_values jsonb,
  p_notes text default null,
  p_log_choices jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  v_uid uuid := auth.uid();
  v_period date;
  v_row public.challenge_checkins%rowtype;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_amount numeric;
  v_parts jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;
  if not found then
    raise exception 'Join this challenge before you check in.';
  end if;

  perform public.checkin_assert_open(ch, part);
  v_period := public.checkin_period_for(ch);
  v_row := public.checkin_open_row(ch, v_uid, v_period);

  if jsonb_typeof(coalesce(p_metric_values, '{}'::jsonb)) = 'object' then
    for v_key, v_amount in
      select e.key, e.value::numeric
      from jsonb_each_text(p_metric_values) as e(key, value)
    loop
      if v_key <> '' and v_amount is not null and v_amount >= 0 then
        v_clean := v_clean || jsonb_build_object(v_key, v_amount);
      end if;
    end loop;
  end if;

  v_parts := coalesce(v_row.proof_parts, '{}'::jsonb);
  if p_log_choices is not null and jsonb_typeof(p_log_choices) = 'object' then
    v_parts := v_parts || jsonb_build_object('log_choices', p_log_choices);
  end if;

  update public.challenge_checkins
    set metric_values = v_clean,
        notes = coalesce(p_notes, notes),
        proof_parts = v_parts,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

  perform public.sync_participant_metric_totals(p_challenge_id, v_uid);
  if coalesce(ch.scoring_method, '') = 'comparable_points' then
    perform public.apply_comparable_points(p_challenge_id, v_uid, v_row.id);
  end if;
  perform public.refresh_participant_progress(p_challenge_id, v_uid);

  return public.checkin_row_json(v_row.id);
end;
$$;

revoke all on function public.save_checkin_metric_values(uuid, jsonb) from public, anon;
revoke all on function public.save_checkin_metric_values(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.save_checkin_metric_values(uuid, jsonb) to authenticated, service_role;
grant execute on function public.save_checkin_metric_values(uuid, jsonb, text, jsonb) to authenticated, service_role;

create or replace function public.challenge_checkins_stamp_points()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  if new.status = 'submitted' and new.points_awarded is null then
    select * into ch from public.challenges where id = new.challenge_id;
    if found and coalesce(ch.scoring_method, '') is distinct from 'comparable_points' then
      new.points_awarded := public.challenge_per_checkin_points(ch);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_participant_progress(
  p_challenge_id uuid,
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
  v_points numeric := 0;
  v_target int := 1;
  v_span int := 1;
  v_allow int := 0;
  v_comparable boolean := false;
  v_totals jsonb := '{}'::jsonb;
  v_hit boolean := false;
  v_cumulative boolean := false;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;

  v_days := public.challenge_board_days(p_challenge_id, p_user_id);
  v_comparable := coalesce(ch.scoring_method, '') = 'comparable_points';
  if v_comparable then
    v_points := public.apply_comparable_points(p_challenge_id, p_user_id, null);
  else
    v_points := public.challenge_board_points(p_challenge_id, p_user_id);
  end if;
  v_cumulative := lower(coalesce(ch.format, ch.challenge_type, '')) = 'cumulative';

  if v_cumulative then
    v_totals := public.sync_participant_metric_totals(p_challenge_id, p_user_id);
    v_hit := public.cumulative_metrics_hit(coalesce(ch.metrics, '[]'::jsonb), v_totals);
    update public.challenge_participants
      set days_completed = v_days,
          points = case
            when v_comparable then v_points
            when v_hit then greatest(coalesce(points, 0), 1)
            else points
          end,
          metric_totals = coalesce(v_totals, '{}'::jsonb),
          completed_at = case
            when v_hit then coalesce(completed_at, now())
            else completed_at
          end,
          status = case
            when coalesce(status, 'joined') = 'withdrawn' then status
            when v_hit then 'completed'
            else status
          end
      where challenge_id = p_challenge_id
        and user_id = p_user_id;
    return v_days;
  end if;

  if lower(coalesce(ch.challenge_type, 'consistency')) = 'points'
     or lower(coalesce(ch.format, '')) = 'points'
     or v_comparable then
    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    v_span := greatest(
      coalesce(ch.days_required, ch.length_value, ch.target_count, 1),
      1
    );
    v_allow := greatest(coalesce(ch.misses_allowed, 0), 0);
    v_target := greatest(v_span - v_allow, 1);
  end if;

  update public.challenge_participants
    set days_completed = v_days,
        points = case
          when v_comparable then v_points
          when lower(coalesce(ch.challenge_type, '')) = 'points'
            or lower(coalesce(ch.format, '')) = 'points'
            then v_points
          else points
        end,
        completed_at = case
          when coalesce(ch.is_unlimited, false) then completed_at
          when v_days >= v_target then coalesce(completed_at, now())
          else null
        end,
        status = case
          when coalesce(status, 'joined') = 'withdrawn' then status
          when coalesce(ch.is_unlimited, false) then status
          when v_days >= v_target then 'completed'
          when status = 'completed' then 'joined'
          else status
        end
    where challenge_id = p_challenge_id
      and user_id = p_user_id;

  return v_days;
end;
$$;

grant execute on function public.refresh_participant_progress(uuid, uuid) to authenticated, service_role;
grant execute on function public.score_comparable_participant(uuid, uuid) to authenticated, service_role;
grant execute on function public.apply_comparable_points(uuid, uuid, uuid) to authenticated, service_role;
