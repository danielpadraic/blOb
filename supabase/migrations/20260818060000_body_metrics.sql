-- Body metrics for Official Fitness Challenges.
-- gender, body_fat_pct, and body_metrics_completed_at stay private:
-- clients read them through get_my_profile() (select *), not table SELECT grants.

alter table public.profiles
  add column if not exists gender text,
  add column if not exists body_fat_pct numeric,
  add column if not exists body_metrics_completed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_gender_check'
  ) then
    alter table public.profiles
      add constraint profiles_gender_check
      check (gender is null or gender in ('male', 'female'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_body_fat_pct_check'
  ) then
    alter table public.profiles
      add constraint profiles_body_fat_pct_check
      check (body_fat_pct is null or (body_fat_pct >= 0 and body_fat_pct <= 70));
  end if;
end $$;

comment on column public.profiles.gender is 'PRIVATE. male or female. Read via get_my_profile().';
comment on column public.profiles.body_fat_pct is 'PRIVATE estimated body fat %. Read via get_my_profile().';
comment on column public.profiles.body_metrics_completed_at is 'When set, Official Fitness Challenges may be joined. After this, current_weight is stored in kg.';

-- join_challenge: Official challenges require completed body metrics.
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
