-- blOb schema
-- Run this in the Supabase SQL editor (or as a migration) on a fresh project.
-- Requires: Auth enabled. Do not run against production without a backup.

begin;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is 'Keeps updated_at current on row changes.';

-- True when the caller is a participant of the given challenge (any status).
create or replace function public.is_challenge_participant(p_challenge_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = p_user_id
  );
$$;

comment on function public.is_challenge_participant(uuid, uuid) is
  'SECURITY DEFINER helper used by RLS. Does not expose participant rows.';

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
-- Credits live on this table per product spec. SELECT of the credits column is
-- revoked from anon/authenticated; clients read credits via get_my_profile().

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  avatar_url text,
  bio text,
  height_cm numeric,
  current_weight numeric,
  goal_weight numeric,
  weight_unit text default 'kg' check (weight_unit in ('kg','lb')),
  gender text check (gender is null or gender in ('male','female')),
  body_fat_pct numeric,
  body_metrics_completed_at timestamptz,
  typical_weekly_workout_frequency int,
  primary_activities text[] default '{}',
  skill_tags text[] default '{}',
  fitness_profile jsonb,
  show_fitness_stats_publicly boolean default false,
  credits numeric(12,2) default 50.00, -- alias of coins; kept for older readers
  coins numeric(12,2) not null default 50.00,
  bucks numeric(12,2) not null default 0,
  is_official boolean not null default false,
  is_creator boolean not null default false,
  allow_profile_posts boolean not null default true,
  profile_visibility text not null default 'public' check (profile_visibility in ('public', 'friends')),
  mute_mentions boolean not null default false,
  home_state text,
  motivation_tone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint username_format check (username ~ '^[a-z0-9_]{3,24}$'),
  constraint credits_non_negative check (credits >= 0),
  constraint coins_non_negative check (coins >= 0),
  constraint bucks_non_negative check (bucks >= 0),
  constraint profiles_motivation_tone_check
    check (motivation_tone is null or motivation_tone in ('gentle', 'neutral', 'honest'))
);

comment on table public.profiles is 'Public identity + private fitness stats. Extends auth.users.';
comment on column public.profiles.credits is 'PRIVATE alias of coins. Not granted to anon/authenticated SELECT. Use get_my_profile().';
comment on column public.profiles.coins is 'PRIVATE Blob Coins. Read via get_my_profile().';
comment on column public.profiles.bucks is 'PRIVATE Blob Bucks (1 Buck = $1 USD). Read via get_my_profile().';
comment on column public.profiles.show_fitness_stats_publicly is 'When false, height/weight/frequency are redacted in profiles_public.';
comment on column public.profiles.gender is 'PRIVATE. male or female. Read via get_my_profile().';
comment on column public.profiles.body_fat_pct is 'PRIVATE estimated body fat %. Read via get_my_profile().';
comment on column public.profiles.body_metrics_completed_at is 'When set, Official Fitness Challenges may be joined. After this, current_weight is stored in kg.';
comment on column public.profiles.fitness_profile is 'PRIVATE jsonb training background for matching. Read via get_my_profile().';
comment on column public.profiles.is_official is 'Server-enforced official account. Client display only. Do not grant powers from username.';
comment on column public.profiles.motivation_tone is
  'Optional UI copy tone. gentle | neutral | honest. Owner-only via get_my_profile(); not on public profile selects.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_username_idx on public.profiles (username);
create index profiles_created_at_idx on public.profiles (created_at desc);

