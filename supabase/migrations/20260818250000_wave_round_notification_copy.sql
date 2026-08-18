-- User-facing labels: Story → Wave, Reel → Round. Table/route names stay story/reel.

create or replace function public.trg_notify_story_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
begin
  if coalesce(new.caption, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  for rec in
    select distinct p.id as user_id, p.username
    from regexp_matches(new.caption, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.user_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.user_id,
      'tagged',
      v_name || ' tagged you in a Wave.',
      null,
      jsonb_build_object('story_id', new.id, 'challenge_id', new.challenge_id, 'username', rec.username)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_post_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_kind text;
begin
  if coalesce(new.content, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  if new.challenge_id is not null then
    v_kind := 'a proof';
  elsif coalesce(array_length(new.media_urls, 1), 0) > 0
     and exists (
       select 1 from unnest(new.media_urls) u
       where u ilike '%.mp4' or u ilike '%.mov' or u ilike '%.webm'
     ) then
    v_kind := 'a post';
  else
    v_kind := 'a post';
  end if;
  for rec in
    select distinct p.id as user_id
    from regexp_matches(new.content, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.author_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'tagged',
      v_name || ' tagged you in ' || v_kind || '.',
      null,
      jsonb_build_object('post_id', new.id, 'challenge_id', new.challenge_id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;
