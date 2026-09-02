-- Interests slice 1: child tables + RLS + Official Challenge DOB gate.
-- Do not store Interests on profiles (except three timestamps).
-- Follow-up safety pass: profiles RLS USING (true) is still world-readable.

alter table public.profiles
  add column if not exists interests_prompted_at timestamptz,
  add column if not exists interests_dismissed_home_at timestamptz,
  add column if not exists interests_skipped_all_at timestamptz;

comment on column public.profiles.interests_prompted_at is
  'When the person opened or finished the Interests wizard.';
comment on column public.profiles.interests_dismissed_home_at is
  'Home Interests sheet has been shown and dismissed (Set up or Skip for now).';
comment on column public.profiles.interests_skipped_all_at is
  'Skip for now from Home. Rooms stay incomplete. You-tab reminder stays on.';

create table if not exists public.interest_rooms (
  slug text primary key,
  title text not null,
  sort_order int not null,
  constraint interest_rooms_slug_check check (
    slug in (
      'health_fitness',
      'sports',
      'personal_development',
      'relationships',
      'esports',
      'outdoors'
    )
  )
);

create table if not exists public.interest_chips (
  id uuid primary key default gen_random_uuid(),
  room_slug text not null references public.interest_rooms (slug) on delete cascade,
  slug text not null,
  label text not null,
  sort_order int not null,
  allows_indoor_outdoor boolean not null default false,
  rating_kind text,
  qty_kind text,
  constraint interest_chips_room_slug_slug_key unique (room_slug, slug),
  constraint interest_chips_rating_kind_check check (
    rating_kind is null
    or rating_kind in ('dupr', 'utr', 'handicap', 'mmr')
  )
);

create table if not exists public.profile_interest_rooms (
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_slug text not null references public.interest_rooms (slug) on delete cascade,
  state text not null default 'incomplete',
  skipped_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, room_slug),
  constraint profile_interest_rooms_state_check check (
    state in ('incomplete', 'complete_empty', 'complete_filled')
  )
);

create table if not exists public.profile_interest_chips (
  user_id uuid not null references public.profiles (id) on delete cascade,
  chip_id uuid not null references public.interest_chips (id) on delete cascade,
  excel boolean not null default false,
  level_up boolean not null default false,
  rating_value numeric,
  rating_unknown boolean not null default false,
  current_qty numeric,
  goal_qty numeric,
  indoor_outdoor text,
  preferred_proof text,
  extras jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  pinned boolean not null default false,
  pin_rank int,
  updated_at timestamptz not null default now(),
  primary key (user_id, chip_id),
  constraint profile_interest_chips_stance_check check (excel or level_up),
  constraint profile_interest_chips_indoor_check check (
    indoor_outdoor is null or indoor_outdoor in ('indoor', 'outdoor', 'both')
  ),
  constraint profile_interest_chips_proof_check check (
    preferred_proof is null
    or preferred_proof in ('honor', 'photo', 'time', 'score', 'fitness_tracker')
  ),
  constraint profile_interest_chips_rating_unknown_check check (
    rating_unknown is false or rating_value is null
  ),
  constraint profile_interest_chips_pin_rank_check check (
    pin_rank is null or (pin_rank >= 1 and pin_rank <= 8)
  )
);