-- Auto-create a stub profile so FKs work immediately after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  v_official boolean;
begin
  v_official := lower(coalesce(new.email, '')) = 'danielpadraic@gmail.com';
  base_username := case
    when v_official then 'blob'
    else 'blob_' || substr(replace(new.id::text, '-', ''), 1, 10)
  end;

  if v_official then
    update public.profiles
    set username = 'blob_' || substr(replace(id::text, '-', ''), 1, 10)
    where lower(username) = 'blob'
      and id <> new.id;
  end if;

  insert into public.profiles (id, username, display_name, is_official)
  values (
    new.id,
    lower(base_username),
    case when v_official then 'Bob LeBlob' else null end,
    v_official
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Public-safe projection. Credits are never included. Fitness stats are
-- visible only to the owner or when the owner opted in.
create or replace view public.profiles_public
with (security_invoker = true) as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.skill_tags,
  p.primary_activities,
  p.show_fitness_stats_publicly,
  p.created_at,
  case
    when p.id = auth.uid() or p.show_fitness_stats_publicly then p.height_cm
  end as height_cm,
  case
    when p.id = auth.uid() or p.show_fitness_stats_publicly then p.current_weight
  end as current_weight,
  case
    when p.id = auth.uid() or p.show_fitness_stats_publicly then p.goal_weight
  end as goal_weight,
  case
    when p.id = auth.uid() or p.show_fitness_stats_publicly then p.weight_unit
  end as weight_unit,
  case
    when p.id = auth.uid() or p.show_fitness_stats_publicly then p.typical_weekly_workout_frequency
  end as typical_weekly_workout_frequency,
  p.is_official
from public.profiles p;

comment on view public.profiles_public is 'Redacted profile projection for feeds, challenge cards, and public profiles.';

-- Exact email/phone people search without exposing those fields.
create or replace function public.search_people(p_query text)
returns setof public.profiles_public
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text;
  v_like text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if length(v_q) < 2 then
    return;
  end if;

  if v_q ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and lower(coalesce(u.email, '')) = lower(v_q)
    limit 8;
    return;
  end if;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  if v_q ~ '^[+0-9().[:space:]-]+$' and length(v_digits) >= 10 then
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and length(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')) >= 10
      and regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_digits
    limit 8;
    return;
  end if;

  v_like := '%' || replace(replace(replace(regexp_replace(v_q, '^@', ''), '%', ''), '_', ''), ',', '') || '%';
  if length(btrim(v_like, '%')) < 2 then
    return;
  end if;

  return query
  select pp.*
  from public.profiles_public pp
  where pp.id <> v_uid
    and (
      pp.username ilike v_like
      or coalesce(pp.display_name, '') ilike v_like
    )
  order by
    case when pp.username ilike replace(v_like, '%', '') || '%' then 0 else 1 end,
    pp.username
  limit 16;
end;
$$;

grant execute on function public.search_people(text) to authenticated;

comment on function public.search_people(text) is
  'Find people by username/display name (partial) or exact email/phone. Never returns email or phone.';

-- Owner-only full row, including credits.
create or replace function public.get_my_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where id = auth.uid();
$$;

grant execute on function public.get_my_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- challenges
-- ---------------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  rules text,
  is_official boolean default false,
  discoverability text check (discoverability is null or discoverability in ('invite_only', 'friends_of_friends')),
  allowed_states text[],
  created_by uuid references public.profiles(id),
  category text default 'fitness',
  challenge_type text default 'consistency',
  frequency text default 'daily',
  target_count int not null default 6,
  tasks jsonb not null default '[]'::jsonb,
  visibility text default 'public',
  buy_in_amount numeric(10,2) not null default 10.00,
  currency text not null default 'coins' check (currency in ('coins', 'bucks')),
  days_required int not null default 6,
  min_minutes int not null default 30,
  proof_requirements jsonb not null default '[{"type":"pre_selfie","required":true},{"type":"post_selfie","required":true},{"type":"hr_monitor","required":true}]',
  proofs jsonb not null default '[]'::jsonb,
  status text not null default 'upcoming' check (status in ('upcoming','open','in_progress','judging','settled','cancelled_underfilled','cancelled')),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles(id),
  starts_at timestamptz not null,
  ends_at timestamptz,
  prize_pool numeric(12,2) default 0, -- calculated from buy-ins
  prize_structure text not null default 'equal_split',
  top_places_mode text,
  top_places_value int,
  top_places_distribution text,
  funding_model text not null default 'participants',
  creator_contribution numeric(10,2) not null default 0,
  max_participants int,
  is_unlimited boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint buy_in_positive check (buy_in_amount >= 0),
  constraint creator_contribution_positive check (creator_contribution >= 0),
  constraint max_participants_positive check (max_participants is null or max_participants > 0),
  constraint funding_model_allowed check (funding_model in ('creator', 'hybrid', 'participants')),
  constraint days_required_positive check (days_required > 0),
  constraint target_count_positive check (target_count > 0),
  constraint min_minutes_positive check (min_minutes > 0),
  constraint challenge_window check (
    (is_unlimited = true and ends_at is null)
    or (is_unlimited = false and ends_at is not null and ends_at > starts_at)
  )
);

comment on table public.challenges is 'Peer-to-peer competitions with a Coin buy-in and prize pool.';
comment on column public.challenges.challenge_type is 'Primary scoring model: consistency (hit a log target) or points (complete custom tasks).';
comment on column public.challenges.frequency is 'How often a consistency log counts: daily, weekly, monthly, or once.';
comment on column public.challenges.target_count is 'Successful logs required to finish a consistency challenge.';
comment on column public.challenges.tasks is 'Points-challenge task list: id, title, points, proof_required, proof_types.';
comment on column public.challenges.proof_requirements is 'JSON list of required proof types per consistency log.';
comment on column public.challenges.proofs is 'Named proof list [{id, name, method}]. methods: photo | video | checkin | honor | hr.';
comment on column public.challenges.prize_pool is 'Creator contribution plus participant buy-ins. Updated on publish and join.';
comment on column public.challenges.prize_structure is 'How the prize pool is paid out: winner_take_all, equal_split, or top_places.';
comment on column public.challenges.top_places_mode is 'For top_places: percent of finishers, or a fixed count.';
comment on column public.challenges.top_places_value is 'For top_places: 10 means top 10% or top 10 people.';
comment on column public.challenges.top_places_distribution is 'For top_places: even split or scaled so 1st earns the most.';
comment on column public.challenges.funding_model is 'Who funds the prize pool: creator, hybrid, or participants.';
comment on column public.challenges.creator_contribution is 'Coins the creator puts into the pool up front. 0 for participant-funded challenges.';
comment on column public.challenges.max_participants is 'Join cap. Null means unlimited.';
comment on column public.challenges.is_unlimited is 'Last-man-standing: no end date. Continues until one eligible participant remains.';
comment on column public.challenges.ends_at is 'End of a fixed window. Null when is_unlimited.';
comment on column public.challenges.cancelled_at is 'Set by cancel_challenge. Row is never deleted.';
comment on column public.challenges.cancelled_by is 'profiles.id of the host or official who cancelled.';

create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();

create or replace function public.guard_challenge_settlement()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'settled' and new.status is distinct from 'settled' then
    raise exception 'A settled challenge cannot change status' using errcode = 'P0001';
  end if;

  if new.status = 'settled' and old.status is distinct from 'settled' then
    if current_user = session_user then
      raise exception 'Use settle_challenge() to pay out and settle' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create trigger challenges_guard_settlement
  before update on public.challenges
  for each row execute function public.guard_challenge_settlement();

create index challenges_status_starts_at_idx on public.challenges (status, starts_at);
create index challenges_created_by_idx on public.challenges (created_by);
create index challenges_is_official_idx on public.challenges (is_official) where is_official = true;

-- ---------------------------------------------------------------------------
-- challenge_drafts (one in-progress wizard per user)
-- ---------------------------------------------------------------------------

create table public.challenge_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  step int not null default 0 check (step >= 0),
  start_path text,
  template_id text,
  source_challenge_id uuid references public.challenges(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.challenge_drafts is 'In-progress challenge creation wizard. One row per user.';
comment on column public.challenge_drafts.payload is 'CreateChallengeValues JSON: title, type, duration, prize, funding, proofs, tasks, etc.';
comment on column public.challenge_drafts.step is 'Last wizard step index the user was on.';

create trigger challenge_drafts_set_updated_at
  before update on public.challenge_drafts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- challenge_participants
-- ---------------------------------------------------------------------------

create table public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'joined' check (status in ('joined','completed','failed','withdrawn')),
  days_completed int default 0,
  joined_at timestamptz default now(),
  completed_at timestamptz,
  eliminated_at timestamptz,
  unique(challenge_id, user_id),
  constraint days_completed_non_negative check (days_completed >= 0)
);

comment on table public.challenge_participants is 'Join table. Buy-in is collected by join_challenge(), not by a client insert.';
comment on column public.challenge_participants.eliminated_at is 'When a last-man-standing joiner missed a required period and was eliminated.';

create index challenge_participants_user_id_idx on public.challenge_participants (user_id);
create index challenge_participants_challenge_status_idx on public.challenge_participants (challenge_id, status);

create table public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint challenge_invite_not_self check (inviter_id <> invitee_id),
  unique (challenge_id, invitee_id)
);

comment on table public.challenge_invites is 'Host invites. A row is the share; the notification is created by trigger.';

create index challenge_invites_invitee_id_idx
  on public.challenge_invites (invitee_id, created_at desc);

-- Atomic join: lock profile + challenge, debit credits, credit prize pool, insert row.
create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  participant public.challenge_participants%rowtype;
  my_credits numeric(12,2);
  joiner_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status not in ('upcoming', 'open', 'in_progress') then
    raise exception 'This challenge is no longer accepting joiners' using errcode = 'P0001';
  end if;

  if ch.ends_at is not null and now() >= ch.ends_at then
    raise exception 'Challenge has ended' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  ) then
    raise exception 'Already joined this challenge' using errcode = '23505';
  end if;

  if ch.max_participants is not null then
    select count(*) into joiner_count
    from public.challenge_participants
    where challenge_id = p_challenge_id;
    if joiner_count >= ch.max_participants then
      raise exception 'This challenge is full' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(ch.buy_in_amount, 0) > 0 then
    select credits into my_credits
    from public.profiles
    where id = auth.uid()
    for update;

    if my_credits < ch.buy_in_amount then
      raise exception 'Insufficient credits' using errcode = 'P0001';
    end if;

    update public.profiles
      set credits = credits - ch.buy_in_amount
      where id = auth.uid();

    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + ch.buy_in_amount
      where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, status)
  values (p_challenge_id, auth.uid(), 'joined')
  returning * into participant;

  return participant;
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- coin_transfers: peer sends. Balance movement is RPC-only.
-- ---------------------------------------------------------------------------

create table public.coin_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  recipient_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now(),
  constraint coin_transfer_positive check (amount > 0),
  constraint coin_transfer_not_self check (sender_id <> recipient_id)
);

comment on table public.coin_transfers is 'Audit log for peer Coin sends. Inserts happen only inside transfer_coins().';

create index coin_transfers_sender_id_idx on public.coin_transfers (sender_id, created_at desc);
create index coin_transfers_recipient_id_idx on public.coin_transfers (recipient_id, created_at desc);

create or replace function public.transfer_coins(p_recipient_id uuid, p_amount numeric)
returns public.coin_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_sender uuid;
  v_first uuid;
  v_second uuid;
  v_sender_credits numeric(12,2);
  v_transfer public.coin_transfers%rowtype;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_recipient_id is null then
    raise exception 'Pick someone to send Coins to' using errcode = 'P0001';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'You can’t send Coins to yourself' using errcode = 'P0001';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Send at least 0.01 Coins' using errcode = 'P0001';
  end if;
  if v_amount > 10000 then
    raise exception 'Keep a transfer at 10,000 Coins or less' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_recipient_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if v_sender < p_recipient_id then
    v_first := v_sender;
    v_second := p_recipient_id;
  else
    v_first := p_recipient_id;
    v_second := v_sender;
  end if;

  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  select credits into v_sender_credits
  from public.profiles
  where id = v_sender;

  if v_sender_credits is null then
    raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
  end if;

  if v_sender_credits < v_amount then
    raise exception 'Insufficient credits' using errcode = 'P0001';
  end if;

  update public.profiles
    set credits = credits - v_amount
    where id = v_sender;

  update public.profiles
    set credits = credits + v_amount
    where id = p_recipient_id;

  insert into public.coin_transfers (sender_id, recipient_id, amount)
  values (v_sender, p_recipient_id, v_amount)
  returning * into v_transfer;

  return v_transfer;
