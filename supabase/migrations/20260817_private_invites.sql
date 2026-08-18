-- Packet 4: token invites, access helper, private join gate, persist challenge_lane.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- challenge_lane (private vs coin). Publish historically only stored visibility.
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column if not exists challenge_lane text not null default 'coins';

update public.challenges
set challenge_lane = 'private'
where visibility = 'private'
  and coalesce(funding_model, '') = 'creator'
  and challenge_lane is distinct from 'private';

alter table public.challenges drop constraint if exists challenges_lane_allowed;
alter table public.challenges add constraint challenges_lane_allowed
  check (challenge_lane in ('coins', 'private'));

create or replace function public.trg_challenges_sync_lane()
returns trigger
language plpgsql
as $$
begin
  if new.challenge_lane is null or new.challenge_lane not in ('coins', 'private') then
    new.challenge_lane := 'coins';
  end if;
  -- Private lane publish sets visibility=private + creator funding; column defaults to coins.
  if new.challenge_lane is distinct from 'private'
     and coalesce(new.visibility, 'public') = 'private'
     and coalesce(new.funding_model, '') = 'creator' then
    new.challenge_lane := 'private';
  end if;
  return new;
end;
$$;

drop trigger if exists challenges_sync_lane on public.challenges;
create trigger challenges_sync_lane
  before insert or update of visibility, funding_model, challenge_lane
  on public.challenges
  for each row execute function public.trg_challenges_sync_lane();

-- ---------------------------------------------------------------------------
-- challenge_invites: shareable token + pending/accepted
-- ---------------------------------------------------------------------------
alter table public.challenge_invites
  alter column invitee_id drop not null;

alter table public.challenge_invites
  add column if not exists token text;

alter table public.challenge_invites
  add column if not exists status text not null default 'pending';

alter table public.challenge_invites
  add column if not exists accepted_at timestamptz;

update public.challenge_invites
set token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
where token is null or token = '';

alter table public.challenge_invites
  alter column token set default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

alter table public.challenge_invites
  alter column token set not null;

create unique index if not exists challenge_invites_token_uidx
  on public.challenge_invites (token);

create index if not exists challenge_invites_challenge_status_idx
  on public.challenge_invites (challenge_id, status);

alter table public.challenge_invites drop constraint if exists challenge_invites_status_allowed;
alter table public.challenge_invites add constraint challenge_invites_status_allowed
  check (status in ('pending', 'accepted', 'revoked'));

comment on table public.challenge_invites is
  'Host invites. Token links are invitee_id-null until accepted. Targeted rows notify the invitee.';

create or replace function public.trg_notify_challenge_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
begin
  if new.invitee_id is null then
    return new;
  end if;
  v_name := public.profile_display_name(new.inviter_id);
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.invitee_id,
    new.inviter_id,
    'challenge_invite',
    'You’re invited',
    v_name || ' invited you to ' || coalesce(v_title, 'a challenge') || '.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access helper
-- ---------------------------------------------------------------------------
create or replace function public.is_invite_only_challenge(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select coalesce(p_challenge.challenge_lane, 'coins') = 'private';
$$;

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
    return true;
  end if;

  if not public.is_invite_only_challenge(v_c) then
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

  return false;
end;
$$;

grant execute on function public.user_can_access_challenge(uuid, uuid) to authenticated, anon;
grant execute on function public.user_can_access_challenge(uuid) to authenticated, anon;

drop policy if exists "Users can read challenges" on public.challenges;
drop policy if exists "Challenges are readable" on public.challenges;
create policy "Users can read challenges" on public.challenges
  for select to authenticated
  using (public.user_can_access_challenge(id));

drop policy if exists "Public read public challenges" on public.challenges;
create policy "Public read public challenges" on public.challenges
  for select to anon
  using (
    (
      visibility in ('public', 'unlisted')
      or visibility is null
      or is_official = true
    )
    and coalesce(challenge_lane, 'coins') is distinct from 'private'
  );

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_challenge_invite(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if v_c.created_by is distinct from v_uid then
    raise exception 'ONLY_HOST_CAN_INVITE';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
  values (p_challenge_id, v_uid, null, 'pending')
  returning * into v_invite;

  return jsonb_build_object(
    'ok', true,
    'invite_id', v_invite.id,
    'challenge_id', v_invite.challenge_id,
    'token', v_invite.token
  );
end;
$$;

create or replace function public.accept_challenge_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.challenge_invites%rowtype;
  v_existing public.challenge_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  select * into v_invite
  from public.challenge_invites
  where token = trim(p_token)
  for update;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'INVITE_REVOKED';
  end if;

  if v_invite.inviter_id = v_uid then
    return jsonb_build_object(
      'ok', true,
      'challenge_id', v_invite.challenge_id,
      'already_host', true
    );
  end if;

  if v_invite.status = 'accepted' and v_invite.invitee_id = v_uid then
    return jsonb_build_object(
      'ok', true,
      'challenge_id', v_invite.challenge_id,
      'already_accepted', true
    );
  end if;

  if v_invite.invitee_id is not null and v_invite.invitee_id is distinct from v_uid then
    raise exception 'INVITE_USED';
  end if;

  if v_invite.status = 'accepted' and v_invite.invitee_id is distinct from v_uid then
    raise exception 'INVITE_USED';
  end if;

  select * into v_existing
  from public.challenge_invites
  where challenge_id = v_invite.challenge_id
    and invitee_id = v_uid
  limit 1;

  if found then
    update public.challenge_invites
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where id = v_existing.id;

    if v_existing.id is distinct from v_invite.id and v_invite.invitee_id is null then
      delete from public.challenge_invites where id = v_invite.id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'challenge_id', v_invite.challenge_id,
      'already_accepted', v_existing.status = 'accepted'
    );
  end if;

  update public.challenge_invites
  set invitee_id = v_uid,
      status = 'accepted',
      accepted_at = now()
  where id = v_invite.id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_invite.challenge_id
  );
end;
$$;

grant execute on function public.create_challenge_invite(uuid) to authenticated;
grant execute on function public.accept_challenge_invite(text) to authenticated;

-- ---------------------------------------------------------------------------
-- join_challenge: private + no access → NOT_INVITED. Coin/public unchanged.
-- ---------------------------------------------------------------------------
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

  if v_c.official_started_at is not null then
    raise exception 'ALREADY_STARTED';
  end if;

  -- 'upcoming' / 'in_progress' remain joinable until official_started_at is set.
  if v_c.status not in ('open', 'starting', 'upcoming', 'in_progress') then
    raise exception 'NOT_JOINABLE';
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
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
