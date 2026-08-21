-- Participant Leave before live (user-created only).
-- Refund entry on wallet_ledger using existing columns (never ref_type).
-- Remove the participant row so Join returns. Official: no leave.
-- Posts stay. Void leftover in_progress / ready check-ins.
-- If joined drops below min, stay not-live; tick_one_user_challenge_start still rolls.

create or replace function public.leave_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_cur text;
  v_amt numeric := 0;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) or coalesce(v_c.series_id, '') <> '' then
    raise exception 'LEAVE_NOT_ALLOWED';
  end if;

  if v_c.status in (
    'live', 'judging', 'settled', 'cancelled', 'cancelled_underfilled', 'distributing'
  ) then
    raise exception 'ALREADY_STARTED';
  end if;

  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'already_left', true, 'refunded', 0);
  end if;

  if coalesce(v_p.status, 'joined') in ('refunded_pre_start', 'withdrawn') then
    delete from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = v_uid;
    return jsonb_build_object('ok', true, 'already_left', true, 'refunded', 0);
  end if;

  v_cur := case
    when coalesce(v_p.currency, v_c.currency, 'coins') = 'bucks' then 'bucks'
    else 'coins'
  end;
  v_amt := greatest(coalesce(v_p.buy_in_paid, v_c.buy_in_amount, 0), 0);

  if v_amt > 0 then
    if v_cur = 'coins' then
      update public.profiles
      set coins = coalesce(coins, credits, 0) + v_amt
      where id = v_uid;
    else
      update public.profiles
      set bucks = coalesce(bucks, 0) + v_amt
      where id = v_uid;
    end if;
    update public.challenges
    set prize_pool = greatest(coalesce(prize_pool, 0) - v_amt, 0),
        updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, v_amt,
      'leave_refund', 'leave_refund',
      '{}'::jsonb,
      p_challenge_id
    );
  end if;

  -- Posts.checkin_id ON DELETE SET NULL — challenge feed stays.
  begin
    delete from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = v_uid
      and status in ('in_progress', 'ready');
  exception when others then
    null;
  end;

  delete from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = v_uid;

  begin
    perform public.tick_one_user_challenge_start(p_challenge_id);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'refunded', v_amt,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.leave_challenge(uuid) to authenticated;

notify pgrst, 'reload schema';
