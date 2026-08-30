-- Clip comments: mention SELECT must not 403, one reaction per user per comment,
-- and @tag notify deep-links the Wave / Round that owns the comment.

grant execute on function public.user_can_see_post(uuid, uuid) to anon, authenticated;

drop policy if exists "Comment mentions readable" on public.comment_mentions;
create policy "Comment mentions readable"
  on public.comment_mentions for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.comments c
      where c.id = comment_id
    )
  );

drop policy if exists "Authors insert comment mentions" on public.comment_mentions;
create policy "Authors insert comment mentions"
  on public.comment_mentions for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.comments c
      where c.id = comment_id
        and c.author_id = auth.uid()
    )
  );

grant select on public.comment_mentions to anon, authenticated;
grant insert on public.comment_mentions to authenticated;

create unique index if not exists reactions_user_comment_unique_idx
  on public.reactions (user_id, comment_id)
  where comment_id is not null;

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
  if not public.user_can_see_post(new.mentioned_user_id, v_post.id) then
    return new;
  end if;

  if v_post.type = 'wave' then
    select id into v_story from public.stories where post_id = v_post.id limit 1;
    v_href := case
      when v_story is not null then '/wave/' || v_story::text || '?comments=1&commentId=' || new.comment_id::text
      else '/feed?postId=' || v_post.id::text
    end;
  elsif v_post.type = 'round' then
    select id into v_reel from public.reels where post_id = v_post.id limit 1;
    v_href := case
      when v_reel is not null then '/round/' || v_reel::text || '?comments=1&commentId=' || new.comment_id::text
      else '/feed?postId=' || v_post.id::text
    end;
  else
    v_href := '/feed?postId=' || v_post.id::text;
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

notify pgrst, 'reload schema';
