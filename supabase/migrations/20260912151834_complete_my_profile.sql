-- First-run name write. Client upsert/update was returning every profiles column
-- (PostgREST return=representation). After column-level SELECT grants, that
-- fails with 42501 even when username/display_name/bio are writable. This RPC
-- is SECURITY DEFINER, auth.uid() only, and does not require optional metrics.

create or replace function public.complete_my_profile(
  p_username text,
  p_display_name text,
  p_bio text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_display text;
  v_bio text;
  v_stub text;
  v_out public.profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  v_username := lower(btrim(coalesce(p_username, '')));
  v_username := regexp_replace(v_username, '^@+', '');
  v_display := btrim(coalesce(p_display_name, ''));
  v_bio := nullif(btrim(coalesce(p_bio, '')), '');
  v_stub := 'blob_' || substr(replace(v_uid::text, '-', ''), 1, 10);

  if v_username !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'USERNAME_INVALID' using errcode = '22023';
  end if;
  if v_username like 'blob_%' then
    raise exception 'USERNAME_RESERVED' using errcode = '22023';
  end if;
  if char_length(v_display) < 2 or char_length(v_display) > 48 then
    raise exception 'DISPLAY_NAME_REQUIRED' using errcode = '22023';
  end if;
  if v_bio is not null and char_length(v_bio) > 160 then
    raise exception 'BIO_TOO_LONG' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.profiles
    where username = v_username and id <> v_uid
  ) then
    raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end if;

  insert into public.profiles (id, username)
  values (v_uid, v_stub)
  on conflict (id) do nothing;

  begin
    update public.profiles
    set
      username = v_username,
      display_name = v_display,
      bio = v_bio
    where id = v_uid
    returning * into v_out;
  exception
    when unique_violation then
      raise exception 'USERNAME_TAKEN' using errcode = '23505';
  end;

  if not found or v_out.id is null then
    raise exception 'PROFILE_MISSING' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'ok', true,
    'username', v_out.username,
    'display_name', v_out.display_name
  );
end;
$$;

revoke all on function public.complete_my_profile(text, text, text) from public, anon;
grant execute on function public.complete_my_profile(text, text, text) to authenticated;

comment on function public.complete_my_profile(text, text, text) is
  'Owner-only first-run name write. Ensures the profiles row, then UPDATEs username, display_name, bio. No metrics required.';

notify pgrst, 'reload schema';
