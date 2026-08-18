-- Even-split at end: remaining share the pot. Remaining = 0 → forfeit, no refund.
-- Misses still drop people while in_progress. Join stays open-only before starts_at.

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

  v_pool := coalesce(v_c.prize_pool, 0);

  if v_even then
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id
      and eliminated_at is null
      and status in ('active', 'completed', 'joined')
      and status is distinct from 'refunded_pre_start';

    if v_completers is null or array_length(v_completers, 1) is null then
      update challenges
      set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
      where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
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
      insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
      values (p_challenge_id, v_winner, v_c.currency, v_share, null, 'distribute_win')
      on conflict (challenge_id, user_id) do nothing;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
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
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'solo_forfeit', true);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
  elsif v_c.prize_structure = 'winner_take_all' then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and eliminated_at is null and status <> 'refunded_pre_start'
    order by points desc, days_completed desc, joined_at asc
    limit 1;
    if v_winner is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
  else
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id and status = 'completed' and eliminated_at is null;
    if v_completers is null or array_length(v_completers, 1) is null then
      select array_agg(user_id) into v_completers from challenge_participants
      where challenge_id = p_challenge_id and eliminated_at is null and status in ('active', 'completed', 'joined');
    end if;
    if v_completers is null or array_length(v_completers, 1) is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
    end if;
    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
      values (p_challenge_id, v_winner, v_c.currency, v_share, null, 'distribute_win')
      on conflict (challenge_id, user_id) do nothing;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
    end loop;
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'distributed_at', now());
end;
$$;

grant execute on function public.distribute_challenge(uuid) to authenticated;

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_joined int;
  v_need int;
begin
  for rec in
    select id, min_participants, start_rule, starts_at
    from public.challenges
    where status in ('upcoming', 'open')
      and starts_at is not null
      and now() >= starts_at
      and (ends_at is null or now() < ends_at)
    for update skip locked
  loop
    select count(*) into v_joined
    from public.challenge_participants
    where challenge_id = rec.id
      and status is distinct from 'refunded_pre_start';

    if coalesce(rec.start_rule, 'legacy') = 'at_starts_at' then
      v_need := greatest(coalesce(rec.min_participants, 2), 2);
      if v_joined >= v_need then
        update public.challenges
        set
          status = 'in_progress',
          official_started_at = coalesce(official_started_at, starts_at)
        where id = rec.id;
      else
        update public.challenges
        set status = 'cancelled_underfilled'
        where id = rec.id;
        perform public.refund_challenge_underfilled(rec.id);
      end if;
    else
      update public.challenges
      set
        status = 'in_progress',
        official_started_at = coalesce(official_started_at, starts_at)
      where id = rec.id;
    end if;
  end loop;

  -- Drops happen while still in_progress, including after the clock hits ends_at.
  perform public.sync_challenge_misses();
  perform public.sync_unlimited_eliminations();

  for rec in
    select id
    from public.challenges
    where status = 'in_progress'
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and coalesce(payout_mode, 'even_split_remaining') = 'even_split_remaining'
      and coalesce(prize_structure, 'equal_split') not in ('winner_take_all', 'top_places')
      and distributed_at is null
    for update skip locked
  loop
    begin
      perform public.distribute_challenge(rec.id);
    exception when others then
      update public.challenges
      set status = 'judging'
      where id = rec.id and status = 'in_progress';
    end;
  end loop;

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and distributed_at is null;
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;
