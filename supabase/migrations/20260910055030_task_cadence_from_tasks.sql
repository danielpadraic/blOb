-- Per-task cadence for miss duty. Extra tasks live on challenges.tasks jsonb
-- (there is no extra_tasks column). Missing frequency inherits challenge.frequency.
-- once true → once. Does not change checkin_open_row, settlement, or write_coin_ledger.

create or replace function public.task_cadence(p_task jsonb, ch public.challenges)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce((p_task->>'once')::boolean, false) then 'once'
    when lower(coalesce(p_task->>'frequency', '')) in (
      'once', 'daily', 'day', '3x_week', 'custom', 'weekly', 'week', 'monthly', 'month'
    ) then lower(p_task->>'frequency')
    else lower(coalesce(ch.frequency, 'daily'))
  end;
$$;

comment on function public.task_cadence(jsonb, public.challenges) is
  'Cadence for one challenges.tasks element. once true → once; else stored frequency or challenge.frequency.';

create or replace function public.challenge_task_is_daily(p_cadence text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select lower(coalesce(p_cadence, '')) in ('daily', 'day');
$$;

create or replace function public.challenge_has_daily_checkin_duty(ch public.challenges)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then true
    when lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative') then false
    when lower(coalesce(ch.format, 'consistency')) in ('cumulative', 'points') then false
    when jsonb_typeof(coalesce(ch.tasks, '[]'::jsonb)) = 'array'
      and jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)) > 0 then exists (
        select 1
        from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) elem
        where public.challenge_task_is_daily(public.task_cadence(elem, ch))
      )
    when lower(coalesce(ch.frequency, 'daily')) in (
      'weekly', 'week', 'monthly', 'month', 'once', 'custom', '3x_week'
    ) then false
    when lower(coalesce(ch.frequency, 'daily')) in ('daily', 'day') then true
    else false
  end;
$$;

comment on function public.challenge_has_daily_checkin_duty(public.challenges) is
  'True when a period miss may tick: Official week, or any task with daily cadence (else challenge.frequency).';

grant execute on function public.task_cadence(jsonb, public.challenges) to authenticated, service_role;
grant execute on function public.challenge_task_is_daily(text) to authenticated, service_role;
grant execute on function public.challenge_has_daily_checkin_duty(public.challenges) to authenticated, service_role;
