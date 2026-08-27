-- Client already writes "{Name} is {task}!" / "{Name} checked in for {Challenge}."
-- Prefer those notes as-is. Do not prefix "Check-in Complete".

create or replace function public.checkin_post_caption(p_complete boolean, p_notes text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(nullif(btrim(p_notes), ''), '') <> '' then
      btrim(p_notes)
    when p_complete then
      'Check-in Complete'
    else
      'Started check-in.'
  end;
$$;
