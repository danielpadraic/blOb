-- blOb challenge escrow spine: locked creation model + wallet ledger + money RPCs.
-- Safe to re-run on a fresh or existing project.
-- Clients must not write profiles.coins / profiles.bucks or challenges.prize_pool.
-- All money movement is SECURITY DEFINER with explicit gates.

-- ---------------------------------------------------------------------------
-- Helper: drop a table check constraint whose definition matches a pattern
-- ---------------------------------------------------------------------------
create or replace function public.blob_drop_checks(p_table text, p_match text)
returns void
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = p_table
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike p_match
  loop
    execute format('alter table public.%I drop constraint if exists %I', p_table, r.conname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (ensure dual currency)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists coins numeric not null default 0,
  add column if not exists bucks numeric not null default 0;

comment on column public.profiles.coins is 'PRIVATE Blob Coins (soft). Read via get_my_profile(). Change only via SECURITY DEFINER RPCs.';
comment on column public.profiles.bucks is 'PRIVATE Blob Bucks (1 Buck = $1 USD). Read via get_my_profile(). Change only via SECURITY DEFINER RPCs.';

revoke update (coins, bucks, credits) on public.profiles from authenticated, anon;

-- ---------------------------------------------------------------------------
-- challenges: full creation spine fields
-- ---------------------------------------------------------------------------
alter table public.challenges
  add column if not exists description text,
  add column if not exists rules text,
  add column if not exists is_official boolean not null default false,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists category text,
  add column if not exists visibility text not null default 'public',
  add column if not exists challenge_type text not null default 'consistency',
  add column if not exists start_mode text not null default 'fixed',
  add column if not exists starts_at timestamptz,
  add column if not exists start_within_value int,
  add column if not exists start_within_unit text,
  add column if not exists full_lobby_start_time time,
  add column if not exists full_lobby_day_offset int not null default 0,
  add column if not exists end_mode text not null default 'length',
  add column if not exists ends_at timestamptz,
  add column if not exists length_value int,
  add column if not exists length_unit text,
  add column if not exists is_unlimited boolean not null default false,
  add column if not exists max_participants int,
  add column if not exists min_participants int not null default 1,
  add column if not exists buy_in_amount numeric not null default 0,
  add column if not exists currency text not null default 'coins',
  add column if not exists creator_participating boolean not null default true,
  add column if not exists days_required int,
  add column if not exists min_minutes int,
  add column if not exists proof_requirements jsonb not null default '[]'::jsonb,
  add column if not exists tasks jsonb not null default '[]'::jsonb,
  add column if not exists rules_list jsonb not null default '[]'::jsonb,
  add column if not exists status text not null default 'draft',
  add column if not exists official_started_at timestamptz,
  add column if not exists prize_pool numeric not null default 0,
  add column if not exists prize_structure text not null default 'equal_split',
  add column if not exists top_places_mode text,
  add column if not exists top_places_value numeric,
  add column if not exists top_places_distribution text,
  add column if not exists scaled_first_place_pct numeric,
  add column if not exists funding_model text not null default 'participants',
  add column if not exists creator_contribution numeric not null default 0,
  add column if not exists distribution_mode text not null default 'auto',
  add column if not exists distribution_scheduled_at timestamptz,
  add column if not exists distributed_at timestamptz,
  add column if not exists frequency text,
  add column if not exists target_count int,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Existing live DBs: starts_at was NOT NULL; days/minutes had CHECK > 0.
alter table public.challenges alter column starts_at drop not null;
alter table public.challenges alter column days_required drop not null;
alter table public.challenges alter column min_minutes drop not null;
alter table public.challenges alter column status set default 'draft';

select public.blob_drop_checks('challenges', '%status%in%');
select public.blob_drop_checks('challenges', '%challenge_window%');
select public.blob_drop_checks('challenges', '%ends_at > starts_at%');
select public.blob_drop_checks('challenges', '%days_required%');
select public.blob_drop_checks('challenges', '%min_minutes%');
select public.blob_drop_checks('challenges', '%funding_model%');
select public.blob_drop_checks('challenges', '%prize_structure%');

alter table public.challenges drop constraint if exists challenges_currency_known;
alter table public.challenges drop constraint if exists challenges_currency_check;
alter table public.challenges add constraint challenges_currency_known
  check (currency in ('coins', 'bucks'));

alter table public.challenges add constraint challenges_status_allowed
  check (status in (
    'draft', 'upcoming', 'open', 'starting', 'in_progress',
    'ended', 'judging', 'distributing', 'settled', 'cancelled'
  ));

alter table public.challenges add constraint challenges_funding_model_allowed
  check (funding_model in ('participants', 'creator', 'hybrid', 'sponsored'));

alter table public.challenges add constraint challenges_prize_structure_allowed
  check (prize_structure in ('winner_take_all', 'equal_split', 'top_places', 'solo_return'));

comment on column public.challenges.start_mode is 'fixed | full_lobby | all_ready';
comment on column public.challenges.end_mode is 'end_date | length | indefinite_lms';
comment on column public.challenges.official_started_at is 'Set once. refund_pre_start hard-fails after this.';
comment on column public.challenges.prize_pool is 'Escrow. Updated only by SECURITY DEFINER money RPCs.';
comment on column public.challenges.distribution_mode is 'auto | scheduled | manual';

-- Old insert trigger debited creator_contribution on client INSERT. Escrow RPCs own that now.
drop trigger if exists challenges_fund_on_insert on public.challenges;

revoke update (prize_pool, official_started_at, distributed_at) on public.challenges from authenticated, anon;

-- ---------------------------------------------------------------------------
-- challenge_drafts
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_drafts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  step int not null default 1,
  start_path text,
  template_id text,
  source_challenge_id uuid references public.challenges(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.challenge_drafts enable row level security;
drop policy if exists "Users manage own drafts" on public.challenge_drafts;
create policy "Users manage own drafts" on public.challenge_drafts
  for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on public.challenge_drafts to authenticated;

-- ---------------------------------------------------------------------------
-- challenge_participants
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  ready_at timestamptz,
  eliminated_at timestamptz,
  days_completed int not null default 0,
  points numeric not null default 0,
  status text not null default 'active',
  buy_in_paid numeric not null default 0,
  currency text not null default 'coins',
  unique (challenge_id, user_id)
);

alter table public.challenge_participants
  add column if not exists ready_at timestamptz,
  add column if not exists eliminated_at timestamptz,
  add column if not exists days_completed int not null default 0,
  add column if not exists points numeric not null default 0,
  add column if not exists buy_in_paid numeric not null default 0,
  add column if not exists currency text not null default 'coins';

select public.blob_drop_checks('challenge_participants', '%status%in%');
alter table public.challenge_participants add constraint challenge_participants_status_allowed
  check (status in (
    'joined', 'active', 'eliminated', 'completed', 'failed', 'withdrawn', 'refunded_pre_start'
  ));

create index if not exists challenge_participants_challenge_id_idx on public.challenge_participants(challenge_id);
create index if not exists challenge_participants_user_id_idx on public.challenge_participants(user_id);

alter table public.challenge_participants enable row level security;
drop policy if exists "Participants read visible rows" on public.challenge_participants;
create policy "Participants read visible rows" on public.challenge_participants
  for select to authenticated using (true);
drop policy if exists "Users can join as themselves" on public.challenge_participants;
drop policy if exists "Users can update their own participation" on public.challenge_participants;
revoke insert, update, delete on public.challenge_participants from authenticated, anon;
grant select on public.challenge_participants to anon, authenticated;

-- ---------------------------------------------------------------------------
-- wallet_ledger (extend the badge ledger if it already exists)
-- ---------------------------------------------------------------------------
create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  challenge_id uuid references public.challenges(id) on delete set null,
  currency text not null check (currency in ('coins', 'bucks')),
  amount numeric not null,
  entry_type text not null,
  balance_after numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.wallet_ledger
  add column if not exists challenge_id uuid references public.challenges(id) on delete set null,
  add column if not exists entry_type text,
  add column if not exists balance_after numeric,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists reason text default '';

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_ledger' and column_name = 'user_id'
  ) then
    execute 'alter table public.wallet_ledger alter column user_id drop not null';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'wallet_ledger' and column_name = 'reason'
  ) then
    execute 'alter table public.wallet_ledger alter column reason drop not null';
    execute 'alter table public.wallet_ledger alter column reason set default ''''';
  end if;
end $$;

update public.wallet_ledger
  set entry_type = coalesce(nullif(btrim(entry_type), ''), nullif(btrim(coalesce(reason, '')), ''), 'adjustment')
  where entry_type is null or btrim(entry_type) = '';

create or replace function public.trg_wallet_ledger_entry_type()
returns trigger
language plpgsql
as $$
begin
  if new.entry_type is null or btrim(new.entry_type) = '' then
    new.entry_type := coalesce(nullif(btrim(coalesce(new.reason, '')), ''), 'adjustment');
  end if;
  if new.reason is null or btrim(new.reason) = '' then
    new.reason := new.entry_type;
  end if;
  if new.metadata is null then
    new.metadata := '{}'::jsonb;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_ledger_fill_entry_type on public.wallet_ledger;
create trigger wallet_ledger_fill_entry_type
  before insert or update on public.wallet_ledger
  for each row execute function public.trg_wallet_ledger_entry_type();

create index if not exists wallet_ledger_user_id_idx on public.wallet_ledger(user_id);
create index if not exists wallet_ledger_challenge_id_idx on public.wallet_ledger(challenge_id);

alter table public.wallet_ledger enable row level security;
drop policy if exists "Users read own ledger" on public.wallet_ledger;
create policy "Users read own ledger" on public.wallet_ledger
  for select to authenticated using (auth.uid() = user_id);
grant select on public.wallet_ledger to authenticated;

comment on table public.wallet_ledger is 'Source of truth for money movement. Inserts happen only inside SECURITY DEFINER RPCs.';

-- ---------------------------------------------------------------------------
-- challenge_payouts (idempotent distribution rows)
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_payouts (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  currency text not null,
  amount numeric not null,
  place int,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

alter table public.challenge_payouts
  add column if not exists currency text,
  add column if not exists amount numeric,
  add column if not exists place int,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists settlement_id uuid,
  add column if not exists reason text default 'distribute_win',
  add column if not exists score numeric default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_payouts' and column_name = 'settlement_id'
  ) then
    execute 'alter table public.challenge_payouts alter column settlement_id drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_payouts' and column_name = 'place'
  ) then
    execute 'alter table public.challenge_payouts alter column place drop not null';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_payouts' and column_name = 'reason'
  ) then
    execute 'alter table public.challenge_payouts alter column reason drop not null';
    execute 'alter table public.challenge_payouts alter column reason set default ''distribute_win''';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'challenge_payouts' and column_name = 'score'
  ) then
    execute 'alter table public.challenge_payouts alter column score drop not null';
    execute 'alter table public.challenge_payouts alter column score set default 0';
  end if;
