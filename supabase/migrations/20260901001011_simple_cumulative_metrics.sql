-- Simple Cumulative: generic metrics[] (not distance-only), anyone-to even split,
-- first-to by completed_at. Does not change Consistency payout rules.

alter table public.challenges
  add column if not exists metrics jsonb not null default '[]'::jsonb,
  add column if not exists win_window text;

alter table public.challenge_participants
  add column if not exists metric_totals jsonb not null default '{}'::jsonb;

alter table public.challenge_checkins
  add column if not exists metric_values jsonb not null default '{}'::jsonb;

comment on column public.challenges.metrics is
  'Simple Cumulative rows: [{id, target, name, unit}]. Display units, not meters.';
comment on column public.challenges.win_window is
  'challenge | week. Alias of cumulative_window.';
comment on column public.challenge_participants.metric_totals is
  'Sum of check-in metric_values per metric id.';
comment on column public.challenge_checkins.metric_values is
  'This-session amounts keyed by metric id.';

update public.challenges
set win_window = coalesce(nullif(btrim(win_window), ''), nullif(btrim(cumulative_window), ''), 'challenge')
where lower(coalesce(format, challenge_type, '')) = 'cumulative'
  and coalesce(nullif(btrim(win_window), ''), '') = '';

update public.challenges
set metrics = jsonb_build_array(
  jsonb_build_object(
    'id', 'm1',
    'target', case
      when cumulative_metric = 'distance_m' and coalesce(cumulative_target, 0) >= 100
        then round((cumulative_target / 1609.34)::numeric, 2)
      else coalesce(cumulative_target, 0)
    end,
    'name', case
      when cumulative_metric = 'distance_m' then 'miles'
      else 'count'
    end,
    'unit', case when cumulative_metric = 'distance_m' then 'mi' else null end
  )
)
where lower(coalesce(format, challenge_type, '')) = 'cumulative'
  and coalesce(jsonb_array_length(metrics), 0) = 0
  and coalesce(cumulative_target, 0) > 0;

create or replace function public.assert_format_payout_pair(
  p_format text,
  p_prize_structure text,
  p_payout_mode text
)
returns void
language plpgsql
immutable
as $$
declare
  v_format text := lower(coalesce(nullif(p_format, ''), 'consistency'));
  v_structure text := lower(coalesce(nullif(p_prize_structure, ''), ''));
  v_payout text := lower(coalesce(nullif(p_payout_mode, ''), ''));
begin
  if v_format in ('lms') then
    v_format := 'consistency';
  end if;
  if v_format = 'consistency' and v_structure = 'top_places' then
    raise exception 'CONSISTENCY_NO_TOP_PLACES';
  end if;
  if v_format = 'points' and v_payout = 'even_split_remaining' then
    raise exception 'POINTS_NO_EVEN_SPLIT';
  end if;
  if v_format = 'cumulative' and (v_payout = 'winner_take_all' or v_structure = 'winner_take_all') then
    raise exception 'CUMULATIVE_NO_LAST_STANDING';
  end if;
end;
$$;

create or replace function public.settlement_format_family(p_challenge public.challenges)
returns text
language sql
immutable
as $$
  select case
    when coalesce((p_challenge).is_unlimited, false)
      or lower(coalesce((p_challenge).end_mode, '')) = 'indefinite_lms'
      or lower(coalesce((p_challenge).format, '')) = 'lms'
      or lower(coalesce((p_challenge).challenge_type, '')) = 'lms'
      then 'consistency'
    when lower(coalesce(nullif(btrim((p_challenge).format), ''), nullif(btrim((p_challenge).challenge_type), ''), ''))
      = 'cumulative'
      then 'cumulative'
    when lower(coalesce(nullif(btrim((p_challenge).format), ''), nullif(btrim((p_challenge).challenge_type), ''), ''))
      = 'points'
      then 'points'
    else 'consistency'
  end;
$$;