end;
$$;

grant execute on function public.transfer_coins(uuid, numeric) to authenticated;

alter table public.coin_transfers add column if not exists note text;

create or replace function public.send_coins(
  p_to_user_id uuid,
  p_amount numeric,
  p_note text default null
)
returns public.coin_transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_sender uuid;
  v_first uuid;
  v_second uuid;
  v_balance numeric(12,2);
  v_official boolean;
  v_note text;
  v_transfer public.coin_transfers%rowtype;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_to_user_id is null then
    raise exception 'Pick someone to send to' using errcode = 'P0001';
  end if;

  if p_to_user_id = v_sender then
    raise exception 'You can’t send Coins to yourself' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles where id = p_to_user_id) then
    raise exception 'Invalid recipient' using errcode = 'P0002';
  end if;

  if public.users_blocked(v_sender, p_to_user_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    raise exception 'Send at least 0.01 Coins' using errcode = 'P0001';
  end if;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if v_note is not null and char_length(v_note) > 280 then
    raise exception 'Keep the note under 280 characters' using errcode = 'P0001';
  end if;

  if v_sender < p_to_user_id then
    v_first := v_sender;
    v_second := p_to_user_id;
  else
    v_first := p_to_user_id;
    v_second := v_sender;
  end if;

  perform 1 from public.profiles where id = v_first for update;
  perform 1 from public.profiles where id = v_second for update;

  select coins, coalesce(is_official, false)
    into v_balance, v_official
  from public.profiles
  where id = v_sender;

  if not v_official then
    if v_balance is null then
      raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
    end if;
    if v_amount > 10000 then
      raise exception 'Keep a transfer at 10,000 Coins or less' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient coins' using errcode = 'P0001';
    end if;
    perform public.wallet_debit(v_sender, 'coins', v_amount);
  end if;

  perform public.wallet_credit(p_to_user_id, 'coins', v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency, note)
  values (v_sender, p_to_user_id, v_amount, 'coins', v_note)
  returning * into v_transfer;

  if v_official then
    insert into public.wallet_ledger (
      user_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id, created_at
    )
    values (
      p_to_user_id,
      'coins',
      v_amount,
      'official_grant',
      'official_grant',
      jsonb_build_object(
        'sender_id', v_sender,
        'transfer_id', v_transfer.id,
        'created_at', v_transfer.created_at
      ),
      'coin_transfer',
      v_transfer.id::text,
      v_transfer.created_at
    );
  end if;

  return v_transfer;
end;
$$;

comment on function public.send_coins(uuid, numeric, text) is
  'Peer Coin send. Official senders skip debit and balance. Recipient credit is real. Ledger official_grant. ∞ is not cash.';

grant execute on function public.send_coins(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Settlement: one payout record per challenge, credits moved only here
-- ---------------------------------------------------------------------------

create table public.challenge_settlements (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  settled_by uuid references public.profiles(id),
  prize_pool numeric(12,2) not null default 0,
  distributed numeric(12,2) not null default 0,
  prize_structure text not null,
  winner_count int not null default 0,
  settled_at timestamptz not null default now()
);

create table public.challenge_payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.challenge_settlements(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  place int not null,
  score numeric(12,2) not null default 0,
  amount numeric(12,2) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index challenge_payouts_challenge_place_idx
  on public.challenge_payouts (challenge_id, place);

comment on table public.challenge_settlements is 'One row per settled challenge. Unique challenge_id makes payout idempotent.';
comment on table public.challenge_payouts is 'Coins credited to each winner when a challenge settles.';

create or replace function public.sync_unlimited_eliminations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  period_start date;
  period_end date;
  eligible int;
  eliminated int;
begin
  for ch in
    select *
    from public.challenges
    where coalesce(is_unlimited, false) = true
      and status in ('upcoming', 'open', 'in_progress')
      and now() >= starts_at
  loop
    if coalesce(ch.frequency, 'daily') = 'weekly' then
      period_start := (date_trunc('week', current_date::timestamp) - interval '7 days')::date;
      period_end := (date_trunc('week', current_date::timestamp) - interval '1 day')::date;
    elsif coalesce(ch.frequency, 'daily') = 'monthly' then
      period_start := (date_trunc('month', current_date::timestamp) - interval '1 month')::date;
      period_end := (date_trunc('month', current_date::timestamp) - interval '1 day')::date;
    else
      period_start := current_date - 1;
      period_end := current_date - 1;
    end if;

    if ch.starts_at::date > period_start then
      continue;
    end if;

    update public.challenge_participants p
      set eliminated_at = now(),
          status = 'failed'
    where p.challenge_id = ch.id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') <> 'withdrawn'
      and p.joined_at::date <= period_start
      and (
        select count(*)
        from public.workout_submissions s
        where s.challenge_id = ch.id
          and s.user_id = p.user_id
          and s.submission_date >= period_start
          and s.submission_date <= period_end
      ) < greatest(coalesce(ch.target_count, 1), 1);

    select
      count(*) filter (
        where eliminated_at is null and coalesce(status, 'joined') <> 'withdrawn'
      ),
      count(*) filter (where eliminated_at is not null)
    into eligible, eliminated
    from public.challenge_participants
    where challenge_id = ch.id;

    if eligible = 1 and eliminated >= 1 and auth.uid() is not null then
      begin
        perform public.settle_challenge(ch.id);
      exception
        when others then
          null;
      end;
    end if;
  end loop;
end;
$$;

grant execute on function public.sync_unlimited_eliminations() to authenticated;

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenges
    set status = 'in_progress'
    where status in ('upcoming', 'open')
      and now() >= starts_at
      and (ends_at is null or now() < ends_at);

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false;

  perform public.sync_unlimited_eliminations();
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;

create or replace function public.get_challenge_settlement(p_challenge_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'already_settled', true,
    'settlement', jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'settled_by', s.settled_by,
      'prize_pool', s.prize_pool,
      'distributed', s.distributed,
      'prize_structure', s.prize_structure,
      'winner_count', s.winner_count,
      'settled_at', s.settled_at
    ),
    'payouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'place', p.place,
          'score', p.score,
          'amount', p.amount,
          'reason', p.reason
        )
        order by p.place, p.user_id
      )
      from public.challenge_payouts p
      where p.challenge_id = s.challenge_id
    ), '[]'::jsonb)
  )
  from public.challenge_settlements s
  where s.challenge_id = p_challenge_id;
$$;

grant execute on function public.get_challenge_settlement(uuid) to authenticated, anon;

