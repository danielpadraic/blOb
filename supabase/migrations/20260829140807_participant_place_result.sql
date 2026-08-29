-- Stamp place + result on every participant when even-split settlement runs.
-- Does not change even-split money math. Does not implement WTA / top-places payouts.

alter table public.challenge_participants
  add column if not exists place integer,
  add column if not exists result text not null default 'pending';

alter table public.challenge_participants
  drop constraint if exists challenge_participants_result_check;

alter table public.challenge_participants
  add constraint challenge_participants_result_check
  check (result in ('pending', 'remaining', 'dropped', 'won', 'lost', 'split', 'forfeited'));

create or replace function public.stamp_challenge_settlement_results(
  p_challenge_id uuid,
  p_winners uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := coalesce(array_length(p_winners, 1), 0);
begin
  if p_challenge_id is null then
    return;
  end if;

  update public.challenge_participants p
  set
    place = case when p.user_id = any(coalesce(p_winners, '{}')) then 1 else null end,
    result = case
      when p.user_id = any(coalesce(p_winners, '{}')) then
        case when v_count > 1 then 'split' else 'won' end
      when coalesce(p.status, 'joined') in ('withdrawn', 'refunded_pre_start', 'refunded') then
        'dropped'
      when p.eliminated_at is not null
        or coalesce(p.status, 'joined') in ('eliminated', 'failed') then
        'lost'
      when v_count = 0 then
        'forfeited'
      else
        'remaining'
    end
  where p.challenge_id = p_challenge_id;
end;
$$;

revoke all on function public.stamp_challenge_settlement_results(uuid, uuid[]) from public, anon;
grant execute on function public.stamp_challenge_settlement_results(uuid, uuid[]) to service_role;

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
  v_pool := round(coalesce(v_c.prize_pool, 0), 2);
  v_currency := coalesce(v_c.currency, 'coins');
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
  v_shares := public.even_split_shares(v_pool, v_count);

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
