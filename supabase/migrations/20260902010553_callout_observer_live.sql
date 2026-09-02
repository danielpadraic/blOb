-- Callout Slice 3b: cheer-only observers on Live after accept.
-- Table/RLS from Slice 1b. Observers are never participants. No second money path.

create table if not exists public.callout_observers (
  callout_id uuid not null references public.callouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (callout_id, user_id)
);

create or replace function public.is_callout_challenge_observer(p_challenge_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.callouts c
    join public.callout_observers o on o.callout_id = c.id
    where c.challenge_id = p_challenge_id
      and o.user_id = p_user_id
      and p_user_id is not null
      and p_user_id is distinct from c.challenger_id
      and p_user_id is distinct from c.opponent_id
  );
$$;

revoke all on function public.is_callout_challenge_observer(uuid, uuid) from public, anon;
grant execute on function public.is_callout_challenge_observer(uuid, uuid) to authenticated;

create or replace function public.user_can_access_challenge(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if p_challenge_id is null then
    return false;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return false;
  end if;

  if coalesce(v_c.is_official, false) then
    return true;
  end if;

  if p_user_id is not null and v_c.created_by = p_user_id then
    return true;
  end if;

  if p_user_id is not null and exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;

  if lower(coalesce(v_c.visibility, 'public')) in ('public', 'unlisted')
     and lower(coalesce(v_c.challenge_lane, 'coins')) <> 'private' then
    return true;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.challenge_invites
    where challenge_id = p_challenge_id
      and status in ('pending', 'accepted')
      and invitee_id = p_user_id
  ) then
    return true;
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c)
     and coalesce(v_c.discoverability, '') = 'friends_of_friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if coalesce(v_c.is_callout, false)
     and public.is_callout_challenge_observer(p_challenge_id, p_user_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.user_can_access_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_challenge(p_challenge_id, auth.uid());
$$;

grant execute on function public.user_can_access_challenge(uuid, uuid) to authenticated, anon;
grant execute on function public.user_can_access_challenge(uuid) to authenticated, anon;

-- Live posts: observers can read fighter check-ins and cheer. Strangers stay out
-- unless the post is otherwise public (Home). Challenge Live still needs access.
create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not distinct from p_author_id
    or (
      p_audience is distinct from 'only_me'
      and (
        p_audience = 'public'
        or exists (
          select 1
          from public.profiles pr
          where pr.id = p_author_id
            and coalesce(pr.is_official, false)
        )
        or (
          p_audience = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.friendships f
            where f.status = 'accepted'
              and f.user_a_id = least(auth.uid(), p_author_id)
              and f.user_b_id = greatest(auth.uid(), p_author_id)
          )
        )
        or (
          p_audience in ('specific', 'people')
          and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and exists (
            select 1
            from public.challenge_participants cp
            where cp.challenge_id = p_challenge_id
              and cp.user_id = auth.uid()
          )
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and public.is_callout_challenge_observer(p_challenge_id, auth.uid())
        )
      )
    );
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;

-- Cheer posts must belong to a challenge the author can open. Observers pass
-- user_can_access_challenge; strangers cannot post into a private Callout.
drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      circle_id is null
      or public.is_circle_member(circle_id, auth.uid())
    )
    and (
      challenge_id is null
      or public.user_can_access_challenge(challenge_id, auth.uid())
    )
    and (
      (challenge_id is null or circle_id is null)
      or (
        type = 'circle_challenge_share'
        and public.user_can_access_challenge(challenge_id, auth.uid())
      )
    )
  );

-- accept_callout is the only money path. Watchers cannot Pay entry.
create or replace function public.join_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
  v_cur text;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if coalesce(v_c.is_callout, false) then
    raise exception 'This Callout is cheer only. Watching — no entry, no prize.' using errcode = 'P0001';
  end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.series_id is not null then
    if v_c.status not in ('filling', 'arming') then
      raise exception 'ALREADY_STARTED';
    end if;
  elsif v_c.is_official then
    raise exception 'NOT_JOINABLE';
  else
    if v_c.status in (
      'live', 'judging', 'settled',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'ALREADY_STARTED';
    end if;
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is distinct from v_uid
     and not public.are_accepted_friends(v_c.created_by, v_uid) then
    raise exception 'FRIENDS_ONLY';
  end if;

  if public.is_invite_only_challenge(v_c)
     and v_c.created_by is distinct from v_uid then
    if not public.user_can_access_challenge(p_challenge_id, v_uid) then
      raise exception 'NOT_INVITED';
    end if;
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if public.requires_official_body_metrics(v_c) then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  v_cur := case when v_c.currency = 'bucks' then 'bucks' else 'coins' end;
  if v_cur = 'coins' then
    select coalesce(coins, credits, 0) into v_balance from profiles where id = v_uid for update;
  else
    select coalesce(bucks, 0) into v_balance from profiles where id = v_uid for update;
  end if;

  if coalesce(v_balance, 0) < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_cur = 'coins' then
      update profiles
      set coins = coalesce(coins, credits, 0) - v_c.buy_in_amount
      where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, -v_c.buy_in_amount,
      'join_escrow', 'join_escrow',
      '{}'::jsonb,
      p_challenge_id
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_cur, 'active');

  begin
    update public.challenge_invites
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = v_uid
      and status = 'pending';
  exception when others then
    null;
  end;

  if v_c.series_id is not null then
    select 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0)
      into v_need
    from public.challenges
    where id = p_challenge_id;
    if v_need > 0 then
      update public.challenges
      set status = 'arming', armed_at = coalesce(armed_at, now()), updated_at = now()
      where id = p_challenge_id
        and status = 'filling'
        and coalesce(prize_pool, 0) >= v_need;
    end if;
  elsif coalesce(v_c.is_official, false) = false then
    begin
      perform public.tick_one_user_challenge_start(p_challenge_id);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$function$;

grant execute on function public.join_challenge(uuid) to authenticated;

create or replace function public.invite_callout_observer(p_callout_id uuid, p_user_id uuid)
returns public.callout_observers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_obs public.callout_observers%rowtype;
  v_name text;
  v_title text;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Pick someone else to watch' using errcode = 'P0001';
  end if;

  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Only the two in this Callout can invite watchers' using errcode = '42501';
  end if;
  if p_user_id in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'That person is already in this Callout' using errcode = 'P0001';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'This Callout was cancelled' using errcode = 'P0001';
  end if;
  if not public.callout_opponent_allowed(v_me, p_user_id) then
    raise exception 'You can only invite a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.callout_observers
    where callout_id = p_callout_id and user_id = p_user_id
  ) then
    select * into v_obs
    from public.callout_observers
    where callout_id = p_callout_id and user_id = p_user_id;
    return v_obs;
  end if;

  insert into public.callout_observers (callout_id, user_id, invited_by)
  values (p_callout_id, p_user_id, v_me)
  returning * into v_obs;

  v_name := public.profile_display_name(v_me);
  v_title := coalesce(nullif(btrim(v_row.win_condition), ''), 'Callout:');
  begin
    perform public.notify_user(
      p_user_id, v_me, 'callout_observer_invited',
      v_title,
      v_name || ' invited you to watch. Watching — no entry, no prize.',
      jsonb_strip_nulls(jsonb_build_object(
        'callout_id', p_callout_id,
        'challenge_id', v_row.challenge_id,
        'title', v_title
      ))
    );
  exception when others then
    null;
  end;

  return v_obs;
end;
$$;

grant execute on function public.invite_callout_observer(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
