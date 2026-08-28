-- Wave Share to Feed: a posts row (type=wave_share) points at the Wave post.

alter table public.posts drop constraint if exists posts_type_allowed;
alter table public.posts
  add constraint posts_type_allowed
  check (type in (
    'feed',
    'checkin',
    'challenge',
    'share',
    'profile_photo',
    'wave',
    'round',
    'round_share',
    'wave_share'
  ));

comment on column public.posts.type is
  'wave and round are clips, not Home cards. round_share and wave_share are Feed posts.';