create table if not exists public.profile_work (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  occupation text not null,
  employer text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.interest_other_text (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  room_slug text not null references public.interest_rooms (slug) on delete cascade,
  raw_text text not null,
  normalized_slug text,
  created_at timestamptz not null default now(),
  constraint interest_other_text_user_room_key unique (user_id, room_slug)
);

create index if not exists profile_interest_rooms_user_idx
  on public.profile_interest_rooms (user_id);
create index if not exists profile_interest_chips_user_idx
  on public.profile_interest_chips (user_id);
create unique index if not exists profile_interest_chips_pin_rank_idx
  on public.profile_interest_chips (user_id, pin_rank)
  where pinned and pin_rank is not null;
create index if not exists profile_interest_chips_public_idx
  on public.profile_interest_chips (user_id)
  where is_public;

insert into public.interest_rooms (slug, title, sort_order) values
  ('health_fitness', 'Health & Fitness', 1),
  ('sports', 'Sports', 2),
  ('personal_development', 'Personal Development', 3),
  ('relationships', 'Relationships', 4),
  ('esports', 'eSports', 5),
  ('outdoors', 'Outdoors', 6)
on conflict (slug) do update set title = excluded.title, sort_order = excluded.sort_order;

insert into public.interest_chips (room_slug, slug, label, sort_order, allows_indoor_outdoor, rating_kind) values
  ('health_fitness', 'running', 'Running', 1, true, null),
  ('health_fitness', 'lifting', 'Lifting', 2, true, null),
  ('health_fitness', 'walking', 'Walking', 3, true, null),
  ('health_fitness', 'cycling', 'Cycling', 4, true, null),
  ('health_fitness', 'hiit', 'HIIT', 5, true, null),
  ('health_fitness', 'yoga', 'Yoga', 6, true, null),
  ('health_fitness', 'swimming', 'Swimming', 7, true, null),
  ('health_fitness', 'mobility', 'Mobility', 8, true, null),
  ('health_fitness', 'hyrox', 'Hyrox', 9, true, null),
  ('health_fitness', 'pilates', 'Pilates', 10, true, null),
  ('health_fitness', 'rowing', 'Rowing', 11, true, null),
  ('health_fitness', 'other', 'Other', 12, false, null),
  ('sports', 'pickleball', 'Pickleball', 1, true, 'dupr'),
  ('sports', 'tennis', 'Tennis', 2, true, 'utr'),
  ('sports', 'golf', 'Golf', 3, true, 'handicap'),
  ('sports', 'basketball', 'Basketball', 4, true, null),
  ('sports', 'soccer', 'Soccer', 5, true, null),
  ('sports', 'baseball', 'Baseball', 6, true, null),
  ('sports', 'volleyball', 'Volleyball', 7, true, null),
  ('sports', 'climbing', 'Climbing', 8, true, null),
  ('sports', 'martial_arts', 'Martial arts', 9, true, null),
  ('sports', 'hockey', 'Hockey', 10, true, null),
  ('sports', 'football', 'Football', 11, true, null),
  ('sports', 'other', 'Other', 12, false, null),
  ('personal_development', 'academics', 'Academics', 1, false, null),
  ('personal_development', 'fasting', 'Fasting', 2, false, null),
  ('personal_development', 'work', 'Work', 3, false, null),
  ('personal_development', 'meditation', 'Meditation', 4, false, null),
  ('personal_development', 'reading', 'Reading', 5, false, null),
  ('personal_development', 'languages', 'Languages', 6, false, null),
  ('personal_development', 'music', 'Music', 7, false, null),
  ('personal_development', 'writing', 'Writing', 8, false, null),
  ('personal_development', 'other', 'Other', 9, false, null),
  ('relationships', 'dating', 'Dating', 1, false, null),
  ('relationships', 'marriage', 'Marriage', 2, false, null),
  ('relationships', 'friendship', 'Friendship', 3, false, null),
  ('relationships', 'communication', 'Communication', 4, false, null),
  ('relationships', 'family', 'Family', 5, false, null),
  ('relationships', 'other', 'Other', 6, false, null),
  ('esports', 'league', 'League', 1, false, 'mmr'),
  ('esports', 'cs2', 'CS2', 2, false, 'mmr'),
  ('esports', 'valorant', 'Valorant', 3, false, 'mmr'),
  ('esports', 'dota_2', 'Dota 2', 4, false, 'mmr'),
  ('esports', 'mlbb', 'MLBB', 5, false, 'mmr'),
  ('esports', 'pubg_mobile', 'PUBG Mobile', 6, false, 'mmr'),
  ('esports', 'fortnite', 'Fortnite', 7, false, 'mmr'),
  ('esports', 'rocket_league', 'Rocket League', 8, false, 'mmr'),
  ('esports', 'apex', 'Apex', 9, false, 'mmr'),
  ('esports', 'cod', 'CoD', 10, false, 'mmr'),
  ('esports', 'ea_fc', 'EA FC', 11, false, 'mmr'),
  ('esports', 'nba_2k', 'NBA 2K', 12, false, 'mmr'),
  ('esports', 'sf_tekken', 'SF/Tekken', 13, false, 'mmr'),
  ('esports', 'smash', 'Smash', 14, false, 'mmr'),
  ('esports', 'starcraft_ii', 'StarCraft II', 15, false, 'mmr'),
  ('esports', 'free_fire', 'Free Fire', 16, false, 'mmr'),
  ('esports', 'other', 'Other', 17, false, null),
  ('outdoors', 'hiking', 'Hiking', 1, false, null),
  ('outdoors', 'camping', 'Camping', 2, false, null),
  ('outdoors', 'fishing', 'Fishing', 3, false, null),
  ('outdoors', 'hunting', 'Hunting', 4, false, null),
  ('outdoors', 'trail_running', 'Trail running', 5, false, null),
  ('outdoors', 'kayaking', 'Kayaking', 6, false, null),
  ('outdoors', 'skiing', 'Skiing', 7, false, null),
  ('outdoors', 'snowboarding', 'Snowboarding', 8, false, null),
  ('outdoors', 'gardening', 'Gardening', 9, false, null),
  ('outdoors', 'other', 'Other', 10, false, null)
on conflict (room_slug, slug) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  allows_indoor_outdoor = excluded.allows_indoor_outdoor,
  rating_kind = excluded.rating_kind;

create or replace function public.profile_interest_pin_cap()
returns trigger
language plpgsql
as $$
begin
  if new.pinned then
    if (
      select count(*)::int
      from public.profile_interest_chips
      where user_id = new.user_id
        and pinned
        and chip_id is distinct from new.chip_id
    ) >= 8 then
      raise exception 'PIN_CAP';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profile_interest_chips_pin_cap on public.profile_interest_chips;
create trigger profile_interest_chips_pin_cap
  before insert or update of pinned, pin_rank on public.profile_interest_chips
  for each row
  execute function public.profile_interest_pin_cap();

create or replace function public.profile_interest_chip_catalog_guard()
returns trigger
language plpgsql
as $$
declare
  v_allows boolean;
begin
  select allows_indoor_outdoor into v_allows
  from public.interest_chips
  where id = new.chip_id;
  if new.indoor_outdoor is not null and not coalesce(v_allows, false) then
    raise exception 'INDOOR_OUTDOOR_NOT_ALLOWED';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_interest_chips_catalog_guard on public.profile_interest_chips;
create trigger profile_interest_chips_catalog_guard
  before insert or update of indoor_outdoor, chip_id on public.profile_interest_chips
  for each row
  execute function public.profile_interest_chip_catalog_guard();

alter table public.interest_rooms enable row level security;
alter table public.interest_chips enable row level security;
alter table public.profile_interest_rooms enable row level security;
alter table public.profile_interest_chips enable row level security;
alter table public.profile_work enable row level security;
alter table public.interest_other_text enable row level security;

drop policy if exists interest_rooms_read on public.interest_rooms;
create policy interest_rooms_read on public.interest_rooms
  for select to anon, authenticated using (true);

drop policy if exists interest_chips_read on public.interest_chips;
create policy interest_chips_read on public.interest_chips
  for select to anon, authenticated using (true);

drop policy if exists profile_interest_rooms_owner on public.profile_interest_rooms;
create policy profile_interest_rooms_owner on public.profile_interest_rooms
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists profile_interest_chips_owner on public.profile_interest_chips;
create policy profile_interest_chips_owner on public.profile_interest_chips
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Other users may read public chips only. Ratings / extras stay on the row;
-- clients should use profile_interest_chips_public. Pin/public default off.
drop policy if exists profile_interest_chips_public_read on public.profile_interest_chips;
create policy profile_interest_chips_public_read on public.profile_interest_chips
  for select to anon, authenticated
  using (is_public);

drop policy if exists profile_work_owner on public.profile_work;
create policy profile_work_owner on public.profile_work
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists interest_other_text_owner on public.interest_other_text;
create policy interest_other_text_owner on public.interest_other_text
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace view public.profile_interest_chips_public
with (security_invoker = true) as
select user_id, chip_id, excel, level_up, is_public, pinned, pin_rank
from public.profile_interest_chips
where is_public;

grant select on public.interest_rooms to anon, authenticated;
grant select on public.interest_chips to anon, authenticated;
grant select on public.profile_interest_chips_public to anon, authenticated;

grant select, insert, update, delete on public.profile_interest_rooms to authenticated;
grant select, insert, update, delete on public.profile_interest_chips to authenticated;
grant select, insert, update, delete on public.profile_work to authenticated;
grant select, insert, update, delete on public.interest_other_text to authenticated;

-- Anon: public chips only (SELECT). No write on work, rooms, extras, or chips.
grant select on public.profile_interest_chips to anon;
revoke insert, update, delete on public.profile_interest_chips from anon;
revoke all on public.profile_work from anon;
revoke all on public.profile_interest_rooms from anon;
revoke all on public.interest_other_text from anon;

create or replace function public.official_dob_status(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'DOB_REQUIRED'
    when p_uid is distinct from auth.uid() then 'DOB_REQUIRED'
    when p.id is null then 'DOB_REQUIRED'
    when p.date_of_birth is null then 'DOB_REQUIRED'
    when p.date_of_birth > (current_date - interval '18 years') then 'UNDERAGE'
    else 'ok'
  end
  from (select p_uid as id) q
  left join public.profiles p on p.id = q.id;
$$;

revoke all on function public.official_dob_status(uuid) from public, anon;
grant execute on function public.official_dob_status(uuid) to authenticated;

create or replace function public.notify_interests_skipped()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tone text;
  v_title text;
  v_body text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  select case
    when coalesce(motivation_tone, encouragement_tone, '') = 'honest' then 'honest'
    else 'gentle'
  end
  into v_tone
  from public.profiles
  where id = v_uid;

  if v_tone = 'honest' then
    v_title := 'Interests are still open on You.';
    v_body := 'You skipped for now. Finish them on You when you are ready.';
  else
    v_title := 'Your interests are waiting on You.';
    v_body := 'No rush. Open You whenever you want to finish.';
  end if;

  return public.insert_notification(
    v_uid,
    'interests_reminder',
    v_title,
    v_body,
    jsonb_build_object('dedupe_key', 'interests:skip', 'href', '/profile/interests'),
    null
  );
end;
$$;

revoke all on function public.notify_interests_skipped() from public, anon;
grant execute on function public.notify_interests_skipped() to authenticated;

alter table public.notifications drop constraint if exists notifications_type_known;
alter table public.notifications add constraint notifications_type_known check (type in (
  'challenge_invite',
  'challenge_new',
  'tagged',
  'mentioned',
  'profile_wall',
  'challenge_joined',
  'challenge_join_confirmed',
  'follow',
  'friend_request',
  'friend_accepted',
  'friend_challenge',
  'post_comment',
  'post_reaction',
  'post_reposted',
  'story_reaction',
  'story_comment',
  'story_shared',
  'coins_received',
  'coin_grant',
  'challenge_settled',
  'challenge_placed',
  'challenge_eliminated',
  'challenge_starting',
  'challenge_checkin_reminder',
  'challenge_checkin',
  'competitor_dropped',
  'challenge_won',
  'challenge_lost',
  'payout_received',
  'profile_incomplete',
  'interests_reminder',
  'callout_received',
  'callout_accepted',
  'callout_resolved',
  'callout_disputed',
  'callout_cancelled',
  'callout_observer_invited',
  'badge_unlocked',
  'challenge_cancelled',
  'message',
  'official_started',
  'proof_flagged',
  'start_rolled',
  'bob_encouragement',
  'circle_invite',
  'circle_invite_accepted',
  'circle_join',
  'circle_post',
  'circle_challenge_share'
));

-- Official Challenge DOB gate (all Official Challenges). Body-metrics gate stays.
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
  v_dob text;
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

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) then
    v_dob := public.official_dob_status(v_uid);
    if v_dob = 'DOB_REQUIRED' then
      raise exception 'DOB_REQUIRED';
    end if;
    if v_dob = 'UNDERAGE' then
      raise exception 'UNDERAGE';
    end if;
  end if;

  if public.requires_official_body_metrics(v_c) then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
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
