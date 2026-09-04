-- Comment / reply / mention bells store post_id + comment_id (and parent_comment_id
-- for replies) and deep-link that line. Client still appends commentId if an older
-- href is only /feed?postId=.

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
    v_href := case
      when v_reel is not null then '/round/' || v_reel::text || '?comments=1&commentId=' || new.id::text
      else '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.id::text
    end;
  elsif v_post.type = 'wave' then
    v_one := 'commented on your Wave';
    v_many := 'commented on your Wave';
    select id into v_story from public.stories where post_id = v_post.id limit 1;
    v_href := case
      when v_story is not null then '/wave/' || v_story::text || '?comments=1&commentId=' || new.id::text
      else '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.id::text
    end;
  else
    v_one := 'commented on your post';
    v_many := 'commented on your post';
    v_href := '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.id::text;
  end if;

  v_data := jsonb_build_object(
    'post_id', new.post_id,
    'postId', new.post_id,
    'comment_id', new.id,
    'parent_comment_id', new.parent_id,
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

create or replace function public.trg_notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_mute boolean;
  v_href text;
  v_story uuid;
  v_reel uuid;
  v_parent uuid;
begin
  if new.mentioned_user_id is not distinct from new.author_id then
    return new;
  end if;
  if public.users_blocked(new.author_id, new.mentioned_user_id) then
    return new;
  end if;
  select coalesce(mute_mentions, false) into v_mute
  from public.profiles
  where id = new.mentioned_user_id;
  if v_mute then
    return new;
  end if;
  select p.* into v_post
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = new.comment_id;
  if not found then
    return new;
  end if;
  select c.parent_id into v_parent
  from public.comments c
  where c.id = new.comment_id;
  if not public.user_can_see_post(new.mentioned_user_id, v_post.id) then
    return new;
  end if;

  if v_post.type = 'wave' then
    select id into v_story from public.stories where post_id = v_post.id limit 1;
    v_href := case
      when v_story is not null then '/wave/' || v_story::text || '?comments=1&commentId=' || new.comment_id::text
      else '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.comment_id::text
    end;
  elsif v_post.type = 'round' then
    select id into v_reel from public.reels where post_id = v_post.id limit 1;
    v_href := case
      when v_reel is not null then '/round/' || v_reel::text || '?comments=1&commentId=' || new.comment_id::text
      else '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.comment_id::text
    end;
  else
    v_href := '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.comment_id::text;
  end if;

  perform public.notify_stacked_interaction(
    new.mentioned_user_id,
    new.author_id,
    'mentioned',
    'comment:' || new.comment_id::text,
    'tagged you in a comment',
    'tagged you in a comment',
    jsonb_build_object(
      'post_id', v_post.id,
      'postId', v_post.id,
      'comment_id', new.comment_id,
      'parent_comment_id', v_parent,
      'challenge_id', v_post.challenge_id,
      'challengeId', v_post.challenge_id,
      'href', v_href,
      'story_id', v_story,
      'reel_id', v_reel
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
