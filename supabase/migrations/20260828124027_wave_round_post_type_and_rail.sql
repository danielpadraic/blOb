-- Wave / Round posts share public.posts for reactions + comments.
-- Home and public profile feeds exclude type IN ('wave','round').
-- hidden_from_rail hides rails only; direct links still use existing post RLS.

alter table public.posts
  add column if not exists type text;

alter table public.posts
  add column if not exists duration_ms integer;

alter table public.posts
  add column if not exists overlays jsonb not null default '[]'::jsonb;

alter table public.posts
  add column if not exists hidden_from_rail boolean not null default false;

update public.posts
set type = coalesce(nullif(source, ''), 'feed')
where type is null;

update public.posts p
set type = 'wave'
from public.stories s
where s.post_id = p.id;

update public.posts p
set type = 'round'
from public.reels r
where r.post_id = p.id;

update public.posts
set type = 'feed'
where type is null;

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
    'round_share'
  ));

alter table public.posts
  alter column type set default 'feed';

alter table public.posts
  alter column type set not null;

create index if not exists posts_type_created_at_idx
  on public.posts (type, created_at desc);

create index if not exists posts_hidden_from_rail_idx
  on public.posts (hidden_from_rail)
  where hidden_from_rail;

comment on column public.posts.type is
  'wave and round are clips, not Home cards. round_share is a real Feed post.';
comment on column public.posts.hidden_from_rail is
  'Author hide from Waves/Rounds rails. Direct link still uses post RLS.';
