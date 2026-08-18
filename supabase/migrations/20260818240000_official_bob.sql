-- Official Bob account. Server-enforced.
-- Client may show a mark from profiles.is_official. Username is not a privilege.

alter table public.profiles
  add column if not exists is_official boolean not null default false;

comment on column public.profiles.is_official is
  'Server-enforced official account. Client display only. Do not grant powers from username.';

create unique index if not exists profiles_one_official_idx
  on public.profiles (is_official)
  where is_official;

-- Public projection includes the official mark. New columns appended at the end
-- so CREATE OR REPLACE VIEW stays valid.
drop function if exists public.search_people(text);
drop view if exists public.profiles_public;

create view public.profiles_public
with (security_invoker = true) as
select
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.skill_tags,
  p.primary_activities,
  false as show_fitness_stats_publicly,
  p.created_at,
  null::numeric as height_cm,
  null::numeric as current_weight,
  null::numeric as goal_weight,
  null::text as weight_unit,
  null::integer as typical_weekly_workout_frequency,
  p.is_official
from public.profiles p;

comment on view public.profiles_public is
  'Public profile projection. Body metrics stay private. is_official is a display flag.';

grant select on public.profiles_public to anon, authenticated;

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

grant select (
  id, username, display_name, avatar_url, bio,
  primary_activities, skill_tags,
  show_fitness_stats_publicly, created_at, updated_at, is_official
) on public.profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Seed Bob LeBlob / @blob from the known email, else existing @blob.
-- ---------------------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  select p.id into v_id
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = 'danielpadraic@gmail.com'
  limit 1;

  if v_id is null then
    select id into v_id
    from public.profiles
    where lower(username) = 'blob'
    limit 1;
  end if;

  if v_id is null then
    return;
  end if;

  update public.profiles
  set username = 'blob_' || substr(replace(id::text, '-', ''), 1, 10)
  where lower(username) = 'blob'
    and id <> v_id;

  update public.profiles
  set
    username = 'blob',
    display_name = 'Bob LeBlob',
    is_official = true
  where id = v_id;
end $$;

-- If the official account signs up after this migration, mark them on insert.
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

-- Clients cannot flip the official flag.
create or replace function public.protect_profiles_is_official()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if NEW.is_official is distinct from OLD.is_official then
    raise exception 'That flag is locked' using errcode = '42501';
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_is_official on public.profiles;
create trigger profiles_protect_is_official
  before update on public.profiles
  for each row execute function public.protect_profiles_is_official();

-- ---------------------------------------------------------------------------
-- Friendships: official ↔ every user is accepted. Columns used:
-- user_a_id, user_b_id, status, requested_by, created_at, accepted_at
-- ---------------------------------------------------------------------------
create or replace function public.official_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where is_official limit 1;
$$;

create or replace function public.sync_official_friendships(p_official uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_official is null then
    return;
  end if;

  insert into public.friendships (
    user_a_id, user_b_id, status, requested_by, created_at, accepted_at
  )
  select
    least(p.id, p_official),
    greatest(p.id, p_official),
    'accepted',
    p_official,
    now(),
    now()
  from public.profiles p
  where p.id <> p_official
  on conflict (user_a_id, user_b_id) do update
    set status = 'accepted',
        accepted_at = coalesce(public.friendships.accepted_at, excluded.accepted_at);
end;
$$;

create or replace function public.trg_friend_official_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official uuid;
begin
  if NEW.is_official then
    perform public.sync_official_friendships(NEW.id);
    return NEW;
  end if;

  v_official := public.official_profile_id();
  if v_official is null or v_official = NEW.id then
    return NEW;
  end if;

  insert into public.friendships (
    user_a_id, user_b_id, status, requested_by, created_at, accepted_at
  )
  values (
    least(NEW.id, v_official),
    greatest(NEW.id, v_official),
    'accepted',
    v_official,
    now(),
    now()
  )
  on conflict (user_a_id, user_b_id) do update
    set status = 'accepted',
        accepted_at = coalesce(public.friendships.accepted_at, excluded.accepted_at);

  return NEW;
end;
$$;

drop trigger if exists profiles_friend_official on public.profiles;
create trigger profiles_friend_official
  after insert or update of is_official on public.profiles
  for each row execute function public.trg_friend_official_account();

create or replace function public.protect_official_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official uuid := public.official_profile_id();
begin
  if v_official is null then
    if TG_OP = 'DELETE' then
      return OLD;
    end if;
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    if OLD.user_a_id = v_official or OLD.user_b_id = v_official then
      raise exception 'You can’t unfriend the official account' using errcode = 'P0001';
    end if;
    return OLD;
  end if;

  if NEW.user_a_id = v_official or NEW.user_b_id = v_official then
    if TG_OP = 'INSERT' and NEW.status is distinct from 'accepted' then
      raise exception 'You’re already friends with the official account' using errcode = 'P0001';
    end if;
    if TG_OP = 'UPDATE' and NEW.status is distinct from 'accepted' then
      raise exception 'You can’t block the official account' using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists friendships_protect_official on public.friendships;
create trigger friendships_protect_official
  before insert or update or delete on public.friendships
  for each row execute function public.protect_official_friendship();

drop policy if exists "Users request friendships as themselves" on public.friendships;
create policy "Users request friendships as themselves"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a_id or auth.uid() = user_b_id)
    and status = 'pending'
    and not exists (
      select 1 from public.profiles p
      where p.id in (user_a_id, user_b_id) and p.is_official
    )
  );

