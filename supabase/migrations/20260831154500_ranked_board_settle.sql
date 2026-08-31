-- Ranked settle from the same proven-check-in counter the Board uses.
-- Coins floor leftover-1s on the highest place. Never overpay the pot.
-- Illegal format×payout pairs raise a plain error. 0 eligible forfeits (no refund)
-- unless this row is Official and the guarantee lane already exists.
-- Does not rewrite challenge_settlements (TEST settled rows stay).

create or replace function public.even_split_shares(
  p_pool numeric,
  p_count int,
  p_currency text default 'coins'
)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_total numeric;
  v_share numeric;
  v_left int;
  v_i int;
  v_out numeric[] := '{}';
begin
  if p_count is null or p_count <= 0 then
    return '{}';
  end if;
  if coalesce(p_currency, 'coins') = 'bucks' then
    v_total := round(greatest(coalesce(p_pool, 0), 0), 2);
    v_share := round(v_total / p_count, 2);
    v_out := array_fill(v_share, array[p_count]);
    v_out[p_count] := round(v_share + (v_total - v_share * p_count), 2);
    return v_out;
  end if;
  v_total := floor(greatest(coalesce(p_pool, 0), 0));
  if v_total <= 0 then
    return '{}';
  end if;
  v_share := floor(v_total / p_count);
  v_left := (v_total - v_share * p_count)::int;
  for v_i in 1..p_count loop
    v_out := v_out || (v_share + case when v_i <= v_left then 1 else 0 end);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.even_split_shares(numeric, int, text) from public;
grant execute on function public.even_split_shares(numeric, int, text) to anon, authenticated, service_role;

-- Scaled weights are N, N-1, … 1. Ties share that place’s combined weight.
create or replace function public.scaled_place_shares(p_pool numeric, p_count int)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_n int;
  v_pool numeric;
  v_sum int := 0;
  v_i int;
  v_out numeric[] := '{}';
  v_paid numeric := 0;
  v_left numeric;
begin
  v_n := coalesce(p_count, 0);
  v_pool := floor(greatest(coalesce(p_pool, 0), 0));
  if v_n <= 0 or v_pool <= 0 then
    return '{}';
  end if;
  for v_i in 1..v_n loop
    v_sum := v_sum + (v_n - v_i + 1);
  end loop;
  for v_i in 1..v_n loop
    v_out := v_out || floor(v_pool * (v_n - v_i + 1) / v_sum);
    v_paid := v_paid + v_out[v_i];
  end loop;
  v_left := v_pool - v_paid;
  v_i := 1;
  while v_left > 0 and v_i <= v_n loop
    v_out[v_i] := v_out[v_i] + 1;
    v_left := v_left - 1;
    v_i := v_i + 1;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.scaled_place_shares(numeric, int) from public, anon, authenticated;
grant execute on function public.scaled_place_shares(numeric, int) to service_role;

create or replace function public.settlement_format_family(p_challenge public.challenges)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_challenge.is_unlimited, false)
      or lower(coalesce(p_challenge.end_mode, '')) = 'indefinite_lms'
      or lower(coalesce(p_challenge.format, '')) = 'lms'
      or lower(coalesce(p_challenge.challenge_type, '')) = 'lms'
      then 'consistency'
    when lower(coalesce(nullif(btrim(p_challenge.format), ''), nullif(btrim(p_challenge.challenge_type), ''), ''))
      in ('points', 'cumulative')
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
      and lower(coalesce(p_challenge.prize_structure, '')) = 'top_places'
      then true
    when public.settlement_format_family(p_challenge) = 'points'
      and lower(coalesce(p_challenge.payout_mode, '')) = 'even_split_remaining'
      then true
    else false
  end;
$$;

