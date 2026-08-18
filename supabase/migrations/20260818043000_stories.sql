-- Stories + views. Safe to re-run. Tables may already exist in hosted Supabase.

create table if not exists public.stories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  media_url     text not null,
  media_type    text not null check (media_type in ('image', 'video')),
  challenge_id  uuid references public.challenges(id) on delete set null,
  caption       text,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

create index if not exists stories_user_id_idx on public.stories (user_id);
create index if not exists stories_expires_at_idx on public.stories (expires_at);

create table if not exists public.story_views (
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create index if not exists story_views_viewer_id_idx on public.story_views (viewer_id);

alter table public.stories enable row level security;
alter table public.story_views enable row level security;

drop policy if exists "Active stories are readable" on public.stories;
create policy "Active stories are readable"
  on public.stories for select
  to authenticated
  using (expires_at > now() or auth.uid() = user_id);

drop policy if exists "Users post their own stories" on public.stories;
create policy "Users post their own stories"
  on public.stories for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own stories" on public.stories;
create policy "Users delete their own stories"
  on public.stories for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users read own story views" on public.story_views;
create policy "Users read own story views"
  on public.story_views for select
  to authenticated
  using (auth.uid() = viewer_id);

drop policy if exists "Users mark stories viewed" on public.story_views;
create policy "Users mark stories viewed"
  on public.story_views for insert
  to authenticated
  with check (auth.uid() = viewer_id);

drop policy if exists "Users update own story views" on public.story_views;
create policy "Users update own story views"
  on public.story_views for update
  to authenticated
  using (auth.uid() = viewer_id)
  with check (auth.uid() = viewer_id);

grant select, insert, delete on public.stories to authenticated;
grant select, insert, update on public.story_views to authenticated;

-- Media lives in post-media/{user_id}/stories/... (existing public bucket + folder RLS).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  52428800,
  array['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do nothing;