create or replace function public.settle_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_target int;
  v_pool numeric(12,2);
  v_structure text;
  v_mode text;
  v_places int;
  v_dist text;
  v_settlement_id uuid;
  v_distributed numeric(12,2) := 0;
  rec record;
  n int := 0;
  take_n int := 0;
  i int;
  v_weight_sum int;
  v_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_reason text;
  ids uuid[] := '{}';
  scores numeric[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_settlements where challenge_id = p_challenge_id
  ) then
    update public.challenges
      set status = 'settled'
      where id = p_challenge_id
        and status is distinct from 'settled';
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  if ch.status = 'settled' then
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  if auth.uid() is distinct from ch.created_by
     and ch.status is distinct from 'judging' then
    if coalesce(ch.is_unlimited, false) then
      select count(*) into n
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and p.eliminated_at is null
        and coalesce(p.status, 'joined') <> 'withdrawn';
      if n <> 1 then
        raise exception 'Only the creator can end this challenge while more than one person is still in'
          using errcode = '42501';
      end if;
      n := 0;
    elsif ch.ends_at is not null and now() < ch.ends_at then
      raise exception 'Only the creator can close this challenge before it ends'
        using errcode = '42501';
    end if;
  end if;

  update public.challenges
    set status = 'judging'
    where id = ch.id
      and status is distinct from 'settled';

  v_pool := round(coalesce(ch.prize_pool, 0), 2);
  v_structure := coalesce(nullif(ch.prize_structure, ''), 'equal_split');
  v_mode := coalesce(nullif(ch.top_places_mode, ''), 'percent');
  v_places := greatest(coalesce(ch.top_places_value, 10), 1);
  v_dist := coalesce(nullif(ch.top_places_distribution, ''), 'even');

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    v_target := greatest(coalesce(ch.target_count, ch.days_required), 1);
  end if;

  if coalesce(ch.is_unlimited, false) then
    v_structure := 'winner_take_all';
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and p.eliminated_at is null
        and coalesce(p.status, 'joined') <> 'withdrawn'
      order by p.days_completed desc, p.joined_at asc
      limit 1
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;

  elsif v_structure = 'winner_take_all' then
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) > 0
      order by p.days_completed desc, p.joined_at asc
      limit 1
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;

  elsif v_structure = 'top_places' then
    select count(*) into n
    from public.challenge_participants p
    where p.challenge_id = ch.id
      and coalesce(p.status, 'joined') <> 'withdrawn'
      and coalesce(p.days_completed, 0) >= v_target;

    if n = 0 then
      select count(*) into n
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) > 0;
    end if;

    if n > 0 then
      if v_mode = 'count' then
        take_n := least(v_places, n);
      else
        take_n := least(n, greatest(1, ceil(n * v_places / 100.0)::int));
      end if;

      for rec in
        select p.user_id, p.days_completed::numeric as score
        from public.challenge_participants p
        where p.challenge_id = ch.id
          and coalesce(p.status, 'joined') <> 'withdrawn'
          and (
            (
              (select count(*) from public.challenge_participants c
                where c.challenge_id = ch.id
                  and coalesce(c.status, 'joined') <> 'withdrawn'
                  and coalesce(c.days_completed, 0) >= v_target) = 0
              and coalesce(p.days_completed, 0) > 0
            )
            or coalesce(p.days_completed, 0) >= v_target
          )
        order by p.days_completed desc, p.joined_at asc
        limit take_n
      loop
        ids := array_append(ids, rec.user_id);
        scores := array_append(scores, rec.score);
      end loop;
    end if;

  else
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) >= v_target
      order by p.days_completed desc, p.joined_at asc
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;
  end if;

  n := coalesce(array_length(ids, 1), 0);

  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count
  ) values (
    ch.id, auth.uid(), v_pool, 0, v_structure, n
  )
  returning id into v_settlement_id;

  if n > 0 and v_pool > 0 then
    v_remaining := v_pool;
    v_weight_sum := n * (n + 1) / 2;

    for i in 1..n loop
      if coalesce(ch.is_unlimited, false) then
        v_amount := v_remaining;
        v_reason := 'Last person still meeting the requirement — takes the entire prize pool.';
      elsif v_structure = 'winner_take_all' then
        v_amount := v_remaining;
        v_reason := 'Highest rank — takes the entire prize pool.';
      elsif v_structure = 'top_places' and v_dist = 'scaled' then
        if i < n then
          v_amount := round(v_pool * (n - i + 1) / v_weight_sum, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Finished in the top places. Higher place earns more.';
      elsif v_structure = 'top_places' then
        if i < n then
          v_amount := round(v_pool / n, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Finished in the top places and splits the pool evenly.';
      else
        if i < n then
          v_amount := round(v_pool / n, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Completed the required logs and splits the pool evenly.';
      end if;

      if v_amount < 0 then
        v_amount := 0;
      end if;

      insert into public.challenge_payouts (
        settlement_id, challenge_id, user_id, place, score, amount, reason
      ) values (
        v_settlement_id, ch.id, ids[i], i, scores[i], v_amount, v_reason
      );

      update public.profiles
        set credits = credits + v_amount
        where id = ids[i];

      v_distributed := v_distributed + v_amount;
      v_remaining := v_remaining - v_amount;
    end loop;
  elsif n > 0 then
    for i in 1..n loop
      if coalesce(ch.is_unlimited, false) then
        v_reason := 'Last person still meeting the requirement. The pool was empty, so no Coins moved.';
      elsif v_structure = 'winner_take_all' then
        v_reason := 'Highest rank — the pool was empty, so no Coins moved.';
      elsif v_structure = 'top_places' then
        v_reason := 'Finished in the top places. The pool was empty, so no Coins moved.';
      else
        v_reason := 'Completed the required logs. The pool was empty, so no Coins moved.';
      end if;

      insert into public.challenge_payouts (
        settlement_id, challenge_id, user_id, place, score, amount, reason
      ) values (
        v_settlement_id, ch.id, ids[i], i, scores[i], 0, v_reason
      );
    end loop;
  end if;

  update public.challenge_settlements
    set distributed = v_distributed,
        winner_count = n
    where id = v_settlement_id;

  if coalesce(ch.is_unlimited, false) then
    update public.challenge_participants
      set status = 'completed',
          completed_at = coalesce(completed_at, now())
      where challenge_id = ch.id
        and eliminated_at is null
        and coalesce(status, 'joined') <> 'withdrawn';
  else
    update public.challenge_participants
      set status = 'completed',
          completed_at = coalesce(completed_at, now())
      where challenge_id = ch.id
        and coalesce(status, 'joined') <> 'withdrawn'
        and coalesce(days_completed, 0) >= v_target;

    update public.challenge_participants
      set status = 'failed'
      where challenge_id = ch.id
        and coalesce(status, 'joined') not in ('withdrawn', 'completed')
        and coalesce(days_completed, 0) < v_target;
  end if;

  update public.challenges
    set status = 'settled',
        prize_pool = case when n > 0 then greatest(v_pool - v_distributed, 0) else v_pool end
    where id = ch.id;

  return public.get_challenge_settlement(p_challenge_id);

exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

grant execute on function public.settle_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- health_connections / health_workouts (Apple Health + Health Connect proof)
-- ---------------------------------------------------------------------------

create table public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null,
  last_synced_at timestamptz,
  hk_workout_anchor text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  constraint health_connections_provider_check check (provider in ('apple_health', 'health_connect')),
  constraint health_connections_status_check check (status in ('connected', 'disconnected'))
);

create table public.health_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_workout_id text not null,
  activity_type text not null,
  activity_label text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null,
  calories_kcal numeric,
  distance_m numeric,
  hr_avg numeric,
  hr_max numeric,
  source_bundle text,
  confidence text not null,
  raw_summary jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_workout_id),
  constraint health_workouts_provider_check check (provider in ('apple_health', 'health_connect')),
  constraint health_workouts_confidence_check check (confidence in ('watch', 'phone', 'manual', 'unknown')),
  constraint health_workouts_duration_check check (duration_sec >= 0)
);

comment on table public.health_connections is 'Owner-only Health connection flag (Apple Health or Health Connect). Disconnect stops future reads; existing proofs stay.';
comment on table public.health_workouts is 'Owner-only workout summaries used as challenge proof. No HR time series.';
comment on column public.health_workouts.raw_summary is 'Small summary only. Never store heart-rate samples.';
comment on column public.health_connections.hk_workout_anchor is 'Serialized HKQueryAnchor for incremental workout sync. Apple Health only.';
comment on column public.health_connections.last_error is 'User-facing sync failure. Never store HealthKit / PostgREST strings.';
comment on column public.health_workouts.dismissed_at is 'User dismissed the next-open prompt for this workout. Never nag again.';

create index health_connections_user_idx on public.health_connections (user_id);
create index health_workouts_user_started_idx on public.health_workouts (user_id, started_at desc);

