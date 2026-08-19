-- Wave clips (15s segments) + reactions, comments, share notify.
-- Safe to re-run. Route/table names stay stories. User-facing name is Wave.

alter table public.stories
  add column if not exists sequence_id uuid,
  add column if not exists sequence_index integer not null default 0,
  add column if not exists clip_start_ms integer not null default 0,
  add column if not exists clip_duration_ms integer;

create index if not exists stories_sequence_id_idx
  on public.stories (sequence_id, sequence_index)
  where sequence_id is not null;

create table if not exists public.story_reactions (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction_type text not null check (reaction_type in ('like', 'love', 'fire', 'strong')),
  created_at timestamptz not null default now(),
  unique (story_id, user_id, reaction_type)
);

create index if not exists story_reactions_story_id_idx
  on public.story_reactions (story_id, created_at desc);

create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists story_comments_story_id_idx
  on public.story_comments (story_id, created_at);

alter table public.story_reactions enable row level security;
alter table public.story_comments enable row level security;

drop policy if exists "Wave reactions are readable" on public.story_reactions;
create policy "Wave reactions are readable"
  on public.story_reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.expires_at > now() or s.user_id = auth.uid())
    )
  );

drop policy if exists "Users react to Waves" on public.story_reactions;
create policy "Users react to Waves"
  on public.story_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users remove own Wave reactions" on public.story_reactions;
create policy "Users remove own Wave reactions"
  on public.story_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Wave comments are readable" on public.story_comments;
create policy "Wave comments are readable"
  on public.story_comments for select
  to authenticated
  using (
    exists (
      select 1 from public.stories s
      where s.id = story_id
        and (s.expires_at > now() or s.user_id = auth.uid())
    )
  );

drop policy if exists "Users comment on Waves" on public.story_comments;
create policy "Users comment on Waves"
  on public.story_comments for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select, insert, delete on public.story_reactions to authenticated;
grant select, insert on public.story_comments to authenticated;

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
exception when others then
  null;
end $$;

do $$
begin
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
    'proof_flagged'
  ));
exception when others then
  null;
end $$;

create or replace function public.trg_notify_story_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  select user_id into v_author from public.stories where id = new.story_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_author,
    new.user_id,
    'story_reaction',
    v_name || ' reacted to your Wave.',
    null,
    jsonb_build_object('story_id', new.story_id, 'reaction_type', new.reaction_type)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists story_reactions_notify on public.story_reactions;
create trigger story_reactions_notify
  after insert on public.story_reactions
  for each row execute function public.trg_notify_story_reaction();

create or replace function public.trg_notify_story_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  select user_id into v_author from public.stories where id = new.story_id;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_author,
    new.user_id,
    'story_comment',
    v_name || ' commented on your Wave.',
    left(trim(new.body), 140),
    jsonb_build_object('story_id', new.story_id, 'comment_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists story_comments_notify on public.story_comments;
create trigger story_comments_notify
  after insert on public.story_comments
  for each row execute function public.trg_notify_story_comment();

create or replace function public.notify_story_shared(p_story_id uuid, p_recipient_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_name text;
begin
  if auth.uid() is null or p_story_id is null then
    return;
  end if;
  select user_id into v_author from public.stories where id = p_story_id;
  if v_author is null or v_author = auth.uid() then
    return;
  end if;
  v_name := public.profile_display_name(auth.uid());
  perform public.notify_user(
    v_author,
    auth.uid(),
    'story_shared',
    v_name || ' shared your Wave to a DM.',
    null,
    jsonb_build_object('story_id', p_story_id, 'recipient_id', p_recipient_id)
  );
exception when others then
  return;
end;
$$;

grant execute on function public.notify_story_shared(uuid, uuid) to authenticated;
