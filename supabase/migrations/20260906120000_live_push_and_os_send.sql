-- OS push send path + Live thread fanout.
--
-- Root cause of zero lock-screen push: pg_net was not installed, so send_push_to_user
-- returned without HTTP. In-app rows still inserted and pushed_at was stamped anyway.
-- Apply on live blOb-app (tguzdtwsajnnczdxjqyq). Safe to re-run.

create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Hook key so the Edge Function is not an open send endpoint
-- ---------------------------------------------------------------------------
create table if not exists public.push_hook_config (
  id int primary key default 1 check (id = 1),
  hook_key text not null
);

insert into public.push_hook_config (id, hook_key)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

alter table public.push_hook_config enable row level security;
revoke all on table public.push_hook_config from public, anon, authenticated;
grant select on table public.push_hook_config to service_role;

-- ---------------------------------------------------------------------------
-- Mute (per challenge) + Live focus (skip OS push while looking at that Live tab)
-- ---------------------------------------------------------------------------
alter table public.challenge_participants
  add column if not exists live_mute text not null default 'all';

do $$
begin
  alter table public.challenge_participants drop constraint if exists challenge_participants_live_mute_known;
  alter table public.challenge_participants
    add constraint challenge_participants_live_mute_known
    check (live_mute in ('all', 'mentions', 'off'));
exception when others then
  null;
end $$;

comment on column public.challenge_participants.live_mute is
  'Live thread alerts: all | mentions | off. Default all. Mentions still includes @tags and check-in receipts.';

