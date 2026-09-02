-- Isolated post report. Does not rewrite can_read_post, quote triggers,
-- Circles, settlement, posts_type_allowed, or notifications_type_known.

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'spam',
    'harassment',
    'inappropriate',
    'other',
    'comment',
    'clip'
  )),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create index if not exists post_reports_post_id_idx on public.post_reports (post_id);

alter table public.post_reports enable row level security;

drop policy if exists "Users insert own post reports" on public.post_reports;
create policy "Users insert own post reports"
  on public.post_reports for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Users read own post reports" on public.post_reports;
create policy "Users read own post reports"
  on public.post_reports for select
  to authenticated
  using (auth.uid() = reporter_id);

grant select, insert on public.post_reports to authenticated;

-- Live user_can_see_post / mention trigger still call this name.
-- friendship_is_blocked already exists; this is the missing alias only.
create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.friendship_is_blocked(p_a, p_b);
$fn$;

revoke all on function public.users_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.report_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_reason not in ('spam', 'harassment', 'inappropriate', 'other', 'comment', 'clip') then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;
  if not public.user_can_see_post(v_uid, p_post_id) then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.posts where id = p_post_id and author_id = v_uid) then
    raise exception 'CANT_REPORT_OWN' using errcode = 'P0001';
  end if;
  insert into public.post_reports (post_id, reporter_id, reason)
  values (p_post_id, v_uid, v_reason)
  on conflict (post_id, reporter_id) do update set reason = excluded.reason;
end;
$fn$;

revoke all on function public.report_post(uuid, text) from public, anon;
grant execute on function public.report_post(uuid, text) to authenticated;

notify pgrst, 'reload schema';
