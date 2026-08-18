-- Feed columns. Safe to re-run.
-- Does not recreate post_hides / mutes (those already exist).
-- Client does not call an RPC; it selects a known-good column list.

alter table public.posts
  add column if not exists audience text not null default 'public',
  add column if not exists audience_user_ids uuid[] not null default '{}',
  add column if not exists moderation_status text not null default 'visible',
  add column if not exists quoted_post_id uuid references public.posts(id) on delete set null,
  add column if not exists quote_snapshot jsonb,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_audience_check') then
    alter table public.posts add constraint posts_audience_check
      check (audience in ('public', 'friends', 'specific'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'posts_moderation_status_allowed') then
    alter table public.posts add constraint posts_moderation_status_allowed
      check (moderation_status in ('visible', 'under_review', 'removed'));
  end if;
end $$;

create index if not exists posts_quoted_post_id_idx on public.posts (quoted_post_id)
  where quoted_post_id is not null;
create index if not exists posts_deleted_at_idx on public.posts (deleted_at)
  where deleted_at is null;