create table if not exists public.live_thread_focus (
  user_id uuid not null references public.profiles (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  focused_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

comment on table public.live_thread_focus is
  'Client heartbeat while the Live tab for that challenge is focused. Fresh rows skip OS push (in-app insert still happens).';

create index if not exists live_thread_focus_challenge_idx
  on public.live_thread_focus (challenge_id, focused_at desc);

alter table public.live_thread_focus enable row level security;

drop policy if exists live_thread_focus_select_own on public.live_thread_focus;
create policy live_thread_focus_select_own on public.live_thread_focus
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists live_thread_focus_insert_own on public.live_thread_focus;
create policy live_thread_focus_insert_own on public.live_thread_focus
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists live_thread_focus_update_own on public.live_thread_focus;
create policy live_thread_focus_update_own on public.live_thread_focus
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists live_thread_focus_delete_own on public.live_thread_focus;
create policy live_thread_focus_delete_own on public.live_thread_focus
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.live_thread_focus to authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_known;
alter table public.notifications add constraint notifications_type_known check (type in (
  'challenge_invite',
  'challenge_new',
  'tagged',
  'mentioned',
  'profile_wall',
  'challenge_joined',
  'challenge_join_confirmed',
  'follow',
  'friend_request',
  'friend_accepted',
  'friend_challenge',
  'post_comment',
  'post_reaction',
  'post_reposted',
  'story_reaction',
  'story_comment',
  'story_shared',
  'coins_received',
  'coin_grant',
  'challenge_settled',
  'challenge_placed',
  'challenge_eliminated',
  'challenge_starting',
  'challenge_checkin_reminder',
  'challenge_checkin',
  'competitor_dropped',
  'challenge_won',
  'challenge_lost',
  'payout_received',
  'profile_incomplete',
  'interests_reminder',
  'callout_received',
  'callout_accepted',
  'callout_resolved',
  'callout_disputed',
  'callout_cancelled',
  'callout_observer_invited',
  'badge_unlocked',
  'challenge_cancelled',
  'message',
  'official_started',
  'proof_flagged',
  'start_rolled',
  'bob_encouragement',
  'circle_invite',
  'circle_invite_accepted',
  'circle_join',
  'circle_post',
  'circle_challenge_share',
  'live_message',
  'live_checkin',
  'live_reply'
));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_live_origin_post(p_source text, p_challenge_id uuid)
returns boolean
language sql
immutable
as $$
  select p_challenge_id is not null
    and coalesce(p_source, '') in ('challenge', 'checkin');
$$;

create or replace function public.live_chat_snippet(p_text text)
returns text
language sql
immutable
as $$
  select left(regexp_replace(btrim(coalesce(p_text, '')), E'\\s+', ' ', 'g'), 80);
$$;

create or replace function public.live_joined_participant(p_status text, p_eliminated_at timestamptz)
returns boolean
language sql
immutable
as $$
  select p_eliminated_at is null
    and coalesce(p_status, 'joined') in ('joined', 'active', 'completed');
$$;

create or replace function public.live_thread_focused(p_user_id uuid, p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.live_thread_focus f
    where f.user_id = p_user_id
      and f.challenge_id = p_challenge_id
      and f.focused_at > now() - interval '90 seconds'
  );
$$;

create or replace function public.set_challenge_live_mute(p_challenge_id uuid, p_mute text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mute text := lower(btrim(coalesce(p_mute, 'all')));
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_mute not in ('all', 'mentions', 'off') then
    raise exception 'Pick All, Mentions only, or Off' using errcode = 'P0001';
  end if;
  update public.challenge_participants
    set live_mute = v_mute
  where challenge_id = p_challenge_id
    and user_id = v_uid;
  if not found then
    raise exception 'Join this challenge first' using errcode = 'P0002';
  end if;
  return v_mute;
end;
$$;

revoke all on function public.set_challenge_live_mute(uuid, text) from public, anon;
grant execute on function public.set_challenge_live_mute(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Send: one Edge Function invoke with a recipient list (no N+1, no Expo from SQL)
-- ---------------------------------------------------------------------------
create or replace function public.send_push_to_users(
  p_user_ids uuid[],
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_notification_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_key text;
  v_url text;
begin
  if coalesce(p_title, '') = '' then
    return;
  end if;
  v_ids := (
    select array_agg(distinct id)
    from unnest(coalesce(p_user_ids, '{}'::uuid[])) as id
    where id is not null
  );
  if v_ids is null or cardinality(v_ids) = 0 then
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

  select hook_key into v_key from public.push_hook_config where id = 1;
  if coalesce(v_key, '') = '' then
    return;
  end if;

  v_url := coalesce(
    nullif(current_setting('app.edge_push_url', true), ''),
    'https://tguzdtwsajnnczdxjqyq.supabase.co/functions/v1/push-notify'
  );

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Accept', 'application/json',
        'x-blob-push-key', v_key
      ),
      body := jsonb_build_object(
        'user_ids', to_jsonb(v_ids),
        'title', p_title,
        'body', coalesce(nullif(p_body, ''), p_title),
        'data', coalesce(p_data, '{}'::jsonb),
        'notification_ids', to_jsonb(coalesce(p_notification_ids, '{}'::uuid[]))
      )
    );
  exception when others then
    raise warning 'send_push_to_users failed: %', sqlerrm;
  end;
end;
$$;

revoke all on function public.send_push_to_users(uuid[], text, text, jsonb, uuid[]) from public, anon, authenticated;

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
begin
  if p_user_id is null then
    return;
  end if;
  perform public.send_push_to_users(array[p_user_id], p_title, p_body, p_data, '{}'::uuid[]);
end;
$$;

revoke all on function public.send_push_to_user(uuid, text, text, jsonb) from public, anon, authenticated;

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
  if not found then
    return;
  end if;

  v_data := coalesce(v_row.data, '{}'::jsonb) || jsonb_build_object(
    'notification_id', v_row.id,
    'type', v_row.type,
    'challengeId', coalesce(v_row.data->>'challengeId', v_row.data->>'challenge_id'),
    'postId', coalesce(v_row.data->>'postId', v_row.data->>'post_id'),
    'commentId', coalesce(v_row.data->>'commentId', v_row.data->>'comment_id'),
    'actorId', coalesce(v_row.data->>'actorId', v_row.data->>'actor_id', v_row.actor_id::text),
    'url', coalesce(v_row.data->>'url', v_row.data->>'href')
  );

  perform public.send_push_to_users(
    array[v_row.user_id],
    v_row.title,
    coalesce(nullif(v_row.body, ''), v_row.title),
    v_data,
    array[v_row.id]
  );
exception when others then
  raise warning 'enqueue_notification_push failed: %', sqlerrm;
end;
$$;

revoke all on function public.enqueue_notification_push(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Live fanout: in-app for every other joined participant; OS push unless focused
-- ---------------------------------------------------------------------------
create or replace function public.notify_live_thread(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_mentioned_ids uuid[] default '{}'
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
       and p_type is distinct from 'live_checkin'
       and not (v_user = any (v_mentioned)) then
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

revoke all on function public.notify_live_thread(uuid, uuid, text, text, text, jsonb, uuid[]) from public, anon, authenticated;

create or replace function public.live_mentioned_user_ids(p_text text, p_actor_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct p.id), '{}'::uuid[])
  from regexp_matches(coalesce(p_text, ''), '@([A-Za-z0-9_]+)', 'g') as m
  join public.profiles p on p.username = lower(m[1])
  where p.id is distinct from p_actor_id;
$$;

create or replace function public.live_href(p_challenge_id uuid, p_post_id uuid, p_comment_id uuid default null)
returns text
language sql
immutable
as $$
  select '/challenges/' || p_challenge_id::text
    || '?tab=feed'
    || case when p_post_id is not null then '&postId=' || p_post_id::text else '' end
    || case
         when p_comment_id is not null then '&comments=1&commentId=' || p_comment_id::text
         else ''
       end;
$$;

-- Check-in receipts: existing copy lock, type live_checkin, participants only, batched push
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
    '{}'::uuid[]
  );
exception when others then
  null;
end;
$$;

-- Live chat / reply posts (source challenge). Check-in posts stay on notify_challenge_checkin.
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
    v_mentioned
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_notify_live on public.posts;
create trigger posts_notify_live
  after insert on public.posts
  for each row
  execute function public.trg_notify_live_post();

-- Comments on Live-origin posts fan out as live_reply (not only the post author).
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
      v_mentioned
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

-- @tags on Live-origin posts: Mentions-only users (dedupe with the Live fanout).
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
    if v_post.source is not distinct from 'checkin' then
      return new;
    end if;
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
    v_kind := case when v_post.parent_id is not null then 'live_reply' else 'live_message' end;
    perform public.notify_live_thread(
      v_post.challenge_id,
      new.author_id,
      v_kind,
      v_name || ' in ' || coalesce(v_title, 'this challenge'),
      v_snippet,
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
        'dedupe_key', 'live:' || v_post.id::text
      ),
      array[new.mentioned_user_id]
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
  v_name text;
  v_title text;
  v_snippet text;
  v_live_href text;
  v_comment text;
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
      array[new.mentioned_user_id]
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