-- Same counter the Board uses: official_valid_day_count, stored comparable points,
-- or submitted_checkin_count (one proven check-in = one point). No third uniqueness lock.
create or replace function public.settlement_board_score(p_challenge_id uuid, p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_family text;
  v_points numeric := 0;
  v_checkins numeric := 0;
begin
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if coalesce(v_c.is_official, false) then
    begin
      return public.official_valid_day_count(p_challenge_id, p_user_id);
    exception when others then
      null;
    end;
  end if;
  v_family := public.settlement_format_family(v_c);
  select coalesce(p.points, 0) into v_points
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id and p.user_id = p_user_id;
  v_checkins := public.submitted_checkin_count(p_challenge_id, p_user_id);
  if v_family = 'points' then
    if coalesce(v_c.scoring_method, '') = 'comparable_points' and coalesce(v_points, 0) > 0 then
      return v_points;
    end if;
    return coalesce(v_checkins, 0);
  end if;
  return public.settlement_proven_days(p_challenge_id, p_user_id);
end;
$$;

revoke all on function public.settlement_board_score(uuid, uuid) from public, anon;
grant execute on function public.settlement_board_score(uuid, uuid) to authenticated, service_role;

create or replace function public.settlement_wallet_amount_label(p_amount numeric, p_currency text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_currency, 'coins') = 'bucks' then
      public.settlement_format_amount(p_amount, 'bucks')
    else
      trim(to_char(round(coalesce(p_amount, 0), 0), 'FM9999999990'))
      || case when round(coalesce(p_amount, 0), 0) = 1 then ' coin' else ' coins' end
  end;
$$;

create or replace function public.settlement_should_run(p_challenge public.challenges)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_challenge.distributed_at is not null or p_challenge.status = 'settled' then
    return false;
  end if;
  if p_challenge.status in ('cancelled', 'cancelled_underfilled', 'draft') then
    return false;
  end if;
  if coalesce(p_challenge.is_unlimited, false)
     or lower(coalesce(p_challenge.end_mode, '')) = 'indefinite_lms'
     or lower(coalesce(p_challenge.format, '')) = 'lms'
     or lower(coalesce(p_challenge.challenge_type, '')) = 'lms' then
    return false;
  end if;
  if public.settlement_is_illegal_pair(p_challenge) then
    return false;
  end if;
  if public.settlement_clock_ended(p_challenge) then
    return true;
  end if;
  if public.settlement_is_even_split(p_challenge) then
    return public.settlement_all_remaining_submitted(p_challenge.id);
  end if;
  return false;
end;
$$;

create or replace function public.settlement_forfeit_field(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_existing jsonb;
  v_pool numeric;
  v_currency text;
  v_title text;
  v_author uuid;
  v_post uuid;
begin
  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_existing := public.get_challenge_settlement(p_challenge_id);
  if v_existing is not null then
    update public.challenges
    set status = 'settled',
        distributed_at = coalesce(distributed_at, now()),
        updated_at = now()
    where id = p_challenge_id and status is distinct from 'settled';
    return v_existing;
  end if;
  v_currency := coalesce(v_c.currency, 'coins');
  v_pool := case
    when v_currency = 'bucks' then round(greatest(coalesce(v_c.prize_pool, 0), 0), 2)
    else floor(greatest(coalesce(v_c.prize_pool, 0), 0))
  end;
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_author := coalesce(
    v_c.created_by,
    (select user_id from public.challenge_participants where challenge_id = p_challenge_id limit 1)
  );
  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
  ) values (
    p_challenge_id, null, v_pool, '[]'::jsonb, coalesce(v_c.prize_structure, 'equal_split'), 0, v_currency
  )
  on conflict (challenge_id) do nothing;
  update public.challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;
  perform public.stamp_challenge_settlement_results(p_challenge_id, '{}'::uuid[]);
  insert into public.posts (
    author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
  )
  select
    v_author,
    p_challenge_id,
    v_title || ' settled. Nobody remaining. Prize forfeited.',
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
  perform public.notify_challenge_settled(p_challenge_id, v_title, 'forfeit', v_post, v_currency);
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

revoke all on function public.settlement_forfeit_field(uuid) from public, anon;
grant execute on function public.settlement_forfeit_field(uuid) to authenticated, service_role;

create or replace function public.notify_challenge_settled(
  p_challenge_id uuid,
  p_title text,
  p_kind text,
  p_post_id uuid,
  p_currency text default 'coins'::text,
  p_void_copy text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  win record;
  v_name text;
  v_copy text;
  v_host uuid;
  v_href text;
  v_first_name text;
  v_winner_n int := 0;
begin
  select created_by into v_host from public.challenges where id = p_challenge_id;
  v_href := '/challenges/' || p_challenge_id::text;

  if p_kind = 'void' then
    v_copy := p_title || ' settled. ' || coalesce(
      nullif(btrim(p_void_copy), ''),
      'Nobody finished.'
    );
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'void', true,
          'href', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id
        )
      );
    end loop;
    return;
  end if;

  if p_kind = 'forfeit' then
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        p_title || ' settled. Nobody remaining. Prize forfeited.',
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'forfeit', true,
          'href', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id
        )
      );
    end loop;
    return;
  end if;

  select count(*) into v_winner_n from public.challenge_payouts where challenge_id = p_challenge_id;
  select public.profile_display_name(user_id) into v_first_name
  from public.challenge_payouts
  where challenge_id = p_challenge_id
  order by amount desc, user_id
  limit 1;

  for win in
    select user_id, amount from public.challenge_payouts where challenge_id = p_challenge_id
  loop
    perform public.notify_user(
      win.user_id,
      v_host,
      'payout_received',
      p_title || ' settled. ' || public.settlement_wallet_amount_label(win.amount, p_currency) || ' is in your wallet.',
      null,
      jsonb_build_object(
        'type', 'payout_received',
        'challengeId', p_challenge_id,
        'challenge_id', p_challenge_id,
        'amount', win.amount,
        'href', v_href,
        'tab', 'overview',
        'dedupe_key', 'payout:' || p_challenge_id || ':' || win.user_id
      )
    );
  end loop;

  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
      and not exists (
        select 1 from public.challenge_payouts w
        where w.challenge_id = p_challenge_id and w.user_id = p.user_id
      )
  loop
    v_copy := p_title || ' settled. ' || coalesce(nullif(btrim(v_first_name), ''), 'Someone') || ' took it.';
    perform public.notify_user(
      rec.user_id,
      v_host,
      'challenge_settled',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_settled',
        'challengeId', p_challenge_id,
        'challenge_id', p_challenge_id,
        'href', v_href,
        'tab', 'overview',
        'dedupe_key', 'settle:' || p_challenge_id
      )
    );
  end loop;
