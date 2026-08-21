-- Admin Pulse + app_errors. Official (is_official / is_admin) only.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create or replace function public.is_official_viewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (coalesce(is_official, false) or coalesce(is_admin, false))
  );
$$;

revoke all on function public.is_official_viewer() from public;
grant execute on function public.is_official_viewer() to authenticated;

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  route text,
  code text,
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_errors_created_at_idx on public.app_errors (created_at desc);
create index if not exists app_errors_code_idx on public.app_errors (code, created_at desc);

alter table public.app_errors enable row level security;

drop policy if exists "Users insert own app errors" on public.app_errors;
create policy "Users insert own app errors"
  on public.app_errors for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Official read app errors" on public.app_errors;
create policy "Official read app errors"
  on public.app_errors for select
  to authenticated
  using (public.is_official_viewer());

grant insert, select on public.app_errors to authenticated;

create table if not exists public.app_opens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists app_opens_created_at_idx on public.app_opens (created_at desc);
create index if not exists app_opens_user_created_idx on public.app_opens (user_id, created_at desc);

alter table public.app_opens enable row level security;

drop policy if exists "Users insert own app opens" on public.app_opens;
create policy "Users insert own app opens"
  on public.app_opens for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Official read app opens" on public.app_opens;
create policy "Official read app opens"
  on public.app_opens for select
  to authenticated
  using (public.is_official_viewer());

grant insert, select on public.app_opens to authenticated;

create or replace function public.ping_app_open()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if exists (
    select 1
    from public.app_opens
    where user_id = v_uid
      and created_at > now() - interval '1 hour'
  ) then
    return;
  end if;
  insert into public.app_opens (user_id) values (v_uid);
end;
$$;

revoke all on function public.ping_app_open() from public;
grant execute on function public.ping_app_open() to authenticated;

create or replace function public.admin_range_start(p_range text)
returns timestamptz
language sql
stable
as $$
  select case
    when p_range = '7d' then timezone('America/Chicago', ((timezone('America/Chicago', now()))::date - 6)::timestamp)
    else timezone('America/Chicago', (timezone('America/Chicago', now()))::date::timestamp)
  end;
$$;

create or replace function public.admin_pulse(p_range text default 'today')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_now timestamptz := now();
  v_accounts int := 0;
  v_dau int := 0;
  v_joins int := 0;
  v_checkins int := 0;
  v_filling int := 0;
  v_live int := 0;
  v_errors int := 0;
begin
  if not public.is_official_viewer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_start := public.admin_range_start(coalesce(nullif(p_range, ''), 'today'));

  select count(*) into v_accounts
  from public.profiles
  where created_at >= v_start;

  select count(distinct uid) into v_dau
  from (
    select user_id as uid from public.app_opens where created_at >= v_start
    union
    select author_id from public.posts where created_at >= v_start and author_id is not null
    union
    select author_id from public.comments where created_at >= v_start and author_id is not null
    union
    select user_id from public.challenge_checkins
    where coalesce(submitted_at, created_at) >= v_start
      and status = 'submitted'
  ) activity;

  select count(*) into v_joins
  from public.challenge_participants
  where coalesce(joined_at, now()) >= v_start
    and coalesce(status, 'joined') is distinct from 'refunded_pre_start';

  select count(*) into v_checkins
  from public.challenge_checkins
  where status = 'submitted'
    and coalesce(submitted_at, created_at) >= v_start;

  select count(*) into v_filling
  from public.challenges
  where coalesce(is_official, false)
    and status = 'filling';

  select count(*) into v_live
  from public.challenges
  where coalesce(is_official, false)
    and status = 'live';

  select count(*) into v_errors
  from public.app_errors
  where created_at >= v_now - interval '24 hours';

  return jsonb_build_object(
    'range', coalesce(nullif(p_range, ''), 'today'),
    'start', v_start,
    'accounts', v_accounts,
    'dau', v_dau,
    'joins', v_joins,
    'checkins', v_checkins,
    'filling', v_filling,
    'live', v_live,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.admin_pulse(text) from public;
grant execute on function public.admin_pulse(text) to authenticated;

create or replace function public.admin_pulse_list(p_metric text, p_range text default 'today')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.is_official_viewer() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_start := public.admin_range_start(coalesce(nullif(p_range, ''), 'today'));

  if p_metric = 'accounts' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select p.id as user_id, p.username, p.display_name, p.created_at as at
      from public.profiles p
      where p.created_at >= v_start
      order by p.created_at desc
      limit 200
    ) x;
  elsif p_metric = 'dau' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select p.id as user_id, p.username, p.display_name, max(a.at) as at
      from (
        select user_id as uid, created_at as at from public.app_opens where created_at >= v_start
        union all
        select author_id, created_at from public.posts where created_at >= v_start and author_id is not null
        union all
        select author_id, created_at from public.comments where created_at >= v_start and author_id is not null
        union all
        select user_id, coalesce(submitted_at, created_at)
        from public.challenge_checkins
        where coalesce(submitted_at, created_at) >= v_start and status = 'submitted'
      ) a
      join public.profiles p on p.id = a.uid
      group by p.id, p.username, p.display_name
      order by max(a.at) desc
      limit 200
    ) x;
  elsif p_metric = 'joins' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select
        cp.user_id,
        p.username,
        p.display_name,
        c.id as challenge_id,
        c.title,
        coalesce(cp.joined_at, now()) as at
      from public.challenge_participants cp
      join public.challenges c on c.id = cp.challenge_id
      left join public.profiles p on p.id = cp.user_id
      where coalesce(cp.joined_at, now()) >= v_start
        and coalesce(cp.status, 'joined') is distinct from 'refunded_pre_start'
      order by coalesce(cp.joined_at, now()) desc
      limit 200
    ) x;
  elsif p_metric = 'checkins' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select
        ck.user_id,
        p.username,
        p.display_name,
        c.id as challenge_id,
        c.title,
        coalesce(ck.submitted_at, ck.created_at) as at
      from public.challenge_checkins ck
      join public.challenges c on c.id = ck.challenge_id
      left join public.profiles p on p.id = ck.user_id
      where ck.status = 'submitted'
        and coalesce(ck.submitted_at, ck.created_at) >= v_start
      order by coalesce(ck.submitted_at, ck.created_at) desc
      limit 200
    ) x;
  elsif p_metric = 'filling' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select c.id as challenge_id, c.title, c.status, c.starts_at as at
      from public.challenges c
      where coalesce(c.is_official, false) and c.status = 'filling'
      order by c.starts_at asc nulls last
      limit 200
    ) x;
  elsif p_metric = 'live' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select c.id as challenge_id, c.title, c.status, c.starts_at as at
      from public.challenges c
      where coalesce(c.is_official, false) and c.status = 'live'
      order by c.starts_at desc nulls last
      limit 200
    ) x;
  elsif p_metric = 'errors' then
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) into v_rows
    from (
      select
        e.id,
        e.user_id,
        p.username,
        p.display_name,
        e.code,
        e.route,
        e.message,
        e.created_at as at
      from public.app_errors e
      left join public.profiles p on p.id = e.user_id
      where e.created_at >= now() - interval '24 hours'
      order by e.created_at desc
      limit 200
    ) x;
  else
    v_rows := '[]'::jsonb;
  end if;

  return v_rows;
end;
$$;

revoke all on function public.admin_pulse_list(text, text) from public;
grant execute on function public.admin_pulse_list(text, text) to authenticated;

notify pgrst, 'reload schema';
