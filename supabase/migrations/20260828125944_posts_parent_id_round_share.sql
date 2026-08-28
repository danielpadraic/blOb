-- Round Share to Feed: a new posts row (type=round_share) points at the Round post.
-- Home still excludes type wave/round. parent_id is the Round post, not a Feed flip.

alter table public.posts
  add column if not exists parent_id uuid references public.posts(id) on delete set null;

create index if not exists posts_parent_id_idx
  on public.posts (parent_id)
  where parent_id is not null;

comment on column public.posts.parent_id is
  'Round share points at the type=round post. Hiding the Round does not delete this row.';

-- Share row stays readable on its own audience. Parent video is gated in the app.
-- Comments on the Round post vs the share row must not mix notify copy.

create or replace function public.trg_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_parent_author uuid;
  v_one text;
  v_many text;
  v_href text;
  v_reel uuid;
  v_story uuid;
  v_data jsonb;
begin
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return new;
  end if;

  if v_post.type = 'round' then
    v_one := 'commented on your Round';
    v_many := 'commented on your Round';
    select id into v_reel from public.reels where post_id = v_post.id limit 1;
    v_href := case when v_reel is not null then '/round/' || v_reel::text else '/feed?postId=' || v_post.id::text end;
  elsif v_post.type = 'wave' then
    v_one := 'commented on your Wave';
    v_many := 'commented on your Wave';
    select id into v_story from public.stories where post_id = v_post.id limit 1;
    v_href := case when v_story is not null then '/wave/' || v_story::text else '/feed?postId=' || v_post.id::text end;
  else
    v_one := 'commented on your post';
    v_many := 'commented on your post';
    v_href := '/feed?postId=' || v_post.id::text;
  end if;

  v_data := jsonb_build_object(
    'post_id', new.post_id,
    'postId', new.post_id,
    'comment_id', new.id,
    'challenge_id', v_post.challenge_id,
    'challengeId', v_post.challenge_id,
    'href', v_href,
    'reel_id', v_reel,
    'story_id', v_story
  );

  if v_post.author_id is distinct from new.author_id
     and public.user_can_see_post(v_post.author_id, v_post.id) then
    perform public.notify_stacked_interaction(
      v_post.author_id,
      new.author_id,
      'post_comment',
      'post:' || new.post_id::text,
      v_one,
      v_many,
      v_data
    );
  end if;

  if new.parent_id is not null then
    select author_id into v_parent_author
    from public.comments
    where id = new.parent_id;
    if v_parent_author is not null
       and v_parent_author is distinct from new.author_id
       and v_parent_author is distinct from v_post.author_id
       and public.user_can_see_post(v_parent_author, v_post.id) then
      perform public.notify_stacked_interaction(
        v_parent_author,
        new.author_id,
        'post_comment',
        'comment:' || new.parent_id::text,
        'replied to your comment',
        'replied to your comment',
        v_data
      );
    end if;
  end if;

  return new;
exception when others then
  return new;
end;
$$;
