-- Authors cannot soft-delete check-in proof posts. Regular posts unchanged.

create or replace function public.soft_delete_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_checkin uuid;
  v_source text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select author_id, checkin_id, source
    into v_author, v_checkin, v_source
  from public.posts
  where id = p_post_id
    and deleted_at is null;

  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_author is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_checkin is not null or v_source = 'checkin' then
    raise exception 'CHECKIN_POST' using errcode = 'P0001';
  end if;

  update public.posts
    set deleted_at = now()
    where id = p_post_id
      and author_id = auth.uid()
      and deleted_at is null;
end;
$$;
