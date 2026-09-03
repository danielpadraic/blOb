-- Walking is daily steps, not miles.
-- Additive on live stamp 20260903001549. RLS unchanged.

alter table public.interest_chips
  drop constraint if exists interest_chips_qty_kind_check;

alter table public.interest_chips
  add constraint interest_chips_qty_kind_check check (
    qty_kind is null
    or qty_kind in (
      'pages_week',
      'books_year',
      'miles_outing',
      'sessions_week',
      'fasting_hours',
      'laps',
      'steps_day'
    )
  );

update public.interest_chips
set qty_kind = 'steps_day'
where room_slug = 'health_fitness'
  and slug = 'walking';

-- Old Walking rows stored miles (usually 0–20). Clear those so people re-enter steps.
update public.profile_interest_chips as pic
set
  qty_period = 'day',
  goal_qty_period = 'day',
  current_qty = case
    when pic.current_qty is not null and pic.current_qty <= 25 then null
    else pic.current_qty
  end,
  goal_qty = case
    when pic.goal_qty is not null and pic.goal_qty <= 25 then null
    else pic.goal_qty
  end
from public.interest_chips as ic
where ic.id = pic.chip_id
  and ic.room_slug = 'health_fitness'
  and ic.slug = 'walking';
