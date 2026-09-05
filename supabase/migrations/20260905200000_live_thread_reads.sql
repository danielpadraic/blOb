-- How far each person has read in a challenge Live thread.
--
-- One row per user per challenge, holding the cursor the client advances as rows scroll into view.
-- This is what the "N new since you were here" chip is measured against. It is deliberately separate
-- from Home notification unread, which is capped and counts a different thing.
--
-- Owner only. A read cursor is nobody else's business, so there is no participant or official read
-- policy here, and no delete policy. No new grants.

create table if not exists public.live_thread_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

comment on table public.live_thread_reads is
  'Per-user read cursor for a challenge Live thread. Owner-only. Advances only through rows the client confirmed on screen, so a bottom-pinned open does not mark a skipped backlog read.';

alter table public.live_thread_reads enable row level security;

drop policy if exists live_thread_reads_select_own on public.live_thread_reads;
create policy live_thread_reads_select_own on public.live_thread_reads
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists live_thread_reads_insert_own on public.live_thread_reads;
create policy live_thread_reads_insert_own on public.live_thread_reads
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists live_thread_reads_update_own on public.live_thread_reads;
create policy live_thread_reads_update_own on public.live_thread_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The cursor only ever moves forward. A late write from a backgrounded tab must not reopen messages
-- the user has already read past.
create or replace function public.live_thread_read_forward_only()
returns trigger
language plpgsql
as $$
begin
  if new.last_read_at < old.last_read_at then
    new.last_read_at := old.last_read_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists live_thread_reads_forward_only on public.live_thread_reads;
create trigger live_thread_reads_forward_only
  before update on public.live_thread_reads
  for each row
  execute function public.live_thread_read_forward_only();
