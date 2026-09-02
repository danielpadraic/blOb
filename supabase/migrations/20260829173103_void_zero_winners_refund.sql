-- 0 eligible winners voids the contest and refunds the field.
-- Does not rewrite existing challenge_settlements (TEST Forfeit rows stay).
-- even_split_shares for n > 0 is unchanged. No Create toggle.

create or replace function public.void_settlement_copy(
  p_refund_buyin boolean,
  p_return_host boolean
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_refund_buyin, false) and coalesce(p_return_host, false) then
      'Nobody finished. Entry coins were returned and the prize returned to the host.'
    when coalesce(p_return_host, false) then
      'Nobody finished. Prize returned to the host.'
    else
      'Nobody finished. Entry coins were returned.'
  end;
$$;

revoke all on function public.void_settlement_copy(boolean, boolean) from public;
grant execute on function public.void_settlement_copy(boolean, boolean) to anon, authenticated, service_role;

drop function if exists public.notify_challenge_settled(uuid, text, boolean, uuid, text);

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

revoke all on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) from public, anon;
grant execute on function public.notify_challenge_settled(uuid, text, text, uuid, text, text) to authenticated, service_role;

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
          'place', 1,
          'score', 0,
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

create or replace function public.void_challenge_refund_field(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_existing jsonb;
  v_pool numeric;
  v_left numeric;
  v_currency text;
  v_title text;
  v_author uuid;
  v_host uuid;
  v_post uuid;
  v_slices jsonb := '[]'::jsonb;
  v_amt numeric;
  v_host_label numeric;
  v_host_amt numeric;
  v_did_buyin boolean := false;
  v_did_host boolean := false;
  v_copy text;
  rec record;
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

  v_currency := coalesce(v_c.currency, 'coins');
  v_pool := case
    when v_currency = 'bucks' then round(greatest(coalesce(v_c.prize_pool, 0), 0), 2)
    else floor(greatest(coalesce(v_c.prize_pool, 0), 0))
  end;
  v_left := v_pool;
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_host := v_c.created_by;
  v_author := coalesce(
    v_c.created_by,
    (select user_id from public.challenge_participants where challenge_id = p_challenge_id limit 1)
  );

  for rec in
    select
      p.user_id,
      case
        when v_currency = 'bucks' then round(greatest(coalesce(p.buy_in_paid, 0), 0), 2)
        else floor(greatest(coalesce(p.buy_in_paid, 0), 0))
      end as paid
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and greatest(coalesce(p.buy_in_paid, 0), 0) > 0
      and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
      and not exists (
        select 1
        from public.wallet_ledger w
        where w.challenge_id = p_challenge_id
          and w.user_id = p.user_id
          and w.reason in ('refund_buyin', 'leave_refund', 'refund_pre_start')
      )
    order by p.joined_at, p.user_id
  loop
    v_amt := least(rec.paid, v_left);
    if v_amt > 0 then
      perform public.official_credit_payout(
        p_challenge_id,
        rec.user_id,
        v_currency,
        v_amt,
        'refund_buyin'
      );
      update public.wallet_ledger
      set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'settlement', true,
        'void', true
      )
      where challenge_id = p_challenge_id
        and user_id = rec.user_id
        and reason = 'refund_buyin';
      v_slices := v_slices || jsonb_build_array(jsonb_build_object(
        'user_id', rec.user_id,
        'amount', v_amt,
        'place', 0,
        'reason', 'refund_buyin'
      ));
      v_left := v_left - v_amt;
      v_did_buyin := true;
    end if;
  end loop;

  v_host_label := greatest(coalesce(v_c.host_budget, 0), coalesce(v_c.creator_contribution, 0), 0);
  if v_currency = 'bucks' then
    v_host_label := round(v_host_label, 2);
  else
    v_host_label := floor(v_host_label);
  end if;
  if v_host_label <= 0
    and (
      coalesce(v_c.host_funded, false)
      or coalesce(v_c.funding_model, '') in ('host', 'host_funded', 'sponsored')
    )
  then
    v_host_label := v_left;
  end if;
  v_host_amt := least(v_host_label, v_left);
  if v_host is not null and v_host_amt > 0 then
    perform public.official_credit_payout(
      p_challenge_id,
      v_host,
      v_currency,
      v_host_amt,
      'return_host_funding'
    );
    update public.wallet_ledger
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'settlement', true,
      'void', true
    )
    where challenge_id = p_challenge_id
      and user_id = v_host
      and reason = 'return_host_funding';
    v_slices := v_slices || jsonb_build_array(jsonb_build_object(
      'user_id', v_host,
      'amount', v_host_amt,
      'place', 0,
      'reason', 'return_host_funding'
    ));
    v_left := v_left - v_host_amt;
    v_did_host := true;
  end if;

  if not v_did_buyin and not v_did_host then
    v_did_buyin := coalesce(v_c.buy_in_amount, 0) > 0;
    v_did_host :=
      coalesce(v_c.host_funded, false)
      or coalesce(v_c.host_budget, 0) > 0
      or coalesce(v_c.creator_contribution, 0) > 0;
  end if;
  v_copy := public.void_settlement_copy(v_did_buyin, v_did_host);

  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
  ) values (
    p_challenge_id, null, v_pool, v_slices, coalesce(v_c.prize_structure, 'equal_split'), 0, v_currency
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
    v_title || ' settled. ' || v_copy,
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
      v_title || ' settled. ' || v_copy,
      '{}',
      'public',
      '{}',
      'feed',
      'settlement_result_main'
    );
  end if;

  perform public.notify_challenge_settled(p_challenge_id, v_title, 'void', v_post, v_currency, v_copy);
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

