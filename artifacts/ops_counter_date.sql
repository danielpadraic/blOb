-- blOb ops — Counter calendar day + last-opened restore
-- Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- Cursor will also run SCRIPT B from here. You do not need to paste unless
-- Cursor says the column is missing.
--
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. Blank box + green Run.
-- 3. Open artifacts/ops_counter_date.sql in Cursor.
-- 4. SCRIPT A: select from “-- SCRIPT A” to the line before “-- SCRIPT B”.
--    Copy. Paste. Green Run. If it offers “Run without RLS”, click Cancel.
-- 5. SCRIPT B: select from “-- SCRIPT B” to the end. Copy. Paste. Green Run.
-- 6. Run SCRIPT A again. DONE WHEN has_counter_date = true and has_last_opened = true.


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'counters' and column_name = 'counter_date'
  ) as has_counter_date,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'counters' and column_name = 'last_opened_at'
  ) as has_last_opened;


-- =============================================================================
-- SCRIPT B — apply
-- =============================================================================
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