create table public.health_workout_starts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  started_at timestamptz not null,
  activity_type text,
  goal_seconds int,
  created_at timestamptz not null default now()
);

create index health_workout_starts_user_challenge_idx
  on public.health_workout_starts (user_id, challenge_id, started_at desc);

comment on table public.health_workout_starts is
  'Owner-only Start on Watch taps. Matching prefers health_workouts.started_at >= this. No proof until confirm.';

-- ---------------------------------------------------------------------------
-- workout_submissions
-- ---------------------------------------------------------------------------

create table public.workout_submissions (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submission_date date not null,
  pre_selfie_url text,
  post_selfie_url text,
  hr_monitor_url text,
  notes text,
  status text default 'pending_review' check (status in ('pending_review','approved','rejected')),
  task_ids jsonb not null default '[]'::jsonb,
  proof_parts jsonb not null default '{}'::jsonb,
  proof_kind text,
  health_workout_id uuid references public.health_workouts(id),
  created_at timestamptz default now(),
  unique(challenge_id, user_id, submission_date)
);

comment on table public.workout_submissions is 'One proof set per calendar day per participant. Privacy-first: not publicly readable.';
comment on column public.workout_submissions.task_ids is
  'Points challenges: task ids completed in this log. Empty for consistency / three-proof days.';
comment on column public.workout_submissions.proof_parts is
  'Parts for this log, keyed by challenge proof id.';
comment on column public.workout_submissions.proof_kind is
  'camera | health_workout | existing values. Null camera rows stay valid.';
comment on column public.workout_submissions.health_workout_id is
  'Optional Health workout used as this day’s proof. Readable with the submission.';

create index workout_submissions_user_date_idx on public.workout_submissions (user_id, submission_date desc);
create index workout_submissions_challenge_status_idx on public.workout_submissions (challenge_id, status);

-- Recalculate days_completed from submissions (never increment blindly).
create or replace function public.refresh_participant_progress(
  p_challenge_id uuid,
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
  v_target int := 1;
  v_task_count int := 0;
begin
  select * into ch
  from public.challenges
  where id = p_challenge_id;

  if not found then
    return 0;
  end if;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select count(distinct tid) into v_task_count
    from public.workout_submissions s
    cross join lateral jsonb_array_elements_text(coalesce(s.task_ids, '[]'::jsonb)) as tid
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id
      and length(trim(tid)) > 0;

    if coalesce(v_task_count, 0) > 0 then
      v_days := v_task_count;
    else
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id;
    end if;

    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    select count(*) into v_days
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id;

    v_target := greatest(coalesce(ch.target_count, ch.days_required), 1);
  end if;

  v_days := greatest(coalesce(v_days, 0), 0);

  update public.challenge_participants
    set days_completed = v_days,
        completed_at = case
          when coalesce(ch.is_unlimited, false) then completed_at
          when v_days >= v_target then coalesce(completed_at, now())
          else null
        end,
        status = case
          when coalesce(status, 'joined') = 'withdrawn' then status
          when coalesce(ch.is_unlimited, false) then status
          when v_days >= v_target then 'completed'
          when status = 'completed' then 'joined'
          else status
        end
    where challenge_id = p_challenge_id
      and user_id = p_user_id;

  return v_days;
end;
$$;

create or replace function public.trg_refresh_participant_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_participant_progress(old.challenge_id, old.user_id);
    return old;
  end if;
  perform public.refresh_participant_progress(new.challenge_id, new.user_id);
  return new;
end;
$$;

create trigger workout_submissions_apply_progress
  after insert or delete or update of task_ids
  on public.workout_submissions
  for each row execute function public.trg_refresh_participant_progress();

create or replace function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  v_uid uuid := auth.uid();
  v_tasks text[] := '{}';
  v_valid text[] := '{}';
  v_unknown text[] := '{}';
  v_id uuid;
  v_days int;
  rec record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    raise exception 'Pick a calendar day to log.';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Logging is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Logging is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;

  if exists (
    select 1
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = v_uid
      and s.submission_date = p_submission_date
  ) then
    raise exception 'You’ve already logged a workout for today.';
  end if;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select coalesce(array_agg(trim(tid)), '{}') into v_tasks
    from (
      select distinct trim(tid) as tid
      from jsonb_array_elements_text(coalesce(p_task_ids, '[]'::jsonb)) as tid
      where length(trim(tid)) > 0
    ) cleaned;

    if coalesce(array_length(v_tasks, 1), 0) = 0 then
      raise exception 'Pick at least one task you completed.';
    end if;

    select coalesce(array_agg(t->>'id'), '{}') into v_valid
    from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) t
    where coalesce(t->>'id', '') <> '';

    select coalesce(array_agg(tid), '{}') into v_unknown
    from unnest(v_tasks) as tid
    where tid <> all (coalesce(v_valid, '{}'));

    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'Those tasks are not part of this challenge.';
    end if;
  else
    v_tasks := '{}';
    for rec in
      select coalesce(req->>'type', '') as proof_type
      from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
      where coalesce((req->>'required')::boolean, true)
    loop
      if rec.proof_type = 'pre_selfie' and coalesce(p_pre_selfie_url, '') = '' then
        raise exception 'Upload every required proof before you log.';
      end if;
      if rec.proof_type = 'post_selfie' and coalesce(p_post_selfie_url, '') = '' then
        raise exception 'Upload every required proof before you log.';
      end if;
      if rec.proof_type = 'hr_monitor' and coalesce(p_hr_monitor_url, '') = '' then
        raise exception 'Upload every required proof before you log.';
      end if;
    end loop;
  end if;

  insert into public.workout_submissions (
    challenge_id, user_id, submission_date,
    pre_selfie_url, post_selfie_url, hr_monitor_url, notes, status, task_ids
  ) values (
    p_challenge_id, v_uid, p_submission_date,
    p_pre_selfie_url, p_post_selfie_url, p_hr_monitor_url, p_notes,
    'pending_review', to_jsonb(coalesce(v_tasks, '{}'))
  )
  returning id into v_id;

  v_days := public.refresh_participant_progress(p_challenge_id, v_uid);

  return (
    select jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'user_id', s.user_id,
      'submission_date', s.submission_date,
      'pre_selfie_url', s.pre_selfie_url,
      'post_selfie_url', s.post_selfie_url,
      'hr_monitor_url', s.hr_monitor_url,
      'notes', s.notes,
      'status', s.status,
      'created_at', s.created_at,
      'task_ids', s.task_ids,
      'days_completed', v_days
    )
    from public.workout_submissions s
    where s.id = v_id
  );
exception
  when unique_violation then
    raise exception 'You’ve already logged a workout for today.';
end;
$$;

grant execute on function public.refresh_participant_progress(uuid, uuid) to authenticated;
grant execute on function public.log_workout(uuid, date, text, text, text, text, jsonb) to authenticated;

create or replace function public.log_health_workout(
  p_challenge_id uuid,
  p_health_workout_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  hw public.health_workouts%rowtype;
  v_uid uuid := auth.uid();
  v_id uuid;
  v_days int;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    p_submission_date := (timezone('utc', now()))::date;
  end if;

  select * into hw
  from public.health_workouts
  where id = p_health_workout_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'That workout is not available.';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.starts_at is not null and now() < ch.starts_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.official_started_at is not null and now() < ch.official_started_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Logging is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Logging is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;

  if exists (
    select 1
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = v_uid
      and s.submission_date = p_submission_date
  ) then
    raise exception 'You’ve already logged a workout for today.';
  end if;

  insert into public.workout_submissions (
    challenge_id,
    user_id,
    submission_date,
    pre_selfie_url,
    post_selfie_url,
    hr_monitor_url,
    notes,
    status,
    task_ids,
    proof_parts,
    proof_kind,
    health_workout_id
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    null,
    null,
    null,
    coalesce(p_notes, hw.activity_label),
    'pending_review',
    '[]'::jsonb,
    '{}'::jsonb,
    'health_workout',
    hw.id
  )
  returning id into v_id;

  v_days := public.refresh_participant_progress(p_challenge_id, v_uid);

  return (
    select jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'user_id', s.user_id,
      'submission_date', s.submission_date,
      'pre_selfie_url', s.pre_selfie_url,
      'post_selfie_url', s.post_selfie_url,
      'hr_monitor_url', s.hr_monitor_url,
      'notes', s.notes,
      'status', s.status,
      'created_at', s.created_at,
      'task_ids', s.task_ids,
      'proof_parts', s.proof_parts,
      'proof_kind', s.proof_kind,
      'health_workout_id', s.health_workout_id,
      'days_completed', v_days
    )
    from public.workout_submissions s
    where s.id = v_id
  );