revoke all on function public.void_challenge_refund_field(uuid) from public, anon;
grant execute on function public.void_challenge_refund_field(uuid) to authenticated, service_role;

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

  if v_count = 0 then
    return public.void_challenge_refund_field(p_challenge_id);
  end if;

  if not public.settlement_is_even_split(v_c) then
    raise exception 'NOT_EVEN_SPLIT';
  end if;

  v_shares := public.even_split_shares(v_pool, v_count, v_currency);

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
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

create or replace function public.distribute_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_open_disputes int;
  v_active int;
  v_winner uuid;
  v_pool numeric;
  v_share numeric;
  v_completers uuid[];
  v_even boolean;
  v_need int;
  v_threshold int := 0;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.distributed_at is not null then
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if exists (select 1 from challenge_payouts where challenge_id = p_challenge_id) then
    update challenges
      set distributed_at = coalesce(distributed_at, now()), status = 'settled', updated_at = now()
      where id = p_challenge_id;
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if v_c.official_started_at is null then
    raise exception 'NOT_STARTED';
  end if;

  v_even := coalesce(v_c.payout_mode, 'even_split_remaining') = 'even_split_remaining'
    and coalesce(v_c.prize_structure, 'equal_split') not in ('winner_take_all', 'top_places')
    and coalesce(v_c.is_unlimited, false) = false
    and coalesce(v_c.end_mode, '') is distinct from 'indefinite_lms';

  if v_c.end_mode = 'indefinite_lms' or v_c.is_unlimited = true then
    select count(*) into v_active from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null;
    if v_active <> 1 then
      raise exception 'LMS_NOT_FINISHED';
    end if;
  else
    if v_c.ends_at is null then
      raise exception 'NO_END_TIME';
    end if;
    if not v_even and now() < v_c.ends_at + interval '1 hour' then
      raise exception 'COOLDOWN_ACTIVE';
    end if;
    if v_even and now() < v_c.ends_at then
      raise exception 'CHALLENGE_NOT_ENDED';
    end if;
  end if;

  select count(*) into v_open_disputes from challenge_disputes
  where challenge_id = p_challenge_id and status = 'open';
  if v_open_disputes > 0 then
    raise exception 'OPEN_DISPUTES';
  end if;

  if coalesce(v_c.is_official, false) and coalesce(v_c.series_id, '') <> '' then
    return public.distribute_official_guarantee(p_challenge_id);
  end if;

  if coalesce(v_c.end_mode, '') is distinct from 'indefinite_lms'
    and coalesce(v_c.is_unlimited, false) = false
  then
    v_need := public.settlement_required_days(v_c);
    select coalesce(count(*), 0) into v_threshold
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
      and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;
    if v_threshold = 0 then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;
  end if;

  v_pool := coalesce(v_c.prize_pool, 0);

  if v_even then
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id
      and eliminated_at is null
      and status in ('active', 'completed', 'joined')
      and status is distinct from 'refunded_pre_start';

    if v_completers is null or array_length(v_completers, 1) is null then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;

    if v_pool <= 0 then
      update challenges set distributed_at = now(), status = 'settled', updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'paid', 0);
    end if;

    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, amount)
      values (p_challenge_id, v_winner, v_share);
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb);
    end loop;

    update challenges
    set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
    where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'distributed_at', now(), 'paid', v_share);
  end if;

  if v_pool <= 0 then
    update challenges set distributed_at = now(), status = 'settled', updated_at = now() where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'paid', 0);
  end if;

  if v_c.prize_structure = 'solo_return' or (v_c.max_participants = 1) then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null
    limit 1;
    if v_winner is null then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, amount)
    values (p_challenge_id, v_winner, v_pool);
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb);
  elsif v_c.prize_structure = 'winner_take_all' then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and eliminated_at is null and status <> 'refunded_pre_start'
    order by points desc, days_completed desc, joined_at asc
    limit 1;
    if v_winner is null then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, amount)
    values (p_challenge_id, v_winner, v_pool);
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb);
  else
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id and status = 'completed' and eliminated_at is null;
    if v_completers is null or array_length(v_completers, 1) is null then
      select array_agg(user_id) into v_completers from challenge_participants
      where challenge_id = p_challenge_id and eliminated_at is null and status in ('active', 'completed', 'joined');
    end if;
    if v_completers is null or array_length(v_completers, 1) is null then
      return public.void_challenge_refund_field(p_challenge_id);
    end if;
    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, amount)
      values (p_challenge_id, v_winner, v_share);
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb);
    end loop;
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'distributed_at', now());
end;
$$;
