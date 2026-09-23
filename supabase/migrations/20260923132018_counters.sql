-- Counter: titled sheets of named metrics. Owner-only. Not a check-in or money path.

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
