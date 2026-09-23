-- blOb ops — Counter tables
-- Owner-only live sheets + locked snapshots. Not a check-in or money path.
--
-- Do not supabase db push --include-all.
--
-- =============================================================================
-- OPERATOR CLICKS — Daniel
-- =============================================================================
-- Cursor will also run SCRIPT B from here. If a page asks you to paste:
--
-- 1. Open https://supabase.com/dashboard/project/tguzdtwsajnnczdxjqyq/sql/new
-- 2. Sign in if it asks. You should see a blank box and a green Run button.
-- 3. Open artifacts/ops_counters.sql in Cursor.
-- 4. SCRIPT A first: select from “-- SCRIPT A” down to the line before “-- SCRIPT B”.
--    Copy (Cmd+C). Paste in Supabase. Click green Run.
--    If it offers “Run without RLS”, click Cancel.
--    DONE WHEN you see one row. exists_counters and exists_metrics should be false
--    the first time (tables not created yet). After SCRIPT B they should be true.
-- 5. SCRIPT B: select from “-- SCRIPT B” to the end. Copy. Paste. Green Run.
--    If it offers “Run without RLS”, click Cancel.
-- 6. Run SCRIPT A again. DONE WHEN exists_counters = true, exists_metrics = true,
--    rls_counters = true, rls_metrics = true, policy_count >= 8.


-- =============================================================================
-- SCRIPT A — preview (read only)
-- =============================================================================
select
  to_regclass('public.counters') is not null as exists_counters,
  to_regclass('public.counter_metrics') is not null as exists_metrics,
  coalesce((
    select relrowsecurity from pg_class
    where oid = to_regclass('public.counters')
  ), false) as rls_counters,
  coalesce((
    select relrowsecurity from pg_class
    where oid = to_regclass('public.counter_metrics')
  ), false) as rls_metrics,
  (
    select count(*) from pg_policies
    where schemaname = 'public' and tablename in ('counters', 'counter_metrics')
  ) as policy_count;


-- =============================================================================
-- SCRIPT B — apply
-- =============================================================================
create table if not exists public.counters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  status text not null check (status in ('live', 'saved')),
  parent_id uuid references public.counters (id) on delete set null,
  card_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  saved_at timestamptz
);

comment on table public.counters is
  'A titled Counter sheet. Live rows stay editable. Saved rows are locked snapshots. Owner-only.';

create index if not exists counters_owner_status_updated_idx
  on public.counters (user_id, status, updated_at desc);
create index if not exists counters_parent_idx
  on public.counters (parent_id);

alter table public.counters enable row level security;

drop policy if exists "Owner reads own counters" on public.counters;
create policy "Owner reads own counters"
  on public.counters for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Owner inserts own counters" on public.counters;
create policy "Owner inserts own counters"
  on public.counters for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Owner updates own counters" on public.counters;
create policy "Owner updates own counters"
  on public.counters for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Owner deletes own counters" on public.counters;
create policy "Owner deletes own counters"
  on public.counters for delete
  to authenticated
  using (user_id = auth.uid());

revoke all on public.counters from anon, authenticated;
grant select, insert, update, delete on public.counters to authenticated;
grant all on public.counters to service_role;

create table if not exists public.counter_metrics (
  id uuid primary key default gen_random_uuid(),
  counter_id uuid not null references public.counters (id) on delete cascade,
  sort_index int not null default 0,
  name text not null check (length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('count', 'decimal', 'money')),
  value numeric not null default 0
);

comment on table public.counter_metrics is
  'Named metrics on one Counter. Deleted with the parent. Owner-only through the parent row.';

create index if not exists counter_metrics_counter_sort_idx
  on public.counter_metrics (counter_id, sort_index);

alter table public.counter_metrics enable row level security;

drop policy if exists "Owner reads own counter metrics" on public.counter_metrics;
create policy "Owner reads own counter metrics"
  on public.counter_metrics for select
  to authenticated
  using (
    exists (
      select 1 from public.counters c
      where c.id = counter_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Owner inserts own counter metrics" on public.counter_metrics;
create policy "Owner inserts own counter metrics"
  on public.counter_metrics for insert
  to authenticated
  with check (
    exists (
      select 1 from public.counters c
      where c.id = counter_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Owner updates own counter metrics" on public.counter_metrics;
create policy "Owner updates own counter metrics"
  on public.counter_metrics for update
  to authenticated
  using (
    exists (
      select 1 from public.counters c
      where c.id = counter_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.counters c
      where c.id = counter_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Owner deletes own counter metrics" on public.counter_metrics;
create policy "Owner deletes own counter metrics"
  on public.counter_metrics for delete
  to authenticated
  using (
    exists (
      select 1 from public.counters c
      where c.id = counter_id and c.user_id = auth.uid()
    )
  );

revoke all on public.counter_metrics from anon, authenticated;
grant select, insert, update, delete on public.counter_metrics to authenticated;
grant all on public.counter_metrics to service_role;
