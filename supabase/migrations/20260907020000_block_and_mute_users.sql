-- Blocking and muting people.
--
-- Block is directional and permanent until undone: I keep my own row, so a
-- mutual block survives one side unblocking, and "Blocked accounts" can list
-- exactly who I blocked. Enforcement stays symmetric.
--
-- Mute is one-way and quiet: their posts leave my feed and their social
-- notifications stop. They are never told. Money, friend requests, and
-- challenge notifications still arrive.
--
-- friendship_is_blocked is the chokepoint the DM policies, wall reads, and
-- can_post_on_profile already call, so teaching it about blocks covers those.

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_not_self check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

comment on table public.blocks is
  'One row per block. blocker_id blocked blocked_id. Enforcement is symmetric, ownership is not.';

alter table public.blocks enable row level security;

-- Only the blocker reads or writes their own rows: nobody learns they were blocked.
drop policy if exists blocks_own on public.blocks;
create policy blocks_own
  on public.blocks for all
  to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

grant select, insert, delete on public.blocks to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Symmetric. Legacy friendships.status = 'blocked' rows still count.
create or replace function public.friendship_is_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_a is not null
    and p_b is not null
    and p_a is distinct from p_b
    and (
      exists (
        select 1
        from public.blocks b
        where (b.blocker_id = p_a and b.blocked_id = p_b)
           or (b.blocker_id = p_b and b.blocked_id = p_a)
      )
      or exists (
        select 1
        from public.friendships f
        where f.status = 'blocked'
          and f.user_a_id = least(p_a, p_b)
          and f.user_b_id = greatest(p_a, p_b)
      )
    );
$$;

grant execute on function public.friendship_is_blocked(uuid, uuid) to authenticated;

create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.friendship_is_blocked(p_a, p_b);
$$;

grant execute on function public.users_blocked(uuid, uuid) to anon, authenticated;

-- Everyone I can no longer interact with, in either direction, without saying
-- which side blocked. The client uses this to hide dead controls.
create or replace function public.blocked_peer_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct peer
  from (
    select b.blocked_id as peer from public.blocks b where b.blocker_id = auth.uid()
    union
    select b.blocker_id as peer from public.blocks b where b.blocked_id = auth.uid()
    union
    select case when f.user_a_id = auth.uid() then f.user_b_id else f.user_a_id end as peer
    from public.friendships f
    where f.status = 'blocked'
      and auth.uid() in (f.user_a_id, f.user_b_id)
  ) t
  where peer is not null
    and peer is distinct from auth.uid();
$$;

grant execute on function public.blocked_peer_ids() to authenticated;

create or replace function public.user_is_muted(p_viewer uuid, p_author uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.mutes m
    where m.user_id = p_viewer
      and m.muted_user_id = p_author
  );
$$;

grant execute on function public.user_is_muted(uuid, uuid) to authenticated;

