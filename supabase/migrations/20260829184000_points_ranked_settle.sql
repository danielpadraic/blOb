-- Points / cumulative ranked settle inside settle_ended_challenge only.
-- Consistency even-split / last-standing / 0-winner void is unchanged.
-- Does not replace distribute_challenge. Does not drop notify_challenge_settled.
-- Does not grant void_challenge_refund_field to authenticated.
-- even_split_shares(pool, n) two-arg only. Coins floor, never ceil the pot.

-- Scaled whole-coin shares. Leftover coins go to place 1. Sum = pot.
-- n=1: 100%
-- n=2: 65 / 35
-- n=3: 50 / 30 / 20
-- n=4: 40 / 25 / 15 / 10 (leftover 10% snaps to place 1 → 50 / 25 / 15 / 10)
-- n>=5: 50% place 1, remainder even_split_shares among the rest
create or replace function public.scaled_place_shares(p_pool numeric, p_count int)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_pool numeric;
  v_n int;
  v_out numeric[] := '{}';
  v_i int;
  v_sum numeric := 0;
  v_first numeric;
  v_rest numeric[];
  v_rest_sum numeric;
  v_pct numeric[];
begin
  v_n := coalesce(p_count, 0);
  v_pool := floor(greatest(coalesce(p_pool, 0), 0));
  if v_n <= 0 or v_pool <= 0 then
    return '{}';
  end if;
  if v_n = 1 then
    return array[v_pool];
  end if;
  if v_n >= 5 then
    v_first := floor(v_pool * 0.50);
    v_rest := public.even_split_shares(v_pool - v_first, v_n - 1);
    v_rest_sum := coalesce((select sum(x) from unnest(v_rest) as x), 0);
    return array[v_first + (v_pool - v_first - v_rest_sum)] || v_rest;
  end if;
  if v_n = 2 then
    v_pct := array[0.65, 0.35];
  elsif v_n = 3 then
    v_pct := array[0.50, 0.30, 0.20];
  else
    v_pct := array[0.40, 0.25, 0.15, 0.10];
  end if;
  for v_i in 1..v_n loop
    v_out := v_out || floor(v_pool * v_pct[v_i]);
    v_sum := v_sum + v_out[v_i];
  end loop;
  v_out[1] := v_out[1] + (v_pool - v_sum);
  return v_out;
end;
$$;

revoke all on function public.scaled_place_shares(numeric, int) from public, anon, authenticated;
grant execute on function public.scaled_place_shares(numeric, int) to service_role;

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
  v_pronoun text;
  v_copy text;
  v_host uuid;
  v_href text;
