-- One Board score (days + points) and write-time proof uniqueness.
-- Same proof may score one weekly AND one monthly. Never two weeklies or two monthlies.
-- hidden_from_home is a post flag only — it does not change days_completed or points.
-- Honor-only rows must not stamp Official selfie + HR.

create or replace function public.proof_uniqueness_family(ch public.challenges)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(coalesce((ch).frequency, '')) in ('monthly', 'month') then 'monthly'
    when lower(coalesce((ch).series_id, '')) like '%month%' then 'monthly'
    when lower(coalesce((ch).length_unit, '')) like 'month%' then 'monthly'
    when coalesce((ch).duration_days, 0) >= 28
      and lower(coalesce((ch).frequency, '')) not in ('daily', 'weekly', 'week')
      then 'monthly'
    else 'weekly'
  end;
$$;

create or replace function public.proof_object_key(p_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(nullif(btrim(p_url), ''), '') = '' then ''
    when position('/storage/v1/object/public/' in lower(split_part(split_part(p_url, '?', 1), '#', 1))) > 0 then
      substr(
        split_part(split_part(p_url, '?', 1), '#', 1),
        position('/storage/v1/object/public/' in lower(split_part(split_part(p_url, '?', 1), '#', 1)))
          + char_length('/storage/v1/object/public/')
      )
    when position('/storage/v1/object/sign/' in lower(split_part(split_part(p_url, '?', 1), '#', 1))) > 0 then
      substr(
        split_part(split_part(p_url, '?', 1), '#', 1),
        position('/storage/v1/object/sign/' in lower(split_part(split_part(p_url, '?', 1), '#', 1)))
          + char_length('/storage/v1/object/sign/')
      )
    else lower(split_part(split_part(p_url, '?', 1), '#', 1))
  end;
$$;

create or replace function public.challenge_proofs_honor_only(ch public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select case
    when coalesce(jsonb_typeof((ch).proofs), '') = 'array'
      and jsonb_array_length(coalesce((ch).proofs, '[]'::jsonb)) > 0 then
      not exists (
        select 1
        from jsonb_array_elements((ch).proofs) e
        where lower(coalesce(e->>'method', '')) not in ('honor', '')
      )
    else lower(coalesce((ch).proof_type, 'honor')) = 'honor'
  end;
$$;

create or replace function public.challenge_board_days(p_challenge_id uuid, p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if coalesce(ch.is_official, false) then
    begin
      return public.official_valid_day_count(p_challenge_id, p_user_id);
    exception when others then
      null;
    end;
  end if;
  -- Unique qualifying periods with required proof. Never join posts / hidden_from_home.
  v_days := public.submitted_checkin_count(p_challenge_id, p_user_id);
  return greatest(coalesce(v_days, 0), 0);
end;
$$;

create or replace function public.challenge_board_points(p_challenge_id uuid, p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_points numeric := 0;
  v_checkins numeric := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if coalesce(ch.is_official, false) then
    return public.challenge_board_days(p_challenge_id, p_user_id);
  end if;
  select coalesce(p.points, 0) into v_points
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id and p.user_id = p_user_id;
  v_checkins := public.submitted_checkin_count(p_challenge_id, p_user_id);
  if coalesce(ch.scoring_method, '') = 'comparable_points' then
    return coalesce(v_points, 0);
  end if;
  -- Daily Prayer and other simple points: 1 per proven submitted check-in.
  if lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
     or lower(coalesce(ch.format, '')) in ('points', 'cumulative') then
    return coalesce(v_checkins, 0);
  end if;
  return 0;
end;
$$;

-- Single rank number the Board and settlement both read.
create or replace function public.challenge_board_score(p_challenge_id uuid, p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
     or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
     or coalesce(ch.scoring_method, '') = 'comparable_points' then
    return public.challenge_board_points(p_challenge_id, p_user_id);
  end if;
  return public.challenge_board_days(p_challenge_id, p_user_id);
end;
$$;

create or replace function public.settlement_board_score(p_challenge_id uuid, p_user_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.challenge_board_score(p_challenge_id, p_user_id);
$$;

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
  v_points numeric := 0;
  v_target int := 1;
  v_span int := 1;
  v_allow int := 0;
  v_comparable boolean := false;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;

  v_days := public.challenge_board_days(p_challenge_id, p_user_id);
  v_comparable := coalesce(ch.scoring_method, '') = 'comparable_points';
  v_points := public.challenge_board_points(p_challenge_id, p_user_id);

  if lower(coalesce(ch.challenge_type, 'consistency')) = 'points'
     or lower(coalesce(ch.format, '')) = 'points' then
    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    v_span := greatest(
      coalesce(ch.duration_days, ch.days_required, ch.target_count, 1),
      1
    );
    v_allow := greatest(coalesce(ch.misses_allowed, 0), 0);
    v_target := greatest(v_span - v_allow, 1);
  end if;

  update public.challenge_participants
    set days_completed = v_days,
        points = case
          when v_comparable then points
          when lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
            or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
            then v_points
          else points
        end,
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

create or replace function public.proof_token_from_part(p_part jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(distinct t)
      from (
        select public.proof_object_key(p_part->>'url') as t
        union all
        select public.proof_object_key(u)
        from jsonb_array_elements_text(coalesce(p_part->'urls', '[]'::jsonb)) u
        union all
        select nullif(btrim(coalesce(p_part->>'contentHash', p_part->>'content_hash')), '')
        union all
        select case
          when coalesce(nullif(btrim(coalesce(p_part->>'healthWorkoutId', p_part->>'health_workout_id')), ''), '') <> ''
            then 'health:' || btrim(coalesce(p_part->>'healthWorkoutId', p_part->>'health_workout_id'))
          else ''
        end
      ) s
      where coalesce(t, '') <> ''
    ),
    '{}'::text[]
  );
$$;

create table if not exists public.checkin_proof_locks (
  user_id uuid not null,
  family text not null,
  token text not null,
  checkin_id uuid not null references public.challenge_checkins(id) on delete cascade,
  challenge_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, family, token)
);

alter table public.checkin_proof_locks enable row level security;
revoke all on table public.checkin_proof_locks from public, anon, authenticated;

create or replace function public.assert_checkin_proofs_unique(p_row public.challenge_checkins)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_family text;
  v_tokens text[] := '{}';
  v_part jsonb;
  v_url text;
  v_token text;
  v_other_title text;
begin
  if p_row.user_id is null or p_row.challenge_id is null then
    return;
  end if;

  select * into ch from public.challenges where id = p_row.challenge_id;
  if not found then
    return;
  end if;
  if public.challenge_proofs_honor_only(ch) then
    delete from public.checkin_proof_locks where checkin_id = p_row.id;
    return;
  end if;

  v_family := public.proof_uniqueness_family(ch);

  if coalesce(p_row.health_workout_id::text, '') <> '' then
    v_tokens := v_tokens || ('health:' || p_row.health_workout_id::text);
  end if;
  foreach v_url in array array[
    p_row.pre_selfie_url,
    p_row.post_selfie_url,
    p_row.hr_monitor_url
  ]
  loop
    v_token := public.proof_object_key(v_url);
    if v_token <> '' then
      v_tokens := v_tokens || v_token;
    end if;
  end loop;

  for v_part in
    select value from jsonb_each(coalesce(p_row.proof_parts, '{}'::jsonb))
  loop
    v_tokens := v_tokens || public.proof_token_from_part(v_part);
  end loop;

  select coalesce(array_agg(distinct x), '{}')
    into v_tokens
  from unnest(v_tokens) x
  where coalesce(x, '') <> '';

  delete from public.checkin_proof_locks
  where checkin_id = p_row.id
    and not (token = any (v_tokens));

  if coalesce(array_length(v_tokens, 1), 0) = 0 then
    return;
  end if;

  foreach v_token in array v_tokens
  loop
    begin
      insert into public.checkin_proof_locks (user_id, family, token, checkin_id, challenge_id)
      values (p_row.user_id, v_family, v_token, p_row.id, p_row.challenge_id)
      on conflict (user_id, family, token) do update
        set checkin_id = excluded.checkin_id,
            challenge_id = excluded.challenge_id
      where public.checkin_proof_locks.checkin_id = p_row.id;
      if not found then
        select coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''), 'another challenge')
          into v_other_title
        from public.checkin_proof_locks l
        join public.challenges c on c.id = l.challenge_id
        where l.user_id = p_row.user_id
          and l.family = v_family
          and l.token = v_token
        limit 1;
        raise exception 'PROOF_ALREADY_COUNTS:%', coalesce(v_other_title, 'another challenge')
          using errcode = 'P0001';
      end if;
    exception
      when unique_violation then
        select coalesce(nullif(btrim(c.title), ''), nullif(btrim(c.task), ''), 'another challenge')
          into v_other_title
        from public.checkin_proof_locks l
        join public.challenges c on c.id = l.challenge_id
        where l.user_id = p_row.user_id
          and l.family = v_family
          and l.token = v_token
        limit 1;
        raise exception 'PROOF_ALREADY_COUNTS:%', coalesce(v_other_title, 'another challenge')
          using errcode = 'P0001';
    end;
  end loop;
end;
$$;

create or replace function public.trg_assert_checkin_proofs_unique()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_checkin_proofs_unique(new);
  return new;
end;
$$;

drop trigger if exists challenge_checkins_proof_unique on public.challenge_checkins;
create trigger challenge_checkins_proof_unique
  before insert or update of proof_parts, health_workout_id, pre_selfie_url, post_selfie_url, hr_monitor_url
  on public.challenge_checkins
  for each row execute function public.trg_assert_checkin_proofs_unique();

create or replace function public.trg_honor_no_official_stamp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = new.challenge_id;
  if found and public.challenge_proofs_honor_only(ch) then
    new.pre_selfie_url := null;
    new.post_selfie_url := null;
    new.hr_monitor_url := null;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_checkins_honor_no_official_stamp on public.challenge_checkins;
create trigger challenge_checkins_honor_no_official_stamp
  before insert or update of proof_parts, pre_selfie_url, post_selfie_url, hr_monitor_url
  on public.challenge_checkins
  for each row execute function public.trg_honor_no_official_stamp();

revoke all on function public.proof_uniqueness_family(public.challenges) from public, anon;
revoke all on function public.proof_object_key(text) from public, anon;
revoke all on function public.challenge_proofs_honor_only(public.challenges) from public, anon;
revoke all on function public.challenge_board_days(uuid, uuid) from public, anon;
revoke all on function public.challenge_board_points(uuid, uuid) from public, anon;
revoke all on function public.challenge_board_score(uuid, uuid) from public, anon;
revoke all on function public.assert_checkin_proofs_unique(public.challenge_checkins) from public, anon;
revoke all on function public.proof_token_from_part(jsonb) from public, anon;

grant execute on function public.proof_uniqueness_family(public.challenges) to authenticated, service_role;
grant execute on function public.proof_object_key(text) to authenticated, service_role;
grant execute on function public.challenge_proofs_honor_only(public.challenges) to authenticated, service_role;
grant execute on function public.challenge_board_days(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_board_points(uuid, uuid) to authenticated, service_role;
grant execute on function public.challenge_board_score(uuid, uuid) to authenticated, service_role;
grant execute on function public.settlement_board_score(uuid, uuid) to authenticated, service_role;
grant execute on function public.refresh_participant_progress(uuid, uuid) to authenticated, service_role;
