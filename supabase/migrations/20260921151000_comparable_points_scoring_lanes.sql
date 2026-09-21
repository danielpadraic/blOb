-- Comparable Points lanes. Host/mod/@blob assign scoring_lane.
-- Does not change settlement math. Apply on blOb-app.

alter table public.challenge_participants
  add column if not exists scoring_lane text;

comment on column public.challenge_participants.scoring_lane is
  'Lane id from comparable_points_config.lanes. Null = unlabeled. Host, moderator, or official ops write this.';

drop function if exists public.comparable_score_window(jsonb, jsonb);
drop function if exists public.comparable_score_window(jsonb, jsonb, text);

create or replace function public.comparable_score_window(
  p_config jsonb,
  p_totals jsonb,
  p_lane text default null
)
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
  v_lane text := nullif(btrim(coalesce(p_lane, '')), '');
  v_lane_ids jsonb;
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
    v_lane_ids := v_activity->'lane_ids';
    if jsonb_typeof(v_lane_ids) = 'array' and jsonb_array_length(v_lane_ids) > 0 then
      if v_lane is null
         or not exists (
           select 1
           from jsonb_array_elements_text(v_lane_ids) as lid(id)
           where btrim(lid.id) = v_lane
         )
      then
        continue;
      end if;
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
  v_lane text;
  v_sum numeric := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or coalesce(ch.scoring_method, '') is distinct from 'comparable_points' then
    return 0;
  end if;
  v_config := coalesce(ch.scoring_config, ch.comparable_points_config, '{}'::jsonb);
  select nullif(btrim(coalesce(scoring_lane, '')), '')
    into v_lane
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;
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
    v_sum := v_sum + public.comparable_score_window(v_config, coalesce(v_totals, '{}'::jsonb), v_lane);
  end loop;
  return coalesce(v_sum, 0);
end;
$$;

create or replace function public.set_participant_scoring_lane(
  p_challenge_id uuid,
  p_user_id uuid,
  p_lane text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_actor uuid := auth.uid();
  v_config jsonb;
  v_lane text := nullif(btrim(coalesce(p_lane, '')), '');
  v_label text;
  v_actor_name text;
  v_title text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;
  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'This challenge has already ended.';
  end if;
  if not public.checkin_is_staff(ch) then
    raise exception 'Only the host or a moderator can set a side.';
  end if;
  if not exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They are not on this challenge.';
  end if;
  v_config := coalesce(ch.scoring_config, ch.comparable_points_config, '{}'::jsonb);
  if v_lane is null then
    raise exception 'Pick a side.';
  end if;
  select e.el->>'label'
    into v_label
  from jsonb_array_elements(coalesce(v_config->'lanes', '[]'::jsonb)) as e(el)
  where e.el->>'id' = v_lane
  limit 1;
  if v_label is null or btrim(v_label) = '' then
    raise exception 'That side is not on this challenge.';
  end if;

  update public.challenge_participants
    set scoring_lane = v_lane
    where challenge_id = p_challenge_id and user_id = p_user_id;

  perform public.apply_comparable_points(p_challenge_id, p_user_id);

  v_actor_name := coalesce(nullif(public.profile_display_name(v_actor), ''), 'Someone');
  v_title := coalesce(nullif(btrim(ch.title), ''), 'this challenge');
  perform public.notify_user(
    p_user_id,
    'scoring_lane',
    v_actor_name || ' marked you as a ' || btrim(v_label) || ' on ' || v_title || '.',
    null,
    p_challenge_id,
    null,
    v_actor,
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'href', '/challenges/' || p_challenge_id::text,
      'scoring_lane', v_lane
    )
  );
end;
$$;

revoke all on function public.set_participant_scoring_lane(uuid, uuid, text) from public, anon;
grant execute on function public.set_participant_scoring_lane(uuid, uuid, text) to authenticated;

-- This week's honor log: lanes + drop the self-serve Side chip.
update public.challenges
set
  scoring_config = (
    coalesce(scoring_config, comparable_points_config, '{}'::jsonb)
    || jsonb_build_object(
      'lanes', jsonb_build_array(
        jsonb_build_object('id', 'rookie', 'label', 'Rookie'),
        jsonb_build_object('id', 'veteran', 'label', 'Veteran')
      ),
      'choice_fields', '[]'::jsonb
    )
  ),
  comparable_points_config = (
    coalesce(comparable_points_config, scoring_config, '{}'::jsonb)
    || jsonb_build_object(
      'lanes', jsonb_build_array(
        jsonb_build_object('id', 'rookie', 'label', 'Rookie'),
        jsonb_build_object('id', 'veteran', 'label', 'Veteran')
      ),
      'choice_fields', '[]'::jsonb
    )
  ),
  rules = replace(
    coalesce(rules, ''),
    'The Side chip is context only and does not score. ',
    ''
  )
where title = 'Rookies vs. Veterans'
  and starts_at = timestamptz '2026-09-21 00:00:00-05';

update public.challenges c
set
  scoring_config = jsonb_set(
    scoring_config,
    '{activities}',
    (
      select coalesce(jsonb_agg(
        case
          when a.el->>'id' = 'act-dials' then a.el || jsonb_build_object('lane_ids', jsonb_build_array('rookie'))
          when a.el->>'id' = 'act-ap' then a.el || jsonb_build_object('lane_ids', jsonb_build_array('rookie', 'veteran'))
          else a.el
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(c.scoring_config->'activities', '[]'::jsonb)) as a(el)
    )
  ),
  comparable_points_config = jsonb_set(
    comparable_points_config,
    '{activities}',
    (
      select coalesce(jsonb_agg(
        case
          when a.el->>'id' = 'act-dials' then a.el || jsonb_build_object('lane_ids', jsonb_build_array('rookie'))
          when a.el->>'id' = 'act-ap' then a.el || jsonb_build_object('lane_ids', jsonb_build_array('rookie', 'veteran'))
          else a.el
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(c.comparable_points_config->'activities', '[]'::jsonb)) as a(el)
    )
  )
where title = 'Rookies vs. Veterans'
  and starts_at = timestamptz '2026-09-21 00:00:00-05';

do $$
declare
  r record;
begin
  for r in
    select cp.challenge_id, cp.user_id
    from public.challenge_participants cp
    join public.challenges c on c.id = cp.challenge_id
    where c.title = 'Rookies vs. Veterans'
      and c.starts_at = timestamptz '2026-09-21 00:00:00-05'
  loop
    perform public.apply_comparable_points(r.challenge_id, r.user_id);
  end loop;
end $$;
