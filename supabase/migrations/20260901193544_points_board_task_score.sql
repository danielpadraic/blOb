-- Points / cumulative Board score is task points, not 1 per check-in.
-- Persist points_awarded on each submitted check-in. Consistency stays days.

alter table public.challenge_checkins
  add column if not exists points_awarded numeric;

comment on column public.challenge_checkins.points_awarded is
  'Task points for this accepted check-in. Not 1 per row.';

create or replace function public.challenge_task_point_value(p_task jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
begin
  return greatest(coalesce(nullif(btrim(p_task->>'points'), '')::numeric, 0), 0);
exception
  when others then
    return 0;
end;
$$;

create or replace function public.challenge_per_checkin_points(ch public.challenges)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  v_points numeric := 0;
begin
  select public.challenge_task_point_value(e)
  into v_points
  from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) e
  where public.challenge_task_point_value(e) > 0
    and coalesce((e->>'once')::boolean, false) = false
  limit 1;
  if coalesce(v_points, 0) > 0 then
    return v_points;
  end if;
  select public.challenge_task_point_value(e)
  into v_points
  from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) e
  where public.challenge_task_point_value(e) > 0
  limit 1;
  return coalesce(v_points, 0);
end;
$$;

create or replace function public.challenge_board_points(p_challenge_id uuid, p_user_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_points numeric := 0;
  v_unit numeric := 0;
  v_from_checkins numeric := 0;
  v_checkins numeric := 0;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if coalesce(ch.is_official, false) then
    return public.challenge_board_days(p_challenge_id, p_user_id);
  end if;
  if coalesce(ch.scoring_method, '') = 'comparable_points' then
    select coalesce(p.points, 0) into v_points
    from public.challenge_participants p
    where p.challenge_id = p_challenge_id and p.user_id = p_user_id;
    return coalesce(v_points, 0);
  end if;
  if lower(coalesce(ch.challenge_type, '')) not in ('points', 'cumulative')
     and lower(coalesce(ch.format, '')) not in ('points', 'cumulative') then
    return 0;
  end if;

  v_unit := public.challenge_per_checkin_points(ch);
  select coalesce(sum(coalesce(ck.points_awarded, v_unit)), 0), count(*)
  into v_from_checkins, v_checkins
  from public.challenge_checkins ck
  where ck.challenge_id = p_challenge_id
    and ck.user_id = p_user_id
    and (ck.status = 'submitted' or ck.submitted_at is not null);

  if v_checkins > 0 then
    return v_from_checkins;
  end if;

  v_checkins := public.submitted_checkin_count(p_challenge_id, p_user_id);
  return coalesce(v_checkins, 0) * coalesce(v_unit, 0);
end;
$$;

create or replace function public.challenge_checkins_stamp_points()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
begin
  if new.status = 'submitted' and new.points_awarded is null then
    select * into ch from public.challenges where id = new.challenge_id;
    if found then
      new.points_awarded := public.challenge_per_checkin_points(ch);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_checkins_stamp_points on public.challenge_checkins;
create trigger challenge_checkins_stamp_points
  before insert or update of status, submitted_at, points_awarded
  on public.challenge_checkins
  for each row
  execute function public.challenge_checkins_stamp_points();

update public.challenge_checkins ck
set points_awarded = public.challenge_per_checkin_points(ch)
from public.challenges ch
where ch.id = ck.challenge_id
  and ck.points_awarded is null
  and (ck.status = 'submitted' or ck.submitted_at is not null)
  and coalesce(ch.is_official, false) = false
  and coalesce(ch.scoring_method, '') is distinct from 'comparable_points'
  and (
    lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
    or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
  );

do $$
declare
  r record;
begin
  for r in
    select distinct p.challenge_id, p.user_id
    from public.challenge_participants p
    join public.challenges ch on ch.id = p.challenge_id
    where coalesce(ch.is_official, false) = false
      and coalesce(ch.scoring_method, '') is distinct from 'comparable_points'
      and (
        lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
        or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
      )
  loop
    perform public.refresh_participant_progress(r.challenge_id, r.user_id);
  end loop;
end;
$$;