create or replace function public.settlement_is_illegal_pair(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select case
    when public.settlement_format_family(p_challenge) = 'consistency'
      and lower(coalesce((p_challenge).prize_structure, '')) = 'top_places'
      then true
    when public.settlement_format_family(p_challenge) = 'points'
      and lower(coalesce((p_challenge).payout_mode, '')) = 'even_split_remaining'
      then true
    when public.settlement_format_family(p_challenge) = 'cumulative'
      and (
        lower(coalesce((p_challenge).payout_mode, '')) = 'winner_take_all'
        or lower(coalesce((p_challenge).prize_structure, '')) = 'winner_take_all'
      )
      then true
    else false
  end;
$$;

create or replace function public.sync_participant_metric_totals(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_totals jsonb := '{}'::jsonb;
begin
  select coalesce(jsonb_object_agg(key, total), '{}'::jsonb)
    into v_totals
  from (
    select e.key, sum(e.value::numeric) as total
    from public.challenge_checkins c
    cross join lateral jsonb_each_text(coalesce(c.metric_values, '{}'::jsonb)) as e(key, value)
    where c.challenge_id = p_challenge_id
      and c.user_id = p_user_id
    group by e.key
    having sum(e.value::numeric) > 0
  ) s;

  update public.challenge_participants
    set metric_totals = coalesce(v_totals, '{}'::jsonb)
    where challenge_id = p_challenge_id
      and user_id = p_user_id;

  return coalesce(v_totals, '{}'::jsonb);
end;
$$;

revoke all on function public.sync_participant_metric_totals(uuid, uuid) from public, anon;
grant execute on function public.sync_participant_metric_totals(uuid, uuid) to authenticated, service_role;

create or replace function public.cumulative_metrics_hit(
  p_metrics jsonb,
  p_totals jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  v_elem jsonb;
  v_id text;
  v_target numeric;
  v_have numeric;
  v_any boolean := false;
begin
  if jsonb_typeof(coalesce(p_metrics, '[]'::jsonb)) <> 'array' then
    return false;
  end if;
  for v_elem in select value from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb))
  loop
    v_target := coalesce(nullif(v_elem->>'target', '')::numeric, 0);
    v_id := coalesce(nullif(btrim(v_elem->>'id'), ''), '');
    if v_target <= 0 or v_id = '' or coalesce(nullif(btrim(v_elem->>'name'), ''), '') = '' then
      continue;
    end if;
    v_any := true;
    v_have := coalesce(nullif(p_totals->>v_id, '')::numeric, 0);
    if v_have < v_target then
      return false;
    end if;
  end loop;
  return v_any;
end;
$$;

create or replace function public.save_checkin_metric_values(
  p_challenge_id uuid,
  p_metric_values jsonb
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
      if v_key <> '' and v_amount is not null and v_amount > 0 then
        v_clean := v_clean || jsonb_build_object(v_key, v_amount);
      end if;
    end loop;
  end if;

  update public.challenge_checkins
    set metric_values = v_clean,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

  perform public.sync_participant_metric_totals(p_challenge_id, v_uid);
  perform public.refresh_participant_progress(p_challenge_id, v_uid);

  return public.checkin_row_json(v_row.id);
end;
$$;

revoke all on function public.save_checkin_metric_values(uuid, jsonb) from public, anon;
grant execute on function public.save_checkin_metric_values(uuid, jsonb) to authenticated, service_role;

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
  v_points := public.challenge_board_points(p_challenge_id, p_user_id);
  v_cumulative := lower(coalesce(ch.format, ch.challenge_type, '')) = 'cumulative';

  if v_cumulative then
    v_totals := public.sync_participant_metric_totals(p_challenge_id, p_user_id);
    v_hit := public.cumulative_metrics_hit(coalesce(ch.metrics, '[]'::jsonb), v_totals);
    update public.challenge_participants
      set days_completed = v_days,
          points = case
            when v_comparable then points
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
     or lower(coalesce(ch.format, '')) = 'points' then
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
          when v_comparable then points
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

create or replace function public.settlement_cumulative_winner_ids(
  p_challenge_id uuid,
  p_challenge public.challenges
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_structure text := lower(coalesce((p_challenge).prize_structure, 'equal_split'));
  v_payout text := lower(coalesce((p_challenge).payout_mode, ''));
  v_slots int;
  v_pool_n int;
  v_cut timestamptz;
  v_winners uuid[] := '{}';
begin
  select coalesce(array_agg(p.user_id order by date_trunc('second', p.completed_at), p.joined_at, p.user_id), '{}')
    into v_winners
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and p.completed_at is not null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');

  if v_structure = 'top_places' or v_payout = 'top_places' then
    select count(*)::int
      into v_pool_n
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
      and p.joined_at <= coalesce((p_challenge).starts_at, p.joined_at);
    if v_pool_n is null or v_pool_n <= 0 then
      select count(*)::int
        into v_pool_n
      from public.challenge_participants p
      where p.challenge_id = p_challenge_id
        and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start';
    end if;
    if lower(coalesce((p_challenge).top_places_mode, 'count')) = 'percent' then
      v_slots := greatest(1, ceil(greatest(v_pool_n, 0) * greatest(coalesce((p_challenge).top_places_value, 25), 0) / 100.0));
    else
      v_slots := greatest(1, floor(greatest(coalesce((p_challenge).top_places_value, 3), 1)));
    end if;
    if coalesce(array_length(v_winners, 1), 0) > v_slots then
      select date_trunc('second', p.completed_at)
        into v_cut
      from public.challenge_participants p
      where p.user_id = v_winners[v_slots]
        and p.challenge_id = p_challenge_id;
      select coalesce(array_agg(x.user_id order by x.ord), '{}')
        into v_winners
      from unnest(v_winners) with ordinality as x(user_id, ord)
      join public.challenge_participants p
        on p.challenge_id = p_challenge_id and p.user_id = x.user_id
      where date_trunc('second', p.completed_at) <= v_cut;
    end if;
  end if;

  return v_winners;
end;
$$;

revoke all on function public.settlement_cumulative_winner_ids(uuid, public.challenges) from public, anon;
grant execute on function public.settlement_cumulative_winner_ids(uuid, public.challenges) to authenticated, service_role;

create or replace function public.settle_ended_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_need int;
  v_pool numeric;
  v_winners uuid[];
  v_scores numeric[];
  v_shares numeric[];
  v_i int;
  v_slices jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_title text;
  v_author uuid;
  v_post uuid;
  v_count int := 0;
  v_currency text;
  v_family text;
  v_structure text;
  v_payout text;
  v_why text;
  v_slots int;
  v_cut numeric;
  v_max numeric;
  v_official jsonb;
begin
  if p_challenge_id is null then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_existing := public.get_challenge_settlement(p_challenge_id);
  if v_existing is not null then
    if v_c.status is distinct from 'settled' then
      update public.challenges
      set status = 'settled',
          distributed_at = coalesce(distributed_at, now()),
          updated_at = now()
      where id = p_challenge_id;
    end if;
    return v_existing;
  end if;

  if v_c.distributed_at is not null or v_c.status = 'settled' then
    return jsonb_build_object(
      'already_settled', true,
      'ok', true,
      'forfeit', true,
      'payouts', '[]'::jsonb
    );
  end if;

  if public.settlement_is_illegal_pair(v_c) then
    if public.settlement_format_family(v_c) = 'points' then
      raise exception 'POINTS_NO_EVEN_SPLIT';
    end if;
    if public.settlement_format_family(v_c) = 'cumulative' then
      raise exception 'CUMULATIVE_NO_LAST_STANDING';
    end if;
    raise exception 'CONSISTENCY_NO_TOP_PLACES';
  end if;

  if coalesce(v_c.is_unlimited, false)
     or lower(coalesce(v_c.end_mode, '')) = 'indefinite_lms'
     or lower(coalesce(v_c.format, '')) = 'lms'
     or lower(coalesce(v_c.challenge_type, '')) = 'lms' then
    raise exception 'NOT_EVEN_SPLIT';
  end if;

  if not public.settlement_should_run(v_c) then
    raise exception 'CHALLENGE_NOT_ENDED';
  end if;

  if v_c.status is distinct from 'settling' then
    update public.challenges
    set status = 'settling', updated_at = now()
    where id = p_challenge_id;
  end if;

  v_need := public.settlement_required_days(v_c);
  v_currency := coalesce(v_c.currency, 'coins');
  v_pool := case
    when v_currency = 'bucks' then round(coalesce(v_c.prize_pool, 0), 2)
    else floor(greatest(coalesce(v_c.prize_pool, 0), 0))
  end;
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_author := coalesce(
    v_c.created_by,
    (select user_id from public.challenge_participants where challenge_id = p_challenge_id limit 1)
  );
  v_family := public.settlement_format_family(v_c);
  v_structure := lower(coalesce(v_c.prize_structure, 'equal_split'));
  v_payout := lower(coalesce(v_c.payout_mode, ''));

  if v_family = 'consistency' and public.settlement_is_even_split(v_c) then
    select coalesce(array_agg(p.user_id order by p.joined_at, p.user_id), '{}')
      into v_winners
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
      and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;
    v_count := coalesce(array_length(v_winners, 1), 0);
    v_why := 'Everyone still in split.';
    if v_count = 0 then
      if coalesce(v_c.is_official, false) then
        begin
          v_official := public.distribute_official_guarantee(p_challenge_id);
          if v_official is not null then
            return v_official;
          end if;
        exception when others then
          null;
        end;
      end if;
      return public.settlement_forfeit_field(p_challenge_id);
    end if;
    v_shares := public.even_split_shares(v_pool, v_count, v_currency);
    v_scores := array_fill(0::numeric, array[greatest(v_count, 1)]);
    for v_i in 1..v_count loop
      v_scores[v_i] := public.settlement_board_score(p_challenge_id, v_winners[v_i]);
    end loop;

  elsif v_family = 'consistency' then
    select coalesce(array_agg(p.user_id order by public.settlement_board_score(p_challenge_id, p.user_id) desc, p.joined_at, p.user_id), '{}')
      into v_winners
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');
    v_count := coalesce(array_length(v_winners, 1), 0);
    v_why := 'Last standing.';
    if v_count = 0 then
      if coalesce(v_c.is_official, false) then
        begin
          v_official := public.distribute_official_guarantee(p_challenge_id);
          if v_official is not null then
            return v_official;
          end if;
        exception when others then
          null;
        end;
      end if;
      return public.settlement_forfeit_field(p_challenge_id);
    end if;
    if v_count > 1 then
      v_max := public.settlement_board_score(p_challenge_id, v_winners[1]);
      select coalesce(array_agg(x order by public.settlement_board_score(p_challenge_id, x) desc, x), '{}')
        into v_winners
      from unnest(v_winners) as x
      where public.settlement_board_score(p_challenge_id, x) = v_max;
      v_count := coalesce(array_length(v_winners, 1), 0);
    end if;
    v_shares := public.even_split_shares(v_pool, v_count, v_currency);
    v_scores := array_fill(0::numeric, array[greatest(v_count, 1)]);
    for v_i in 1..v_count loop
      v_scores[v_i] := public.settlement_board_score(p_challenge_id, v_winners[v_i]);
    end loop;

  elsif v_family = 'cumulative' then
    v_winners := public.settlement_cumulative_winner_ids(p_challenge_id, v_c);
    v_count := coalesce(array_length(v_winners, 1), 0);
    v_why := case
      when v_structure = 'top_places' or v_payout = 'top_places' then 'Ranked by who finishes every target first.'
      else 'Anyone who hits the goal.'
    end;
    if v_count = 0 then
      if coalesce(v_c.is_official, false) then
        begin
          v_official := public.distribute_official_guarantee(p_challenge_id);
          if v_official is not null then
            return v_official;
          end if;
        exception when others then
          null;
        end;
      end if;
      return public.settlement_forfeit_field(p_challenge_id);
    end if;
    v_shares := public.even_split_shares(v_pool, v_count, v_currency);
    v_scores := array_fill(0::numeric, array[greatest(v_count, 1)]);
    for v_i in 1..v_count loop
      v_scores[v_i] := 1;
    end loop;

  else
    select coalesce(array_agg(p.user_id order by public.settlement_board_score(p_challenge_id, p.user_id) desc, p.joined_at, p.user_id), '{}')
      into v_winners
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');
    v_count := coalesce(array_length(v_winners, 1), 0);
    v_max := 0;
    if v_count > 0 then
      v_max := public.settlement_board_score(p_challenge_id, v_winners[1]);
    end if;
    if v_count = 0 or v_max <= 0 then
      if coalesce(v_c.is_official, false) then
        begin
          v_official := public.distribute_official_guarantee(p_challenge_id);
          if v_official is not null then
            return v_official;
          end if;
        exception when others then
          null;
        end;
      end if;
      return public.settlement_forfeit_field(p_challenge_id);
    end if;
    v_why := 'Highest points. Tie split.';
    if v_structure = 'top_places' or v_payout = 'top_places' then
      if lower(coalesce(v_c.top_places_mode, 'count')) = 'percent' then
        v_slots := greatest(1, ceil(v_count * greatest(coalesce(v_c.top_places_value, 25), 0) / 100.0));
      else
        v_slots := greatest(1, floor(greatest(coalesce(v_c.top_places_value, 3), 1)));
      end if;
      v_cut := public.settlement_board_score(
        p_challenge_id,
        v_winners[least(v_slots, v_count)]
      );
      select coalesce(array_agg(x order by public.settlement_board_score(p_challenge_id, x) desc, x), '{}')
        into v_winners
      from unnest(v_winners) as x
      where public.settlement_board_score(p_challenge_id, x) >= v_cut;
      v_count := coalesce(array_length(v_winners, 1), 0);
      if lower(coalesce(v_c.top_places_distribution, 'even')) = 'scaled' then
        v_why := 'Highest points. Scaled.';
        v_shares := public.scaled_place_shares(v_pool, v_count);
      else
        v_shares := public.even_split_shares(v_pool, v_count, v_currency);
      end if;
    else
      select coalesce(array_agg(x order by public.settlement_board_score(p_challenge_id, x) desc, x), '{}')
        into v_winners
      from unnest(v_winners) as x
      where public.settlement_board_score(p_challenge_id, x) = v_max;
      v_count := coalesce(array_length(v_winners, 1), 0);
      v_shares := public.even_split_shares(v_pool, v_count, v_currency);
    end if;
    v_scores := array_fill(0::numeric, array[greatest(v_count, 1)]);
    for v_i in 1..v_count loop
      v_scores[v_i] := public.settlement_board_score(p_challenge_id, v_winners[v_i]);
    end loop;
  end if;

  if v_count = 0 then
    return public.settlement_forfeit_field(p_challenge_id);
  end if;

  if v_pool <= 0 then
    insert into public.challenge_settlements (
      challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
    ) values (
      p_challenge_id, null, v_pool, '[]'::jsonb, coalesce(v_c.prize_structure, 'equal_split'), v_count, v_currency
    )
    on conflict (challenge_id) do nothing;
    update public.challenges
    set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
    where id = p_challenge_id;
    perform public.stamp_challenge_settlement_results(p_challenge_id, v_winners);
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  for v_i in 1..v_count loop
    perform public.official_credit_payout(
      p_challenge_id,
      v_winners[v_i],
      v_currency,
      v_shares[v_i],
      'distribute_win'
    );
    update public.wallet_ledger
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stripe_transfer_status', 'pending_internal',
      'settlement', true
    )
    where challenge_id = p_challenge_id
      and user_id = v_winners[v_i]
      and entry_type = 'distribute_win';
    v_slices := v_slices || jsonb_build_array(jsonb_build_object(
      'user_id', v_winners[v_i],
      'amount', v_shares[v_i],
      'place', (
        select 1 + count(*)
        from unnest(v_scores) with ordinality as s(score, ord)
        where s.ord < v_i and s.score > v_scores[v_i]
      ),
      'score', v_scores[v_i],
      'reason', 'distribute_win'
    ));
  end loop;

  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
  ) values (
    p_challenge_id, null, v_pool, v_slices, coalesce(v_c.prize_structure, 'equal_split'), v_count, v_currency
  )
  on conflict (challenge_id) do nothing;

  update public.challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  perform public.stamp_challenge_settlement_results(p_challenge_id, v_winners);

  insert into public.posts (
    author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
  )
  select
    v_author,
    p_challenge_id,
    v_title || ' settled. ' || coalesce(v_why, 'Everyone still in split.'),
    '{}',
    'public',
    '{}',
    'challenge',
    'settlement_result'
  where v_author is not null
    and not exists (
      select 1 from public.posts
      where challenge_id = p_challenge_id
        and system_kind = 'settlement_result'
        and deleted_at is null
    )
  returning id into v_post;

  if v_author is not null
    and public.challenge_allows_main_feed_announce(v_c)
    and not exists (
      select 1 from public.posts
      where challenge_id = p_challenge_id
        and system_kind = 'settlement_result_main'
        and deleted_at is null
    )
  then
    insert into public.posts (
      author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
    ) values (
      v_author,
      p_challenge_id,
      v_title || ' settled. ' || coalesce(v_why, 'Everyone still in split.'),
      '{}',
      'public',
      '{}',
      'feed',
      'settlement_result_main'
    );
  end if;

  perform public.notify_challenge_settled(
    p_challenge_id,
    v_title,
    case
      when v_family = 'points' or v_structure = 'winner_take_all' then 'ranked'
      when v_family = 'cumulative' and (v_structure = 'top_places' or v_payout = 'top_places') then 'ranked'
      else 'split'
    end,
    v_post,
    v_currency
  );
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;
