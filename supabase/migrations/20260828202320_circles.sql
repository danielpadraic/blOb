-- Circles: private standing crews. Not a challenge (no buy-in, board, or settle).
-- A post has either challenge_id or circle_id or neither. Never both.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  focus text not null,
  description text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint circles_name_present check (length(btrim(name)) > 0),
  constraint circles_focus_present check (length(btrim(focus)) > 0)
);

drop trigger if exists circles_touch_updated_at on public.circles;
create trigger circles_touch_updated_at
  before update on public.circles
  for each row execute function public.touch_updated_at();

create table if not exists public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id),
  constraint circle_members_role_allowed check (role in ('host', 'member')),
  constraint circle_members_unique_pair unique (circle_id, user_id)
);

create table if not exists public.circle_invites (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  channel text not null default 'dm',
  created_at timestamptz not null default now(),
  constraint circle_invites_status_allowed check (status in ('pending', 'accepted', 'declined')),
  constraint circle_invites_channel_allowed check (channel in ('feed', 'dm', 'push')),
  constraint circle_invites_not_self check (inviter_id is distinct from invitee_id)
);

create unique index if not exists circle_invites_pending_pair_idx
  on public.circle_invites (circle_id, invitee_id)
  where status = 'pending';

create index if not exists circle_members_user_idx on public.circle_members (user_id);
create index if not exists circle_invites_invitee_idx
  on public.circle_invites (invitee_id, status);
create index if not exists circles_created_by_idx on public.circles (created_by);

alter table public.posts
  add column if not exists circle_id uuid references public.circles(id) on delete set null;

create index if not exists posts_circle_id_created_at_idx
  on public.posts (circle_id, created_at desc)
  where circle_id is not null;

alter table public.posts drop constraint if exists posts_origin_xor;
alter table public.posts
  add constraint posts_origin_xor
  check (challenge_id is null or circle_id is null);

alter table public.posts drop constraint if exists posts_type_allowed;
alter table public.posts
  add constraint posts_type_allowed
  check (type in (
    'feed',
    'checkin',
    'challenge',
    'share',
    'profile_photo',
    'wave',
    'round',
    'round_share',
    'wave_share',
    'circle_invite',
    'circle_join'
  ));

alter table public.posts drop constraint if exists posts_source_allowed;
alter table public.posts
  add constraint posts_source_allowed
  check (source in ('challenge', 'checkin', 'feed', 'share', 'profile_photo', 'circle'));

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
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
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
    'circle_post'
  ));
exception when others then
  null;
end $$;

create or replace function public.is_circle_member(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_circle_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.circle_members m
      where m.circle_id = p_circle_id
        and m.user_id = p_user_id
    );
$$;

create or replace function public.is_circle_host(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_circle_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.circle_members m
      where m.circle_id = p_circle_id
        and m.user_id = p_user_id
        and m.role = 'host'
    );
$$;

