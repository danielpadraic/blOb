-- Challenge discoverability for private challenges + official jurisdiction gate.
-- Does not change prize, proof, or settlement math.

alter table public.challenges
  add column if not exists discoverability text;

alter table public.challenges
  add column if not exists allowed_states text[];

alter table public.profiles
  add column if not exists home_state text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'challenges_discoverability_allowed'
  ) then
    alter table public.challenges
      add constraint challenges_discoverability_allowed
      check (discoverability is null or discoverability in ('invite_only', 'friends_of_friends'));
  end if;
end $$;

comment on column public.challenges.discoverability is
  'invite_only | friends_of_friends. Null when public or official.';
comment on column public.challenges.allowed_states is
  'Official jurisdiction. Empty/null = available everywhere.';
comment on column public.profiles.home_state is
  'Two-letter home State for official Challenge eligibility.';

create or replace function public.challenge_available_in_jurisdiction(
  p_challenge_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_official boolean;
  v_states text[];
  v_state text;
begin
  select is_official, allowed_states
    into v_official, v_states
  from public.challenges
  where id = p_challenge_id;
  if not found then
    return false;
  end if;
  if not v_official then
    return true;
  end if;
  if v_states is null or coalesce(array_length(v_states, 1), 0) = 0 then
    return true;
  end if;
  if p_user_id is null then
    return false;
  end if;
  select nullif(upper(btrim(home_state)), '') into v_state
  from public.profiles
  where id = p_user_id;
  if v_state is null then
    return false;
  end if;
  return exists (
    select 1 from unnest(v_states) as s
    where upper(btrim(s)) = v_state
  );
end;
$$;

grant execute on function public.challenge_available_in_jurisdiction(uuid, uuid) to authenticated, anon;

create or replace function public.challenge_access_reason(p_challenge_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_uid uuid := auth.uid();
begin
  if p_challenge_id is null then
    return 'hidden';
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return 'hidden';
  end if;
  if v_c.is_official
     and v_uid is distinct from v_c.created_by
     and not exists (
       select 1 from public.challenge_participants
       where challenge_id = p_challenge_id and user_id = v_uid
     )
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    return 'geo';
  end if;
  if public.user_can_access_challenge(p_challenge_id, v_uid) then
    return 'ok';
  end if;
  return 'hidden';
end;
$$;

grant execute on function public.challenge_access_reason(uuid) to authenticated, anon;

create or replace function public.set_challenge_discoverability()
returns trigger
language plpgsql
as $$
begin
  if new.is_official or coalesce(new.visibility, 'public') in ('public', 'unlisted') then
    new.discoverability := null;
  elsif coalesce(new.visibility, '') in ('private', 'invite')
        or coalesce(new.challenge_lane, 'coins') = 'private' then
    if new.discoverability in ('invite_only', 'friends_of_friends') then
      null;
    elsif coalesce(new.currency, 'coins') = 'bucks' then
      new.discoverability := 'invite_only';
    else
      new.discoverability := 'friends_of_friends';
    end if;
  else
    new.discoverability := null;
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_set_discoverability on public.challenges;
create trigger challenges_set_discoverability
  before insert or update of visibility, challenge_lane, currency, is_official, discoverability
  on public.challenges
  for each row execute function public.set_challenge_discoverability();

update public.challenges
set discoverability = case
  when is_official or coalesce(visibility, 'public') in ('public', 'unlisted') then null
  when coalesce(visibility, '') in ('private', 'invite')
       or coalesce(challenge_lane, 'coins') = 'private' then
    case when coalesce(currency, 'coins') = 'bucks' then 'invite_only' else 'friends_of_friends' end
  else null
end
where true;

create or replace function public.user_can_access_challenge(
  p_challenge_id uuid,
  p_user_id uuid default auth.uid()
)
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

  if v_c.is_official then
    if p_user_id is not null and (
      v_c.created_by = p_user_id
      or exists (
        select 1 from public.challenge_participants
        where challenge_id = p_challenge_id and user_id = p_user_id
      )
    ) then
      return true;
    end if;
    return public.challenge_available_in_jurisdiction(p_challenge_id, p_user_id);
  end if;

  if coalesce(v_c.visibility, 'public') in ('public', 'unlisted')
     and coalesce(v_c.challenge_lane, 'coins') is distinct from 'private' then
    return true;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if v_c.created_by = p_user_id then
    return true;
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;

  if exists (
    select 1 from public.challenge_invites
    where challenge_id = p_challenge_id
      and invitee_id = p_user_id
      and status in ('pending', 'accepted')
  ) then
    return true;
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c)
     and v_c.discoverability = 'friends_of_friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c) then
    return false;
  end if;

  return false;
end;
$$;

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
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.is_official or coalesce(v_c.start_rule, 'legacy') is distinct from 'at_starts_at' then
    if v_c.official_started_at is not null then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.status not in ('open', 'starting', 'upcoming', 'in_progress') then
      raise exception 'NOT_JOINABLE';
    end if;
  else
    if v_c.status is distinct from 'open' then
      raise exception 'NOT_JOINABLE';
    end if;
    if v_c.starts_at is not null and now() >= v_c.starts_at then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.official_started_at is not null then
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
     and not public.user_can_access_challenge(p_challenge_id, v_uid) then
    raise exception 'NOT_INVITED';
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

  if v_c.currency = 'coins' then
    select coins into v_balance from profiles where id = v_uid for update;
  else
    select bucks into v_balance from profiles where id = v_uid for update;
  end if;

  if v_balance < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_c.currency = 'coins' then
      update profiles set coins = coins - v_c.buy_in_amount where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      v_uid, p_challenge_id, v_c.currency, -v_c.buy_in_amount, 'join_escrow', 'join_escrow',
      '{}'::jsonb, 'challenge', p_challenge_id::text
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_c.currency, 'active');

  update public.challenge_invites
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now())
  where challenge_id = p_challenge_id
    and invitee_id = v_uid
    and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;