exception
  when unique_violation then
    raise exception 'You’ve already logged a workout for today.';
end;
$$;

grant execute on function public.log_health_workout(uuid, uuid, date, text) to authenticated;

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_official boolean := false;
  v_others int := 0;
  v_p record;
  v_host_amt numeric := 0;
  v_refunded uuid[] := '{}';
  v_host_coin_back boolean := false;
  v_notified_host boolean := false;
  v_body text;
  v_paid boolean;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_c.status = 'settled' then
    raise exception 'ALREADY_SETTLED';
  end if;
  if v_c.status in ('cancelled', 'cancelled_underfilled') then
    raise exception 'ALREADY_CANCELLED';
  end if;

  select coalesce(is_official, false) into v_official from public.profiles where id = v_uid;
  if not v_official then
    if v_c.created_by is distinct from v_uid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_c.starts_at is null or v_c.starts_at <= now() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select count(*) into v_others
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id is distinct from v_c.created_by
      and coalesce(status, 'joined') is distinct from 'refunded_pre_start';
    if coalesce(v_others, 0) > 0 then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  for v_p in
    select * from public.challenge_participants where challenge_id = p_challenge_id for update
  loop
    if coalesce(v_p.buy_in_paid, 0) > 0
       and coalesce(v_p.currency, v_c.currency, 'coins') = 'coins'
       and coalesce(v_p.status, 'joined') is distinct from 'refunded_pre_start' then
      update public.profiles set coins = coins + v_p.buy_in_paid where id = v_p.user_id;
      update public.challenges set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0) where id = p_challenge_id;
      insert into public.wallet_ledger (
        user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
      ) values (
        v_p.user_id, p_challenge_id, 'coins', v_p.buy_in_paid,
        'challenge_cancel_refund', 'challenge_cancel_refund',
        jsonb_build_object('kind', 'buy_in'), 'challenge', p_challenge_id::text
      );
      v_refunded := array_append(v_refunded, v_p.user_id);
      if v_p.user_id = v_c.created_by then
        v_host_coin_back := true;
      end if;
    end if;
  end loop;

  select * into v_c from public.challenges where id = p_challenge_id;
  v_host_amt := least(
    greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0),
    greatest(coalesce(v_c.prize_pool, 0), 0)
  );
  if v_host_amt > 0 and v_c.created_by is not null then
    if coalesce(v_c.currency, 'coins') = 'coins' then
      update public.profiles set coins = coins + v_host_amt where id = v_c.created_by;
      v_host_coin_back := true;
    else
      update public.profiles set bucks = bucks + v_host_amt where id = v_c.created_by;
    end if;
    update public.challenges set prize_pool = greatest(prize_pool - v_host_amt, 0) where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    ) values (
      v_c.created_by, p_challenge_id, coalesce(v_c.currency, 'coins'), v_host_amt,
      'challenge_cancel_refund', 'challenge_cancel_host_release',
      jsonb_build_object('kind', 'host_escrow'), 'challenge', p_challenge_id::text
    );
  end if;

  update public.challenges
  set status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid, updated_at = now()
  where id = p_challenge_id;

  for v_p in select * from public.challenge_participants where challenge_id = p_challenge_id
  loop
    v_paid := v_p.user_id = any (v_refunded) or (v_p.user_id = v_c.created_by and v_host_coin_back);
    v_body := 'This challenge was cancelled.';
    if v_paid then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_p.user_id, v_uid, 'challenge_cancelled', v_c.title, v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_paid)
    );
    if v_p.user_id = v_c.created_by then
      v_notified_host := true;
    end if;
  end loop;

  if v_official and v_c.created_by is not null and v_c.created_by is distinct from v_uid and not v_notified_host then
    v_body := 'This challenge was cancelled.';
    if v_host_coin_back then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_c.created_by, v_uid, 'challenge_cancelled', v_c.title, v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_host_coin_back)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_challenge(uuid) to authenticated;

create or replace function public.mark_challenge_judging(p_challenge_id uuid)
returns public.challenges
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_uid uuid := auth.uid();
  v_is_participant boolean := false;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status in ('settled', 'judging') then
    return ch;
  end if;

  select exists (
    select 1
    from public.challenge_participants p
    where p.challenge_id = ch.id
      and p.user_id = v_uid
      and coalesce(p.status, 'joined') <> 'withdrawn'
  ) into v_is_participant;

  if v_uid is distinct from ch.created_by then
    if coalesce(ch.is_unlimited, false)
       or ch.ends_at is null
       or now() < ch.ends_at
       or not v_is_participant then
      raise exception 'Only the host can close this challenge before it ends.';
    end if;
  end if;

  update public.challenges
    set status = 'judging'
    where id = ch.id
    returning * into ch;

  return ch;
end;
$$;

grant execute on function public.mark_challenge_judging(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- follows
-- ---------------------------------------------------------------------------

create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  constraint no_self_follow check (follower_id <> following_id)
);

create index follows_following_id_idx on public.follows (following_id);

-- ---------------------------------------------------------------------------
-- posts
-- ---------------------------------------------------------------------------

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade, -- null = global feed
  content text,
  media_urls text[] default '{}',
  wall_host_id uuid references public.profiles(id) on delete set null,
  wall_removed_at timestamptz,
  created_at timestamptz default now(),
  constraint post_has_body check (
    (content is not null and length(btrim(content)) > 0)
    or coalesce(array_length(media_urls, 1), 0) > 0
  )
);

comment on column public.posts.challenge_id is 'NULL posts appear in the global feed. Set to attach a post to a challenge.';

create index posts_created_at_idx on public.posts (created_at desc);
create index posts_author_id_idx on public.posts (author_id);
create index posts_challenge_created_at_idx on public.posts (challenge_id, created_at desc);
create index posts_global_created_at_idx on public.posts (created_at desc) where challenge_id is null;

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  content text not null,
  created_at timestamptz default now(),
  constraint comment_not_empty check (length(btrim(content)) > 0)
);

create table public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (post_id, mentioned_user_id)
);

create table public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  unique (comment_id, mentioned_user_id)
);

create index comments_post_id_created_at_idx on public.comments (post_id, created_at);
create index comments_parent_id_idx on public.comments (parent_id);

-- ---------------------------------------------------------------------------
-- reactions
-- ---------------------------------------------------------------------------

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  reaction_type text not null default 'like', -- like, fire, strong, etc.
  created_at timestamptz default now(),
  constraint reaction_type_known check (reaction_type in ('like', 'fire', 'strong')),
  constraint reaction_one_target check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  )
);

create unique index reactions_user_post_type_idx
  on public.reactions (user_id, post_id, reaction_type)
  where post_id is not null;

create unique index reactions_user_comment_type_idx
  on public.reactions (user_id, comment_id, reaction_type)
  where comment_id is not null;

create index reactions_post_id_idx on public.reactions (post_id);
create index reactions_comment_id_idx on public.reactions (comment_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'challenge_joined',
    'follow',
    'coins_received',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated'
  ))
);

comment on table public.notifications is 'Per-user inbox. Inserts happen inside notify_user(); clients only read and mark as read.';

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