begin
  select created_by into v_host from public.challenges where id = p_challenge_id;
  v_href := '/challenges/' || p_challenge_id::text;

  if p_kind = 'void' then
    v_copy := p_title || ' settled. ' || coalesce(
      nullif(btrim(p_void_copy), ''),
      public.void_settlement_copy(true, false)
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

  if p_kind = 'ranked' then
    for win in
      select user_id, amount from public.challenge_payouts where challenge_id = p_challenge_id
    loop
      perform public.notify_user(
        win.user_id,
        v_host,
        'payout_received',
        'You received ' || public.settlement_format_amount(win.amount, p_currency) || ' from @' || p_title || '.',
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
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        p_title || ' settled.',
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
    return;
  end if;

  for win in
    select user_id, amount from public.challenge_payouts where challenge_id = p_challenge_id
  loop
    v_name := public.profile_display_name(win.user_id);
    v_pronoun := coalesce(public.profile_object_pronoun(win.user_id), 'them');
    v_copy := v_name || ' Settled @' || p_title || '. Congratulate ' || v_pronoun || '.';
    perform public.notify_user(
      win.user_id,
      v_host,
      'payout_received',
      'You received ' || public.settlement_format_amount(win.amount, p_currency) || ' from @' || p_title || '.',
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
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and user_id is distinct from win.user_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        win.user_id,
        'challenge_settled',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'actorId', win.user_id,
          'postId', p_post_id,
          'href', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id || ':' || win.user_id
        )
      );
    end loop;
  end loop;
end;
$$;

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
  v_shares numeric[];
  v_i int;
  v_slices jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_title text;
  v_author uuid;
  v_post uuid;
  v_count int := 0;
  v_currency text;
  v_format text;
  v_is_points boolean;
  v_structure text;
  v_eligible int := 0;
  v_slots int;
  v_cut numeric;
  v_max numeric;
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
  v_format := lower(coalesce(nullif(btrim(v_c.format), ''), nullif(btrim(v_c.challenge_type), ''), 'consistency'));
  v_is_points := v_format in ('points', 'cumulative');
  v_structure := lower(coalesce(v_c.prize_structure, 'equal_split'));

  select coalesce(array_agg(p.user_id order by p.joined_at, p.user_id), '{}')
    into v_winners
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;

  v_count := coalesce(array_length(v_winners, 1), 0);

  if (not v_is_points) or public.settlement_is_even_split(v_c) then
    if v_count = 0 then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;

    if not public.settlement_is_even_split(v_c) then
      raise exception 'NOT_EVEN_SPLIT';
    end if;

    v_shares := public.even_split_shares(v_pool, v_count);

    if v_pool <= 0 then
      insert into public.challenge_settlements (
        challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
      ) values (
        p_challenge_id, null, v_pool, '[]'::jsonb, 'equal_split', v_count, v_currency
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
        'place', 1,
        'reason', 'distribute_win'
      ));
    end loop;

    insert into public.challenge_settlements (
      challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
    ) values (
      p_challenge_id, null, v_pool, v_slices, 'equal_split', v_count, v_currency
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
      v_title || ' settled. ' || v_count || ' remaining split the prize.',
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
        v_title || ' settled. ' || v_count || ' remaining split the prize.',
        '{}',
        'public',
        '{}',
        'feed',
        'settlement_result_main'
      );
    end if;

    perform public.notify_challenge_settled(p_challenge_id, v_title, 'split', v_post, v_currency);
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  if v_is_points and v_structure in ('winner_take_all', 'top_places') then
    select count(*), coalesce(max(coalesce(p.points, 0)), 0)
      into v_eligible, v_max
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');

    if v_eligible = 0 or v_max <= 0 then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;

    if v_structure = 'winner_take_all' then
      v_slots := 1;
    elsif lower(coalesce(v_c.top_places_mode, 'count')) = 'percent' then
      v_slots := greatest(1, ceil(v_eligible * greatest(coalesce(v_c.top_places_value, 0), 0) / 100.0));
    else
      v_slots := greatest(1, floor(greatest(coalesce(v_c.top_places_value, 1), 1)));
    end if;

    select coalesce(p.points, 0)
      into v_cut
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    order by coalesce(p.points, 0) desc, coalesce(p.days_completed, 0) desc, p.joined_at asc, p.user_id asc
    offset greatest(v_slots - 1, 0)
    limit 1;

    select coalesce(array_agg(p.user_id order by coalesce(p.points, 0) desc, coalesce(p.days_completed, 0) desc, p.joined_at asc, p.user_id asc), '{}')
      into v_winners
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
      and coalesce(p.points, 0) >= v_cut;

    v_count := coalesce(array_length(v_winners, 1), 0);
    if v_count = 0 then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;

    if lower(coalesce(v_c.top_places_distribution, 'even')) = 'scaled' and v_structure = 'top_places' then
      v_shares := public.scaled_place_shares(v_pool, v_count);
    else
      v_shares := public.even_split_shares(v_pool, v_count);
    end if;

    if v_pool <= 0 then
      insert into public.challenge_settlements (
        challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
      ) values (
        p_challenge_id, null, v_pool, '[]'::jsonb, v_structure, v_count, v_currency
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
        'place', v_i,
        'reason', 'distribute_win'
      ));
    end loop;

    insert into public.challenge_settlements (
      challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
    ) values (
      p_challenge_id, null, v_pool, v_slices, v_structure, v_count, v_currency
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
      v_title || ' settled.',
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
        v_title || ' settled.',
        '{}',
        'public',
        '{}',
        'feed',
        'settlement_result_main'
      );
    end if;

    perform public.notify_challenge_settled(p_challenge_id, v_title, 'ranked', v_post, v_currency);
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  raise exception 'NOT_EVEN_SPLIT';
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;
