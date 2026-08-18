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
