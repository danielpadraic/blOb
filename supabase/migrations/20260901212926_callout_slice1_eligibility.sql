-- Callout Slice 1: 1v1 eligibility, Callout: title, notify copy.
-- Keeps create_callout / accept_callout / decline_callout. Safe to re-run.

create or replace function public.callout_opponent_allowed(p_me uuid, p_them uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_me is not null
    and p_them is not null
    and p_me <> p_them
    and not exists (
      select 1
      from public.friendships f
      where f.status = 'blocked'
        and f.user_a_id = least(p_me, p_them)
        and f.user_b_id = greatest(p_me, p_them)
    )
    and (
      exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and f.user_a_id = least(p_me, p_them)
          and f.user_b_id = greatest(p_me, p_them)
      )
      or exists (
        select 1
        from public.challenge_participants me
        join public.challenge_participants them
          on them.challenge_id = me.challenge_id
         and them.user_id = p_them
        join public.challenges c on c.id = me.challenge_id
        where me.user_id = p_me
          and me.status not in ('withdrawn', 'refunded_pre_start')
          and them.status not in ('withdrawn', 'refunded_pre_start')
          and c.status not in (
            'draft',
            'ended',
            'settling',
            'settled',
            'judging',
            'distributing',
            'cancelled',
            'cancelled_underfilled'
          )
      )
    );
$$;

revoke all on function public.callout_opponent_allowed(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_callout(
  p_opponent_id uuid,
  p_amount numeric,
  p_currency text,
  p_win_condition text,
  p_deadline timestamptz
)
returns public.callouts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_amount numeric(12,2);
  v_currency text;
  v_task text;
  v_win text;
  v_row public.callouts%rowtype;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_opponent_id is null or p_opponent_id = v_me then
    raise exception 'Pick someone else to call out' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_opponent_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;
  if not public.callout_opponent_allowed(v_me, p_opponent_id) then
    raise exception 'You can only call out a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.callouts
    where status = 'pending'
      and (
        (challenger_id = v_me and opponent_id = p_opponent_id)
        or (challenger_id = p_opponent_id and opponent_id = v_me)
      )
  ) then
    raise exception 'You already have a pending call-out with them' using errcode = 'P0001';
  end if;

  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Stake at least 0.01' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a stake at 10,000 or less' using errcode = 'P0001';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Set a deadline in the future' using errcode = 'P0001';
  end if;

  v_task := btrim(coalesce(p_win_condition, ''));
  if lower(v_task) like 'callout:%' then
    v_task := btrim(substr(v_task, 9));
  end if;
  if length(v_task) < 3 then
    raise exception 'Say what a win looks like' using errcode = 'P0001';
  end if;
  v_win := 'Callout: ' || v_task;

  insert into public.callouts (
    challenger_id, opponent_id, currency, stake_amount, win_condition, deadline, status
  ) values (
    v_me, p_opponent_id, v_currency, v_amount, v_win, p_deadline, 'pending'
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.create_callout(uuid, numeric, text, text, timestamptz) to authenticated;

create or replace function public.trg_notify_callout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_noun text;
  v_amount text;
  v_title text;
begin
  v_noun := case when new.currency = 'bucks' then '$' else 'Coins' end;
  v_amount := to_char(new.stake_amount, 'FM999999990.00');
  v_title := coalesce(nullif(btrim(new.win_condition), ''), 'Callout:');

  if tg_op = 'INSERT' then
    v_name := public.profile_display_name(new.challenger_id);
    perform public.notify_user(
      new.opponent_id, new.challenger_id, 'callout_received',
      v_title,
      v_name || ' called you out for ' || v_amount || ' ' || v_noun || '.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency, 'title', v_title)
    );
    return new;
  end if;

  if old.status = 'pending' and new.status = 'active' then
    v_name := public.profile_display_name(new.opponent_id);
    perform public.notify_user(
      new.challenger_id, new.opponent_id, 'callout_accepted',
      v_title,
      v_name || ' accepted. Stakes are held.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency, 'title', v_title)
    );
  elsif old.status is distinct from new.status and new.status = 'settled' then
    perform public.notify_user(
      new.challenger_id, new.winner_id, 'callout_resolved',
      v_title,
      'You both agreed. The prize was released.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency, 'title', v_title)
    );
    perform public.notify_user(
      new.opponent_id, new.winner_id, 'callout_resolved',
      v_title,
      'You both agreed. The prize was released.',
      jsonb_build_object('callout_id', new.id, 'currency', new.currency, 'title', v_title)
    );
  elsif old.status is distinct from new.status and new.status = 'disputed' then
    perform public.notify_user(
      new.challenger_id, new.opponent_id, 'callout_disputed',
      v_title,
      'You picked different winners. Cancel together to refund the stakes.',
      jsonb_build_object('callout_id', new.id, 'title', v_title)
    );
    perform public.notify_user(
      new.opponent_id, new.challenger_id, 'callout_disputed',
      v_title,
      'You picked different winners. Cancel together to refund the stakes.',
      jsonb_build_object('callout_id', new.id, 'title', v_title)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;
