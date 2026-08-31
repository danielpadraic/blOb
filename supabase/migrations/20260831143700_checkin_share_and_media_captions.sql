-- Per-proof check-in captions + remembered Share to Home / Wave.
-- Additive. Lobby is always on and is not stored.

alter table public.profiles
  add column if not exists checkin_share_home boolean not null default false;

alter table public.profiles
  add column if not exists checkin_share_wave boolean not null default false;

comment on column public.profiles.checkin_share_home is
  'Last check-in Share to Home. Default off. Owner-only.';

comment on column public.profiles.checkin_share_wave is
  'Last check-in Share to Wave. Default off. Owner-only.';

alter table public.posts
  add column if not exists media_captions text[] not null default '{}';

comment on column public.posts.media_captions is
  'Per-media captions aligned with media_urls. Check-in proof captions (≤180). posts.content is the social line.';
