-- Restores server functions the app calls but the live database does not have.
--
-- Each of these shipped in an older migration that never reached production. The app calls them, so
-- today they return PGRST202 / 404: push tokens never register (push_tokens has 0 rows), people
-- search falls back to a client-side scan, Health workout check-in shows "couldn't attach", and
-- story shares/comments have nowhere to land.
--
-- This file only ADDS what is missing. It deliberately does NOT re-run the whole of
-- 20260818180000_native_notifications.sql or 20260818280000_challenge_discoverability.sql, because
-- those files would overwrite 16 functions that have been improved since -- including join_challenge,
-- send_push_to_user, insert_notification and the notify triggers -- and roll them back weeks.

-- ============ push token registration + profile gate + challenge access reason ============
create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(btrim(p_token)) < 10 then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (btrim(p_token), v_uid, nullif(btrim(coalesce(p_platform, '')), ''), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = coalesce(excluded.platform, public.push_tokens.platform),
        updated_at = now();
end;
$$;
grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.clear_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.push_tokens
  where token = btrim(p_token)
    and user_id = auth.uid();
end;
$$;
grant execute on function public.clear_push_token(text) to authenticated;

create or replace function public.notify_my_profile_gate(p_missing text default 'physical details')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_missing text := coalesce(nullif(btrim(p_missing), ''), 'physical details');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return public.insert_notification(
    v_uid,
    'profile_incomplete',
    'Add ' || v_missing || ' to continue.',
    null,
    jsonb_build_object('dedupe_key', 'gate:' || v_missing, 'href', '/profile/body-metrics'),
    null
  );
end;
$$;
grant execute on function public.notify_my_profile_gate(text) to authenticated;

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

-- ============ people search ============
-- Exact email/phone people search without exposing those fields.
-- Email and phone are matched exactly (never partial). Name/username stay ilike.

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

  -- Exact email. Never ilike.
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

  -- Exact phone (10+ digits). Compare digit-only forms. Never partial.
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

-- ============ Health workout check-in ============
-- Apple Health workouts as optional challenge proof.
-- Health evidence uses workout_submissions (same table as camera). No second proof system.
-- NOTIFY pgrst reloads PostgREST's schema cache so clients stop seeing PGRST204.

create table if not exists public.health_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider),
  constraint health_connections_provider_check check (provider = 'apple_health'),
  constraint health_connections_status_check check (status in ('connected', 'disconnected'))
);

create table if not exists public.health_workouts (
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
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_workout_id),
  constraint health_workouts_provider_check check (provider = 'apple_health'),
  constraint health_workouts_confidence_check check (confidence in ('watch', 'phone', 'manual', 'unknown')),
  constraint health_workouts_duration_check check (duration_sec >= 0)
);

comment on table public.health_connections is 'Owner-only Apple Health connection flag. Disconnect stops future reads; existing proofs stay.';
comment on table public.health_workouts is 'Owner-only workout summaries used as challenge proof. No HR time series.';
comment on column public.health_workouts.raw_summary is 'Small summary only. Never store heart-rate samples.';

create index if not exists health_connections_user_idx
  on public.health_connections (user_id);
create index if not exists health_workouts_user_started_idx
  on public.health_workouts (user_id, started_at desc);

alter table public.workout_submissions
  add column if not exists proof_kind text;

alter table public.workout_submissions
  add column if not exists health_workout_id uuid references public.health_workouts(id);

comment on column public.workout_submissions.proof_kind is
  'camera | health_workout | existing values. Null camera rows stay valid.';
comment on column public.workout_submissions.health_workout_id is
  'Optional Health workout used as this day’s proof. Readable with the submission.';

alter table public.health_connections enable row level security;
alter table public.health_workouts enable row level security;

drop policy if exists "Owners manage their health connections" on public.health_connections;
create policy "Owners manage their health connections"
  on public.health_connections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Owners manage their health workouts" on public.health_workouts;
create policy "Owners manage their health workouts"
  on public.health_workouts
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.health_connections to authenticated;
grant select, insert, update, delete on public.health_workouts to authenticated;

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

notify pgrst, 'reload schema';

-- ============ story comments / reactions / share notify ============
-- Wave clips (15s segments) + reactions, comments, share notify.
-- Safe to re-run. Route/table names stay stories. User-facing name is Wave.

alter table public.stories
  add column if not exists sequence_id uuid,
  add column if not exists sequence_index integer not null default 0,
  add column if not exists clip_start_ms integer not null default 0,
  add column if not exists clip_duration_ms integer;

create index if not exists stories_sequence_id_idx
  on public.stories (sequence_id, sequence_index)
  where sequence_id is not null;

create table if not exists public.story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'love', 'fire', 'strong')),
  created_at timestamptz not null default now(),
  unique (story_id, user_id, reaction_type)
);

create index if not exists story_reactions_story_id_idx
  on public.story_reactions (story_id, created_at desc);

create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists story_comments_story_id_idx
  on public.story_comments (story_id, created_at);

alter table public.story_reactions enable row level security;
alter table public.story_comments enable row level security;

drop policy if exists "Wave reactions are readable" on public.story_reactions;
create policy "Wave reactions are readable"
  on public.story_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.expires_at > now() or s.user_id = auth.uid())
    )
  );

drop policy if exists "Users react to Waves" on public.story_reactions;
create policy "Users react to Waves"
  on public.story_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own Wave reactions" on public.story_reactions;
create policy "Users remove own Wave reactions"
  on public.story_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Wave comments are readable" on public.story_comments;
create policy "Wave comments are readable"
  on public.story_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.expires_at > now() or s.user_id = auth.uid())
    )
  );

drop policy if exists "Users comment on Waves" on public.story_comments;
create policy "Users comment on Waves"
  on public.story_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert, delete on public.story_reactions to authenticated;
grant select, insert on public.story_comments to authenticated;

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
exception when others then
  null;
end $$;

do $$
begin
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
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked',
    'challenge_cancelled',
    'message',
    'official_started',
    'proof_flagged'
  ));
exception when others then
  null;
end $$;

create or replace function public.trg_notify_story_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  select user_id into v_author from public.stories where id = new.story_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_author,
    new.user_id,
    'story_reaction',
    v_name || ' reacted to your Wave.',
    null,
    jsonb_build_object('story_id', new.story_id, 'reaction_type', new.reaction_type)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists story_reactions_notify on public.story_reactions;
create trigger story_reactions_notify
  after insert on public.story_reactions
  for each row execute function public.trg_notify_story_reaction();

create or replace function public.trg_notify_story_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  select user_id into v_author from public.stories where id = new.story_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_author,
    new.user_id,
    'story_comment',
    v_name || ' commented on your Wave.',
    left(trim(new.body), 140),
    jsonb_build_object('story_id', new.story_id, 'comment_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists story_comments_notify on public.story_comments;
create trigger story_comments_notify
  after insert on public.story_comments
  for each row execute function public.trg_notify_story_comment();

create or replace function public.notify_story_shared(p_story_id uuid, p_recipient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  if auth.uid() is null or p_story_id is null then
    return;
  end if;
  select user_id into v_author from public.stories where id = p_story_id;
  if v_author is null or v_author = auth.uid() then
    return;
  end if;
  v_name := public.profile_display_name(auth.uid());
  perform public.notify_user(
    v_author,
    auth.uid(),
    'story_shared',
    v_name || ' shared your Wave to a DM.',
    null,
    jsonb_build_object('story_id', p_story_id, 'recipient_id', p_recipient_id)
  );
exception when others then
  return;
end;
$$;

grant execute on function public.notify_story_shared(uuid, uuid) to authenticated;
