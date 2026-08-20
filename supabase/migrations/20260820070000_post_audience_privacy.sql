-- Default Home post audience + authors may change audience after publish.
-- Authors still cannot delete posts.

alter table public.profiles
  add column if not exists default_post_audience text not null default 'friends';

alter table public.profiles drop constraint if exists profiles_default_post_audience_allowed;
alter table public.profiles
  add constraint profiles_default_post_audience_allowed
  check (default_post_audience in ('public', 'friends'));

comment on column public.profiles.default_post_audience is
  'Home composer default: public or friends. Body metrics are never public.';

grant update (audience, audience_user_ids) on public.posts to authenticated;
