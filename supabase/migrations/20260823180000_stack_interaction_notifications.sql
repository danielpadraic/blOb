-- Stack mention / reaction / reply notifications per recipient + target.
-- One open row (unread or last 24h), rewritten copy, re-pushed.

create index if not exists notifications_stack_key_idx
  on public.notifications (user_id, type, ((data->>'stack_key')))
  where data ? 'stack_key';

create or replace function public.user_can_see_post(p_user_id uuid, p_post_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_c public.challenges%rowtype;
begin
  if p_user_id is null or p_post_id is null then
    return false;
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    return false;
  end if;

  if v_post.author_id is not distinct from p_user_id then
    return true;
  end if;

  if public.users_blocked(v_post.author_id, p_user_id) then
    return false;
  end if;

  if v_post.challenge_id is not null then
    select * into v_c from public.challenges where id = v_post.challenge_id;
    if found then
      if public.is_invite_only_challenge(v_c)
         or coalesce(v_post.source, 'feed') = 'challenge' then
        return public.user_can_access_challenge(v_post.challenge_id, p_user_id);
      end if;
    end if;
  end if;

  if coalesce(v_post.audience, 'public') = 'public' then
    return true;
  end if;
  if v_post.audience = 'friends' and public.are_accepted_friends(p_user_id, v_post.author_id) then
    return true;
  end if;
  if v_post.audience = 'specific' and p_user_id = any (coalesce(v_post.audience_user_ids, '{}')) then
    return true;
  end if;
  if v_post.wall_host_id is not distinct from p_user_id then
    return true;
  end if;
  if v_post.challenge_id is not null
     and public.is_challenge_participant(v_post.challenge_id, p_user_id) then
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.stacked_interaction_title(
  p_name text,
  p_count int,
  p_one_suffix text,
  p_many_suffix text
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_count, 1) <= 1 then
      coalesce(nullif(p_name, ''), 'Someone') || ' ' || p_one_suffix
    when coalesce(p_count, 1) - 1 = 1 then
      coalesce(nullif(p_name, ''), 'Someone') || ' and 1 other ' || p_many_suffix
    else
      coalesce(nullif(p_name, ''), 'Someone')
        || ' and ' || (coalesce(p_count, 1) - 1)::text || ' others '
        || p_many_suffix
  end;
$$;

create or replace function public.notify_stacked_interaction(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_stack_key text,
  p_one_suffix text,
  p_many_suffix text,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_ids jsonb;
  v_count int;
  v_name text;
  v_title text;
  v_actor text;
begin
  if p_user_id is null or p_actor_id is null or p_user_id = p_actor_id then
    return null;
  end if;
  if coalesce(p_type, '') = '' or coalesce(p_stack_key, '') = '' then
    return null;
  end if;
  if public.users_blocked(p_user_id, p_actor_id) then
    return null;
  end if;

  v_actor := p_actor_id::text;
  v_name := coalesce(nullif(public.profile_display_name(p_actor_id), ''), 'Someone');

  select n.id, n.data->'actor_ids'
    into v_id, v_ids
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = p_type
    and n.data->>'stack_key' = p_stack_key
    and (n.read_at is null or n.created_at > now() - interval '24 hours')
  order by n.created_at desc
  limit 1;

  if v_id is not null then
    v_ids := coalesce(v_ids, '[]'::jsonb);
    select coalesce(jsonb_agg(to_jsonb(x.elem)), '[]'::jsonb)
      into v_ids
    from jsonb_array_elements_text(v_ids) as x(elem)
    where x.elem is distinct from v_actor;
    v_ids := jsonb_build_array(v_actor) || v_ids;
    v_count := jsonb_array_length(v_ids);
    v_title := public.stacked_interaction_title(v_name, v_count, p_one_suffix, p_many_suffix);
    v_data := coalesce(
      (select data from public.notifications where id = v_id),
      '{}'::jsonb
    ) || v_data || jsonb_build_object(
      'stack_key', p_stack_key,
      'actor_id', p_actor_id,
      'actorId', p_actor_id,
      'actor_ids', v_ids,
      'count', v_count
    );

    update public.notifications
    set actor_id = p_actor_id,
        title = v_title,
        body = v_title,
        data = v_data,
        read_at = null,
        created_at = now(),
        pushed_at = null
    where id = v_id;

    begin
      perform public.enqueue_notification_push(v_id);
    exception when others then
      null;
    end;
    return v_id;
  end if;

  v_ids := jsonb_build_array(v_actor);
  v_title := public.stacked_interaction_title(v_name, 1, p_one_suffix, p_many_suffix);
  v_data := v_data || jsonb_build_object(
    'stack_key', p_stack_key,
    'actor_id', p_actor_id,
    'actorId', p_actor_id,
    'actor_ids', v_ids,
    'count', 1
  );

  return public.insert_notification(p_user_id, p_type, v_title, v_title, v_data, p_actor_id);
exception when others then
  return null;
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
begin
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return new;
  end if;

  if v_post.author_id is distinct from new.author_id
     and public.user_can_see_post(v_post.author_id, v_post.id) then
    perform public.notify_stacked_interaction(
      v_post.author_id,
      new.author_id,
      'post_comment',
      'post:' || new.post_id::text,
      'replied to your post',
      'replied to your post',
      jsonb_build_object(
        'post_id', new.post_id,
        'postId', new.post_id,
        'comment_id', new.id,
        'challenge_id', v_post.challenge_id,
        'challengeId', v_post.challenge_id
      )
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
        jsonb_build_object(
          'post_id', new.post_id,
          'postId', new.post_id,
          'comment_id', new.id,
          'challenge_id', v_post.challenge_id,
          'challengeId', v_post.challenge_id
        )
      );
    end if;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists comments_notify_author on public.comments;
create trigger comments_notify_author
  after insert on public.comments
  for each row execute function public.trg_notify_comment();

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
  v_stack text;
  v_one text;
  v_many text;
begin
  if new.post_id is not null then
    select author_id, id, challenge_id into v_author, v_post_id, v_challenge
    from public.posts
    where id = new.post_id;
    v_stack := 'post:' || new.post_id::text;
    v_one := 'reacted to your post';
    v_many := 'reacted to your post';
  elsif new.comment_id is not null then
    select c.author_id, c.post_id, p.challenge_id
      into v_author, v_post_id, v_challenge
    from public.comments c
    join public.posts p on p.id = c.post_id
    where c.id = new.comment_id;
    v_stack := 'comment:' || new.comment_id::text;
    v_one := 'reacted to your comment';
    v_many := 'reacted to your comment';
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
      'challengeId', v_challenge
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reactions_notify_author on public.reactions;
create trigger reactions_notify_author
  after insert on public.reactions
  for each row execute function public.trg_notify_reaction();

create or replace function public.trg_notify_post_mention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mute boolean;
  v_post public.posts%rowtype;
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
  select * into v_post from public.posts where id = new.post_id;
  if not found then
    return new;
  end if;
  if not public.user_can_see_post(new.mentioned_user_id, v_post.id) then
    return new;
  end if;

  perform public.notify_stacked_interaction(
    new.mentioned_user_id,
    new.author_id,
    'tagged',
    'post:' || new.post_id::text,
    'tagged you',
    'tagged you in a post',
    jsonb_build_object(
      'post_id', new.post_id,
      'postId', new.post_id,
      'challenge_id', v_post.challenge_id,
      'challengeId', v_post.challenge_id
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
  v_mute boolean;
  v_post public.posts%rowtype;
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

  perform public.notify_stacked_interaction(
    new.mentioned_user_id,
    new.author_id,
    'mentioned',
    'comment:' || new.comment_id::text,
    'tagged you',
    'tagged you in a comment',
    jsonb_build_object(
      'post_id', v_post.id,
      'postId', v_post.id,
      'comment_id', new.comment_id,
      'challenge_id', v_post.challenge_id,
      'challengeId', v_post.challenge_id
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists post_mentions_notify on public.post_mentions;
create trigger post_mentions_notify
  after insert on public.post_mentions
  for each row execute function public.trg_notify_post_mention();

drop trigger if exists comment_mentions_notify on public.comment_mentions;
create trigger comment_mentions_notify
  after insert on public.comment_mentions
  for each row execute function public.trg_notify_comment_mention();

revoke all on function public.user_can_see_post(uuid, uuid) from public, anon, authenticated;
revoke all on function public.stacked_interaction_title(text, int, text, text) from public, anon, authenticated;
revoke all on function public.notify_stacked_interaction(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
