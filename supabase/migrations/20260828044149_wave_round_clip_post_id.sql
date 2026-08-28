-- Wave clips and Round videos share the existing posts + reactions + comments tables.
-- Check-in posts stay check-ins (source = checkin) and are never linked here.

alter table public.stories
  add column if not exists post_id uuid references public.posts(id) on delete set null;

alter table public.reels
  add column if not exists post_id uuid references public.posts(id) on delete set null;

create index if not exists stories_post_id_idx
  on public.stories (post_id)
  where post_id is not null;

create index if not exists reels_post_id_idx
  on public.reels (post_id)
  where post_id is not null;

comment on column public.stories.post_id is
  'Feed post for this Wave clip. Reactions and comments use public.reactions / public.comments.';
comment on column public.reels.post_id is
  'Feed post for this Round. Reactions and comments use public.reactions / public.comments.';

update public.reels r
set post_id = matched.id
from (
  select distinct on (r2.id)
    r2.id as reel_id,
    p.id
  from public.reels r2
  join public.posts p
    on p.author_id = r2.user_id
   and p.source is distinct from 'checkin'
   and p.checkin_id is null
   and coalesce(p.deleted_at, 'epoch'::timestamptz) = 'epoch'::timestamptz
   and p.media_urls @> array[r2.video_url]::text[]
  order by r2.id, p.created_at desc
) matched
where r.id = matched.reel_id
  and r.post_id is null;

update public.stories s
set post_id = matched.id
from (
  select distinct on (s2.id)
    s2.id as story_id,
    p.id
  from public.stories s2
  join public.posts p
    on p.author_id = s2.user_id
   and p.source is distinct from 'checkin'
   and p.checkin_id is null
   and coalesce(p.deleted_at, 'epoch'::timestamptz) = 'epoch'::timestamptz
   and p.media_urls @> array[s2.media_url]::text[]
  order by s2.id, p.created_at desc
) matched
where s.id = matched.story_id
  and s.post_id is null;
