-- House visibility for the locked @blob session.
-- Paste in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.
--
-- Pulse / wallets: GRANT EXECUTE to authenticated only after these RPCs
-- return early unless is_official_ops(). REVOKE anon. Stay revoked:
-- write_coin_ledger, tick_settlements, settle_ended_challenge, credit_wallet_top_up.
-- Do not restore admin_mass_join / internal.admin_mass_join_challenge.
--
-- Lobby: official ops can SELECT every challenge (private, corporate, ended)
-- plus participants, check-ins, and lobby posts. No wallet UPDATE except
-- through existing RPCs.

-- ---------------------------------------------------------------------------
-- Tight House gate: locked @blob id OR live username=blob row, and that
-- same uid is is_official or is_admin. Not every Official-looking Creator.
-- ---------------------------------------------------------------------------

create or replace function public.official_ops_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id
  from public.profiles p
  where lower(btrim(p.username)) = 'blob'
    and coalesce(p.is_official, false) = true
  order by p.created_at asc nulls last, p.id
  limit 1;
$$;

create or replace function public.is_official_ops()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = '81dfe427-d413-4c60-bd4a-e710c95077ad'::uuid
      or auth.uid() = public.official_ops_user_id()
    )
    and exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and (
          coalesce(p.is_official, false)
          or coalesce(p.is_admin, false)
        )
    );
$$;

revoke all on function public.official_ops_user_id() from public, anon, authenticated;
grant execute on function public.official_ops_user_id() to service_role;

revoke all on function public.is_official_ops() from public, anon;
grant execute on function public.is_official_ops() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- user_can_access_challenge: House may read every challenge id
-- ---------------------------------------------------------------------------

