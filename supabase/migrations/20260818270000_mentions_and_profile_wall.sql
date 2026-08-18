-- Real @mentions (chip-backed rows) and posts on a public profile wall.
-- Typing @name without a chip does not mention. Users cannot delete posts.

-- ---------------------------------------------------------------------------
-- Profile flags
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists allow_profile_posts boolean not null default true;

alter table public.profiles
  add column if not exists profile_visibility text not null default 'public';

alter table public.profiles
  add column if not exists mute_mentions boolean not null default false;

alter table public.profiles
  add column if not exists is_creator boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_visibility_allowed'
  ) then
    alter table public.profiles
      add constraint profiles_visibility_allowed
      check (profile_visibility in ('public', 'friends'));
  end if;
end $$;

comment on column public.profiles.allow_profile_posts is
  'When false, other people cannot post on this profile wall.';
comment on column public.profiles.profile_visibility is
  'public = anyone can view; friends = friends-only profile chrome.';
comment on column public.profiles.mute_mentions is
  'When true, skip mention notifications for this user.';
comment on column public.profiles.is_creator is
  'Paid Creator flag. Follow is only meaningful for Creators.';

-- ---------------------------------------------------------------------------
-- Wall columns on posts
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists wall_host_id uuid references public.profiles(id) on delete set null;

alter table public.posts
  add column if not exists wall_removed_at timestamptz;

create index if not exists posts_wall_host_idx
  on public.posts (wall_host_id, created_at desc)
  where wall_host_id is not null and wall_removed_at is null;

comment on column public.posts.wall_host_id is
  'If set, this post was published onto that user’s profile wall.';
comment on column public.posts.wall_removed_at is
  'Host hid the post from their wall. Not a delete. Author copy remains.';

-- ---------------------------------------------------------------------------
-- Mention tables
-- ---------------------------------------------------------------------------
create table if not exists public.post_mentions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, mentioned_user_id)
);

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, mentioned_user_id)
);

create index if not exists post_mentions_mentioned_idx on public.post_mentions (mentioned_user_id, created_at desc);
create index if not exists comment_mentions_mentioned_idx on public.comment_mentions (mentioned_user_id, created_at desc);

alter table public.post_mentions enable row level security;
alter table public.comment_mentions enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'blocked'
      and f.user_a_id = least(p_a, p_b)
      and f.user_b_id = greatest(p_a, p_b)
  );
$$;

create or replace function public.are_accepted_friends(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_a_id = least(p_a, p_b)
      and f.user_b_id = greatest(p_a, p_b)
  );
$$;

create or replace function public.follows_creator(p_follower uuid, p_host uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.follows fol
    join public.profiles host on host.id = fol.following_id
    where fol.follower_id = p_follower
      and fol.following_id = p_host
      and coalesce(host.is_creator, false)
  );
$$;

create or replace function public.can_post_on_profile(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_host_id is not null
    and auth.uid() is distinct from p_host_id
    and not public.users_blocked(auth.uid(), p_host_id)
    and exists (
      select 1
      from public.profiles host
      where host.id = p_host_id
        and coalesce(host.allow_profile_posts, true)
        and coalesce(host.profile_visibility, 'public') = 'public'
        and (
          public.are_accepted_friends(auth.uid(), p_host_id)
          or public.follows_creator(auth.uid(), p_host_id)
        )
    );
$$;

grant execute on function public.users_blocked(uuid, uuid) to anon, authenticated;
grant execute on function public.are_accepted_friends(uuid, uuid) to anon, authenticated;
grant execute on function public.follows_creator(uuid, uuid) to anon, authenticated;
grant execute on function public.can_post_on_profile(uuid) to authenticated;

-- Wall host can read a post on their wall unless they removed it or blocked the author.
create or replace function public.can_read_post_id(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and p.deleted_at is null
      and (
        public.can_read_post(p.author_id, p.audience, p.audience_user_ids, p.challenge_id)
        or (
          p.wall_host_id is not distinct from auth.uid()
          and p.wall_removed_at is null
          and not public.users_blocked(p.author_id, auth.uid())
        )
      )
  );
$$;

drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    deleted_at is null
    and (
      public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
      or (
        wall_host_id is not distinct from auth.uid()
        and wall_removed_at is null
        and not public.users_blocked(author_id, auth.uid())
      )
    )
  );

drop policy if exists "Authenticated users can post globally" on public.posts;
create policy "Authenticated users can post globally"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      challenge_id is null
      or public.is_challenge_participant(challenge_id, auth.uid())
    )
    and (
      wall_host_id is null
      or (
        wall_host_id is distinct from auth.uid()
        and public.can_post_on_profile(wall_host_id)
      )
    )
  );

