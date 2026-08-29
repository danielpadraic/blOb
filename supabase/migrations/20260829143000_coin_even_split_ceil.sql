-- Coin even-split: ceil(pool / winners), whole coins only.
-- Bucks keep a cents split. WTA / top-places money is unchanged.

drop function if exists public.even_split_shares(numeric, int);

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
  v_share numeric;
  v_left numeric;
  v_i int;
  v_out numeric[] := '{}';
  v_pool numeric;
begin
  if p_count is null or p_count <= 0 then
    return '{}';
  end if;

  if coalesce(p_currency, 'coins') is distinct from 'bucks' then
    v_share := ceil(greatest(coalesce(p_pool, 0), 0) / p_count);
    for v_i in 1..p_count loop
      v_out := v_out || v_share;
    end loop;
    return v_out;
  end if;

  v_pool := round(coalesce(p_pool, 0), 2);
  v_share := round(v_pool / p_count, 2);
  v_left := round(v_pool - (v_share * p_count), 2);
  for v_i in 1..p_count loop
    v_out := v_out || (v_share + case when v_i = p_count then v_left else 0 end);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.even_split_shares(numeric, int, text) from public;
grant execute on function public.even_split_shares(numeric, int, text) to anon, authenticated, service_role;

create or replace function public.official_credit_payout(
  p_challenge_id uuid,
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric;
begin
  if p_user_id is null or coalesce(p_amount, 0) <= 0 then
    return;
  end if;
  v_amount := p_amount;
  if coalesce(p_currency, 'coins') is distinct from 'bucks' then
    v_amount := ceil(greatest(v_amount, 0));
  end if;
  if p_currency = 'coins' then
    update profiles set coins = coins + v_amount where id = p_user_id;
  else
    update profiles set bucks = bucks + v_amount where id = p_user_id;
  end if;
  insert into challenge_payouts (challenge_id, user_id, amount)
  values (p_challenge_id, p_user_id, v_amount);
  insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
  values (
    p_user_id,
    p_challenge_id,
    p_currency,
    v_amount,
    'distribute_win',
    p_reason,
    '{}'::jsonb
  );
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

  if not public.settlement_is_even_split(v_c) then
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
    else ceil(greatest(coalesce(v_c.prize_pool, 0), 0))
  end;
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_author := coalesce(
    v_c.created_by,
    (select user_id from public.challenge_participants where challenge_id = p_challenge_id limit 1)
  );

  select coalesce(array_agg(p.user_id order by p.joined_at, p.user_id), '{}')
    into v_winners
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;

  v_count := coalesce(array_length(v_winners, 1), 0);
  v_shares := public.even_split_shares(v_pool, v_count, v_currency);

  if v_count = 0 or v_pool <= 0 then
    insert into public.challenge_settlements (
      challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
    ) values (
      p_challenge_id, null, v_pool, '[]'::jsonb, 'equal_split', 0, v_currency
    )
    on conflict (challenge_id) do nothing;

    update public.challenges
    set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
    where id = p_challenge_id;

    perform public.stamp_challenge_settlement_results(
      p_challenge_id,
      case when v_count = 0 then '{}'::uuid[] else v_winners end
    );

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
        v_title || ' settled. Nobody remaining. Prize forfeited.',
        '{}',
        'public',
        '{}',
        'feed',
        'settlement_result_main'
      );
    end if;

    perform public.notify_challenge_settled(p_challenge_id, v_title, true, v_post, v_currency);
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

  perform public.notify_challenge_settled(p_challenge_id, v_title, false, v_post, v_currency);
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;
