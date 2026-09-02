-- Interests Activity Card copy + catalog pass.
-- Additive on live stamp 20260902184854. RLS unchanged.
-- Leave indoor_outdoor and preferred_proofs columns. Do not drop them.

-- Dual period: current stays qty_period; goal gets its own column.
alter table public.profile_interest_chips
  add column if not exists goal_qty_period text;

comment on column public.profile_interest_chips.goal_qty_period is
  'day | week | month | year for the Goal block. Current uses qty_period.';

-- Per session is gone. Coerce leftovers to week.
update public.profile_interest_chips
set qty_period = 'week'
where qty_period = 'session';

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_qty_period_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_qty_period_check check (
    qty_period is null
    or qty_period in ('day', 'week', 'month', 'year')
  );

alter table public.profile_interest_chips
  drop constraint if exists profile_interest_chips_goal_qty_period_check;

alter table public.profile_interest_chips
  add constraint profile_interest_chips_goal_qty_period_check check (
    goal_qty_period is null
    or goal_qty_period in ('day', 'week', 'month', 'year')
  );

-- Swimming unit is laps. Rowing is sessions.
alter table public.interest_chips
  drop constraint if exists interest_chips_qty_kind_check;

alter table public.interest_chips
  add constraint interest_chips_qty_kind_check check (
    qty_kind is null
    or qty_kind in ('pages_week', 'books_year', 'miles_outing', 'sessions_week', 'fasting_hours', 'laps')
  );

update public.interest_chips
set qty_kind = 'laps'
where room_slug = 'health_fitness'
  and slug = 'swimming';

update public.interest_chips
set qty_kind = 'sessions_week'
where room_slug = 'health_fitness'
  and slug = 'rowing';

-- Stop asking Indoor / Outdoor. Leave the profile column.
update public.interest_chips
set allows_indoor_outdoor = false
where room_slug in ('health_fitness', 'sports', 'outdoors');

-- Diet & Nutrition after Mobility (sort 8), before Hyrox.
update public.interest_chips
set sort_order = sort_order + 1
where room_slug = 'health_fitness'
  and sort_order >= 9
  and slug <> 'diet_nutrition';

insert into public.interest_chips (
  room_slug,
  slug,
  label,
  sort_order,
  allows_indoor_outdoor,
  rating_kind,
  qty_kind
)
values (
  'health_fitness',
  'diet_nutrition',
  'Diet & Nutrition',
  9,
  false,
  null,
  null
)
on conflict (room_slug, slug) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  allows_indoor_outdoor = excluded.allows_indoor_outdoor,
  rating_kind = excluded.rating_kind,
  qty_kind = excluded.qty_kind;