create or replace function public.profile_display_name(p_user_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(p.display_name), ''), p.username, 'Someone')
  from public.profiles p
  where p.id = p_user_id;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;
  if p_actor_id is not null and p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body, data)
  values (
    p_user_id,
    p_actor_id,
    p_type,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb)
  );
exception when others then
  null;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null
      and (p_ids is null or id = any (p_ids));

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee_id uuid)
returns public.challenge_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_challenge public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
begin
  v_inviter := auth.uid();
  if v_inviter is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_invitee_id is null then
    raise exception 'Pick someone to invite' using errcode = 'P0001';
  end if;

  if p_invitee_id = v_inviter then
    raise exception 'You can’t invite yourself' using errcode = 'P0001';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if v_challenge.created_by is distinct from v_inviter then
    raise exception 'Only the host can invite people' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = p_invitee_id
  ) then
    raise exception 'They’re already in this challenge' using errcode = 'P0001';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id)
  values (p_challenge_id, v_inviter, p_invitee_id)
  on conflict (challenge_id, invitee_id) do nothing
  returning * into v_invite;

  if v_invite.id is null then
    select * into v_invite
    from public.challenge_invites
    where challenge_id = p_challenge_id
      and invitee_id = p_invitee_id;
    raise exception 'You already invited them' using errcode = 'P0001';
  end if;

  return v_invite;
end;
$$;

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

create trigger challenge_invites_notify
  after insert on public.challenge_invites
  for each row execute function public.trg_notify_challenge_invite();

create or replace function public.trg_notify_challenge_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_title text;
  v_name text;
begin
  select created_by, title into v_host, v_title
  from public.challenges
  where id = new.challenge_id;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_host,
    new.user_id,
    'challenge_joined',
    'Someone joined your challenge',
    v_name || ' joined ' || coalesce(v_title, 'your challenge') || '.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger challenge_participants_notify_joined
  after insert on public.challenge_participants
  for each row execute function public.trg_notify_challenge_joined();

create or replace function public.trg_notify_challenge_eliminated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.eliminated_at is not null or new.eliminated_at is null then
    return new;
  end if;
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_eliminated',
    'You’ve been eliminated',
    'You’re out of ' || coalesce(v_title, 'a challenge') || '. New logs are not accepted.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger challenge_participants_notify_eliminated
  after update of eliminated_at on public.challenge_participants
  for each row execute function public.trg_notify_challenge_eliminated();

create or replace function public.trg_notify_challenge_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_kind text;
  v_title text;