create or replace function public.circle_host_count(p_circle_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.circle_members
  where circle_id = p_circle_id
    and role = 'host';
$$;

create or replace function public.circle_member_count(p_circle_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.circle_members
  where circle_id = p_circle_id;
$$;

create or replace function public.friends_accepted(p_a uuid, p_b uuid)
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
    and exists (
      select 1
      from public.friendships f
      where f.status = 'accepted'
        and f.user_a_id = least(p_a, p_b)
        and f.user_b_id = greatest(p_a, p_b)
    );
$$;

create or replace function public.can_read_circle_post(
  p_circle_id uuid,
  p_type text,
  p_author_id uuid,
  p_audience text
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
      p_circle_id is not null
      and auth.uid() is not null
      and (
        (
          p_type = 'circle_invite'
          and p_audience = 'friends'
          and public.friends_accepted(auth.uid(), p_author_id)
        )
        or (
          coalesce(p_type, '') is distinct from 'circle_invite'
          and public.is_circle_member(p_circle_id, auth.uid())
        )
      )
    );
$$;

create or replace function public.can_join_circle(p_circle_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_circle_id is not null
    and p_user_id is not null
    and not public.is_circle_member(p_circle_id, p_user_id)
    and (
      exists (
        select 1
        from public.circle_invites i
        where i.circle_id = p_circle_id
          and i.invitee_id = p_user_id
          and i.status = 'pending'
      )
      or exists (
        select 1
        from public.posts p
        where p.circle_id = p_circle_id
          and p.type = 'circle_invite'
          and p.deleted_at is null
          and public.friends_accepted(p_user_id, p.author_id)
      )
    );
$$;

alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.circle_invites enable row level security;

grant select on public.circles to authenticated;
grant select on public.circle_members to authenticated;
grant select, insert, update on public.circle_invites to authenticated;

drop policy if exists circles_select_authenticated on public.circles;
create policy circles_select_authenticated
  on public.circles for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists circles_update_host on public.circles;
create policy circles_update_host
  on public.circles for update
  to authenticated
  using (public.is_circle_host(id, auth.uid()))
  with check (public.is_circle_host(id, auth.uid()));

drop policy if exists circle_members_select on public.circle_members;
create policy circle_members_select
  on public.circle_members for select
  to authenticated
  using (
    public.is_circle_member(circle_id, auth.uid())
    or role = 'host'
  );

drop policy if exists circle_members_delete_host on public.circle_members;
create policy circle_members_delete_host
  on public.circle_members for delete
  to authenticated
  using (
    public.is_circle_host(circle_id, auth.uid())
    and user_id is distinct from auth.uid()
  );

drop policy if exists circle_invites_select on public.circle_invites;
create policy circle_invites_select
  on public.circle_invites for select
  to authenticated
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

drop policy if exists circle_invites_insert on public.circle_invites;
create policy circle_invites_insert
  on public.circle_invites for insert
  to authenticated
  with check (
    auth.uid() = inviter_id
    and public.is_circle_member(circle_id, auth.uid())
    and not public.is_circle_member(circle_id, invitee_id)
  );

drop policy if exists circle_invites_update on public.circle_invites;
create policy circle_invites_update
  on public.circle_invites for update
  to authenticated
  using (auth.uid() = invitee_id or auth.uid() = inviter_id)
  with check (auth.uid() = invitee_id or auth.uid() = inviter_id);

drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    deleted_at is null
    and (
      (
        circle_id is not null
        and public.can_read_circle_post(circle_id, type, author_id, audience)
      )
      or (
        circle_id is null
        and (
          public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
          or public.can_read_wall_as_host(author_id, audience, wall_host_id, wall_removed_at)
        )
      )
    )
  );

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (challenge_id is null or circle_id is null)
    and (
      circle_id is null
      or public.is_circle_member(circle_id, auth.uid())
    )
  );

drop policy if exists "Comments are viewable by everyone" on public.comments;
create policy "Comments are viewable by everyone"
  on public.comments for select
  using (
    not exists (
      select 1
      from public.posts p
      where p.id = comments.post_id
        and p.circle_id is not null
    )
    or public.is_circle_member(
      (select p.circle_id from public.posts p where p.id = comments.post_id),
      auth.uid()
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
        where p.id = post_id and p.circle_id is not null
      )
      or public.is_circle_member(
        (select p.circle_id from public.posts p where p.id = post_id),
        auth.uid()
      )
    )
  );

drop policy if exists "Reactions are viewable by everyone" on public.reactions;
create policy "Reactions are viewable by everyone"
  on public.reactions for select
  using (
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
    )
    or (
      comment_id is not null
      and (
        not exists (
          select 1
          from public.comments c
          join public.posts p on p.id = c.post_id
          where c.id = reactions.comment_id
            and p.circle_id is not null
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
    )
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
            where p.id = post_id and p.circle_id is not null
          )
          or public.is_circle_member(
            (select p.circle_id from public.posts p where p.id = post_id),
            auth.uid()
          )
        )
      )
      or (
        comment_id is not null
        and (
          not exists (
            select 1
            from public.comments c
            join public.posts p on p.id = c.post_id
            where c.id = comment_id
              and p.circle_id is not null
          )
          or public.is_circle_member(
            (
              select p.circle_id
              from public.comments c
              join public.posts p on p.id = c.post_id
              where c.id = comment_id
            ),
            auth.uid()
          )
        )
      )
    )
  );

