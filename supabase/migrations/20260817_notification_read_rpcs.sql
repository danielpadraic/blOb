-- Packet 5: named mark-read RPCs. Existing mark_notifications_read(p_ids) stays.
-- Safe to re-run.

create or replace function public.mark_notification_read(p_id uuid)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_id is null then
    return 0;
  end if;

  update public.notifications
    set read_at = now()
    where id = p_id
      and user_id = auth.uid()
      and read_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