end $$;

alter table public.challenge_payouts enable row level security;
drop policy if exists "Users read own payouts" on public.challenge_payouts;
drop policy if exists "Payouts are readable" on public.challenge_payouts;
create policy "Users read own payouts" on public.challenge_payouts
  for select to authenticated using (auth.uid() = user_id);
grant select on public.challenge_payouts to authenticated;

-- ---------------------------------------------------------------------------
-- Minimal disputes table so distribute_challenge can gate on open disputes
-- ---------------------------------------------------------------------------
create table if not exists public.challenge_disputes (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  submission_id uuid,
  raised_by uuid references public.profiles(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists challenge_disputes_challenge_status_idx
  on public.challenge_disputes(challenge_id, status);

alter table public.challenge_disputes enable row level security;

-- ---------------------------------------------------------------------------
-- challenges RLS
-- ---------------------------------------------------------------------------
alter table public.challenges enable row level security;

drop policy if exists "Users can create challenges" on public.challenges;
drop policy if exists "Authenticated users can create challenges" on public.challenges;
create policy "Users can create challenges" on public.challenges
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists "Users can read challenges" on public.challenges;
drop policy if exists "Challenges are readable" on public.challenges;
create policy "Users can read challenges" on public.challenges
  for select to authenticated
  using (
    visibility = 'public'
    or visibility is null
    or is_official = true
    or created_by = auth.uid()
    or exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = challenges.id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Public read public challenges" on public.challenges;
create policy "Public read public challenges" on public.challenges
  for select to anon
  using (visibility = 'public' or visibility is null or is_official = true);

drop policy if exists "Creators can update own challenges" on public.challenges;
drop policy if exists "Creators can update their challenges" on public.challenges;
create policy "Creators can update own challenges" on public.challenges
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- RPC: publish_challenge
-- ---------------------------------------------------------------------------
drop function if exists public.publish_challenge(jsonb);

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
  v_participating boolean;
  v_balance numeric;
  v_row public.challenges%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_currency := coalesce(p_payload->>'currency', 'coins');
  if v_currency not in ('coins', 'bucks') then
    raise exception 'INVALID_CURRENCY';
  end if;

  v_buy_in := coalesce((p_payload->>'buy_in_amount')::numeric, 0);
  v_creator_contribution := coalesce((p_payload->>'creator_contribution')::numeric, 0);
  v_max := nullif(p_payload->>'max_participants', '')::int;
  v_participating := coalesce((p_payload->>'creator_participating')::boolean, true);

  if v_max is not null and v_max < 1 then
    raise exception 'MAX_PARTICIPANTS_MIN_1';
  end if;

  if coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
     and coalesce(p_payload->>'challenge_type', 'consistency') <> 'consistency' then
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

  if v_max = 1 and v_participating and v_buy_in > 0 then
    if v_balance < (v_creator_contribution + v_buy_in) then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;
  else
    if v_balance < v_creator_contribution then
      raise exception 'INSUFFICIENT_FUNDS';
    end if;
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
    distribution_mode, distribution_scheduled_at, is_official, frequency, target_count
  ) values (
    v_uid,
    coalesce(p_payload->>'title', 'Untitled challenge'),
    p_payload->>'description',
    p_payload->>'rules',
    p_payload->>'category',
    coalesce(p_payload->>'visibility', 'public'),
    coalesce(p_payload->>'challenge_type', 'consistency'),
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
      coalesce(p_payload->>'end_mode', '') = 'indefinite_lms'
    ),
    v_max,
    greatest(coalesce((p_payload->>'min_participants')::int, 1), 1),
    v_buy_in,
    v_currency,
    v_participating,
    nullif(p_payload->>'days_required', '')::int,
    nullif(p_payload->>'min_minutes', '')::int,
    coalesce(p_payload->'proof_requirements', '[]'::jsonb),
    coalesce(p_payload->'tasks', '[]'::jsonb),
    coalesce(p_payload->'rules_list', '[]'::jsonb),
    'open',
    0,
    coalesce(p_payload->>'prize_structure', 'equal_split'),
    p_payload->>'top_places_mode',
    nullif(p_payload->>'top_places_value', '')::numeric,
    p_payload->>'top_places_distribution',
    nullif(p_payload->>'scaled_first_place_pct', '')::numeric,
    coalesce(p_payload->>'funding_model', 'participants'),
    v_creator_contribution,
    coalesce(p_payload->>'distribution_mode', 'auto'),
    nullif(p_payload->>'distribution_scheduled_at', '')::timestamptz,
    coalesce((p_payload->>'is_official')::boolean, false),
    p_payload->>'frequency',
    nullif(p_payload->>'target_count', '')::int
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

  if v_max = 1 and v_participating then
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
        jsonb_build_object('solo', true), 'challenge', v_id::text
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

-- ---------------------------------------------------------------------------
-- RPC: join_challenge (replaces the old participant-row return type)
-- ---------------------------------------------------------------------------
drop function if exists public.join_challenge(uuid);

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

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: refund_pre_start
-- ---------------------------------------------------------------------------
drop function if exists public.refund_pre_start(uuid, uuid);
drop function if exists public.refund_pre_start(uuid);

create or replace function public.refund_pre_start(p_challenge_id uuid, p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.official_started_at is not null then
    raise exception 'NO_REFUND_AFTER_START';
  end if;

  if p_user_id is distinct from v_uid and v_c.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN';
  end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;

  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_p.status = 'refunded_pre_start' then
    return jsonb_build_object('ok', true, 'already_refunded', true);
  end if;

  if v_p.buy_in_paid > 0 then
    if v_p.currency = 'coins' then
      update profiles set coins = coins + v_p.buy_in_paid where id = p_user_id;
    else
      update profiles set bucks = bucks + v_p.buy_in_paid where id = p_user_id;
    end if;
    update challenges set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0) where id = p_challenge_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      p_user_id, p_challenge_id, v_p.currency, v_p.buy_in_paid, 'refund_pre_start', 'refund_pre_start',
      '{}'::jsonb, 'challenge', p_challenge_id::text
    );
  end if;

  update challenge_participants
  set status = 'refunded_pre_start'
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object('ok', true, 'refunded', v_p.buy_in_paid);
end;
$$;

grant execute on function public.refund_pre_start(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: mark_challenge_started
-- ---------------------------------------------------------------------------
drop function if exists public.mark_challenge_started(uuid);

create or replace function public.mark_challenge_started(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.created_by is distinct from v_uid then
    raise exception 'FORBIDDEN';
  end if;

  if v_c.official_started_at is not null then
    return jsonb_build_object('ok', true, 'already_started', true, 'official_started_at', v_c.official_started_at);
  end if;

  update challenges
  set official_started_at = now(), status = 'in_progress', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'official_started_at', now());
end;
$$;

grant execute on function public.mark_challenge_started(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: eliminate_participant (entry fee stays in pot)
-- ---------------------------------------------------------------------------
drop function if exists public.eliminate_participant(uuid, uuid);

create or replace function public.eliminate_participant(p_challenge_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  select * into v_p from challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;

  if not found then raise exception 'NOT_A_PARTICIPANT'; end if;
  if v_p.eliminated_at is not null then
    return jsonb_build_object('ok', true, 'already_eliminated', true);
  end if;

  update challenge_participants
  set eliminated_at = now(), status = 'eliminated'
  where challenge_id = p_challenge_id and user_id = p_user_id;

  insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
  values (
    p_user_id, p_challenge_id, v_p.currency, 0, 'eliminate_forfeit', 'eliminate_forfeit',
    jsonb_build_object('buy_in_remains_in_pot', v_p.buy_in_paid), 'challenge', p_challenge_id::text
  );

  return jsonb_build_object('ok', true, 'prize_pool_unchanged', true);
end;
$$;

grant execute on function public.eliminate_participant(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: distribute_challenge
-- Gates: started; end+1h (or LMS one survivor); no open disputes; not already distributed.
-- ---------------------------------------------------------------------------
drop function if exists public.distribute_challenge(uuid);

create or replace function public.distribute_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_open_disputes int;
  v_active int;
  v_winner uuid;
  v_pool numeric;
  v_share numeric;
  v_completers uuid[];
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.distributed_at is not null then
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if exists (select 1 from challenge_payouts where challenge_id = p_challenge_id) then
    update challenges
      set distributed_at = coalesce(distributed_at, now()), status = 'settled', updated_at = now()
      where id = p_challenge_id;
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if v_c.official_started_at is null then
    raise exception 'NOT_STARTED';
  end if;

  if v_c.end_mode = 'indefinite_lms' or v_c.is_unlimited = true then
    select count(*) into v_active from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null;
    if v_active <> 1 then
      raise exception 'LMS_NOT_FINISHED';
    end if;
  else
    if v_c.ends_at is null then
      raise exception 'NO_END_TIME';
    end if;
    if now() < v_c.ends_at + interval '1 hour' then
      raise exception 'COOLDOWN_ACTIVE';
    end if;
  end if;

  select count(*) into v_open_disputes from challenge_disputes
  where challenge_id = p_challenge_id and status = 'open';
  if v_open_disputes > 0 then
    raise exception 'OPEN_DISPUTES';
  end if;

  v_pool := coalesce(v_c.prize_pool, 0);
  if v_pool <= 0 then
    update challenges set distributed_at = now(), status = 'settled', updated_at = now() where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'paid', 0);
  end if;

  if v_c.prize_structure = 'solo_return' or (v_c.max_participants = 1) then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null
    limit 1;
    if v_winner is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'solo_forfeit', true);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
  elsif v_c.prize_structure = 'winner_take_all' then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and eliminated_at is null and status <> 'refunded_pre_start'
    order by points desc, days_completed desc, joined_at asc
    limit 1;
    if v_winner is null then raise exception 'NO_WINNER'; end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
  else
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id and status = 'completed' and eliminated_at is null;
    if v_completers is null or array_length(v_completers, 1) is null then
      select array_agg(user_id) into v_completers from challenge_participants
      where challenge_id = p_challenge_id and eliminated_at is null and status in ('active', 'completed', 'joined');
    end if;
    if v_completers is null or array_length(v_completers, 1) is null then
      raise exception 'NO_COMPLETERS';
    end if;
    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
      values (p_challenge_id, v_winner, v_c.currency, v_share, null, 'distribute_win')
      on conflict (challenge_id, user_id) do nothing;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
    end loop;
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'distributed_at', now());
end;
$$;

grant execute on function public.distribute_challenge(uuid) to authenticated;

notify pgrst, 'reload schema';
