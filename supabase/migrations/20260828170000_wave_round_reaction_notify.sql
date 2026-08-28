-- Heart / comment notify attach to THIS Wave or Round clip, not the author stack.

create or replace function public.trg_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_post_id uuid;
  v_challenge uuid;
  v_type text;
  v_stack text;
  v_one text;
  v_many text;
  v_href text;
  v_story uuid;
  v_reel uuid;
begin
  if new.post_id is not null then
    select author_id, id, challenge_id, type
      into v_author, v_post_id, v_challenge, v_type
    from public.posts
    where id = new.post_id;
    v_stack := 'post:' || new.post_id::text;
    if v_type = 'wave' then
      select id into v_story from public.stories where post_id = v_post_id limit 1;
      v_one := 'reacted to your Wave';
      v_many := 'reacted to your Wave';
      v_href := case when v_story is not null then '/wave/' || v_story::text else '/feed?postId=' || v_post_id::text end;
    elsif v_type = 'round' then
      select id into v_reel from public.reels where post_id = v_post_id limit 1;
      v_one := 'reacted to your Round';
      v_many := 'reacted to your Round';
      v_href := case when v_reel is not null then '/round/' || v_reel::text else '/feed?postId=' || v_post_id::text end;
    else
      v_one := 'reacted to your post';
      v_many := 'reacted to your post';
      v_href := '/feed?postId=' || v_post_id::text;
    end if;
  elsif new.comment_id is not null then
    select c.author_id, c.post_id, p.challenge_id
      into v_author, v_post_id, v_challenge
    from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = new.comment_id;
    v_stack := 'comment:' || new.comment_id::text;
    v_one := 'reacted to your comment';
    v_many := 'reacted to your comment';
    v_href := '/feed?postId=' || coalesce(v_post_id::text, '');
  else
    return new;
  end if;

  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  if v_post_id is null or not public.user_can_see_post(v_author, v_post_id) then
    return new;
  end if;

  perform public.notify_stacked_interaction(
    v_author,
    new.user_id,
    'post_reaction',
    v_stack,
    v_one,
    v_many,
    jsonb_build_object(
      'post_id', v_post_id,
      'postId', v_post_id,
      'comment_id', new.comment_id,
      'challenge_id', v_challenge,
      'challengeId', v_challenge,
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
