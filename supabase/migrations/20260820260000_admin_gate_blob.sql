-- /admin: is_official OR is_admin OR username blob OR Official Bob id.
-- Do not require is_admin.

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
      and (
        coalesce(is_official, false)
        or coalesce(is_admin, false)
        or lower(btrim(coalesce(username, ''))) = 'blob'
        or id = '81dfe427-d413-4c60-bd4a-e710c95077ad'
      )
  );
$$;

revoke all on function public.is_official_viewer() from public;
grant execute on function public.is_official_viewer() to authenticated;

notify pgrst, 'reload schema';
