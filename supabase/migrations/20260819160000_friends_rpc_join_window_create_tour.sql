-- Restore are_accepted_friends (join was calling a function missing in prod),
-- close user-created join after start, and persist Create Challenge tour opt-out.

create or replace function public.are_accepted_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_a_id = least(p_a, p_b)
      and f.user_b_id = greatest(p_a, p_b)
  );
$$;

grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated, anon;

create or replace function public.is_invite_only_challenge(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select coalesce(p_challenge.challenge_lane, 'coins') = 'private'
      or coalesce(p_challenge.visibility, 'public') in ('private', 'invite');
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
  v_need numeric;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.created_by = v_uid then
    raise exception 'ALREADY_JOINED';
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
      'live', 'in_progress', 'judging', 'settled',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.starts_at is not null and now() >= v_c.starts_at then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.official_started_at is not null then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.status not in ('open', 'starting', 'upcoming', 'filling', 'arming') then
      raise exception 'NOT_JOINABLE';
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

alter table public.profiles
  add column if not exists create_tour_opt_out_at timestamptz;

comment on column public.profiles.create_tour_opt_out_at is
  'When the user chose Don’t show this again on the Create Challenge tour.';

create or replace function public.protect_profiles_legal_tutorial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('blob.legal_write', true) = '1' then
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.tos_accepted_at := OLD.tos_accepted_at;
    NEW.privacy_accepted_at := OLD.privacy_accepted_at;
    NEW.skill_attestation_at := OLD.skill_attestation_at;
    NEW.tos_version := OLD.tos_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.tutorial_completed_at := OLD.tutorial_completed_at;
    NEW.create_tour_opt_out_at := OLD.create_tour_opt_out_at;
  end if;
  return NEW;
end;
$$;

create or replace function public.set_create_tour_opt_out(p_opt_out boolean)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform set_config('blob.legal_write', '1', true);
  if p_opt_out then
    update public.profiles
    set create_tour_opt_out_at = coalesce(create_tour_opt_out_at, now())
    where id = v_uid
    returning create_tour_opt_out_at into v_at;
  else
    update public.profiles
    set create_tour_opt_out_at = null
    where id = v_uid;
    v_at := null;
  end if;
  return v_at;
end;
$$;

grant execute on function public.set_create_tour_opt_out(boolean) to authenticated;