-- A blocked person cannot read the post, so an inline subquery would see null
-- and wave them through. Resolve the author with definer rights instead.
create or replace function public.post_author_id(p_post_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.author_id from public.posts p where p.id = p_post_id;
$$;

grant execute on function public.post_author_id(uuid) to authenticated;

create or replace function public.comment_author_id(p_comment_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.author_id from public.comments c where c.id = p_comment_id;
$$;

grant execute on function public.comment_author_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Block / unblock
-- ---------------------------------------------------------------------------
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_target = v_me then
    raise exception 'You can’t block that account.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'That person isn’t on the map.' using errcode = 'P0001';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_me, p_target)
  on conflict (blocker_id, blocked_id) do nothing;

  -- Block implies mute, so their content drops out of the feed immediately.
  insert into public.mutes (user_id, muted_user_id)
  values (v_me, p_target)
  on conflict (user_id, muted_user_id) do nothing;

  -- Cut the graph both ways.
  delete from public.friendships
  where user_a_id = least(v_me, p_target)
    and user_b_id = greatest(v_me, p_target);

  delete from public.follows
  where (follower_id = v_me and following_id = p_target)
     or (follower_id = p_target and following_id = v_me);

  -- Clear the trail so neither side can tap back into unreadable content.
  delete from public.notifications
  where (user_id = v_me and actor_id = p_target)
     or (user_id = p_target and actor_id = v_me);
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

create or replace function public.unblock_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_target is null or p_target = v_me then
    raise exception 'You can’t unblock that account.' using errcode = 'P0001';
  end if;

  delete from public.blocks
  where blocker_id = v_me
    and blocked_id = p_target;

  -- Legacy symmetric row: only clear it if I was the one who set it.
  delete from public.friendships
  where user_a_id = least(v_me, p_target)
    and user_b_id = greatest(v_me, p_target)
    and status = 'blocked'
    and requested_by = v_me;

  -- Block turned the mute on, so unblock turns it back off.
  delete from public.mutes
  where user_id = v_me
    and muted_user_id = p_target;
end;
$$;

grant execute on function public.unblock_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reads: a blocked person loses sight of my posts, even public ones
-- ---------------------------------------------------------------------------
create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not distinct from p_author_id
    or (
      not public.friendship_is_blocked(auth.uid(), p_author_id)
      and p_audience is distinct from 'only_me'
      and (
        p_audience = 'public'
        or exists (
          select 1
          from public.profiles pr
          where pr.id = p_author_id
            and coalesce(pr.is_official, false)
        )
        or (
          p_audience = 'friends'
          and auth.uid() is not null
          and exists (
            select 1
            from public.friendships f
            where f.status = 'accepted'
              and f.user_a_id = least(auth.uid(), p_author_id)
              and f.user_b_id = greatest(auth.uid(), p_author_id)
          )
        )
        or (
          p_audience in ('specific', 'people')
          and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and exists (
            select 1
            from public.challenge_participants cp
            where cp.challenge_id = p_challenge_id
              and cp.user_id = auth.uid()
          )
        )
        or (
          p_challenge_id is not null
          and auth.uid() is not null
          and public.is_callout_challenge_observer(p_challenge_id, auth.uid())
        )
      )
    );
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Writes: a blocked person cannot reach me
-- ---------------------------------------------------------------------------

-- Wall posts. can_post_on_profile already refuses when blocked; this makes the
-- policy honour it instead of trusting the client.
drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (circle_id is null or public.is_circle_member(circle_id, auth.uid()))
    and (challenge_id is null or public.user_can_access_challenge(challenge_id, auth.uid()))
    and (
      challenge_id is null
      or circle_id is null
      or (type = 'circle_challenge_share' and public.user_can_access_challenge(challenge_id, auth.uid()))
    )
    and (
      wall_host_id is null
      or wall_host_id = auth.uid()
      or public.can_post_on_profile(wall_host_id)
    )
  );

drop policy if exists "Users can create friend requests" on public.friendships;
create policy "Users can create friend requests"
  on public.friendships for insert
  with check (
    auth.uid() = requested_by
    and not public.friendship_is_blocked(user_a_id, user_b_id)
  );

drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves"
  on public.follows for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and not public.friendship_is_blocked(follower_id, following_id)
    and exists (
      select 1 from public.profiles p
      where p.id = follows.following_id and p.is_creator = true
    )
  );

drop policy if exists "Users follow official as themselves" on public.follows;
create policy "Users follow official as themselves"
  on public.follows for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and not public.friendship_is_blocked(follower_id, following_id)
    and exists (
      select 1 from public.profiles p
      where p.id = follows.following_id and p.is_official = true
    )
  );

drop policy if exists "Authenticated users can create comments" on public.comments;
create policy "Authenticated users can create comments"
  on public.comments for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      not exists (
        select 1 from public.posts p
        where p.id = comments.post_id and p.circle_id is not null
      )
      or public.is_circle_member(
        (select p.circle_id from public.posts p where p.id = comments.post_id),
        auth.uid()
      )
    )
    and not public.friendship_is_blocked(auth.uid(), public.post_author_id(comments.post_id))
  );

