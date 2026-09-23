-- Counter calendar day + last-opened restore. Not a check-in or honor path.

alter table public.counters
  add column if not exists counter_date date;

update public.counters
  set counter_date = (created_at at time zone 'America/Denver')::date
  where counter_date is null;

alter table public.counters
  alter column counter_date set default current_date;

alter table public.counters
  alter column counter_date set not null;

comment on column public.counters.counter_date is
  'Calendar day this sheet is about. Independent of created_at. Owner can change it without clearing numbers.';

alter table public.counters
  add column if not exists last_opened_at timestamptz;

update public.counters
  set last_opened_at = updated_at
  where status = 'live' and last_opened_at is null;

comment on column public.counters.last_opened_at is
  'When the owner last opened this live sheet. Used to restore the same counter.';
