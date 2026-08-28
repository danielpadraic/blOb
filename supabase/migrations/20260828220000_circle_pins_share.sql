-- Circles slice 2: pins (max 5) + circle_challenge_share (both ids).

create table if not exists public.circle_pins (
  circle_id uuid not null references public.circles(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id),
  sort_index int not null default 0,
  pinned_at timestamptz not null default now(),
  primary key (circle_id, challenge_id)
);

create index if not exists circle_pins_circle_sort_idx
  on public.circle_pins (circle_id, sort_index, pinned_at);

alter table public.circle_pins enable row level security;

grant select, insert, update, delete on public.circle_pins to authenticated;

drop policy if exists circle_pins_select on public.circle_pins;
create policy circle_pins_select
  on public.circle_pins for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists circle_pins_write_host on public.circle_pins;
create policy circle_pins_write_host
  on public.circle_pins for all
  to authenticated
  using (public.is_circle_host(circle_id, auth.uid()))
  with check (public.is_circle_host(circle_id, auth.uid()));

create or replace function public.circle_pins_enforce_cap()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if (
      select count(*)
      from public.circle_pins p
      where p.circle_id = new.circle_id
    ) >= 5 then
      raise exception 'You can pin up to 5.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists circle_pins_cap on public.circle_pins;
create trigger circle_pins_cap
  before insert on public.circle_pins
  for each row
  execute procedure public.circle_pins_enforce_cap();

alter table public.posts drop constraint if exists posts_origin_xor;
alter table public.posts
  add constraint posts_origin_xor
  check (
    challenge_id is null
    or circle_id is null
    or (
      type = 'circle_challenge_share'
      and challenge_id is not null
      and circle_id is not null
    )
  );

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
    'circle_join',
    'circle_challenge_share'
  ));

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
  'circle_post',
  'circle_challenge_share'
));

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and (
      circle_id is null
      or public.is_circle_member(circle_id, auth.uid())
    )
    and (
      (challenge_id is null or circle_id is null)
      or (
        type = 'circle_challenge_share'
        and public.user_can_access_challenge(challenge_id, auth.uid())
      )
    )
  );

create or replace function public.is_corporate_challenge(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges c
    where c.id = p_challenge_id
      and c.privacy_mode = 'private_corporate'
  );
$$;

