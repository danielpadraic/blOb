-- System posts after a successful join_challenge.
-- Challenge feed always. Main Home feed only when the challenge is socially public.

alter table public.posts
  add column if not exists system_kind text;

comment on column public.posts.system_kind is
  'Internal event key (join_challenge_feed, join_main_feed). Null for user-composed posts.';

create unique index if not exists posts_system_kind_uidx
  on public.posts (author_id, challenge_id, system_kind)
  where system_kind is not null;

create or replace function public.challenge_allows_main_feed_announce(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  -- Match feedAudienceForChallenge: invite / private / private-lane stay lobby-only.
  select not (
    (
      coalesce(p_challenge.is_official, false) = false
      and public.is_invite_only_challenge(p_challenge)
    )
    or lower(coalesce(p_challenge.visibility, '')) in ('invite', 'private')
  );
$$;

create or replace function public.announce_challenge_join(p_challenge_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_name text;
  v_title text;
  v_audience text;
begin
  if p_challenge_id is null or p_user_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'a challenge');

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_challenge_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' has joined the challenge!',
      '{}',
      'public',
      '{}',
      'challenge',
      'join_challenge_feed'
    );
  end if;

  if not public.challenge_allows_main_feed_announce(v_c) then
    return;
  end if;

  v_audience := case
    when lower(coalesce(v_c.visibility, '')) = 'friends' then 'friends'
    else 'public'
  end;

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_main_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' joined ' || v_title,
      '{}',
      v_audience,
      '{}',
      'feed',
      'join_main_feed'
    );
  end if;
exception when others then
  null;
end;
$$;

revoke all on function public.announce_challenge_join(uuid, uuid) from public, anon, authenticated;
revoke all on function public.challenge_allows_main_feed_announce(public.challenges) from public, anon, authenticated;

create or replace function public.join_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  if v_c.is_official then
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

  begin
    perform public.announce_challenge_join(p_challenge_id, v_uid);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

notify pgrst, 'reload schema';
