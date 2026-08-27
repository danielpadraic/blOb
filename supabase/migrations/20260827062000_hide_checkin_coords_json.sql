create or replace function public.checkin_row_json(p_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(to_jsonb(c) - 'location_lat' - 'location_lng', '{}'::jsonb)
  from public.challenge_checkins c
  where c.id = p_id;
$$;
