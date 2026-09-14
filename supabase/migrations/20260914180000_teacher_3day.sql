-- Slice B: account spine + 3-Day teacher Official.
-- Per-user instance, personal 72h clock, one Challenge Credit (not cash, not coins).
-- Does not GRANT write_coin_ledger to authenticated.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists challenge_credit_granted_at timestamptz,
  add column if not exists challenge_credit_cents integer,
  add column if not exists teacher_camera_ready_at timestamptz,
  add column if not exists teacher_hr_source text;

alter table public.profiles drop constraint if exists profiles_teacher_hr_source_check;
alter table public.profiles
  add constraint profiles_teacher_hr_source_check
  check (teacher_hr_source is null or teacher_hr_source in ('health', 'upload'));

comment on column public.profiles.phone is
  'PRIVATE. Read via get_my_profile(). Never on the public profile.';
comment on column public.profiles.declared_region is
  'PRIVATE USPS 2-letter + DC + PR. Label: Home state. Used to show Challenges you can enter. Never on the public profile.';
comment on column public.profiles.challenge_credit_granted_at is
  'When the one 3-Day teacher Challenge Credit was granted. Unique per user.';
comment on column public.profiles.challenge_credit_cents is
  'Ledger-only Challenge Credit amount (1000). Not cash. Not coins. Not bucks.';
comment on column public.profiles.teacher_camera_ready_at is
  '3-Day Begin: in-app camera preview or capture permission succeeded.';
comment on column public.profiles.teacher_hr_source is
  '3-Day Begin HR source: health (Watch/Health) or upload (attach from app).';

create unique index if not exists profiles_challenge_credit_once_idx
  on public.profiles (id)
  where challenge_credit_granted_at is not null;

alter table public.challenges
  add column if not exists is_teacher_3day boolean not null default false,
  add column if not exists teacher_kind text;

alter table public.challenges drop constraint if exists challenges_teacher_kind_check;
alter table public.challenges
  add constraint challenges_teacher_kind_check
  check (teacher_kind is null or teacher_kind in ('template', 'instance'));

comment on column public.challenges.is_teacher_3day is
  'Official 3-Day Consistency teacher. Instances are per-user. Not Home-public.';
comment on column public.challenges.teacher_kind is
  'template = seed row. instance = one user attempt.';

create unique index if not exists challenges_one_teacher_3day_template_idx
  on public.challenges ((true))
  where is_teacher_3day and teacher_kind = 'template';

alter table public.challenge_participants
  add column if not exists began_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists attempt_no integer;

comment on column public.challenge_participants.began_at is
  'Personal clock start for the 3-Day teacher. periodKey uses this, not UTC midnight.';
comment on column public.challenge_participants.ends_at is
  'began_at + 72 hours for a 3-Day teacher attempt.';
comment on column public.challenge_participants.attempt_no is
  'Teacher attempt number for this user. Set only on 3-Day rows.';

alter table public.challenge_participants drop constraint if exists challenge_participants_status_check;
alter table public.challenge_participants
  add constraint challenge_participants_status_check
  check (status in (
    'active', 'completed', 'eliminated', 'refunded_pre_start', 'joined', 'pending', 'missed'
  ));

create unique index if not exists teacher_one_active_attempt_idx
  on public.challenge_participants (user_id)
  where attempt_no is not null
    and status in ('joined', 'active', 'pending');

create table if not exists public.teacher_credit_phones (
  phone_digits text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now()
);

comment on table public.teacher_credit_phones is
  'One 3-Day Challenge Credit per phone number when a phone is present.';

alter table public.teacher_credit_phones enable row level security;
revoke all on table public.teacher_credit_phones from public, anon, authenticated;