create or replace function public.user_can_access_challenge(p_challenge_id uuid, p_user_id uuid)
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

  if public.is_official_ops() then
    return true;
  end if;

  if p_user_id is not null
     and (
       p_user_id = public.official_ops_user_id()
       or p_user_id = '81dfe427-d413-4c60-bd4a-e710c95077ad'::uuid
     ) then
    return true;
  end if;

  if coalesce(v_c.is_official, false) then
    return true;
  end if;

  if p_user_id is not null and v_c.created_by = p_user_id then
    return true;
  end if;

  if p_user_id is not null and exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;

  if lower(coalesce(v_c.visibility, 'public')) in ('public', 'unlisted')
     and lower(coalesce(v_c.challenge_lane, 'coins')) <> 'private' then
    return true;
  end if;

  if p_user_id is null then
    return false;
  end if;

  if exists (
    select 1 from public.challenge_invites
    where challenge_id = p_challenge_id
      and status in ('pending', 'accepted')
      and invitee_id = p_user_id
  ) then
    return true;
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if public.is_invite_only_challenge(v_c)
     and coalesce(v_c.discoverability, '') = 'friends_of_friends'
     and v_c.created_by is not null
     and public.are_accepted_friends(v_c.created_by, p_user_id) then
    return true;
  end if;

  if coalesce(v_c.is_callout, false)
     and public.is_callout_challenge_observer(p_challenge_id, p_user_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.user_can_access_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.user_can_access_challenge(p_challenge_id, auth.uid());
$$;

grant execute on function public.user_can_access_challenge(uuid, uuid) to authenticated, anon;
grant execute on function public.user_can_access_challenge(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- can_read_post: House can open Live / Board posts in any lobby
-- ---------------------------------------------------------------------------

create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_official_ops()
    or auth.uid() is not distinct from p_author_id
    or (
      not public.friendship_is_blocked(auth.uid(), p_author_id)
      and p_audience is distinct from 'only_me'
      and (
        p_audience = 'public'
        or exists (
          select 1
          from public.profiles pr
          where pr.id = p_author_id
            and coalesce(pr.is_official, false)
        )
        or (
          p_audience = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.friendships f
            where f.status = 'accepted'
              and f.user_a_id = least(auth.uid(), p_author_id)
              and f.user_b_id = greatest(auth.uid(), p_author_id)
          )
        )
        or (
          p_audience in ('specific', 'people')
          and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and exists (
            select 1
            from public.challenge_participants cp
            where cp.challenge_id = p_challenge_id
              and cp.user_id = auth.uid()
          )
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and public.is_callout_challenge_observer(p_challenge_id, auth.uid())
        )
      )
    );
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- SELECT policies: House can read every row needed to open a room
-- ---------------------------------------------------------------------------

drop policy if exists "Official ops can read challenges" on public.challenges;
create policy "Official ops can read challenges"
  on public.challenges
  for select
  to authenticated
  using (public.is_official_ops());

drop policy if exists "Official ops can read participants" on public.challenge_participants;
create policy "Official ops can read participants"
  on public.challenge_participants
  for select
  to authenticated
  using (public.is_official_ops());

drop policy if exists "Official ops can read checkins" on public.challenge_checkins;
create policy "Official ops can read checkins"
  on public.challenge_checkins
  for select
  to authenticated
  using (public.is_official_ops());

drop policy if exists "Official ops can read checkin proofs" on public.challenge_checkin_proofs;
create policy "Official ops can read checkin proofs"
  on public.challenge_checkin_proofs
  for select
  to authenticated
  using (public.is_official_ops());

drop policy if exists "Official ops can read period misses" on public.challenge_period_misses;
create policy "Official ops can read period misses"
  on public.challenge_period_misses
  for select
  to authenticated
  using (public.is_official_ops());

-- ---------------------------------------------------------------------------
-- admin_pulse / admin_pulse_list / admin_wallets
-- Gate is is_official_ops() (not is_admin only, not every Official Creator).
-- GRANT authenticated only after this early return.
-- ---------------------------------------------------------------------------

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
  if not public.is_official_ops() then
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
  if not public.is_official_ops() then
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

create or replace function public.admin_wallets()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rows jsonb := '[]'::jsonb;
begin
  if not public.is_official_ops() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  into v_rows
  from (
    select
      p.id,
      p.username,
      p.display_name,
      coalesce(p.coins, p.credits, 0) as coins,
      coalesce(p.bucks, 0) as bucks
    from public.profiles p
    order by coalesce(p.coins, p.credits, 0) desc, lower(coalesce(p.username, ''))
  ) x;

  return v_rows;
end;
$$;

revoke all on function public.admin_pulse(text) from public, anon;
grant execute on function public.admin_pulse(text) to authenticated;

revoke all on function public.admin_pulse_list(text, text) from public, anon;
grant execute on function public.admin_pulse_list(text, text) to authenticated;

revoke all on function public.admin_wallets() from public, anon;
grant execute on function public.admin_wallets() to authenticated;

-- Stay revoked from clients. Do not restore admin_mass_join.
do $$
begin
  revoke execute on function public.write_coin_ledger(uuid, numeric, text) from anon, authenticated, public;
exception when undefined_function then
  null;
end $$;

do $$
begin
  revoke execute on function public.tick_settlements() from anon, authenticated, public;
exception when undefined_function then
  null;
end $$;

do $$
begin
  revoke execute on function public.settle_ended_challenge(uuid) from anon, authenticated, public;
exception when undefined_function then
  null;
end $$;

do $$
begin
  revoke execute on function public.credit_wallet_top_up(uuid, numeric, text, text, numeric, jsonb) from anon, authenticated, public;
exception when undefined_function then
  null;
end $$;

notify pgrst, 'reload schema';

-- After Run, this table should show execute = true for authenticated on the
-- three Pulse RPCs, and false on the stay-revoked money functions.
select
  p.proname as function,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_pulse',
    'admin_pulse_list',
    'admin_wallets',
    'write_coin_ledger',
    'tick_settlements',
    'settle_ended_challenge',
    'credit_wallet_top_up',
    'is_official_ops'
  )
order by p.proname;
