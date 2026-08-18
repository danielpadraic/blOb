-- Soft-delete: authors can set posts.deleted_at. Safe to re-run.

alter table public.posts
  add column if not exists deleted_at timestamptz;

create index if not exists posts_deleted_at_idx on public.posts (deleted_at)
  where deleted_at is null;

comment on column public.posts.deleted_at is
  'Soft-delete. Hidden from feeds when not null.';

grant update (deleted_at) on public.posts to authenticated;

drop policy if exists "Authors can soft-delete own posts" on public.posts;
create policy "Authors can soft-delete own posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- Own rows stay selectable after deleted_at is set (client update does not need RETURNING).
drop policy if exists "Authors read own posts" on public.posts;
create policy "Authors read own posts"
  on public.posts for select
  to authenticated
  using (auth.uid() = author_id);