-- Host may hide a wall post (not delete).
grant update (wall_removed_at) on public.posts to authenticated;

drop policy if exists "Hosts can remove wall posts" on public.posts;
create policy "Hosts can remove wall posts"
  on public.posts for update
  to authenticated
  using (wall_host_id = auth.uid())
  with check (wall_host_id = auth.uid());

create or replace function public.remove_post_from_wall(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set wall_removed_at = now()
  where id = p_post_id
    and wall_host_id = auth.uid()
    and wall_removed_at is null;
end;
$$;

grant execute on function public.remove_post_from_wall(uuid) to authenticated;

create or replace function public.block_user(p_target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_a uuid;
  v_b uuid;
begin
  if auth.uid() is null or p_target is null or auth.uid() = p_target then
    raise exception 'Cannot block that account.';
  end if;
  v_a := least(auth.uid(), p_target);
  v_b := greatest(auth.uid(), p_target);
  insert into public.friendships (user_a_id, user_b_id, status, requested_by)
  values (v_a, v_b, 'blocked', auth.uid())
  on conflict (user_a_id, user_b_id)
  do update set status = 'blocked', requested_by = auth.uid();
end;
$$;

grant execute on function public.block_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Mention RLS
-- ---------------------------------------------------------------------------
drop policy if exists "Post mentions readable" on public.post_mentions;
create policy "Post mentions readable"
  on public.post_mentions for select
  using (public.can_read_post_id(post_id));

drop policy if exists "Authors insert post mentions" on public.post_mentions;
create policy "Authors insert post mentions"
  on public.post_mentions for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.author_id = auth.uid()
    )
  );

drop policy if exists "Comment mentions readable" on public.comment_mentions;
create policy "Comment mentions readable"
  on public.comment_mentions for select
  using (
    exists (
      select 1 from public.comments c
      where c.id = comment_id
        and public.can_read_post_id(c.post_id)
    )
  );

drop policy if exists "Authors insert comment mentions" on public.comment_mentions;
create policy "Authors insert comment mentions"
  on public.comment_mentions for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1 from public.comments c
      where c.id = comment_id
        and c.author_id = auth.uid()
        and public.can_read_post_id(c.post_id)
    )
  );

grant select on public.post_mentions to anon, authenticated;
grant insert on public.post_mentions to authenticated;
grant select on public.comment_mentions to anon, authenticated;
grant insert on public.comment_mentions to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications: mentioned + profile_wall. Kill regex tag triggers on posts/comments.
-- ---------------------------------------------------------------------------
do $$
begin
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
    'post_comment',
    'post_reaction',
    'post_reposted',
    'coins_received',
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
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked',
    'challenge_cancelled'
  ));
exception when others then
  null;
end $$;

create or replace function public.trg_notify_post_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Mentions are chip-backed rows in post_mentions. Do not regex the body.
  return new;
end;
$$;

create or replace function public.trg_notify_comment_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  -- Mentioned person must be allowed to see this audience.
  if not (
    v_post.audience = 'public'
    or (v_post.audience = 'friends' and public.are_accepted_friends(new.mentioned_user_id, v_post.author_id))
    or (v_post.audience = 'specific' and new.mentioned_user_id = any (coalesce(v_post.audience_user_ids, '{}')))
    or v_post.wall_host_id is not distinct from new.mentioned_user_id
  ) then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    new.mentioned_user_id,
    new.author_id,
    'mentioned',
    v_name || ' mentioned you',
    null,
    jsonb_build_object('post_id', new.post_id, 'dedupe_key', 'mention:' || new.post_id || ':' || new.mentioned_user_id)
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
  v_post uuid;
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
  select c.post_id into v_post from public.comments c where c.id = new.comment_id;
  if v_post is null then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    new.mentioned_user_id,
    new.author_id,
    'mentioned',
    v_name || ' mentioned you',
    null,
    jsonb_build_object(
      'post_id', v_post,
      'comment_id', new.comment_id,
      'dedupe_key', 'mention-comment:' || new.comment_id || ':' || new.mentioned_user_id
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_profile_wall()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if new.wall_host_id is null or new.wall_host_id is not distinct from new.author_id then
    return new;
  end if;
  if public.users_blocked(new.author_id, new.wall_host_id) then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    new.wall_host_id,
    new.author_id,
    'profile_wall',
    v_name || ' posted on your profile',
    null,
    jsonb_build_object('post_id', new.id, 'dedupe_key', 'wall:' || new.id)
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

drop trigger if exists posts_notify_profile_wall on public.posts;
create trigger posts_notify_profile_wall
  after insert on public.posts
  for each row execute function public.trg_notify_profile_wall();