create or replace function public.list_circle_pins(p_circle_id uuid)
returns table (
  circle_id uuid,
  challenge_id uuid,
  pinned_by uuid,
  sort_index int,
  pinned_at timestamptz,
  title text,
  cover_image_url text,
  status text,
  created_by uuid,
  visibility text,
  prize_pool numeric,
  buy_in_amount numeric,
  currency text,
  is_official boolean,
  starts_at timestamptz,
  timezone text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.circle_id,
    p.challenge_id,
    p.pinned_by,
    p.sort_index,
    p.pinned_at,
    c.title,
    c.cover_image_url,
    c.status::text,
    c.created_by,
    c.visibility::text,
    c.prize_pool,
    c.buy_in_amount,
    c.currency::text,
    c.is_official,
    c.starts_at,
    c.timezone
  from public.circle_pins p
  join public.challenges c on c.id = p.challenge_id
  where p.circle_id = p_circle_id
    and auth.uid() is not null
  order by p.sort_index, p.pinned_at;
$$;

create or replace function public.pin_challenge_to_circle(p_circle_id uuid, p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sort int;
begin
  if v_uid is null then
    raise exception 'Sign in to pin a challenge.';
  end if;
  if not public.is_circle_host(p_circle_id, v_uid) then
    raise exception 'Only the host can pin challenges.';
  end if;
  if public.is_corporate_challenge(p_challenge_id) then
    raise exception 'Keep this in the company challenge.';
  end if;
  if not public.user_can_access_challenge(p_challenge_id, v_uid) then
    raise exception 'You can’t pin a challenge you can’t view.';
  end if;
  if exists (
    select 1
    from public.circle_pins p
    where p.circle_id = p_circle_id
      and p.challenge_id = p_challenge_id
  ) then
    return;
  end if;
  if (
    select count(*)
    from public.circle_pins p
    where p.circle_id = p_circle_id
  ) >= 5 then
    raise exception 'You can pin up to 5.';
  end if;
  select coalesce(max(p.sort_index), -1) + 1
    into v_sort
  from public.circle_pins p
  where p.circle_id = p_circle_id;
  insert into public.circle_pins (circle_id, challenge_id, pinned_by, sort_index)
  values (p_circle_id, p_challenge_id, v_uid, v_sort);
end;
$$;

create or replace function public.unpin_circle_challenge(p_circle_id uuid, p_challenge_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to unpin a challenge.';
  end if;
  if not public.is_circle_host(p_circle_id, auth.uid()) then
    raise exception 'Only the host can unpin challenges.';
  end if;
  delete from public.circle_pins
  where circle_id = p_circle_id
    and challenge_id = p_challenge_id;
end;
$$;

create or replace function public.reorder_circle_pins(p_circle_id uuid, p_challenge_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_i int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to reorder pins.';
  end if;
  if not public.is_circle_host(p_circle_id, auth.uid()) then
    raise exception 'Only the host can reorder pins.';
  end if;
  if p_challenge_ids is null then
    return;
  end if;
  foreach v_id in array p_challenge_ids
  loop
    update public.circle_pins
    set sort_index = v_i
    where circle_id = p_circle_id
      and challenge_id = v_id;
    v_i := v_i + 1;
  end loop;
end;
$$;

create or replace function public.share_challenge_to_circle(
  p_circle_id uuid,
  p_challenge_id uuid,
  p_caption text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post uuid;
  v_actor text;
  v_challenge text;
  v_circle text;
  v_rest text;
  v_title text;
  rec record;
begin
  if v_uid is null then
    raise exception 'Sign in to share a challenge.';
  end if;
  if not public.is_circle_member(p_circle_id, v_uid) then
    raise exception 'Join this Circle to share a challenge.';
  end if;
  if public.is_corporate_challenge(p_challenge_id) then
    raise exception 'Keep this in the company challenge.';
  end if;
  if not public.user_can_access_challenge(p_challenge_id, v_uid) then
    raise exception 'You can’t share a challenge you can’t view.';
  end if;

  insert into public.posts (
    author_id,
    type,
    source,
    circle_id,
    challenge_id,
    content,
    audience
  ) values (
    v_uid,
    'circle_challenge_share',
    'circle',
    p_circle_id,
    p_challenge_id,
    nullif(btrim(coalesce(p_caption, '')), ''),
    'friends'
  )
  returning id into v_post;

  select coalesce(nullif(btrim(pr.display_name), ''), nullif(btrim(pr.username), ''), 'Someone')
    into v_actor
  from public.profiles pr
  where pr.id = v_uid;

  select coalesce(nullif(btrim(c.title), ''), 'a challenge')
    into v_challenge
  from public.challenges c
  where c.id = p_challenge_id;

  select coalesce(nullif(btrim(ci.name), ''), 'this Circle')
    into v_circle
  from public.circles ci
  where ci.id = p_circle_id;

  v_rest := ' shared ' || coalesce(v_challenge, 'a challenge') || ' in ' || coalesce(v_circle, 'this Circle') || '.';
  if length(v_rest) > 100 then
    v_rest := left(v_rest, 99) || '…';
  end if;
  v_title := coalesce(v_actor, 'Someone') || v_rest;

  for rec in
    select m.user_id
    from public.circle_members m
    where m.circle_id = p_circle_id
      and m.user_id is distinct from v_uid
  loop
    perform public.notify_user(
      rec.user_id,
      v_uid,
      'circle_challenge_share',
      v_title,
      null,
      jsonb_build_object(
        'circle_id', p_circle_id,
        'challenge_id', p_challenge_id,
        'post_id', v_post,
        'dedupe_key', 'circle_share:' || v_post::text || ':' || rec.user_id::text
      )
    );
  end loop;

  return v_post;
end;
$$;

revoke all on function public.is_corporate_challenge(uuid) from public, anon, authenticated;
revoke all on function public.circle_pins_enforce_cap() from public, anon, authenticated;
revoke all on function public.list_circle_pins(uuid) from public, anon;
revoke all on function public.pin_challenge_to_circle(uuid, uuid) from public, anon;
revoke all on function public.unpin_circle_challenge(uuid, uuid) from public, anon;
revoke all on function public.reorder_circle_pins(uuid, uuid[]) from public, anon;
revoke all on function public.share_challenge_to_circle(uuid, uuid, text) from public, anon;

grant execute on function public.list_circle_pins(uuid) to authenticated;
grant execute on function public.pin_challenge_to_circle(uuid, uuid) to authenticated;
grant execute on function public.unpin_circle_challenge(uuid, uuid) to authenticated;
grant execute on function public.reorder_circle_pins(uuid, uuid[]) to authenticated;
grant execute on function public.share_challenge_to_circle(uuid, uuid, text) to authenticated;
