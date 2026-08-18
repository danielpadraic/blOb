-- Simple Challenge builder: missing columns, join/start rules, underfill
-- refund, proof flags, friends visibility, wallet ticker cursor.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns (only add what is missing; buy_in_amount / creator_participating /
-- creator_contribution / challenge_type stay the canonical existing names)
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column if not exists host_funded boolean not null default false,
  add column if not exists host_budget numeric not null default 0,
  add column if not exists format text not null default 'consistency',
  add column if not exists task text,
  add column if not exists required_checkins int,
  add column if not exists misses_allowed int not null default 0,
  add column if not exists proof_type text not null default 'photo',
  add column if not exists proof_review text not null default 'auto',
  add column if not exists payout_mode text not null default 'even_split_remaining',
  add column if not exists timezone text,
  add column if not exists start_rule text;

comment on column public.challenges.host_funded is 'True when the host funds the prize (Bucks Simple, or Advanced creator funding).';
comment on column public.challenges.host_budget is 'Host prize amount. Mirrors creator_contribution.';
comment on column public.challenges.format is 'consistency | points | lms. Simple always consistency.';
comment on column public.challenges.task is 'Short task line, e.g. Run 1 mile.';
comment on column public.challenges.required_checkins is 'Derived from duration × frequency. Synced with target_count / days_required.';
comment on column public.challenges.misses_allowed is 'Misses before drop. Simple default 0.';
comment on column public.challenges.proof_type is 'photo | video | check_in | honor.';
comment on column public.challenges.proof_review is 'auto | host.';
comment on column public.challenges.payout_mode is 'even_split_remaining | winner_take_all | top_places.';
comment on column public.challenges.start_rule is 'at_starts_at: join closes and fill is judged at starts_at.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenges_format_allowed') then
    alter table public.challenges add constraint challenges_format_allowed
      check (format in ('consistency', 'points', 'lms'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_proof_type_allowed') then
    alter table public.challenges add constraint challenges_proof_type_allowed
      check (proof_type in ('photo', 'video', 'check_in', 'honor', 'pre_selfie'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_proof_review_allowed') then
    alter table public.challenges add constraint challenges_proof_review_allowed
      check (proof_review in ('auto', 'host'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_payout_mode_allowed') then
    alter table public.challenges add constraint challenges_payout_mode_allowed
      check (payout_mode in ('even_split_remaining', 'winner_take_all', 'top_places'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'challenges_start_rule_allowed') then
    alter table public.challenges add constraint challenges_start_rule_allowed
      check (start_rule is null or start_rule in ('at_starts_at', 'legacy', 'full_lobby', 'all_ready'));
  end if;
end $$;

update public.challenges
set
  host_funded = coalesce(host_funded, false) or coalesce(funding_model, '') in ('creator', 'hybrid'),
  host_budget = coalesce(nullif(host_budget, 0), creator_contribution, 0),
  format = case
    when coalesce(is_unlimited, false) then 'lms'
    when challenge_type = 'points' then 'points'
    else 'consistency'
  end,
  required_checkins = coalesce(required_checkins, target_count, days_required),
  payout_mode = case
    when prize_structure = 'winner_take_all' then 'winner_take_all'
    when prize_structure = 'top_places' then 'top_places'
    else 'even_split_remaining'
  end,
  start_rule = coalesce(start_rule, 'legacy')
where true;

alter table public.challenges
  alter column start_rule set default 'at_starts_at';

update public.challenges set start_rule = 'legacy' where start_rule is null;
alter table public.challenges alter column start_rule set not null;

alter table public.challenges drop constraint if exists challenges_status_allowed;
alter table public.challenges add constraint challenges_status_allowed
  check (status in (
    'draft', 'upcoming', 'open', 'starting', 'in_progress', 'ended',
    'judging', 'distributing', 'settled', 'cancelled_underfilled', 'cancelled'
  ));

-- Visibility: keep unlisted/private; add friends + invite.
alter table public.challenges drop constraint if exists challenges_visibility_allowed;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'challenges_visibility_allowed') then
    alter table public.challenges add constraint challenges_visibility_allowed
      check (visibility is null or visibility in ('public', 'unlisted', 'private', 'friends', 'invite'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Wallet ticker cursor (private; read via get_my_profile)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_shown_coin_balance numeric;

comment on column public.profiles.last_shown_coin_balance is
  'PRIVATE. Last coin total shown in the header ticker. Earnings animate up from this.';

create or replace function public.mark_coin_balance_shown()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_coins numeric;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  update public.profiles
  set last_shown_coin_balance = coins
  where id = v_uid
  returning coins into v_coins;
  return coalesce(v_coins, 0);
end;
$$;

grant execute on function public.mark_coin_balance_shown() to authenticated;

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'challenge_joined',
    'follow',
    'coins_received',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated',
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked',
    'challenge_cancelled'
  ));
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Proof flags (anonymous to the author; hide after 3)
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists moderation_status text not null default 'visible';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_moderation_status_allowed') then
    alter table public.posts add constraint posts_moderation_status_allowed
      check (moderation_status in ('visible', 'under_review', 'removed'));
  end if;
end $$;

create table if not exists public.challenge_proof_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, flagged_by)
);

create index if not exists challenge_proof_flags_post_idx
  on public.challenge_proof_flags (post_id);

alter table public.challenge_proof_flags enable row level security;

drop policy if exists "Users insert own proof flags" on public.challenge_proof_flags;
create policy "Users insert own proof flags"
  on public.challenge_proof_flags for insert to authenticated
  with check (flagged_by = auth.uid());

drop policy if exists "Users read own proof flags" on public.challenge_proof_flags;
create policy "Users read own proof flags"
  on public.challenge_proof_flags for select to authenticated
  using (flagged_by = auth.uid());

grant select, insert on public.challenge_proof_flags to authenticated;

create or replace function public.flag_challenge_proof(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts%rowtype;
  v_count int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.challenge_id is null then
    raise exception 'NOT_A_CHALLENGE_PROOF';
  end if;
  if v_post.author_id = v_uid then
    raise exception 'CANNOT_FLAG_OWN';
  end if;

  insert into public.challenge_proof_flags (post_id, challenge_id, flagged_by)
  values (p_post_id, v_post.challenge_id, v_uid)
  on conflict (post_id, flagged_by) do nothing;

  select count(*) into v_count
  from public.challenge_proof_flags
  where post_id = p_post_id;

  if v_count >= 3 then
    update public.posts
    set moderation_status = 'under_review'
    where id = p_post_id
      and moderation_status = 'visible';
  end if;

  return jsonb_build_object(
    'ok', true,
    'hidden', v_count >= 3,
    'flag_count', v_count
  );
end;
$$;

grant execute on function public.flag_challenge_proof(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Friends + invite access
-- ---------------------------------------------------------------------------
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

create or replace function public.is_invite_only_challenge(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select coalesce(p_challenge.challenge_lane, 'coins') = 'private'
      or coalesce(p_challenge.visibility, 'public') in ('private', 'invite');
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

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c) then
    return exists (
      select 1 from public.challenge_invites
      where challenge_id = p_challenge_id
        and invitee_id = p_user_id
        and status in ('pending', 'accepted')
    );
  end if;

  return false;
end;
$$;

grant execute on function public.are_accepted_friends(uuid, uuid) to authenticated, anon;
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
    and coalesce(visibility, 'public') not in ('friends', 'invite', 'private')
  );

-- ---------------------------------------------------------------------------
-- Underfill refund helper
-- ---------------------------------------------------------------------------
create or replace function public.refund_challenge_underfilled(p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p record;
  v_host numeric;
begin
  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    return;
  end if;

  for v_p in
    select * from public.challenge_participants
    where challenge_id = p_challenge_id
      and status is distinct from 'refunded_pre_start'
    for update
  loop
    if v_p.buy_in_paid > 0 then
      if v_p.currency = 'coins' then
        update public.profiles set coins = coins + v_p.buy_in_paid where id = v_p.user_id;
      else
        update public.profiles set bucks = bucks + v_p.buy_in_paid where id = v_p.user_id;
      end if;
      update public.challenges
      set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0)
      where id = p_challenge_id;
      insert into public.wallet_ledger (
        user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
      ) values (
        v_p.user_id, p_challenge_id, v_p.currency, v_p.buy_in_paid,
        'refund_pre_start', 'underfill_refund',
        jsonb_build_object('reason', 'cancelled_underfilled'),
        'challenge', p_challenge_id::text
      );
    end if;

    update public.challenge_participants
    set status = 'refunded_pre_start'
    where id = v_p.id;

    perform public.notify_user(
      v_p.user_id,
      null,
      'challenge_cancelled',
      'Not enough people joined.',
      'Not enough people joined.',
      jsonb_build_object('challenge_id', p_challenge_id)
    );
  end loop;

  -- Return unused host prize (Bucks or Coins) after buy-in refunds.
  select * into v_c from public.challenges where id = p_challenge_id;
  v_host := greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0);
  if v_host > 0 and v_c.created_by is not null and coalesce(v_c.prize_pool, 0) > 0 then
    v_host := least(v_host, v_c.prize_pool);
    if v_c.currency = 'coins' then
      update public.profiles set coins = coins + v_host where id = v_c.created_by;
    else
      update public.profiles set bucks = bucks + v_host where id = v_c.created_by;
    end if;
    update public.challenges set prize_pool = greatest(prize_pool - v_host, 0) where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    ) values (
      v_c.created_by, p_challenge_id, v_c.currency, v_host,
      'refund_pre_start', 'underfill_host_refund',
      jsonb_build_object('reason', 'cancelled_underfilled'),
      'challenge', p_challenge_id::text
    );
    perform public.notify_user(
      v_c.created_by,
      null,
      'challenge_cancelled',
      'Not enough people joined.',
      'Not enough people joined.',
      jsonb_build_object('challenge_id', p_challenge_id)
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Miss drop: remaining people who skipped a required check-in
-- ---------------------------------------------------------------------------
create or replace function public.sync_challenge_misses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  v_expected int;
  v_elapsed_days int;
  v_weeks int;
begin
  for ch in
    select *
    from public.challenges
    where status = 'in_progress'
      and coalesce(format, 'consistency') = 'consistency'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
  loop
    v_elapsed_days := greatest(
      floor(extract(epoch from (least(now(), coalesce(ch.ends_at, now())) - ch.starts_at)) / 86400)::int,
      0
    );

    if ch.frequency in ('once') then
      -- Once: miss only after the window ends (handled at judging).
      continue;
    elsif ch.frequency in ('3x_week', 'weekly') then
      v_weeks := greatest(ceil(v_elapsed_days / 7.0)::int, 0);
      if ch.frequency = '3x_week' then
        v_expected := v_weeks * 3;
      else
        v_expected := v_weeks * greatest(coalesce(ch.target_count, 1), 1);
      end if;
    elsif ch.frequency = 'custom' then
      v_expected := least(
        coalesce(ch.required_checkins, ch.target_count, 1),
        v_elapsed_days
      );
    else
      -- daily / default: one required check-in per elapsed day
      v_expected := v_elapsed_days;
    end if;

    v_expected := greatest(v_expected, 0);

    update public.challenge_participants p
    set
      status = 'eliminated',
      eliminated_at = coalesce(p.eliminated_at, now())
    where p.challenge_id = ch.id
      and p.status in ('active', 'joined')
      and p.eliminated_at is null
      and (coalesce(p.days_completed, 0) + coalesce(ch.misses_allowed, 0)) < v_expected;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Status sync: start / underfill / judging / misses
-- ---------------------------------------------------------------------------
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

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false;

  perform public.sync_challenge_misses();
  perform public.sync_unlimited_eliminations();
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;

-- ---------------------------------------------------------------------------
-- join_challenge: before starts_at, status=open, under max
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

-- ---------------------------------------------------------------------------
-- publish_challenge: persist Simple fields; charge creator buy-in on create
-- ---------------------------------------------------------------------------
create or replace function public.publish_challenge(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_currency text;
  v_buy_in numeric;
  v_creator_contribution numeric;
  v_max int;
  v_min int;
  v_participating boolean;
  v_balance numeric;
  v_needed numeric;
  v_row public.challenges%rowtype;
  v_visibility text;
  v_host_funded boolean;
  v_format text;
  v_proof_type text;
  v_frequency text;
  v_required int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_currency := coalesce(p_payload->>'currency', 'coins');
  if v_currency not in ('coins', 'bucks') then
    raise exception 'INVALID_CURRENCY';
  end if;

  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_creator_contribution := coalesce(
    (p_payload->>'host_budget')::numeric,
    (p_payload->>'creator_contribution')::numeric,
    0
  );
  v_max := nullif(p_payload->>'max_participants', '')::int;
  v_min := greatest(coalesce((p_payload->>'min_participants')::int, 2), 1);
  v_participating := case
    when p_payload ? 'creator_participates' then (p_payload->>'creator_participates')::boolean
    when p_payload ? 'creator_participating' then (p_payload->>'creator_participating')::boolean
    else true
  end;
  v_visibility := coalesce(p_payload->>'visibility', 'public');
  if v_visibility not in ('public', 'unlisted', 'private', 'friends', 'invite') then
    v_visibility := 'public';
  end if;
  v_host_funded := coalesce(
    (p_payload->>'host_funded')::boolean,
    v_currency = 'bucks',
    false
  );
  if v_currency = 'bucks' then
    v_host_funded := true;
    v_buy_in := 0;
  end if;
  v_format := coalesce(p_payload->>'format', p_payload->>'challenge_type', 'consistency');
  if v_format not in ('consistency', 'points', 'lms') then
    v_format := 'consistency';
  end if;
  v_proof_type := coalesce(p_payload->>'proof_type', 'photo');
  if v_proof_type not in ('photo', 'video', 'check_in', 'honor', 'pre_selfie') then
    v_proof_type := 'photo';
  end if;
  v_frequency := coalesce(p_payload->>'frequency', 'daily');
  v_required := coalesce(
    nullif(p_payload->>'required_checkins', '')::int,
    nullif(p_payload->>'target_count', '')::int,
    nullif(p_payload->>'days_required', '')::int
  );

  if v_max is not null and v_max < 1 then
    raise exception 'MAX_PARTICIPANTS_MIN_1';
  end if;

  if coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
     and v_format <> 'consistency' and v_format <> 'lms' then
    raise exception 'LMS_REQUIRES_CONSISTENCY';
  end if;

  if coalesce(p_payload->>'start_mode', '') = 'full_lobby' and (v_max is null) then
    raise exception 'FULL_LOBBY_REQUIRES_MAX';
  end if;

  if v_currency = 'coins' then
    select coins into v_balance from profiles where id = v_uid for update;
  else
    select bucks into v_balance from profiles where id = v_uid for update;
  end if;

  if v_balance is null then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_creator_contribution < 0 or v_buy_in < 0 then
    raise exception 'NEGATIVE_AMOUNT';
  end if;

  v_needed := v_creator_contribution;
  if v_participating then
    v_needed := v_needed + v_buy_in;
  end if;
  if v_balance < v_needed then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  insert into challenges (
    created_by, title, description, rules, category, visibility, challenge_type,
    start_mode, starts_at, start_within_value, start_within_unit,
    full_lobby_start_time, full_lobby_day_offset,
    end_mode, ends_at, length_value, length_unit, is_unlimited,
    max_participants, min_participants, buy_in_amount, currency,
    creator_participating, days_required, min_minutes, proof_requirements, tasks, rules_list,
    status, prize_pool, prize_structure, top_places_mode, top_places_value,
    top_places_distribution, scaled_first_place_pct, funding_model, creator_contribution,
    distribution_mode, distribution_scheduled_at, is_official, frequency, target_count,
    host_funded, host_budget, format, task, required_checkins, misses_allowed,
    proof_type, proof_review, payout_mode, timezone, start_rule
  ) values (
    v_uid,
    coalesce(p_payload->>'title', 'Untitled challenge'),
    p_payload->>'description',
    p_payload->>'rules',
    p_payload->>'category',
    v_visibility,
    case when v_format = 'points' then 'points' else 'consistency' end,
    coalesce(p_payload->>'start_mode', 'fixed'),
    nullif(p_payload->>'starts_at', '')::timestamptz,
    nullif(p_payload->>'start_within_value', '')::int,
    p_payload->>'start_within_unit',
    nullif(p_payload->>'full_lobby_start_time', '')::time,
    coalesce((p_payload->>'full_lobby_day_offset')::int, 0),
    coalesce(p_payload->>'end_mode', 'length'),
    nullif(p_payload->>'ends_at', '')::timestamptz,
    nullif(p_payload->>'length_value', '')::int,
    p_payload->>'length_unit',
    coalesce(
      (p_payload->>'is_unlimited')::boolean,
      coalesce(p_payload->>'end_mode', '') = 'indefinite_lms',
      v_format = 'lms'
    ),
    v_max,
    v_min,
    v_buy_in,
    v_currency,
    v_participating,
    coalesce(v_required, nullif(p_payload->>'days_required', '')::int),
    nullif(p_payload->>'min_minutes', '')::int,
    coalesce(p_payload->'proof_requirements', '[]'::jsonb),
    coalesce(p_payload->'tasks', '[]'::jsonb),
    coalesce(p_payload->'rules_list', '[]'::jsonb),
    'open',
    0,
    coalesce(
      p_payload->>'prize_structure',
      case
        when coalesce(p_payload->>'payout_mode', 'even_split_remaining') = 'winner_take_all' then 'winner_take_all'
        when coalesce(p_payload->>'payout_mode', '') = 'top_places' then 'top_places'
        else 'equal_split'
      end
    ),
    p_payload->>'top_places_mode',
    nullif(p_payload->>'top_places_value', '')::numeric,
    p_payload->>'top_places_distribution',
    nullif(p_payload->>'scaled_first_place_pct', '')::numeric,
    coalesce(
      p_payload->>'funding_model',
      case when v_host_funded then 'creator' else 'participants' end
    ),
    v_creator_contribution,
    coalesce(p_payload->>'distribution_mode', 'auto'),
    nullif(p_payload->>'distribution_scheduled_at', '')::timestamptz,
    coalesce((p_payload->>'is_official')::boolean, false),
    v_frequency,
    v_required,
    v_host_funded,
    v_creator_contribution,
    v_format,
    nullif(p_payload->>'task', ''),
    v_required,
    greatest(coalesce((p_payload->>'misses_allowed')::int, 0), 0),
    v_proof_type,
    coalesce(p_payload->>'proof_review', 'auto'),
    coalesce(p_payload->>'payout_mode', 'even_split_remaining'),
    coalesce(nullif(p_payload->>'timezone', ''), 'UTC'),
    coalesce(p_payload->>'start_rule', 'at_starts_at')
  ) returning * into v_row;

  v_id := v_row.id;

  if v_creator_contribution > 0 then
    if v_currency = 'coins' then
      update profiles set coins = coins - v_creator_contribution where id = v_uid;
    else
      update profiles set bucks = bucks - v_creator_contribution where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_creator_contribution where id = v_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      v_uid, v_id, v_currency, -v_creator_contribution, 'creator_fund_escrow', 'creator_fund_escrow',
      jsonb_build_object('challenge_id', v_id), 'challenge', v_id::text
    );
  end if;

  if v_participating then
    if v_buy_in > 0 then
      if v_currency = 'coins' then
        update profiles set coins = coins - v_buy_in where id = v_uid;
      else
        update profiles set bucks = bucks - v_buy_in where id = v_uid;
      end if;
      update challenges set prize_pool = prize_pool + v_buy_in where id = v_id;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (
        v_uid, v_id, v_currency, -v_buy_in, 'join_escrow', 'join_escrow',
        jsonb_build_object('creator_join', true), 'challenge', v_id::text
      );
    end if;
    insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
    values (v_id, v_uid, v_buy_in, v_currency, 'active');
  end if;

  delete from challenge_drafts where user_id = v_uid;

  return jsonb_build_object('ok', true, 'challenge_id', v_id, 'prize_pool', (select prize_pool from challenges where id = v_id));
end;
$$;

grant execute on function public.publish_challenge(jsonb) to authenticated;