begin
  if new.created_by is null then
    return new;
  end if;
  if coalesce(new.visibility, 'public') = 'private' then
    return new;
  end if;

  v_name := public.profile_display_name(new.created_by);
  if new.is_official then
    v_kind := 'New official challenge';
    v_title := coalesce(new.title, 'A new official challenge') || ' is live.';
  else
    v_kind := 'New challenge';
    v_title := v_name || ' posted ' || coalesce(new.title, 'a challenge') || '.';
  end if;

  for rec in
    select f.follower_id
    from public.follows f
    where f.following_id = new.created_by
    limit 40
  loop
    perform public.notify_user(
      rec.follower_id,
      new.created_by,
      'challenge_new',
      v_kind,
      v_title,
      jsonb_build_object('challenge_id', new.id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

create trigger challenges_notify_new
  after insert on public.challenges
  for each row execute function public.trg_notify_challenge_new();

create or replace function public.trg_notify_challenge_settled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_title text;
begin
  if old.status is not distinct from new.status or new.status is distinct from 'settled' then
    return new;
  end if;
  v_title := coalesce(new.title, 'A challenge');
  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = new.id
      and not exists (
        select 1 from public.challenge_payouts pay
        where pay.challenge_id = new.id
          and pay.user_id = p.user_id
      )
  loop
    perform public.notify_user(
      rec.user_id,
      new.created_by,
      'challenge_settled',
      'Challenge settled',
      v_title || ' is settled. Check your result.',
      jsonb_build_object('challenge_id', new.id)
    );
  end loop;
  if new.created_by is not null
     and not exists (
       select 1 from public.challenge_participants p
       where p.challenge_id = new.id and p.user_id = new.created_by
     )
  then
    perform public.notify_user(
      new.created_by,
      null,
      'challenge_settled',
      'Challenge settled',
      v_title || ' is settled.',
      jsonb_build_object('challenge_id', new.id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create trigger challenges_notify_settled
  after update of status on public.challenges
  for each row execute function public.trg_notify_challenge_settled();

create or replace function public.trg_notify_challenge_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_ord text;
  v_amount text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;
  v_ord := new.place::text ||
    case
      when new.place % 100 between 11 and 13 then 'th'
      when new.place % 10 = 1 then 'st'
      when new.place % 10 = 2 then 'nd'
      when new.place % 10 = 3 then 'rd'
      else 'th'
    end;
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_placed',
    'You placed ' || v_ord,
    'You finished ' || v_ord || ' in ' || coalesce(v_title, 'a challenge') ||
      ' and received ' || v_amount || ' Coins.',
    jsonb_build_object('challenge_id', new.challenge_id, 'amount', new.amount, 'place', new.place)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger challenge_payouts_notify_placed
  after insert on public.challenge_payouts
  for each row execute function public.trg_notify_challenge_placed();

create or replace function public.trg_notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := public.profile_display_name(new.follower_id);
  select username into v_username from public.profiles where id = new.follower_id;
  perform public.notify_user(
    new.following_id,
    new.follower_id,
    'follow',
    'New follower',
    v_name || ' started following you.',
    jsonb_build_object('username', v_username)
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger follows_notify
  after insert on public.follows
  for each row execute function public.trg_notify_follow();

create or replace function public.trg_notify_coins_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_amount text;
  v_noun text;
  v_body text;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  v_noun := case when public.normalize_wallet_currency(new.currency) = 'bucks' then 'Bucks' else 'Coins' end;
  v_body := v_name || ' sent you ' || v_amount || ' ' || v_noun || '.';
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    v_body,
    null,
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id, 'currency', coalesce(new.currency, 'coins'))
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger coin_transfers_notify
  after insert on public.coin_transfers
  for each row execute function public.trg_notify_coins_received();

create or replace function public.trg_notify_post_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_kind text;
begin
  if coalesce(new.content, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  v_kind := case when new.challenge_id is null then 'a post' else 'a challenge post' end;
  for rec in
    select distinct p.id as user_id
    from regexp_matches(new.content, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.author_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'tagged',
      'You were tagged',
      v_name || ' tagged you in ' || v_kind || '.',
      jsonb_build_object(
        'post_id', new.id,
        'challenge_id', new.challenge_id
      )
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

create trigger posts_notify_tags
  after insert on public.posts
  for each row execute function public.trg_notify_post_tags();

create or replace function public.trg_notify_comment_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_challenge uuid;
begin
  if coalesce(new.content, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  select challenge_id into v_challenge from public.posts where id = new.post_id;
  for rec in
    select distinct p.id as user_id
    from regexp_matches(new.content, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.author_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'tagged',
      'You were tagged',
      v_name || ' tagged you in a comment.',
      jsonb_build_object(
        'post_id', new.post_id,
        'comment_id', new.id,
        'challenge_id', v_challenge
      )
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

create trigger comments_notify_tags
  after insert on public.comments
  for each row execute function public.trg_notify_comment_tags();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================

alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_settlements enable row level security;
alter table public.challenge_payouts enable row level security;
alter table public.workout_submissions enable row level security;
alter table public.health_connections enable row level security;
alter table public.health_workouts enable row level security;
alter table public.health_workout_starts enable row level security;
alter table public.follows enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;
alter table public.challenge_invites enable row level security;
alter table public.notifications enable row level security;

-- profiles: public read of non-sensitive columns, owner write
-- Credits column is revoked below so SELECT * will not leak wallets.
create policy "Profiles are readable"
  on public.profiles for select
  using (true);

create policy "Users insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- challenges: public read, authenticated create (later restrict)
create policy "Challenges are readable"
  on public.challenges for select
  using (
    visibility in ('public', 'unlisted')
    or visibility is null
    or is_official = true
    or created_by = auth.uid()
    or exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = challenges.id and cp.user_id = auth.uid()
    )
  );

create policy "Authenticated users can create challenges"
  on public.challenges for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "Creators can update their challenges"
  on public.challenges for update
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

alter table public.coin_transfers enable row level security;

create policy "Users read own coin transfers"
  on public.coin_transfers for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

alter table public.challenge_drafts enable row level security;

create policy "Users read own challenge invites"
  on public.challenge_invites for select
  to authenticated
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

create policy "Hosts insert challenge invites"
  on public.challenge_invites for insert
  to authenticated
  with check (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and c.created_by = auth.uid()
    )
  );

create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users read own challenge draft"
  on public.challenge_drafts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users insert own challenge draft"
  on public.challenge_drafts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update own challenge draft"
  on public.challenge_drafts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own challenge draft"
  on public.challenge_drafts for delete
  to authenticated
  using (auth.uid() = user_id);

-- participants: users can join themselves, read participants of visible challenges
create policy "Participants of visible challenges are readable"
  on public.challenge_participants for select
  using (true);

-- Direct inserts are allowed only for the caller, but buy-in is NOT collected
-- this way. Prefer join_challenge(). Kept for admin/testing flexibility.
create policy "Users can join as themselves"
  on public.challenge_participants for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own participation"
  on public.challenge_participants for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Settlements are readable"
  on public.challenge_settlements for select
  using (true);

create policy "Payouts are readable"
  on public.challenge_payouts for select
  using (true);

-- submissions: owner + challenge participants can read proofs (privacy first)
create policy "Participants can read challenge proofs"
  on public.workout_submissions for select
  to authenticated
  using (
    auth.uid() = user_id
    or public.is_challenge_participant(challenge_id, auth.uid())
  );

create policy "Participants submit their own proofs"
  on public.workout_submissions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and public.is_challenge_participant(challenge_id, auth.uid())
  );

create policy "Owners can update their pending proofs"
  on public.workout_submissions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners manage their health connections"
  on public.health_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners manage their health workouts"
  on public.health_workouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Owners manage their workout starts"
  on public.health_workout_starts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- posts: anyone can read; only participants can insert challenge posts
create policy "Posts are readable"
  on public.posts for select
  using (true);

create policy "Authenticated users can post globally"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      challenge_id is null
      or public.is_challenge_participant(challenge_id, auth.uid())
    )
  );

create policy "Authors can delete their posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = author_id);

-- follows / comments / reactions: standard authenticated
create policy "Follows are readable"
  on public.follows for select
  to authenticated
  using (true);

create policy "Users follow as themselves"
  on public.follows for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and exists (
      select 1
      from public.profiles p
      where p.id = following_id
        and p.is_creator = true
    )
  );

create policy "Users can unfollow"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

create policy "Comments are readable"
  on public.comments for select
  using (true);

create policy "Authenticated users can comment"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = author_id);

create policy "Authors can delete their comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = author_id);

create policy "Reactions are readable"
  on public.reactions for select
  using (true);

create policy "Authenticated users can react"
  on public.reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can remove their reactions"
  on public.reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (credits column is intentionally omitted from table SELECT)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select (
  id, username, display_name, avatar_url, bio,
  height_cm, current_weight, goal_weight, weight_unit,
  typical_weekly_workout_frequency, primary_activities, skill_tags,
  show_fitness_stats_publicly, created_at, updated_at, is_official
) on public.profiles to anon, authenticated;

grant insert, update on public.profiles to authenticated;

grant select on public.profiles_public to anon, authenticated;

grant select on public.challenges to anon, authenticated;
grant insert, update on public.challenges to authenticated;

grant select, insert, update, delete on public.challenge_drafts to authenticated;

grant select on public.challenge_participants to anon, authenticated;
grant insert, update on public.challenge_participants to authenticated;

grant select on public.challenge_settlements to anon, authenticated;
grant select on public.challenge_payouts to anon, authenticated;

grant select on public.coin_transfers to authenticated;

grant select, insert on public.challenge_invites to authenticated;
grant select, update on public.notifications to authenticated;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

grant select, insert, update on public.workout_submissions to authenticated;
grant select, insert, update, delete on public.health_connections to authenticated;
grant select, insert, update, delete on public.health_workouts to authenticated;
grant select, insert on public.health_workout_starts to authenticated;

grant select, insert, delete on public.follows to authenticated;

grant select on public.posts to anon, authenticated;
grant insert, delete on public.posts to authenticated;

grant select on public.comments to anon, authenticated;
grant insert, delete on public.comments to authenticated;

grant select on public.reactions to anon, authenticated;
grant insert, delete on public.reactions to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Storage buckets: avatars, challenge-proofs, post-media
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
  ('challenge-proofs', 'challenge-proofs', false, 52428800, array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']),
  ('post-media', 'post-media', true, 52428800, array['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

update storage.buckets
set
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm'],
  file_size_limit = 52428800
where id in ('post-media', 'challenge-proofs');

-- avatars: public read, owner write (path: {user_id}/filename)
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Users upload their own avatar"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update their own avatar"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete their own avatar"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- challenge-proofs: private. Path: {user_id}/{challenge_id}/filename
create policy "Participants can read challenge proofs in storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'challenge-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_challenge_participant(((storage.foldername(name))[2])::uuid, auth.uid())
    )
  );

create policy "Users upload their own proofs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'challenge-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_challenge_participant(((storage.foldername(name))[2])::uuid, auth.uid())
  );

create policy "Users delete their own proofs"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'challenge-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- post-media: public read, authenticated insert into own folder
create policy "Post media is publicly readable"
  on storage.objects for select
  using (bucket_id = 'post-media');

create policy "Users upload their own post media"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users update their own post media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users delete their own post media"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- Seed: one official challenge so the lobby is not empty on first run
-- ---------------------------------------------------------------------------

insert into public.challenges (
  title,
  description,
  rules,
  is_official,
  category,
  challenge_type,
  frequency,
  target_count,
  visibility,
  buy_in_amount,
  days_required,
  min_minutes,
  prize_structure,
  funding_model,
  creator_contribution,
  status,
  starts_at,
  ends_at
) values (
  'Weekly Fitness Consistency Challenge',
  'Show up. Six days. Thirty honest minutes. Proof required — no honor system.',
  'Complete 6 workouts of at least 30 minutes in 7 days. Each day you must submit a pre-selfie, a post-selfie, and a heart-rate monitor screenshot. Miss a required day and you are out. Prize pool is split equally among finishers.',
  true,
  'fitness',
  'consistency',
  'daily',
  6,
  'public',
  10.00,
  6,
  30,
  'equal_split',
  'participants',
  0,
  'open',
  now(),
  now() + interval '7 days'
);

-- Dual-currency RPCs (wallet_debit/credit, transfer_funds, join_challenge
-- currency debit, payout credit, and 1-on-1 call-outs) live in
-- supabase/migrations/20260815_dual_currency.sql. Run that file after this
-- schema on a fresh project — it is safe to re-run.
-- Public lifetime Coins/Bucks earnings: supabase/migrations/20260815_lifetime_earnings.sql.
-- Badge catalog, awards, and Coin rewards: supabase/migrations/20260815_badges.sql.
-- Activity logging, progress, and judging: supabase/migrations/20260815_challenge_loop.sql.
-- Challenge escrow spine (publish/join/refund/distribute RPCs): supabase/migrations/20260817_challenge_escrow_spine.sql.
-- Stories + 24h views: supabase/migrations/20260818043000_stories.sql.
-- Direct messages: supabase/migrations/20260818053000_messages.sql.
-- Body metrics + Official join gate: supabase/migrations/20260818060000_body_metrics.sql.
-- Fitness history jsonb: supabase/migrations/20260818070000_fitness_profile.sql.

commit;