end;
$$;

revoke all on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) to authenticated, service_role;

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
      raise exception 'POINTS_NO_EVEN_SPLIT'
        using message = 'Points and cumulative challenges can’t use Even split remaining. Pick Winner take all or top places.';
    end if;
    raise exception 'CONSISTENCY_NO_TOP_PLACES'
      using message = 'Consistency challenges can’t use Top #, Top %, or Scaled. Pick Even split remaining or Last standing.';
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
    case when v_family = 'points' or v_structure = 'winner_take_all' then 'ranked' else 'split' end,
    v_post,
    v_currency
  );
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and public.settlement_should_run(c)
    for update skip locked
  loop
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception when others then
      null;
    end;
  end loop;
end;
$$;

create or replace function public.get_challenge_settlement(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s public.challenge_settlements%rowtype;
  v_has_refund boolean;
  v_slices jsonb;
begin
  select * into v_s from public.challenge_settlements where challenge_id = p_challenge_id;
  if not found then
    return null;
  end if;
  select exists (
    select 1
    from public.wallet_ledger w
    where w.challenge_id = p_challenge_id
      and w.reason in ('refund_buyin', 'return_host_funding')
  ) into v_has_refund;
  v_slices := case
    when jsonb_typeof(v_s.distributed) = 'array' then v_s.distributed
    else '[]'::jsonb
  end;
  return jsonb_build_object(
    'already_settled', true,
    'ok', true,
    'forfeit', coalesce(v_s.winner_count, 0) = 0
      and not coalesce(v_has_refund, false)
      and (v_s.distributed is null or v_s.distributed = '[]'::jsonb),
    'voided', coalesce(v_has_refund, false),
    'settlement', jsonb_build_object(
      'id', v_s.id,
      'challenge_id', v_s.challenge_id,
      'settled_by', v_s.settled_by,
      'prize_pool', v_s.prize_pool,
      'distributed', v_s.distributed,
      'prize_structure', v_s.prize_structure,
      'winner_count', v_s.winner_count,
      'settled_at', v_s.settled_at,
      'currency', v_s.currency
    ),
    'payouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'amount', p.amount,
          'place', coalesce((
            select (elem->>'place')::int
            from jsonb_array_elements(v_slices) elem
            where elem->>'user_id' = p.user_id::text
            limit 1
          ), 1),
          'score', coalesce((
            select (elem->>'score')::numeric
            from jsonb_array_elements(v_slices) elem
            where elem->>'user_id' = p.user_id::text
            limit 1
          ), 0),
          'reason', coalesce((
            select w.reason
            from public.wallet_ledger w
            where w.challenge_id = p.challenge_id
              and w.user_id = p.user_id
              and w.amount = p.amount
            order by
              case when w.reason in ('refund_buyin', 'return_host_funding', 'distribute_win') then 0 else 1 end,
              w.created_at desc
            limit 1
          ), 'distribute_win')
        )
        order by p.created_at, p.user_id
      )
      from public.challenge_payouts p
      where p.challenge_id = p_challenge_id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.settle_ended_challenge(uuid) from public, anon;
grant execute on function public.settle_ended_challenge(uuid) to authenticated, service_role;
grant execute on function public.tick_settlements() to authenticated, service_role;
grant execute on function public.get_challenge_settlement(uuid) to anon, authenticated, service_role;
grant execute on function public.settlement_format_family(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_is_illegal_pair(public.challenges) to authenticated, service_role;
grant execute on function public.settlement_wallet_amount_label(numeric, text) to authenticated, service_role;