create or replace function public.teacher_phone_digits(p_phone text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
$$;

create or replace function public.teacher_3day_template_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.challenges
  where is_teacher_3day
    and teacher_kind = 'template'
  limit 1;
$$;

create or replace function public.teacher_period_key(
  p_began_at timestamptz,
  p_day integer,
  p_tz text
)
returns date
language plpgsql
stable
set search_path = public
as $$
declare
  v_tz text := nullif(btrim(coalesce(p_tz, '')), '');
  v_start timestamptz;
begin
  if p_began_at is null or p_day is null or p_day < 1 or p_day > 3 then
    return null;
  end if;
  if v_tz is null then
    v_tz := 'America/Denver';
  end if;
  v_start := p_began_at + make_interval(hours => (p_day - 1) * 24);
  return ((v_start at time zone v_tz)::date);
end;
$$;

create or replace function public.teacher_hr_parts_ok(p_parts jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_hr jsonb;
  v_health jsonb;
  v_name text;
  v_type text;
  v_has_clock boolean;
  v_has_hr boolean;
  v_calories_only boolean;
begin
  if p_parts is null then
    return false;
  end if;
  v_hr := coalesce(p_parts->'heart_rate', p_parts->'hr', p_parts->'hr_monitor');
  if v_hr is null or v_hr = 'null'::jsonb then
    return false;
  end if;
  if coalesce(nullif(v_hr->>'url', ''), '') = ''
     and coalesce(nullif(v_hr->>'healthWorkoutId', ''), nullif(v_hr->>'health_workout_id', ''), '') = ''
     and v_hr->'health' is null
  then
    return false;
  end if;
  v_health := v_hr->'health';
  if v_health is null or v_health = 'null'::jsonb then
    -- File attached; OCR may fill later. Count the slot if a file exists.
    return coalesce(nullif(v_hr->>'url', ''), '') <> '';
  end if;
  v_name := lower(coalesce(v_health->>'sourceName', '') || ' ' || coalesce(v_health->>'activityType', ''));
  v_type := lower(coalesce(v_health->>'activityType', ''));
  if v_name ~ 'ring|rings|move ring|exercise ring|stand ring|weekly' then
    return false;
  end if;
  v_has_clock := coalesce(nullif(v_health->>'startedAt', ''), '') <> ''
    or coalesce(nullif(v_health->>'endedAt', ''), '') <> '';
  v_has_hr := coalesce((v_health->>'avgHrBpm')::numeric, 0) > 0
    or jsonb_typeof(v_health->'hrSeries') = 'array';
  v_calories_only := coalesce((v_health->>'activeEnergyKcal')::numeric, 0) > 0
    or coalesce((v_health->>'totalEnergyKcal')::numeric, 0) > 0;
  if v_calories_only and not v_has_hr then
    return false;
  end if;
  if v_has_hr and not v_has_clock then
    return false;
  end if;
  return v_has_clock and v_has_hr;
end;
$$;

create or replace function public.teacher_photo_parts_ok(p_parts jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(nullif(coalesce(p_parts->'checkin_photo', p_parts->'photo')->>'url', ''), '') <> '';
$$;

create or replace function public.teacher_period_complete(
  p_user_id uuid,
  p_challenge_id uuid,
  p_period_key date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.challenge_checkins c
    where c.user_id = p_user_id
      and c.challenge_id = p_challenge_id
      and c.period_key = p_period_key
      and c.status = 'submitted'
      and public.teacher_photo_parts_ok(c.proof_parts)
      and public.teacher_hr_parts_ok(c.proof_parts)
  );
$$;

create or replace function public.grant_teacher_credit(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_digits text;
begin
  if p_user_id is null then
    return false;
  end if;
  if exists (
    select 1 from public.profiles
    where id = p_user_id
      and challenge_credit_granted_at is not null
  ) then
    return false;
  end if;

  select phone into v_phone from public.profiles where id = p_user_id;
  v_digits := public.teacher_phone_digits(v_phone);
  if v_digits is not null and length(v_digits) >= 10 then
    if exists (
      select 1 from public.teacher_credit_phones where phone_digits = v_digits
    ) then
      return false;
    end if;
    insert into public.teacher_credit_phones (phone_digits, user_id)
    values (v_digits, p_user_id);
  end if;

  update public.profiles
  set
    challenge_credit_granted_at = now(),
    challenge_credit_cents = 1000
  where id = p_user_id
    and challenge_credit_granted_at is null;

  return found;
end;
$$;

revoke all on function public.grant_teacher_credit(uuid) from public, anon, authenticated;

create or replace function public.teacher_bob_live_post(
  p_user_id uuid,
  p_challenge_id uuid,
  p_kind text,
  p_day integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_tone text;
  v_title text;
  v_body text;
  v_id uuid;
  v_key text;
begin
  v_host := public.official_series_host_id();
  if v_host is null or p_user_id is null or p_challenge_id is null then
    return null;
  end if;
  select title into v_title from public.challenges where id = p_challenge_id;
  if v_title is null then
    v_title := '3-Day Consistency';
  end if;
  select case
    when coalesce(nullif(encouragement_tone, ''), 'gentle') = 'honest' then 'honest'
    else 'gentle'
  end into v_tone
  from public.profiles
  where id = p_user_id;

  if p_kind = 'miss' then
    v_key := 'teacher-miss:' || p_challenge_id::text;
    if v_tone = 'honest' then
      v_body := v_title || ' needed a check-in in that window. Start over when you are ready.';
    else
      v_body := v_title || ' missed a required day. Start over when you want.';
    end if;
  else
    v_key := 'teacher-checkin:' || p_challenge_id::text || ':' || coalesce(p_day, 0)::text;
    if v_tone = 'honest' then
      v_body := v_title || ': day ' || coalesce(p_day, 1)::text || ' counted.';
    else
      v_body := 'Day ' || coalesce(p_day, 1)::text || ' is in on ' || v_title || '.';
    end if;
  end if;

  if exists (
    select 1 from public.posts
    where challenge_id = p_challenge_id
      and author_id = v_host
      and system_key = v_key
  ) then
    return null;
  end if;

  insert into public.posts (
    author_id,
    challenge_id,
    content,
    source,
    hidden_from_home,
    audience,
    system_key
  ) values (
    v_host,
    p_challenge_id,
    v_body,
    'challenge',
    true,
    'only_me',
    v_key
  )
  returning id into v_id;
  return v_id;
exception
  when others then
    return null;
end;
$$;

revoke all on function public.teacher_bob_live_post(uuid, uuid, text, integer) from public, anon, authenticated;

create or replace function public.teacher_mark_attempt(
  p_user_id uuid,
  p_challenge_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenge_participants
  set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    eliminated_at = case when p_status = 'missed' then now() else eliminated_at end
  where user_id = p_user_id
    and challenge_id = p_challenge_id
    and status in ('joined', 'active', 'pending');

  if p_status in ('missed', 'completed') then
    update public.challenges
    set
      status = 'ended',
      updated_at = now()
    where id = p_challenge_id
      and is_teacher_3day
      and teacher_kind = 'instance'
      and status = 'live';
  end if;
end;
$$;

create or replace function public.evaluate_teacher_3day(p_user_id uuid, p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_day integer;
  v_key date;
  v_complete integer := 0;
  v_missed boolean := false;
  v_now timestamptz := now();
  v_window_end timestamptz;
  v_current_day integer := 1;
begin
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found or not coalesce(v_c.is_teacher_3day, false) then
    return jsonb_build_object('phase', 'none');
  end if;
  select * into v_p
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = p_user_id;
  if not found or v_p.began_at is null then
    return jsonb_build_object('phase', 'none');
  end if;

  for v_day in 1..3 loop
    v_key := public.teacher_period_key(v_p.began_at, v_day, v_c.timezone);
    v_window_end := v_p.began_at + make_interval(hours => v_day * 24);
    if public.teacher_period_complete(p_user_id, p_challenge_id, v_key) then
      v_complete := v_complete + 1;
    elsif v_now >= v_window_end then
      v_missed := true;
    end if;
    if v_now >= v_p.began_at + make_interval(hours => (v_day - 1) * 24)
       and v_now < v_window_end then
      v_current_day := v_day;
    end if;
  end loop;

  if v_complete >= 3 then
    perform public.teacher_mark_attempt(p_user_id, p_challenge_id, 'completed');
    perform public.grant_teacher_credit(p_user_id);
    return jsonb_build_object(
      'phase', 'done',
      'challenge_id', p_challenge_id,
      'day_n', 3,
      'completed_days', 3,
      'began_at', v_p.began_at,
      'ends_at', v_p.ends_at,
      'credit_granted', true,
      'credit_cents', 1000
    );
  end if;

  if v_missed or v_now >= coalesce(v_p.ends_at, v_p.began_at + interval '72 hours') then
    if v_p.status in ('joined', 'active', 'pending') then
      perform public.teacher_mark_attempt(p_user_id, p_challenge_id, 'missed');
      perform public.teacher_bob_live_post(p_user_id, p_challenge_id, 'miss', v_current_day);
    end if;
    return jsonb_build_object(
      'phase', 'missed',
      'challenge_id', p_challenge_id,
      'day_n', v_current_day,
      'completed_days', v_complete,
      'began_at', v_p.began_at,
      'ends_at', v_p.ends_at,
      'credit_granted', false
    );
  end if;

  if v_p.status in ('joined', 'pending') then
    update public.challenge_participants
    set status = 'active'
    where id = v_p.id
      and status in ('joined', 'pending');
  end if;

  return jsonb_build_object(
    'phase', 'live',
    'challenge_id', p_challenge_id,
    'day_n', v_current_day,
    'completed_days', v_complete,
    'began_at', v_p.began_at,
    'ends_at', v_p.ends_at,
    'credit_granted', false
  );
end;
$$;

create or replace function public.teacher_3day_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row record;
  v_eval jsonb;
  v_credit timestamptz;
  v_cents integer;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select challenge_credit_granted_at, challenge_credit_cents
  into v_credit, v_cents
  from public.profiles
  where id = v_uid;

  select p.challenge_id, p.status, p.began_at, p.ends_at, p.attempt_no, c.title
  into v_row
  from public.challenge_participants p
  join public.challenges c on c.id = p.challenge_id
  where p.user_id = v_uid
    and c.is_teacher_3day
    and c.teacher_kind = 'instance'
  order by
    case
      when p.status in ('joined', 'active', 'pending') then 0
      when p.status = 'missed' then 1
      when p.status = 'completed' then 2
      else 3
    end,
    p.began_at desc nulls last
  limit 1;

  if v_row.challenge_id is not null and v_row.status in ('joined', 'active', 'pending', 'missed', 'completed') then
    v_eval := public.evaluate_teacher_3day(v_uid, v_row.challenge_id);
    if v_eval is not null and v_eval->>'phase' <> 'none' then
      if v_credit is not null then
        v_eval := v_eval || jsonb_build_object(
          'credit_granted', true,
          'credit_cents', coalesce(v_cents, 1000)
        );
      end if;
      return v_eval;
    end if;
  end if;

  if v_credit is not null then
    return jsonb_build_object(
      'phase', 'done',
      'credit_granted', true,
      'credit_cents', coalesce(v_cents, 1000)
    );
  end if;

  return jsonb_build_object('phase', 'none', 'credit_granted', false);
end;
$$;

grant execute on function public.teacher_3day_state() to authenticated;

create or replace function public.set_teacher_prep(
  p_camera_ready boolean,
  p_hr_source text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_source text := nullif(btrim(coalesce(p_hr_source, '')), '');
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if v_source is not null and v_source not in ('health', 'upload') then
    raise exception 'INVALID_HR_SOURCE';
  end if;
  update public.profiles
  set
    teacher_camera_ready_at = case
      when p_camera_ready then coalesce(teacher_camera_ready_at, now())
      else teacher_camera_ready_at
    end,
    teacher_hr_source = coalesce(v_source, teacher_hr_source)
  where id = v_uid;
end;
$$;

grant execute on function public.set_teacher_prep(boolean, text) to authenticated;

create or replace function public.begin_teacher_3day(p_restart boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
  v_template public.challenges%rowtype;
  v_profile public.profiles%rowtype;
  v_dob date;
  v_age integer;
  v_region text;
  v_phone text;
  v_active uuid;
  v_attempt integer := 1;
  v_id uuid;
  v_now timestamptz := now();
  v_end timestamptz;
  v_tz text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_REQUIRED';
  end if;

  v_dob := v_profile.date_of_birth;
  if v_dob is null then
    raise exception 'DOB_REQUIRED';
  end if;
  v_age := extract(year from age(current_date, v_dob))::int;
  if v_age < 18 then
    raise exception 'UNDERAGE';
  end if;

  v_region := public.geo_normalize_region(coalesce(v_profile.declared_region, v_profile.home_state));
  if v_region is null or length(v_region) <> 2 then
    raise exception 'REGION_REQUIRED';
  end if;

  v_phone := public.teacher_phone_digits(v_profile.phone);
  if v_phone is null or length(v_phone) < 10 then
    raise exception 'PHONE_REQUIRED';
  end if;

  if v_profile.teacher_camera_ready_at is null then
    raise exception 'CAMERA_REQUIRED';
  end if;
  if v_profile.teacher_hr_source is null then
    raise exception 'HR_SOURCE_REQUIRED';
  end if;

  if v_profile.challenge_credit_granted_at is not null and not p_restart then
    raise exception 'CREDIT_ALREADY_GRANTED';
  end if;

  select p.challenge_id into v_active
  from public.challenge_participants p
  join public.challenges c on c.id = p.challenge_id
  where p.user_id = v_uid
    and c.is_teacher_3day
    and c.teacher_kind = 'instance'
    and p.status in ('joined', 'active', 'pending')
  limit 1;

  if v_active is not null then
    if p_restart then
      perform public.teacher_mark_attempt(v_uid, v_active, 'missed');
    else
      return public.evaluate_teacher_3day(v_uid, v_active);
    end if;
  elsif p_restart then
    select p.challenge_id into v_active
    from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
    where p.user_id = v_uid
      and c.is_teacher_3day
      and c.teacher_kind = 'instance'
      and p.status = 'missed'
    order by p.began_at desc nulls last
    limit 1;
    if v_active is not null then
      perform public.teacher_mark_attempt(v_uid, v_active, 'missed');
    end if;
  end if;

  select coalesce(max(p.attempt_no), 0) + 1 into v_attempt
  from public.challenge_participants p
  join public.challenges c on c.id = p.challenge_id
  where p.user_id = v_uid
    and c.is_teacher_3day;

  select * into v_template
  from public.challenges
  where is_teacher_3day
    and teacher_kind = 'template'
  limit 1;
  if not found then
    raise exception 'TEACHER_TEMPLATE_MISSING';
  end if;

  v_host := public.official_series_host_id();
  v_end := v_now + interval '72 hours';
  v_tz := coalesce(nullif(btrim(v_template.timezone), ''), 'America/Denver');

  insert into public.challenges (
    title,
    description,
    rules,
    is_official,
    is_teacher_3day,
    teacher_kind,
    created_by,
    buy_in_amount,
    days_required,
    min_minutes,
    proof_requirements,
    proofs,
    proof_type,
    status,
    starts_at,
    ends_at,
    visibility,
    privacy_mode,
    category,
    challenge_type,
    format,
    currency,
    challenge_lane,
    prize_pool,
    host_budget,
    host_funded,
    creator_contribution,
    max_participants,
    min_participants,
    is_unlimited,
    frequency,
    target_count,
    duration_days,
    length_value,
    length_unit,
    misses_allowed,
    timezone,
    scoring_method,
    creator_participating,
    discoverability
  ) values (
    v_template.title,
    v_template.description,
    v_template.rules,
    true,
    true,
    'instance',
    v_host,
    0,
    3,
    0,
    v_template.proof_requirements,
    v_template.proofs,
    v_template.proof_type,
    'live',
    v_now,
    v_end,
    'invite',
    'private_corporate',
    'fitness',
    'consistency',
    'consistency',
    'coins',
    'official',
    0,
    0,
    false,
    0,
    1,
    1,
    false,
    'daily',
    3,
    3,
    3,
    'days',
    0,
    v_tz,
    'consistency',
    false,
    'hidden'
  )
  returning id into v_id;

  insert into public.challenge_participants (
    challenge_id,
    user_id,
    status,
    joined_at,
    began_at,
    ends_at,
    attempt_no,
    currency,
    buy_in_paid
  ) values (
    v_id,
    v_uid,
    'active',
    v_now,
    v_now,
    v_end,
    v_attempt,
    'coins',
    0
  );

  return jsonb_build_object(
    'phase', 'live',
    'challenge_id', v_id,
    'day_n', 1,
    'completed_days', 0,
    'began_at', v_now,
    'ends_at', v_end,
    'credit_granted', false
  );
end;
$$;

grant execute on function public.begin_teacher_3day(boolean) to authenticated;

create or replace function public.teacher_on_checkin_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p public.challenge_participants%rowtype;
  v_day integer;
  v_key date;
begin
  if new.status is distinct from 'submitted' then
    return new;
  end if;
  select * into v_c from public.challenges where id = new.challenge_id;
  if not found or not coalesce(v_c.is_teacher_3day, false) or v_c.teacher_kind is distinct from 'instance' then
    return new;
  end if;
  select * into v_p
  from public.challenge_participants
  where challenge_id = new.challenge_id
    and user_id = new.user_id;
  if not found or v_p.began_at is null then
    return new;
  end if;
  if not public.teacher_photo_parts_ok(new.proof_parts)
     or not public.teacher_hr_parts_ok(new.proof_parts) then
    return new;
  end if;
  for v_day in 1..3 loop
    v_key := public.teacher_period_key(v_p.began_at, v_day, v_c.timezone);
    if v_key = new.period_key then
      perform public.teacher_bob_live_post(new.user_id, new.challenge_id, 'checkin', v_day);
      exit;
    end if;
  end loop;
  perform public.evaluate_teacher_3day(new.user_id, new.challenge_id);
  return new;
end;
$$;

drop trigger if exists trg_teacher_on_checkin_submitted on public.challenge_checkins;
create trigger trg_teacher_on_checkin_submitted
after insert or update of status, proof_parts, period_key
on public.challenge_checkins
for each row
execute function public.teacher_on_checkin_submitted();

-- Seed the one Official teacher template. Not joinable. Not Home-public.
do $$
declare
  v_host uuid;
  v_proofs jsonb := '[
    {"id":"checkin_photo","name":"Check-in photo","method":"photo"},
    {"id":"heart_rate","name":"Heart rate","method":"hr"}
  ]'::jsonb;
  v_reqs jsonb := '[
    {"type":"photo","required":true},
    {"type":"hr","required":true}
  ]'::jsonb;
begin
  v_host := public.official_series_host_id();
  if exists (
    select 1 from public.challenges
    where is_teacher_3day and teacher_kind = 'template'
  ) then
    update public.challenges
    set
      title = '3-Day Consistency',
      description = 'Three days. You vs you. Photo and heart rate each day.',
      rules = 'Check in each 24 hours from the moment you begin. Photo + heart rate with date, time, and graph or average. Misses allowed: 0.',
      proofs = v_proofs,
      proof_requirements = v_reqs,
      is_official = true,
      visibility = 'unlisted',
      privacy_mode = 'private_corporate',
      buy_in_amount = 0,
      prize_pool = 0,
      host_budget = 0,
      days_required = 3,
      duration_days = 3,
      length_value = 3,
      length_unit = 'days',
      misses_allowed = 0,
      min_minutes = 0,
      frequency = 'daily',
      target_count = 3,
      max_participants = 1,
      min_participants = 1,
      updated_at = now()
    where is_teacher_3day and teacher_kind = 'template';
    return;
  end if;

  insert into public.challenges (
    title,
    description,
    rules,
    is_official,
    is_teacher_3day,
    teacher_kind,
    created_by,
    buy_in_amount,
    days_required,
    min_minutes,
    proof_requirements,
    proofs,
    proof_type,
    status,
    visibility,
    privacy_mode,
    category,
    challenge_type,
    format,
    currency,
    challenge_lane,
    prize_pool,
    host_budget,
    host_funded,
    creator_contribution,
    max_participants,
    min_participants,
    is_unlimited,
    frequency,
    target_count,
    duration_days,
    length_value,
    length_unit,
    misses_allowed,
    timezone,
    scoring_method,
    creator_participating,
    discoverability
  ) values (
    '3-Day Consistency',
    'Three days. You vs you. Photo and heart rate each day.',
    'Check in each 24 hours from the moment you begin. Photo + heart rate with date, time, and graph or average. Misses allowed: 0.',
    true,
    true,
    'template',
    v_host,
    0,
    3,
    0,
    v_reqs,
    v_proofs,
    'photo',
    'upcoming',
    'unlisted',
    'private_corporate',
    'fitness',
    'consistency',
    'consistency',
    'coins',
    'official',
    0,
    0,
    false,
    0,
    1,
    1,
    false,
    'daily',
    3,
    3,
    3,
    'days',
    0,
    'America/Denver',
    'consistency',
    false,
    'hidden'
  );
end;
$$;

-- Hide teacher instances from Official discover lists.
create or replace function public.list_official_joinable()
returns setof public.challenges
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  return query
  select c.*
  from public.challenges c
  where c.is_official
    and c.series_id is not null
    and coalesce(c.is_teacher_3day, false) = false
    and c.status in ('filling', 'arming')
    and (
      v_uid is null
      or not exists (
        select 1 from public.challenge_participants p
        where p.challenge_id = c.id and p.user_id = v_uid
      )
    )
    and (
      v_uid is null
      or public.challenge_available_in_jurisdiction(c.id, v_uid)
    )
  order by c.created_at asc;
end;
$$;

grant execute on function public.list_official_joinable() to authenticated, anon;

-- Own-row writes for account spine + 3-Day prep. Public profile never selects these.
grant update (
  phone,
  date_of_birth,
  declared_region,
  home_state,
  teacher_camera_ready_at,
  teacher_hr_source
) on table public.profiles to authenticated;

revoke all on function public.write_coin_ledger(uuid, numeric, text) from public, anon, authenticated;
revoke all on function public.evaluate_teacher_3day(uuid, uuid) from public, anon, authenticated;
revoke all on function public.teacher_mark_attempt(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.teacher_period_complete(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.teacher_hr_parts_ok(jsonb) from public, anon, authenticated;
revoke all on function public.teacher_photo_parts_ok(jsonb) from public, anon, authenticated;
revoke all on function public.teacher_period_key(timestamptz, integer, text) from public, anon, authenticated;
revoke all on function public.teacher_3day_template_id() from public, anon, authenticated;
revoke execute on function public.begin_teacher_3day(boolean) from public, anon;
revoke execute on function public.set_teacher_prep(boolean, text) from public, anon;
revoke execute on function public.teacher_3day_state() from public, anon;
