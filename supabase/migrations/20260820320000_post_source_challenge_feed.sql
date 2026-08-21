-- Challenge feed is one-way: only posts composed on that page, plus check-ins.
-- Home / share / create-announce stay on Home even when they carry challenge_id.

alter table public.posts
  add column if not exists source text;

update public.posts
set source = case
  when checkin_id is not null or coalesce(checkin_stage, '') <> '' then 'checkin'
  else 'feed'
end
where source is null;

alter table public.posts
  alter column source set default 'feed';

update public.posts
set source = 'feed'
where source is null;

alter table public.posts
  alter column source set not null;

alter table public.posts drop constraint if exists posts_source_allowed;
alter table public.posts
  add constraint posts_source_allowed
  check (source in ('challenge', 'checkin', 'feed', 'share'));

comment on column public.posts.source is
  'challenge = composed on the challenge page; checkin = Begin/Continue/Submit; feed = Home composer or create announce; share = Share to feed.';

create index if not exists posts_challenge_source_created_at_idx
  on public.posts (challenge_id, created_at desc)
  where source in ('challenge', 'checkin');

create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(p_media, 1), 0) = 0 then
    return;
  end if;
  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage,
    source
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    coalesce(p_media, '{}'),
    'public',
    '{}',
    p_checkin_id,
    p_stage,
    'checkin'
  );
exception when others then
  begin
    insert into public.posts (
      author_id, challenge_id, content, media_urls, checkin_id, checkin_stage, source
    )
    values (
      p_user_id,
      p_challenge_id,
      nullif(btrim(p_content), ''),
      coalesce(p_media, '{}'),
      p_checkin_id,
      p_stage,
      'checkin'
    );
  exception when others then
    insert into public.posts (author_id, challenge_id, content, media_urls, source)
    values (
      p_user_id,
      p_challenge_id,
      nullif(btrim(p_content), ''),
      coalesce(p_media, '{}'),
      'checkin'
    );
  end;
end;
$$;