drop policy if exists "Users update own friendships" on public.friendships;
create policy "Users update own friendships"
  on public.friendships for update
  to authenticated
  using (
    (auth.uid() = user_a_id or auth.uid() = user_b_id)
    and not exists (
      select 1 from public.profiles p
      where p.id in (user_a_id, user_b_id) and p.is_official
    )
  )
  with check (
    auth.uid() = user_a_id or auth.uid() = user_b_id
  );

drop policy if exists "Users delete own friendships" on public.friendships;
create policy "Users delete own friendships"
  on public.friendships for delete
  to authenticated
  using (
    (auth.uid() = user_a_id or auth.uid() = user_b_id)
    and not exists (
      select 1 from public.profiles p
      where p.id in (user_a_id, user_b_id) and p.is_official
    )
  );

drop policy if exists "Users insert own mutes" on public.mutes;
create policy "Users insert own mutes"
  on public.mutes for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and user_id <> muted_user_id
    and not exists (
      select 1 from public.profiles p
      where p.id = muted_user_id and p.is_official
    )
  );

-- Backfill accepted official friendships for existing profiles.
-- Clear any prior mutes of the official account.
do $$
begin
  delete from public.mutes m
  using public.profiles p
  where m.muted_user_id = p.id
    and p.is_official;
  perform public.sync_official_friendships(public.official_profile_id());
end $$;

revoke all on function public.official_profile_id() from public, anon, authenticated;
revoke all on function public.sync_official_friendships(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Coins: official sender does not debit. Recipient credit is real.
-- ---------------------------------------------------------------------------
create or replace function public.wallet_debit(p_user uuid, p_currency text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_currency text;
  v_amount numeric(12,2);
  v_balance numeric(12,2);
  v_official boolean;
begin
  v_currency := public.normalize_wallet_currency(p_currency);
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount <= 0 then
    return;
  end if;
  if p_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform 1 from public.profiles where id = p_user for update;

  select coalesce(is_official, false) into v_official from public.profiles where id = p_user;
  if v_official and v_currency = 'coins' then
    return;
  end if;

  if v_currency = 'bucks' then
    select bucks into v_balance from public.profiles where id = p_user;
    if v_balance is null then
      raise exception 'Finish setting up your profile before you spend Bucks' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient bucks' using errcode = 'P0001';
    end if;
    update public.profiles set bucks = bucks - v_amount where id = p_user;
  else
    select coins into v_balance from public.profiles where id = p_user;
    if v_balance is null then
      raise exception 'Finish setting up your profile before you spend Coins' using errcode = 'P0001';
    end if;
    if v_balance < v_amount then
      raise exception 'Insufficient credits' using errcode = 'P0001';
    end if;
    update public.profiles set coins = coins - v_amount where id = p_user;
  end if;
end;
$$;

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

  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
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

  if v_balance is null then
    raise exception 'Finish setting up your profile before you send Coins' using errcode = 'P0001';
  end if;

  if not v_official then
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
      user_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    )
    values (
      p_to_user_id,
      'coins',
      v_amount,
      'credit',
      'official_send',
      jsonb_build_object('sender_id', v_sender, 'transfer_id', v_transfer.id),
      'coin_transfer',
      v_transfer.id::text
    );
  end if;

  return v_transfer;
end;
$$;

comment on function public.send_coins(uuid, numeric, text) is
  'Send Coins to another profile. Official senders skip debit and the 10k cap. Recipient credit is real. Always writes coin_transfers.';

create or replace function public.transfer_funds(
  p_recipient_id uuid,
  p_amount numeric,
  p_currency text default 'coins'
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
  v_currency text;
  v_transfer public.coin_transfers%rowtype;
  v_noun text;
  v_official boolean;
begin
  v_sender := auth.uid();
  if v_sender is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_recipient_id is null then
    raise exception 'Pick someone to send to' using errcode = 'P0001';
  end if;

  if p_recipient_id = v_sender then
    raise exception 'You can’t send to yourself' using errcode = 'P0001';
  end if;

  v_currency := public.normalize_wallet_currency(p_currency);
  v_noun := case when v_currency = 'bucks' then 'Bucks' else 'Coins' end;
  v_amount := round(coalesce(p_amount, 0), 2);
  if v_amount < 0.01 then
    raise exception 'Send at least 0.01' using errcode = 'P0001';
  end if;

  select coalesce(is_official, false) into v_official
  from public.profiles
  where id = v_sender;

  if not (v_official and v_currency = 'coins') then
    if v_amount > 10000 then
      raise exception 'Keep a transfer at 10,000 or less' using errcode = 'P0001';
    end if;
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

  perform public.wallet_debit(v_sender, v_currency, v_amount);
  perform public.wallet_credit(p_recipient_id, v_currency, v_amount);

  insert into public.coin_transfers (sender_id, recipient_id, amount, currency)
  values (v_sender, p_recipient_id, v_amount, v_currency)
  returning * into v_transfer;

  return v_transfer;
end;
$$;
