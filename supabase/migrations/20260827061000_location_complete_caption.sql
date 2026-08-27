create or replace function public.stamp_location_complete_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
begin
  if new.location_label is null or new.submitted_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.submitted_at is not null then
    return new;
  end if;
  select coalesce(nullif(btrim(display_name), ''), nullif(btrim(username), ''), 'Someone')
    into v_name
  from public.profiles where id = new.user_id;
  select coalesce(nullif(btrim(title), ''), 'the challenge')
    into v_title
  from public.challenges where id = new.challenge_id;
  update public.posts
  set
    content = v_name || ' checked in for ' || v_title || '.',
    location_name = new.location_label,
    checkin_stage = 'complete'
  where checkin_id = new.id
    and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists stamp_location_complete_post on public.challenge_checkins;
create trigger stamp_location_complete_post
  after insert or update of submitted_at, location_label
  on public.challenge_checkins
  for each row
  execute function public.stamp_location_complete_post();
