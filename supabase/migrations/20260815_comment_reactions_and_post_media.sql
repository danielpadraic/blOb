-- Comment reactions + broader post-media MIME types.
-- Safe to re-run.

-- Reactions can target a post OR a comment.
alter table public.reactions
  alter column post_id drop not null;

alter table public.reactions
  add column if not exists comment_id uuid references public.comments(id) on delete cascade;

alter table public.reactions
  drop constraint if exists reactions_user_id_post_id_reaction_type_key;

alter table public.reactions
  drop constraint if exists reactions_user_post_type_key;

alter table public.reactions
  drop constraint if exists reaction_one_target;

alter table public.reactions
  add constraint reaction_one_target check (
    (post_id is not null and comment_id is null)
    or (post_id is null and comment_id is not null)
  );

create unique index if not exists reactions_user_post_type_idx
  on public.reactions (user_id, post_id, reaction_type)
  where post_id is not null;

create unique index if not exists reactions_user_comment_type_idx
  on public.reactions (user_id, comment_id, reaction_type)
  where comment_id is not null;

create index if not exists reactions_comment_id_idx
  on public.reactions (comment_id);

-- Image picker often reports image/jpg / HEIF; allow those plus short video.
update storage.buckets
set
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/pjpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ],
  file_size_limit = 52428800
where id = 'post-media';

drop policy if exists "Users update their own post media" on storage.objects;
create policy "Users update their own post media"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
