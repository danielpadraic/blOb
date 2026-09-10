-- Exact email/phone search_people is a contact oracle. Username search is unchanged.
--
-- Eight exact-contact lookups per signed-in caller per 15 minutes. The 9th raises
-- RATE_LIMITED so the app can show a wait line instead of a fake empty result.
-- Never returns email or phone.
--
-- Apply by pasting this file in Supabase SQL Editor (blOb-app / tguzdtwsajnnczdxjqyq).
-- Do not db push --include-all. Do not re-run 20260910000000 / 20260910001000.

create table if not exists public.search_people_contact_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  hit_at timestamptz not null default now()
);

create index if not exists search_people_contact_hits_user_hit_idx
  on public.search_people_contact_hits (user_id, hit_at desc);

alter table public.search_people_contact_hits enable row level security;

revoke all on table public.search_people_contact_hits from anon, authenticated, public;
-- No client policies. Only this SECURITY DEFINER writes.

create or replace function public.assert_search_people_contact_budget()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hits int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  delete from public.search_people_contact_hits
  where user_id = v_uid
    and hit_at < now() - interval '15 minutes';

  select count(*)::int into v_hits
  from public.search_people_contact_hits
  where user_id = v_uid
    and hit_at > now() - interval '15 minutes';

  if coalesce(v_hits, 0) >= 8 then
    raise exception 'RATE_LIMITED';
  end if;

  insert into public.search_people_contact_hits (user_id, hit_at)
  values (v_uid, now());
end;
$$;

revoke all on function public.assert_search_people_contact_budget() from anon, authenticated, public;

create or replace function public.search_people(p_query text)
returns setof profiles_public
language plpgsql
volatile
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
    perform public.assert_search_people_contact_budget();
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and not public.friendship_is_blocked(v_uid, pp.id)
      and lower(coalesce(u.email, '')) = lower(v_q)
    limit 8;
    return;
  end if;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  -- Exact phone (10+ digits). Compare digit-only forms. Never partial.
  if v_q ~ '^[+0-9().[:space:]-]+$' and length(v_digits) >= 10 then
    perform public.assert_search_people_contact_budget();
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and not public.friendship_is_blocked(v_uid, pp.id)
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
    and not public.friendship_is_blocked(v_uid, pp.id)
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

revoke execute on function public.search_people(text) from anon, public;
grant execute on function public.search_people(text) to authenticated;

comment on function public.search_people(text) is
  'Find people by username/display name (partial) or exact email/phone. Never returns email or phone. Exact contact lookups are 8 per caller per 15 minutes.';

notify pgrst, 'reload schema';