create or replace function public.create_circle(
  p_name text,
  p_focus text,
  p_description text default null,
  p_banner_url text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.circles;
  v_name text := btrim(coalesce(p_name, ''));
  v_focus text := btrim(coalesce(p_focus, ''));
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if v_name = '' then
    raise exception 'Give the Circle a name.';
  end if;
  if v_focus = '' then
    raise exception 'Say what this Circle is for.';
  end if;

  insert into public.circles (created_by, name, focus, description, banner_url)
  values (
    auth.uid(),
    v_name,
    v_focus,
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_banner_url, '')), '')
  )
  returning * into v_row;

  insert into public.circle_members (circle_id, user_id, role)
  values (v_row.id, auth.uid(), 'host');

  return v_row;
end;
$$;

create or replace function public.invite_to_circle(
  p_circle_id uuid,
  p_invitee_ids uuid[],
  p_post_to_feed boolean default false
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitee uuid;
  v_name text;
  v_circle text;
  v_title text;
  v_count int := 0;
  v_focus text;
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not public.is_circle_member(p_circle_id, auth.uid()) then
    raise exception 'Only members can invite.';
  end if;

  select c.name, c.focus into v_circle, v_focus
  from public.circles c
  where c.id = p_circle_id;
  if v_circle is null then
    raise exception 'Circle not found.';
  end if;

  v_name := public.profile_display_name(auth.uid());

  foreach v_invitee in array coalesce(p_invitee_ids, '{}')
  loop
    if v_invitee is null or v_invitee = auth.uid() then
      continue;
    end if;
    if public.is_circle_member(p_circle_id, v_invitee) then
      continue;
    end if;
    if not public.friends_accepted(auth.uid(), v_invitee) then
      continue;
    end if;

    if exists (
      select 1
      from public.circle_invites i
      where i.circle_id = p_circle_id
        and i.invitee_id = v_invitee
        and i.status = 'pending'
    ) then
      continue;
    end if;

    insert into public.circle_invites (circle_id, inviter_id, invitee_id, status, channel)
    values (
      p_circle_id,
      auth.uid(),
      v_invitee,
      'pending',
      case when p_post_to_feed then 'feed' else 'dm' end
    );

    v_title := v_name || ' invited you to ' || v_circle || '.';
    perform public.notify_user(
      v_invitee,
      auth.uid(),
      'circle_invite',
      v_title,
      null,
      jsonb_build_object(
        'circle_id', p_circle_id,
        'href', '/circles/' || p_circle_id::text || '?tab=details'
      )
    );
    v_count := v_count + 1;
  end loop;

  if p_post_to_feed then
    insert into public.posts (
      author_id,
      circle_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      type
    )
    values (
      auth.uid(),
      p_circle_id,
      nullif(btrim(coalesce(v_focus, '')), ''),
      '{}',
      'friends',
      '{}',
      'circle',
      'circle_invite'
    );
  end if;

  return v_count;
end;
$$;

create or replace function public.accept_circle_invite(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_name text;
  v_circle text;
  v_joiner uuid := auth.uid();
  rec record;
begin
  if v_joiner is null then
    raise exception 'You need to be signed in.';
  end if;
  if public.is_circle_member(p_circle_id, v_joiner) then
    return;
  end if;
  if not public.can_join_circle(p_circle_id, v_joiner) then
    raise exception 'You need an invite to join this Circle.';
  end if;

  select c.name into v_circle
  from public.circles c
  where c.id = p_circle_id;
  if v_circle is null then
    raise exception 'Circle not found.';
  end if;

  select i.inviter_id into v_inviter
  from public.circle_invites i
  where i.circle_id = p_circle_id
    and i.invitee_id = v_joiner
    and i.status = 'pending'
  order by i.created_at desc
  limit 1;

  update public.circle_invites
  set status = 'accepted'
  where circle_id = p_circle_id
    and invitee_id = v_joiner
    and status = 'pending';

  insert into public.circle_members (circle_id, user_id, role)
  values (p_circle_id, v_joiner, 'member')
  on conflict do nothing;

  v_name := public.profile_display_name(v_joiner);

  insert into public.posts (
    author_id,
    circle_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    source,
    type
  )
  values (
    v_joiner,
    p_circle_id,
    v_name || ' joined the circle.',
    '{}',
    'friends',
    '{}',
    'circle',
    'circle_join'
  );

  if v_inviter is not null and v_inviter is distinct from v_joiner then
    perform public.notify_user(
      v_inviter,
      v_joiner,
      'circle_invite_accepted',
      v_name || ' joined ' || v_circle || '.',
      null,
      jsonb_build_object(
        'circle_id', p_circle_id,
        'href', '/circles/' || p_circle_id::text
      )
    );
  end if;

  for rec in
    select m.user_id
    from public.circle_members m
    where m.circle_id = p_circle_id
      and m.user_id is distinct from v_joiner
      and m.user_id is distinct from v_inviter
  loop
    perform public.notify_user(
      rec.user_id,
      v_joiner,
      'circle_join',
      v_name || ' joined ' || v_circle || '.',
      null,
      jsonb_build_object(
        'circle_id', p_circle_id,
        'href', '/circles/' || p_circle_id::text
      )
    );
  end loop;
end;
$$;

create or replace function public.decline_circle_invite(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  update public.circle_invites
  set status = 'declined'
  where circle_id = p_circle_id
    and invitee_id = auth.uid()
    and status = 'pending';
end;
$$;

create or replace function public.leave_circle(p_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You need to be signed in.';
  end if;
  if not public.is_circle_member(p_circle_id, auth.uid()) then
    return;
  end if;
  if public.is_circle_host(p_circle_id, auth.uid())
     and public.circle_host_count(p_circle_id) <= 1 then
    raise exception 'You’re the only host. Assign another host before you leave.';
  end if;
  delete from public.circle_members
  where circle_id = p_circle_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.remove_circle_member(p_circle_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_circle_host(p_circle_id, auth.uid()) then
    raise exception 'Only a host can remove a member.';
  end if;
  if p_user_id is not distinct from auth.uid() then
    raise exception 'Use Leave to leave this Circle.';
  end if;
  delete from public.circle_members
  where circle_id = p_circle_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.trg_notify_circle_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  rec record;
begin
  if new.circle_id is null then
    return new;
  end if;
  if new.type is distinct from 'feed' then
    return new;
  end if;
  if coalesce(new.source, 'feed') is distinct from 'circle' then
    return new;
  end if;

  v_name := public.profile_display_name(new.author_id);
  for rec in
    select m.user_id
    from public.circle_members m
    where m.circle_id = new.circle_id
      and m.user_id is distinct from new.author_id
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'circle_post',
      v_name || ' posted in the Circle.',
      null,
      jsonb_build_object(
        'circle_id', new.circle_id,
        'post_id', new.id,
        'href', '/circles/' || new.circle_id::text || '?tab=feed&postId=' || new.id::text
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists posts_notify_circle_post on public.posts;
create trigger posts_notify_circle_post
  after insert on public.posts
  for each row execute function public.trg_notify_circle_post();

revoke all on function public.is_circle_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_circle_host(uuid, uuid) from public, anon, authenticated;
revoke all on function public.circle_host_count(uuid) from public, anon, authenticated;
revoke all on function public.friends_accepted(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_read_circle_post(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.trg_notify_circle_post() from public, anon, authenticated;

revoke all on function public.circle_member_count(uuid) from public, anon;
revoke all on function public.can_join_circle(uuid, uuid) from public, anon;
revoke all on function public.create_circle(text, text, text, text) from public, anon;
revoke all on function public.invite_to_circle(uuid, uuid[], boolean) from public, anon;
revoke all on function public.accept_circle_invite(uuid) from public, anon;
revoke all on function public.decline_circle_invite(uuid) from public, anon;
revoke all on function public.leave_circle(uuid) from public, anon;
revoke all on function public.remove_circle_member(uuid, uuid) from public, anon;

grant execute on function public.circle_member_count(uuid) to authenticated;
grant execute on function public.can_join_circle(uuid, uuid) to authenticated;
grant execute on function public.create_circle(text, text, text, text) to authenticated;
grant execute on function public.invite_to_circle(uuid, uuid[], boolean) to authenticated;
grant execute on function public.accept_circle_invite(uuid) to authenticated;
grant execute on function public.decline_circle_invite(uuid) to authenticated;
grant execute on function public.leave_circle(uuid) to authenticated;
grant execute on function public.remove_circle_member(uuid, uuid) to authenticated;

comment on table public.circles is
  'Private standing crew. Organizes people. Not a challenge.';
comment on column public.posts.circle_id is
  'Circle room post. Never set together with challenge_id.';
