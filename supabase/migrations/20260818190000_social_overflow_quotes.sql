-- Social overflow: hide / report / mute / soft-delete + quote-repost.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Posts: quote + soft-delete
-- ---------------------------------------------------------------------------
alter table public.posts
  add column if not exists quoted_post_id uuid references public.posts(id) on delete set null,
  add column if not exists quote_snapshot jsonb,
  add column if not exists deleted_at timestamptz;

create index if not exists posts_quoted_post_id_idx on public.posts (quoted_post_id)
  where quoted_post_id is not null;

create index if not exists posts_deleted_at_idx on public.posts (deleted_at)
  where deleted_at is null;

comment on column public.posts.quoted_post_id is 'Quote-repost target. Snapshot is stored separately so the embed survives delete/privacy.';
comment on column public.posts.quote_snapshot is
  '{ author_id, display_name, username, avatar_url, body, media_preview_url, created_at, audience } captured at create.';
comment on column public.posts.deleted_at is 'Soft-delete. Hidden from feeds. Quote snapshots still render.';

alter table public.posts drop constraint if exists post_has_body;
alter table public.posts
  add constraint post_has_body check (
    (content is not null and length(btrim(content)) > 0)
    or coalesce(array_length(media_urls, 1), 0) > 0
    or quoted_post_id is not null
  );

-- Authors may soft-delete (update deleted_at) their own posts.
grant update (deleted_at) on public.posts to authenticated;

drop policy if exists "Authors can soft-delete own posts" on public.posts;
create policy "Authors can soft-delete own posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

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
    or p_audience = 'public'
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
      p_audience = 'specific'
      and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
    )
    or (
      p_challenge_id is not null
      and public.is_challenge_participant(p_challenge_id, auth.uid())
    );
$$;

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
      and public.can_read_post(p.author_id, p.audience, p.audience_user_ids, p.challenge_id)
  );
$$;

drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    deleted_at is null
    and public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
  );

create or replace function public.soft_delete_post(p_post_id uuid)
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
    set deleted_at = now()
    where id = p_post_id
      and author_id = auth.uid()
      and deleted_at is null;
  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

grant execute on function public.soft_delete_post(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Hide / report / mute
-- ---------------------------------------------------------------------------
create table if not exists public.post_hides (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'other')),
  created_at timestamptz not null default now(),
  unique (post_id, reporter_id)
);

create table if not exists public.mutes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, muted_user_id),
  check (user_id <> muted_user_id)
);

create index if not exists post_hides_post_id_idx on public.post_hides (post_id);
create index if not exists post_reports_post_id_idx on public.post_reports (post_id);
create index if not exists mutes_muted_user_id_idx on public.mutes (muted_user_id);

alter table public.post_hides enable row level security;
alter table public.post_reports enable row level security;
alter table public.mutes enable row level security;

drop policy if exists "Users read own post hides" on public.post_hides;
create policy "Users read own post hides"
  on public.post_hides for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own post hides" on public.post_hides;
create policy "Users insert own post hides"
  on public.post_hides for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own post hides" on public.post_hides;
create policy "Users delete own post hides"
  on public.post_hides for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own post reports" on public.post_reports;
create policy "Users insert own post reports"
  on public.post_reports for insert to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "Users read own post reports" on public.post_reports;
create policy "Users read own post reports"
  on public.post_reports for select to authenticated
  using (auth.uid() = reporter_id);

drop policy if exists "Users read own mutes" on public.mutes;
create policy "Users read own mutes"
  on public.mutes for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users insert own mutes" on public.mutes;
create policy "Users insert own mutes"
  on public.mutes for insert to authenticated
  with check (auth.uid() = user_id and user_id <> muted_user_id);

drop policy if exists "Users delete own mutes" on public.mutes;
create policy "Users delete own mutes"
  on public.mutes for delete to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.post_hides to authenticated;
grant select, insert on public.post_reports to authenticated;
grant select, insert, delete on public.mutes to authenticated;

create or replace function public.report_post(p_post_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_reason text := lower(btrim(coalesce(p_reason, '')));
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_reason not in ('spam', 'harassment', 'inappropriate', 'other') then
    raise exception 'INVALID_REASON' using errcode = 'P0001';
  end if;
  if not public.can_read_post_id(p_post_id) then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.posts where id = p_post_id and author_id = v_uid) then
    raise exception 'CANT_REPORT_OWN' using errcode = 'P0001';
  end if;
  insert into public.post_reports (post_id, reporter_id, reason)
  values (p_post_id, v_uid, v_reason)
  on conflict (post_id, reporter_id) do update set reason = excluded.reason;
end;
$$;

grant execute on function public.report_post(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Quote snapshot at create + notify original author
-- ---------------------------------------------------------------------------
create or replace function public.trg_posts_quote_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_name text;
  v_username text;
  v_avatar text;
  v_preview text;
begin
  if new.quoted_post_id is null then
    return new;
  end if;
  if new.quoted_post_id = new.id then
    raise exception 'CANT_QUOTE_SELF_ROW' using errcode = 'P0001';
  end if;
  if not public.can_read_post_id(new.quoted_post_id) then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select * into v_post from public.posts where id = new.quoted_post_id;
  if not found or v_post.deleted_at is not null then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select display_name, username, avatar_url
    into v_name, v_username, v_avatar
  from public.profiles
  where id = v_post.author_id;

  if coalesce(array_length(v_post.media_urls, 1), 0) > 0 then
    v_preview := v_post.media_urls[1];
  else
    v_preview := null;
  end if;

  new.quote_snapshot := jsonb_build_object(
    'author_id', v_post.author_id,
    'display_name', coalesce(nullif(trim(v_name), ''), v_username, 'Someone'),
    'username', coalesce(v_username, 'blob'),
    'avatar_url', v_avatar,
    'body', left(coalesce(v_post.content, ''), 140),
    'media_preview_url', v_preview,
    'created_at', v_post.created_at,
    'audience', v_post.audience
  );
  return new;
end;
$$;

drop trigger if exists posts_quote_snapshot on public.posts;
create trigger posts_quote_snapshot
  before insert on public.posts
  for each row execute function public.trg_posts_quote_snapshot();

create or replace function public.trg_notify_post_reposted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  if new.quoted_post_id is null then
    return new;
  end if;
  select author_id into v_author from public.posts where id = new.quoted_post_id;
  if v_author is null or v_author = new.author_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  perform public.notify_user(
    v_author,
    new.author_id,
    'post_reposted',
    v_name || ' reposted your post.',
    null,
    jsonb_build_object('post_id', new.quoted_post_id, 'quote_post_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_notify_reposted on public.posts;
create trigger posts_notify_reposted
  after insert on public.posts
  for each row execute function public.trg_notify_post_reposted();

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
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