drop policy if exists "Authenticated users can create reactions" on public.reactions;
create policy "Authenticated users can create reactions"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and (
      (
        post_id is not null
        and (
          not exists (
            select 1 from public.posts p
            where p.id = reactions.post_id and p.circle_id is not null
          )
          or public.is_circle_member(
            (select p.circle_id from public.posts p where p.id = reactions.post_id),
            auth.uid()
          )
        )
        and not public.friendship_is_blocked(auth.uid(), public.post_author_id(reactions.post_id))
      )
      or (
        comment_id is not null
        and (
          not exists (
            select 1
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = reactions.comment_id and p.circle_id is not null
          )
          or public.is_circle_member(
            (
              select p.circle_id
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = reactions.comment_id
            ),
            auth.uid()
          )
        )
        and not public.friendship_is_blocked(auth.uid(), public.comment_author_id(reactions.comment_id))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Notifications and push
-- ---------------------------------------------------------------------------

-- Block silences social contact. Mute silences social noise only, so friend
-- requests and challenge news still land. Money and settlement never go quiet:
-- a real balance change must always reach the person it belongs to.
create or replace function public.notification_suppressed(
  p_user_id uuid,
  p_actor_id uuid,
  p_type text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_user_id is not null
    and p_actor_id is not null
    and p_user_id is distinct from p_actor_id
    and coalesce(p_type, '') not in (
      'coins_received',
      'payout_received',
      'challenge_settled',
      'challenge_placed',
      'challenge_won',
      'challenge_lost',
      'challenge_eliminated',
      'challenge_cancelled'
    )
    and (
      public.friendship_is_blocked(p_user_id, p_actor_id)
      or (
        coalesce(p_type, '') in (
          'post_reaction',
          'post_comment',
          'post_reposted',
          'mentioned',
          'tagged',
          'profile_wall',
          'follow'
        )
        and public.user_is_muted(p_user_id, p_actor_id)
      )
    );
$$;

grant execute on function public.notification_suppressed(uuid, uuid, text) to authenticated;

create or replace function public.insert_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null::text,
  p_data jsonb default '{}'::jsonb,
  p_actor_id uuid default null::uuid
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
  v_created timestamptz;
begin
  if p_user_id is null or coalesce(p_title, '') = '' or coalesce(p_type, '') = '' then
    return null;
  end if;
  if p_actor_id is not null and p_user_id = p_actor_id then
    return null;
  end if;
  if public.notification_suppressed(p_user_id, p_actor_id, p_type) then
    return null;
  end if;

  v_key := nullif(v_data->>'dedupe_key', '');
  if v_key is not null then
    select id, created_at into v_id, v_created
    from public.notifications
    where user_id = p_user_id
      and type = p_type
      and data->>'dedupe_key' = v_key
    limit 1;
    if v_id is not null then
      if v_key like 'official-fill:%' and v_created <= now() - interval '24 hours' then
        update public.notifications
        set title = p_title,
            body = p_body,
            data = v_data,
            actor_id = p_actor_id,
            read_at = null,
            created_at = now()
        where id = v_id;
        begin
          perform public.enqueue_notification_push(v_id);
        exception when others then
          null;
        end;
        return v_id;
      end if;
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

-- The wide overload writes straight to notifications, so it needs the same gate.
create or replace function public.notify_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null::text,
  p_challenge_id uuid default null::uuid,
  p_post_id uuid default null::uuid,
  p_actor_id uuid default null::uuid,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_user_id is null then return null; end if;
  if public.notification_suppressed(p_user_id, p_actor_id, p_type) then return null; end if;
  insert into public.notifications (user_id, type, title, body, challenge_id, post_id, actor_id, data)
  values (p_user_id, p_type, p_title, p_body, p_challenge_id, p_post_id, p_actor_id, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search hides blocked people
-- ---------------------------------------------------------------------------
create or replace function public.search_people(p_query text)
returns setof profiles_public
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q text := btrim(coalesce(p_query, ''));
  v_digits text;
  v_like text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if length(v_q) < 2 then
    return;
  end if;

  -- Exact email. Never ilike.
  if v_q ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and not public.friendship_is_blocked(v_uid, pp.id)
      and lower(coalesce(u.email, '')) = lower(v_q)
    limit 8;
    return;
  end if;

  v_digits := regexp_replace(v_q, '[^0-9]', '', 'g');

  -- Exact phone (10+ digits). Compare digit-only forms. Never partial.
  if v_q ~ '^[+0-9().[:space:]-]+$' and length(v_digits) >= 10 then
    return query
    select pp.*
    from public.profiles_public pp
    join auth.users u on u.id = pp.id
    where pp.id <> v_uid
      and not public.friendship_is_blocked(v_uid, pp.id)
      and length(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g')) >= 10
      and regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g') = v_digits
    limit 8;
    return;
  end if;

  v_like := '%' || replace(replace(replace(regexp_replace(v_q, '^@', ''), '%', ''), '_', ''), ',', '') || '%';
  if length(btrim(v_like, '%')) < 2 then
    return;
  end if;

  return query
  select pp.*
  from public.profiles_public pp
  where pp.id <> v_uid
    and not public.friendship_is_blocked(v_uid, pp.id)
    and (
      pp.username ilike v_like
      or coalesce(pp.display_name, '') ilike v_like
    )
  order by
    case when pp.username ilike replace(v_like, '%', '') || '%' then 0 else 1 end,
    pp.username
  limit 16;
end;
$$;

grant execute on function public.search_people(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Wall host can hide a post without deleting the author's copy
-- ---------------------------------------------------------------------------
create or replace function public.remove_post_from_wall(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  update public.posts
  set wall_removed_at = now()
  where id = p_post_id
    and wall_host_id = auth.uid()
    and wall_removed_at is null;
end;
$$;

grant execute on function public.remove_post_from_wall(uuid) to authenticated;
