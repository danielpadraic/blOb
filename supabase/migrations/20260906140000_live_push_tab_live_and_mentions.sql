-- Live push: tab=live deep links + Mentions-only = @me / parent author.
-- Off skips Live types only. Check-in reminders (8h/4h/2h) stay on Overview.
-- Apply on live blOb-app (tguzdtwsajnnczdxjqyq). Safe to re-run.

comment on column public.challenge_participants.live_mute is
  'Live thread alerts: all | mentions | off. Default all. Mentions = @me + thread replies + check-in replies. Off still allows check-in reminders.';

create or replace function public.live_href(p_challenge_id uuid, p_post_id uuid, p_comment_id uuid default null)
returns text
language sql
immutable
as $$
  select '/challenges/' || p_challenge_id::text
    || '?tab=live'
    || case when p_post_id is not null then '&postId=' || p_post_id::text else '' end
    || case
         when p_comment_id is not null then '&comments=1&commentId=' || p_comment_id::text
         else ''
       end;
$$;

drop function if exists public.notify_live_thread(uuid, uuid, text, text, text, jsonb, uuid[]);

create or replace function public.notify_live_thread(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_mentioned_ids uuid[] default '{}',
  p_parent_author_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_user uuid;
  v_id uuid;
  v_push uuid[] := '{}';
  v_notify uuid[] := '{}';
  v_mute text;
  v_mentioned uuid[] := coalesce(p_mentioned_ids, '{}');
  v_parents uuid[] := coalesce(p_parent_author_ids, '{}');
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_key text;
begin
  if p_challenge_id is null or p_actor_id is null or coalesce(p_title, '') = '' then
    return;
  end if;
  if p_type not in ('live_message', 'live_checkin', 'live_reply') then
    return;
  end if;

  v_key := nullif(v_data->>'dedupe_key', '');

  for rec in
    select cp.user_id, coalesce(cp.live_mute, 'all') as live_mute
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.user_id is distinct from p_actor_id
      and public.live_joined_participant(cp.status, cp.eliminated_at)
  loop
    v_user := rec.user_id;
    if public.users_blocked(p_actor_id, v_user) then
      continue;
    end if;
    v_mute := rec.live_mute;
    if v_mute = 'off' then
      continue;
    end if;
    if v_mute = 'mentions'
       and not (
         v_user = any (v_mentioned)
         or v_user = any (v_parents)
       ) then
      continue;
    end if;

    v_id := null;
    begin
      insert into public.notifications (user_id, actor_id, type, title, body, data)
      select v_user, p_actor_id, p_type, p_title, p_body, v_data
      where v_key is null or not exists (
        select 1 from public.notifications n
        where n.user_id = v_user
          and n.type = p_type
          and n.data->>'dedupe_key' = v_key
      )
      returning id into v_id;
    exception when unique_violation then
      v_id := null;
    end;

    if v_id is null then
      continue;
    end if;
    v_notify := v_notify || v_id;
    if not public.live_thread_focused(v_user, p_challenge_id) then
      v_push := v_push || v_user;
    end if;
  end loop;

  if cardinality(v_push) > 0 then
    perform public.send_push_to_users(
      v_push,
      p_title,
      coalesce(nullif(p_body, ''), p_title),
      v_data || jsonb_build_object('type', p_type),
      v_notify
    );
  end if;
exception when others then
  raise warning 'notify_live_thread failed: %', sqlerrm;
end;
$$;

revoke all on function public.notify_live_thread(uuid, uuid, text, text, text, jsonb, uuid[], uuid[]) from public, anon, authenticated;

create or replace function public.notify_challenge_checkin(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
  v_pronoun text;
  v_copy text;
  v_href text;
  v_mentioned uuid[] := '{}';
begin
  if p_challenge_id is null or p_actor_id is null then
    return;
  end if;

  v_name := public.profile_display_name(p_actor_id);
  v_pronoun := coalesce(public.profile_object_pronoun(p_actor_id), 'them');
  select coalesce(nullif(btrim(c.title), ''), 'this challenge')
    into v_title
  from public.challenges c
  where c.id = p_challenge_id;
  if v_title is null then
    return;
  end if;

  v_copy := v_name || ' Check-In @' || v_title || '. Congratulate ' || v_pronoun || '.';
  v_href := public.live_href(p_challenge_id, p_post_id, null);
  if p_post_id is not null then
    select public.live_mentioned_user_ids(p.content, p_actor_id)
      into v_mentioned
    from public.posts p
    where p.id = p_post_id;
  end if;

  perform public.notify_live_thread(
    p_challenge_id,
    p_actor_id,
    'live_checkin',
    v_copy,
    v_copy,
    jsonb_build_object(
      'type', 'live_checkin',
      'challengeId', p_challenge_id,
      'postId', p_post_id,
      'actorId', p_actor_id,
      'challenge_id', p_challenge_id,
      'post_id', p_post_id,
      'actor_id', p_actor_id,
      'href', v_href,
      'url', v_href,
      'dedupe_key', 'live-checkin:' || p_challenge_id || ':' || p_actor_id || ':' || coalesce(p_post_id::text, to_char((timezone('utc', now()))::date, 'YYYY-MM-DD'))
    ),
    coalesce(v_mentioned, '{}'::uuid[]),
    '{}'::uuid[]
  );
exception when others then
  null;
end;
$$;

create or replace function public.trg_notify_live_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
  v_snippet text;
  v_kind text;
  v_href text;
  v_mentioned uuid[];
  v_parent uuid;
  v_parents uuid[] := '{}';
begin
  if not public.is_live_origin_post(new.source, new.challenge_id) then
    return new;
  end if;
  if new.source is not distinct from 'checkin' then
    return new;
  end if;
  if coalesce(new.type, 'feed') not in ('feed', 'challenge') then
    return new;
  end if;
  if new.author_id is null then
    return new;
  end if;

  v_name := public.profile_display_name(new.author_id);
  select coalesce(nullif(btrim(c.title), ''), 'this challenge')
    into v_title
  from public.challenges c
  where c.id = new.challenge_id;
  if v_title is null then
    return new;
  end if;

  v_snippet := public.live_chat_snippet(new.content);
  if coalesce(v_snippet, '') = '' then
    if coalesce(array_length(new.media_urls, 1), 0) > 0 then
      v_snippet := 'Photo';
    else
      v_snippet := v_name || ' in ' || v_title;
    end if;
  end if;

  v_kind := case when new.parent_id is not null then 'live_reply' else 'live_message' end;
  v_href := public.live_href(new.challenge_id, new.id, null);
  v_mentioned := public.live_mentioned_user_ids(new.content, new.author_id);
  if new.parent_id is not null then
    select author_id into v_parent from public.posts where id = new.parent_id;
    if v_parent is not null then
      v_parents := array[v_parent];
    end if;
  end if;

  perform public.notify_live_thread(
    new.challenge_id,
    new.author_id,
    v_kind,
    v_name || ' in ' || v_title,
    v_snippet,
    jsonb_build_object(
      'type', v_kind,
      'challengeId', new.challenge_id,
      'postId', new.id,
      'actorId', new.author_id,
      'challenge_id', new.challenge_id,
      'post_id', new.id,
      'actor_id', new.author_id,
      'parent_id', new.parent_id,
      'href', v_href,
      'url', v_href,
      'dedupe_key', 'live:' || new.id::text
    ),
    v_mentioned,
    v_parents
  );
  return new;
exception when others then
  return new;
end;
$$;

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
  v_name text;
  v_title text;
  v_snippet text;
  v_live_href text;
  v_mentioned uuid[];
  v_parents uuid[] := '{}';
begin
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return new;
  end if;

  if public.is_live_origin_post(v_post.source, v_post.challenge_id) then
    v_name := public.profile_display_name(new.author_id);
    select coalesce(nullif(btrim(c.title), ''), 'this challenge')
      into v_title
    from public.challenges c
    where c.id = v_post.challenge_id;
    v_snippet := public.live_chat_snippet(new.content);
    if coalesce(v_snippet, '') = '' then
      v_snippet := v_name || ' in ' || coalesce(v_title, 'this challenge');
    end if;
    v_live_href := public.live_href(v_post.challenge_id, v_post.id, new.id);
    v_mentioned := public.live_mentioned_user_ids(new.content, new.author_id);
    if v_post.author_id is not null then
      v_parents := array[v_post.author_id];
    end if;
    if new.parent_id is not null then
      select author_id into v_parent_author
      from public.comments
      where id = new.parent_id;
      if v_parent_author is not null then
        v_parents := v_parents || v_parent_author;
      end if;
    end if;
    perform public.notify_live_thread(
      v_post.challenge_id,
      new.author_id,
      'live_reply',
      v_name || ' in ' || coalesce(v_title, 'this challenge'),
      v_snippet,
      jsonb_build_object(
        'type', 'live_reply',
        'challengeId', v_post.challenge_id,
        'postId', v_post.id,
        'commentId', new.id,
        'actorId', new.author_id,
        'challenge_id', v_post.challenge_id,
        'post_id', v_post.id,
        'comment_id', new.id,
        'parent_comment_id', new.parent_id,
        'actor_id', new.author_id,
        'href', v_live_href,
        'url', v_live_href,
        'dedupe_key', 'live-comment:' || new.id::text
      ),
      v_mentioned,
      v_parents
    );
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
    v_href := '/feed?postId=' || v_post.id::text || '&comments=1&commentId=' || new.id::text
      || case
           when v_post.challenge_id is not null
             then '&challengeId=' || v_post.challenge_id::text
           else ''
         end;
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

create or replace function public.trg_notify_post_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_mute boolean;
  v_post public.posts%rowtype;
  v_title text;
  v_snippet text;
  v_href text;
  v_kind text;
  v_parent uuid;
  v_parents uuid[] := '{}';
begin
  if new.mentioned_user_id is not distinct from new.author_id then
    return new;
  end if;
  if public.users_blocked(new.author_id, new.mentioned_user_id) then
    return new;
  end if;
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return new;
  end if;

  if public.is_live_origin_post(v_post.source, v_post.challenge_id) then
    v_name := public.profile_display_name(new.author_id);
    select coalesce(nullif(btrim(c.title), ''), 'this challenge')
      into v_title
    from public.challenges c
    where c.id = v_post.challenge_id;
    v_snippet := public.live_chat_snippet(v_post.content);
    if coalesce(v_snippet, '') = '' then
      v_snippet := v_name || ' in ' || coalesce(v_title, 'this challenge');
    end if;
    v_href := public.live_href(v_post.challenge_id, v_post.id, null);
    v_kind := case
      when v_post.source is not distinct from 'checkin' then 'live_checkin'
      when v_post.parent_id is not null then 'live_reply'
      else 'live_message'
    end;
    if v_post.parent_id is not null then
      select author_id into v_parent from public.posts where id = v_post.parent_id;
      if v_parent is not null then
        v_parents := array[v_parent];
      end if;
    elsif v_post.source is not distinct from 'checkin' then
      v_parents := '{}';
    end if;
    perform public.notify_live_thread(
      v_post.challenge_id,
      new.author_id,
      v_kind,
      case
        when v_kind = 'live_checkin' then
          v_name || ' Check-In @' || coalesce(v_title, 'this challenge') || '. Congratulate ' || coalesce(public.profile_object_pronoun(new.author_id), 'them') || '.'
        else v_name || ' in ' || coalesce(v_title, 'this challenge')
      end,
      case
        when v_kind = 'live_checkin' then
          v_name || ' Check-In @' || coalesce(v_title, 'this challenge') || '. Congratulate ' || coalesce(public.profile_object_pronoun(new.author_id), 'them') || '.'
        else v_snippet
      end,
      jsonb_build_object(
        'type', v_kind,
        'challengeId', v_post.challenge_id,
        'postId', v_post.id,
        'actorId', new.author_id,
        'challenge_id', v_post.challenge_id,
        'post_id', v_post.id,
        'actor_id', new.author_id,
        'href', v_href,
        'url', v_href,
        'dedupe_key', case
          when v_kind = 'live_checkin' then 'live-checkin:' || v_post.challenge_id || ':' || new.author_id || ':' || v_post.id::text
          else 'live:' || v_post.id::text
        end
      ),
      array[new.mentioned_user_id],
      v_parents
    );
    return new;
  end if;

  select coalesce(mute_mentions, false) into v_mute
  from public.profiles
  where id = new.mentioned_user_id;
  if v_mute then
    return new;
  end if;
  if not (
    v_post.audience = 'public'
    or (v_post.audience = 'friends' and public.are_accepted_friends(new.mentioned_user_id, v_post.author_id))
    or (v_post.audience = 'specific' and new.mentioned_user_id = any (coalesce(v_post.audience_user_ids, '{}')))
    or v_post.wall_host_id is not distinct from new.mentioned_user_id
    or (
      v_post.challenge_id is not null
      and exists (
        select 1 from public.challenge_participants cp
        where cp.challenge_id = v_post.challenge_id
          and cp.user_id = new.mentioned_user_id
          and public.live_joined_participant(cp.status, cp.eliminated_at)
      )
    )
  ) then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    new.mentioned_user_id,
    new.author_id,
    'tagged',
    v_name || ' tagged you.',
    null,
    jsonb_build_object(
      'type', 'tagged',
      'challengeId', v_post.challenge_id,
      'postId', new.post_id,
      'actorId', new.author_id,
      'challenge_id', v_post.challenge_id,
      'post_id', new.post_id,
      'actor_id', new.author_id,
      'dedupe_key', 'mention:' || new.post_id || ':' || new.mentioned_user_id
    )
  );
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
  v_parent_author uuid;
  v_name text;
  v_title text;
  v_snippet text;
  v_live_href text;
  v_comment text;
  v_parents uuid[] := '{}';
begin
  if new.mentioned_user_id is not distinct from new.author_id then
    return new;
  end if;
  if public.users_blocked(new.author_id, new.mentioned_user_id) then
    return new;
  end if;
  select p.* into v_post
  from public.comments c
  join public.posts p on p.id = c.post_id
  where c.id = new.comment_id;
  if not found then
    return new;
  end if;

  if public.is_live_origin_post(v_post.source, v_post.challenge_id) then
    select c.content, c.parent_id into v_comment, v_parent
    from public.comments c
    where c.id = new.comment_id;
    v_name := public.profile_display_name(new.author_id);
    select coalesce(nullif(btrim(c.title), ''), 'this challenge')
      into v_title
    from public.challenges c
    where c.id = v_post.challenge_id;
    v_snippet := public.live_chat_snippet(v_comment);
    if coalesce(v_snippet, '') = '' then
      v_snippet := v_name || ' in ' || coalesce(v_title, 'this challenge');
    end if;
    v_live_href := public.live_href(v_post.challenge_id, v_post.id, new.comment_id);
    if v_post.author_id is not null then
      v_parents := array[v_post.author_id];
    end if;
    if v_parent is not null then
      select author_id into v_parent_author from public.comments where id = v_parent;
      if v_parent_author is not null then
        v_parents := v_parents || v_parent_author;
      end if;
    end if;
    perform public.notify_live_thread(
      v_post.challenge_id,
      new.author_id,
      'live_reply',
      v_name || ' in ' || coalesce(v_title, 'this challenge'),
      v_snippet,
      jsonb_build_object(
        'type', 'live_reply',
        'challengeId', v_post.challenge_id,
        'postId', v_post.id,
        'commentId', new.comment_id,
        'actorId', new.author_id,
        'challenge_id', v_post.challenge_id,
        'post_id', v_post.id,
        'comment_id', new.comment_id,
        'parent_comment_id', v_parent,
        'actor_id', new.author_id,
        'href', v_live_href,
        'url', v_live_href,
        'dedupe_key', 'live-comment:' || new.comment_id::text
      ),
      array[new.mentioned_user_id],
      v_parents
    );
    return new;
  end if;

  select coalesce(mute_mentions, false) into v_mute
  from public.profiles
  where id = new.mentioned_user_id;
  if v_mute then
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

notify pgrst, 'reload schema';
