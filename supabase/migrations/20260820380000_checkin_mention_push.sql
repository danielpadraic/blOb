-- Check-in + mention alerts, Expo push after notify_user, private gender.

alter table public.notifications
  add column if not exists pushed_at timestamptz;

comment on column public.notifications.pushed_at is
  'Set after Expo push is queued. Retries skip rows that already have a timestamp.';

alter table public.profiles
  add column if not exists pronoun text;

comment on column public.profiles.gender is
  'Owner-only. Used for object pronouns in check-in alerts. Never selected on public profile queries.';
comment on column public.profiles.pronoun is
  'Optional owner-only override (her/him/them or female/male). Never selected on public profile queries.';

-- ---------------------------------------------------------------------------
-- Pronoun helper (private profile fields only)
-- ---------------------------------------------------------------------------
create or replace function public.profile_object_pronoun(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case lower(btrim(coalesce(
    nullif(p.pronoun, ''),
    nullif(p.gender::text, ''),
    ''
  )))
    when 'female' then 'her'
    when 'she' then 'her'
    when 'her' then 'her'
    when 'male' then 'him'
    when 'he' then 'him'
    when 'him' then 'him'
    else 'them'
  end
  from public.profiles p
  where p.id = p_user_id;
$$;

revoke all on function public.profile_object_pronoun(uuid) from public, anon, authenticated;
grant execute on function public.profile_object_pronoun(uuid) to service_role;

comment on view public.profiles_public is
  'Public profile projection. Body metrics, gender, and pronoun stay private.';

-- ---------------------------------------------------------------------------
-- Expo / Edge push after notify_user insert
-- ---------------------------------------------------------------------------
create or replace function public.send_push_to_user(
  p_user_id uuid,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_messages jsonb := '[]'::jsonb;
  rec record;
begin
  if p_user_id is null or coalesce(p_title, '') = '' then
    return;
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return;
  end if;

  for rec in
    select token from public.push_tokens where user_id = p_user_id
  loop
    v_messages := v_messages || jsonb_build_array(jsonb_build_object(
      'to', rec.token,
      'title', p_title,
      'body', coalesce(nullif(p_body, ''), p_title),
      'sound', 'default',
      'data', coalesce(p_data, '{}'::jsonb)
    ));
  end loop;

  if v_messages = '[]'::jsonb then
    return;
  end if;

  begin
    perform net.http_post(
      url := coalesce(
        nullif(current_setting('app.edge_push_url', true), ''),
        'https://exp.host/--/api/v2/push/send'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json'
      ),
      body := case
        when current_setting('app.edge_push_url', true) <> '' then
          jsonb_build_object('messages', v_messages)
        else v_messages
      end
    );
  exception when others then
    null;
  end;
exception when others then
  null;
end;
$$;

create or replace function public.enqueue_notification_push(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.notifications%rowtype;
  v_data jsonb;
begin
  if p_notification_id is null then
    return;
  end if;

  select * into v_row
  from public.notifications
  where id = p_notification_id;
  if not found or v_row.pushed_at is not null then
    return;
  end if;

  v_data := coalesce(v_row.data, '{}'::jsonb) || jsonb_build_object(
    'notification_id', v_row.id,
    'type', v_row.type,
    'challengeId', coalesce(v_row.data->>'challengeId', v_row.data->>'challenge_id'),
    'postId', coalesce(v_row.data->>'postId', v_row.data->>'post_id'),
    'actorId', coalesce(v_row.data->>'actorId', v_row.data->>'actor_id', v_row.actor_id::text)
  );

  perform public.send_push_to_user(
    v_row.user_id,
    v_row.title,
    coalesce(nullif(v_row.body, ''), v_row.title),
    v_data
  );

  update public.notifications
    set pushed_at = now()
    where id = v_row.id
      and pushed_at is null;
exception when others then
  null;
end;
$$;

create or replace function public.insert_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_key text;
begin
  if p_user_id is null or coalesce(p_title, '') = '' or coalesce(p_type, '') = '' then
    return null;
  end if;
  if p_actor_id is not null and p_user_id = p_actor_id then
    return null;
  end if;

  v_key := nullif(v_data->>'dedupe_key', '');
  if v_key is not null then
    select id into v_id
    from public.notifications
    where user_id = p_user_id
      and type = p_type
      and data->>'dedupe_key' = v_key
    limit 1;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, data)
  values (p_user_id, p_actor_id, p_type, p_title, p_body, v_data)
  returning id into v_id;

  begin
    perform public.enqueue_notification_push(v_id);
  exception when others then
    null;
  end;

  return v_id;
exception when others then
  return null;
end;
$$;

create or replace function public.notify_user(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_notification(p_user_id, p_type, p_title, p_body, p_data, p_actor_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Challenge check-in → every other live participant
-- ---------------------------------------------------------------------------
drop function if exists public.notify_challenge_checkin(uuid, uuid, uuid);
drop function if exists public.notify_challenge_checkin(uuid, uuid);

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
  v_day text := to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
  rec record;
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

  for rec in
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.user_id is distinct from p_actor_id
      and coalesce(cp.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
  loop
    perform public.notify_user(
      rec.user_id,
      p_actor_id,
      'challenge_checkin',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_checkin',
        'challengeId', p_challenge_id,
        'postId', p_post_id,
        'actorId', p_actor_id,
        'challenge_id', p_challenge_id,
        'post_id', p_post_id,
        'actor_id', p_actor_id,
        'dedupe_key', 'checkin:' || p_challenge_id || ':' || p_actor_id || ':' || v_day
      )
    );
  end loop;
exception when others then
  null;
end;
$$;

grant execute on function public.notify_challenge_checkin(uuid, uuid, uuid) to authenticated;

create or replace function public.trg_notify_checkin_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source is distinct from 'checkin' then
    return new;
  end if;
  if new.challenge_id is null or new.author_id is null then
    return new;
  end if;
  if coalesce(new.checkin_stage, 'submitted') is distinct from 'submitted' then
    return new;
  end if;
  perform public.notify_challenge_checkin(new.challenge_id, new.author_id, new.id);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_notify_checkin on public.posts;
create trigger posts_notify_checkin
  after insert on public.posts
  for each row
  execute function public.trg_notify_checkin_post();

-- ---------------------------------------------------------------------------
-- @mention copy (true mentions only — post_mentions / comment_mentions)
-- ---------------------------------------------------------------------------
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
          and coalesce(cp.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
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
  v_name text;
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
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    new.mentioned_user_id,
    new.author_id,
    'mentioned',
    v_name || ' mentioned you in a comment.',
    null,
    jsonb_build_object(
      'type', 'mentioned',
      'challengeId', v_post.challenge_id,
      'postId', v_post.id,
      'actorId', new.author_id,
      'challenge_id', v_post.challenge_id,
      'post_id', v_post.id,
      'comment_id', new.comment_id,
      'actor_id', new.author_id,
      'dedupe_key', 'mention-comment:' || new.comment_id || ':' || new.mentioned_user_id
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

notify pgrst, 'reload schema';
