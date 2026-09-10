-- Multi-react + ROFL. Paste in the Supabase SQL Editor.
-- Do not db push --include-all.

-- ---------------------------------------------------------------------------
-- Unique: one row per user per post per type (same for comments).
-- ---------------------------------------------------------------------------
drop index if exists public.reactions_user_post_unique_idx;
drop index if exists public.reactions_user_comment_unique_idx;

alter table public.reactions drop constraint if exists reactions_user_id_post_id_key;
alter table public.reactions drop constraint if exists reactions_user_id_comment_id_key;
alter table public.reactions drop constraint if exists reactions_user_id_post_id_reaction_type_key;
alter table public.reactions drop constraint if exists reactions_user_id_comment_id_reaction_type_key;

create unique index if not exists reactions_user_post_type_unique_idx
  on public.reactions (user_id, post_id, reaction_type)
  where post_id is not null;

create unique index if not exists reactions_user_comment_type_unique_idx
  on public.reactions (user_id, comment_id, reaction_type)
  where comment_id is not null;

-- ---------------------------------------------------------------------------
-- Allow rofl on posts and comments (same check).
-- ---------------------------------------------------------------------------
alter table public.reactions drop constraint if exists reaction_type_known;
alter table public.reactions
  add constraint reaction_type_known
  check (reaction_type in (
    'like',
    'love',
    'care',
    'fire',
    'sad',
    'laugh',
    'shock',
    'applause',
    'praise',
    'rofl'
  ));

-- ---------------------------------------------------------------------------
-- Insert still stacks. Delete retracts that (post/comment + type) row
-- and recounts “Name and N others reacted”. Last actor deletes the bell row.
-- ---------------------------------------------------------------------------
create or replace function public.unstack_interaction(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_stack_key text,
  p_one_suffix text,
  p_many_suffix text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_ids jsonb;
  v_count int;
  v_actor text;
  v_keep text;
  v_name text;
  v_title text;
begin
  if p_user_id is null or p_actor_id is null or coalesce(p_stack_key, '') = '' then
    return;
  end if;

  v_actor := p_actor_id::text;

  select n.id, n.data->'actor_ids'
    into v_id, v_ids
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = p_type
    and n.data->>'stack_key' = p_stack_key
  order by n.created_at desc
  limit 1;

  if v_id is null then
    return;
  end if;

  select coalesce(jsonb_agg(to_jsonb(x.elem)), '[]'::jsonb)
    into v_ids
  from jsonb_array_elements_text(coalesce(v_ids, '[]'::jsonb)) as x(elem)
  where x.elem is distinct from v_actor;

  v_count := jsonb_array_length(v_ids);
  if v_count <= 0 then
    delete from public.notifications where id = v_id;
    return;
  end if;

  v_keep := v_ids ->> 0;
  v_name := coalesce(
    nullif(public.profile_display_name(v_keep::uuid), ''),
    'Someone'
  );
  v_title := public.stacked_interaction_title(v_name, v_count, p_one_suffix, p_many_suffix);

  update public.notifications
  set actor_id = v_keep::uuid,
      title = v_title,
      body = v_title,
      data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
        'stack_key', p_stack_key,
        'actor_id', v_keep::uuid,
        'actorId', v_keep::uuid,
        'actor_ids', v_ids,
        'count', v_count
      )
  where id = v_id;
exception when others then
  return;
end;
$$;

revoke all on function public.unstack_interaction(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.unstack_interaction(uuid, uuid, text, text, text, text) to service_role;

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
  v_kind text;
begin
  v_kind := coalesce(nullif(new.reaction_type, ''), 'like');
  if new.post_id is not null then
    select author_id, id, challenge_id, type
      into v_author, v_post_id, v_challenge, v_type
    from public.posts
    where id = new.post_id;
    v_stack := 'post:' || new.post_id::text || ':' || v_kind;
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
    v_stack := 'comment:' || new.comment_id::text || ':' || v_kind;
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
      'reel_id', v_reel,
      'reaction_type', v_kind
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_unstack_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_post_id uuid;
  v_type text;
  v_kind text;
  v_stack text;
  v_legacy text;
  v_one text;
  v_many text;
  v_left int;
begin
  v_kind := coalesce(nullif(old.reaction_type, ''), 'like');
  if old.post_id is not null then
    select author_id, id, type
      into v_author, v_post_id, v_type
    from public.posts
    where id = old.post_id;
    v_stack := 'post:' || old.post_id::text || ':' || v_kind;
    v_legacy := 'post:' || old.post_id::text;
    if v_type = 'wave' then
      v_one := 'reacted to your Wave';
      v_many := 'reacted to your Wave';
    elsif v_type = 'round' then
      v_one := 'reacted to your Round';
      v_many := 'reacted to your Round';
    else
      v_one := 'reacted to your post';
      v_many := 'reacted to your post';
    end if;
  elsif old.comment_id is not null then
    select c.author_id, c.post_id
      into v_author, v_post_id
    from public.comments c
    where c.id = old.comment_id;
    v_stack := 'comment:' || old.comment_id::text || ':' || v_kind;
    v_legacy := 'comment:' || old.comment_id::text;
    v_one := 'reacted to your comment';
    v_many := 'reacted to your comment';
  else
    return old;
  end if;

  if v_author is null or v_author = old.user_id then
    return old;
  end if;

  perform public.unstack_interaction(
    v_author,
    old.user_id,
    'post_reaction',
    v_stack,
    v_one,
    v_many
  );

  if old.post_id is not null then
    select count(*) into v_left
    from public.reactions
    where user_id = old.user_id
      and post_id = old.post_id;
  else
    select count(*) into v_left
    from public.reactions
    where user_id = old.user_id
      and comment_id = old.comment_id;
  end if;

  if coalesce(v_left, 0) = 0 then
    perform public.unstack_interaction(
      v_author,
      old.user_id,
      'post_reaction',
      v_legacy,
      v_one,
      v_many
    );
  end if;

  return old;
exception when others then
  return old;
end;
$$;

drop trigger if exists reactions_notify_author on public.reactions;
create trigger reactions_notify_author
  after insert on public.reactions
  for each row execute function public.trg_notify_reaction();

drop trigger if exists reactions_unstack_author on public.reactions;
create trigger reactions_unstack_author
  after delete on public.reactions
  for each row execute function public.trg_unstack_reaction();
