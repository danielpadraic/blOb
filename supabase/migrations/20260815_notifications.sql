-- In-app notifications. Creation is trigger/RPC-only and never fails the source write.
-- Safe to re-run.

create table if not exists public.challenge_invites (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint challenge_invite_not_self check (inviter_id <> invitee_id),
  unique (challenge_id, invitee_id)
);

comment on table public.challenge_invites is 'Host invites. A row is the share; the notification is created by trigger.';

create index if not exists challenge_invites_invitee_id_idx
  on public.challenge_invites (invitee_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'challenge_joined',
    'follow',
    'coins_received',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated'
  ))
);

comment on table public.notifications is 'Per-user inbox. Inserts happen inside notify_user(); clients only read and mark as read.';

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id)
  where read_at is null;

alter table public.challenge_invites enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users read own challenge invites" on public.challenge_invites;
create policy "Users read own challenge invites"
  on public.challenge_invites for select
  to authenticated
  using (auth.uid() = inviter_id or auth.uid() = invitee_id);

drop policy if exists "Hosts insert challenge invites" on public.challenge_invites;
create policy "Hosts insert challenge invites"
  on public.challenge_invites for insert
  to authenticated
  with check (
    auth.uid() = inviter_id
    and exists (
      select 1 from public.challenges c
      where c.id = challenge_id
        and c.created_by = auth.uid()
    )
  );

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users update own notifications" on public.notifications;
create policy "Users update own notifications"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert on public.challenge_invites to authenticated;
grant select, update on public.notifications to authenticated;

create or replace function public.profile_display_name(p_user_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(p.display_name), ''), p.username, 'Someone')
  from public.profiles p
  where p.id = p_user_id;
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
  if p_user_id is null then
    return;
  end if;
  if p_actor_id is not null and p_user_id = p_actor_id then
    return;
  end if;
  insert into public.notifications (user_id, actor_id, type, title, body, data)
  values (
    p_user_id,
    p_actor_id,
    p_type,
    p_title,
    p_body,
    coalesce(p_data, '{}'::jsonb)
  );
exception when others then
  null;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null
      and (p_ids is null or id = any (p_ids));

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee_id uuid)
returns public.challenge_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_challenge public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
begin
  v_inviter := auth.uid();
  if v_inviter is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_invitee_id is null then
    raise exception 'Pick someone to invite' using errcode = 'P0001';
  end if;

  if p_invitee_id = v_inviter then
    raise exception 'You can’t invite yourself' using errcode = 'P0001';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if v_challenge.created_by is distinct from v_inviter then
    raise exception 'Only the host can invite people' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = p_invitee_id
  ) then
    raise exception 'They’re already in this challenge' using errcode = 'P0001';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id)
  values (p_challenge_id, v_inviter, p_invitee_id)
  on conflict (challenge_id, invitee_id) do nothing
  returning * into v_invite;

  if v_invite.id is null then
    select * into v_invite
    from public.challenge_invites
    where challenge_id = p_challenge_id
      and invitee_id = p_invitee_id;
    raise exception 'You already invited them' using errcode = 'P0001';
  end if;

  return v_invite;
end;
$$;

grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

create or replace function public.trg_notify_challenge_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
begin
  v_name := public.profile_display_name(new.inviter_id);
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.invitee_id,
    new.inviter_id,
    'challenge_invite',
    'You’re invited',
    v_name || ' invited you to ' || coalesce(v_title, 'a challenge') || '.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_invites_notify on public.challenge_invites;
create trigger challenge_invites_notify
  after insert on public.challenge_invites
  for each row execute function public.trg_notify_challenge_invite();

create or replace function public.trg_notify_challenge_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
  v_title text;
  v_name text;
begin
  select created_by, title into v_host, v_title
  from public.challenges
  where id = new.challenge_id;
  v_name := public.profile_display_name(new.user_id);
  perform public.notify_user(
    v_host,
    new.user_id,
    'challenge_joined',
    'Someone joined your challenge',
    v_name || ' joined ' || coalesce(v_title, 'your challenge') || '.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_participants_notify_joined on public.challenge_participants;
create trigger challenge_participants_notify_joined
  after insert on public.challenge_participants
  for each row execute function public.trg_notify_challenge_joined();

create or replace function public.trg_notify_challenge_eliminated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  if old.eliminated_at is not null or new.eliminated_at is null then
    return new;
  end if;
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_eliminated',
    'You’ve been eliminated',
    'You’re out of ' || coalesce(v_title, 'a challenge') || '. New logs are not accepted.',
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_participants_notify_eliminated on public.challenge_participants;
create trigger challenge_participants_notify_eliminated
  after update of eliminated_at on public.challenge_participants
  for each row execute function public.trg_notify_challenge_eliminated();

create or replace function public.trg_notify_challenge_new()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_kind text;
  v_title text;
begin
  if new.created_by is null then
    return new;
  end if;
  if coalesce(new.visibility, 'public') = 'private' then
    return new;
  end if;

  v_name := public.profile_display_name(new.created_by);
  if new.is_official then
    v_kind := 'New official challenge';
    v_title := coalesce(new.title, 'A new official challenge') || ' is live.';
  else
    v_kind := 'New challenge';
    v_title := v_name || ' posted ' || coalesce(new.title, 'a challenge') || '.';
  end if;

  for rec in
    select f.follower_id
    from public.follows f
    where f.following_id = new.created_by
    limit 40
  loop
    perform public.notify_user(
      rec.follower_id,
      new.created_by,
      'challenge_new',
      v_kind,
      v_title,
      jsonb_build_object('challenge_id', new.id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenges_notify_new on public.challenges;
create trigger challenges_notify_new
  after insert on public.challenges
  for each row execute function public.trg_notify_challenge_new();

create or replace function public.trg_notify_challenge_settled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_title text;
begin
  if old.status is not distinct from new.status or new.status is distinct from 'settled' then
    return new;
  end if;
  v_title := coalesce(new.title, 'A challenge');
  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = new.id
      and not exists (
        select 1 from public.challenge_payouts pay
        where pay.challenge_id = new.id
          and pay.user_id = p.user_id
      )
  loop
    perform public.notify_user(
      rec.user_id,
      new.created_by,
      'challenge_settled',
      'Challenge settled',
      v_title || ' is settled. Check your result.',
      jsonb_build_object('challenge_id', new.id)
    );
  end loop;
  if new.created_by is not null
     and not exists (
       select 1 from public.challenge_participants p
       where p.challenge_id = new.id and p.user_id = new.created_by
     )
  then
    perform public.notify_user(
      new.created_by,
      null,
      'challenge_settled',
      'Challenge settled',
      v_title || ' is settled.',
      jsonb_build_object('challenge_id', new.id)
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenges_notify_settled on public.challenges;
create trigger challenges_notify_settled
  after update of status on public.challenges
  for each row execute function public.trg_notify_challenge_settled();

create or replace function public.trg_notify_challenge_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_ord text;
  v_amount text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;
  v_ord := new.place::text ||
    case
      when new.place % 100 between 11 and 13 then 'th'
      when new.place % 10 = 1 then 'st'
      when new.place % 10 = 2 then 'nd'
      when new.place % 10 = 3 then 'rd'
      else 'th'
    end;
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_placed',
    'You placed ' || v_ord,
    'You finished ' || v_ord || ' in ' || coalesce(v_title, 'a challenge') ||
      ' and received ' || v_amount || ' Coins.',
    jsonb_build_object('challenge_id', new.challenge_id, 'amount', new.amount, 'place', new.place)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_payouts_notify_placed on public.challenge_payouts;
create trigger challenge_payouts_notify_placed
  after insert on public.challenge_payouts
  for each row execute function public.trg_notify_challenge_placed();

create or replace function public.trg_notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_username text;
begin
  v_name := public.profile_display_name(new.follower_id);
  select username into v_username from public.profiles where id = new.follower_id;
  perform public.notify_user(
    new.following_id,
    new.follower_id,
    'follow',
    'New follower',
    v_name || ' started following you.',
    jsonb_build_object('username', v_username)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.trg_notify_follow();

create or replace function public.trg_notify_coins_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_amount text;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_amount := to_char(coalesce(new.amount, 0), 'FM999999990.00');
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    'You received Coins',
    v_name || ' sent you ' || v_amount || ' Coins.',
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.coin_transfers') is not null then
    drop trigger if exists coin_transfers_notify on public.coin_transfers;
    create trigger coin_transfers_notify
      after insert on public.coin_transfers
      for each row execute function public.trg_notify_coins_received();
  end if;
end $$;

create or replace function public.trg_notify_post_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_kind text;
begin
  if coalesce(new.content, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  v_kind := case when new.challenge_id is null then 'a post' else 'a challenge post' end;
  for rec in
    select distinct p.id as user_id
    from regexp_matches(new.content, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.author_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'tagged',
      'You were tagged',
      v_name || ' tagged you in ' || v_kind || '.',
      jsonb_build_object(
        'post_id', new.id,
        'challenge_id', new.challenge_id
      )
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_notify_tags on public.posts;
create trigger posts_notify_tags
  after insert on public.posts
  for each row execute function public.trg_notify_post_tags();

create or replace function public.trg_notify_comment_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_challenge uuid;
begin
  if coalesce(new.content, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  select challenge_id into v_challenge from public.posts where id = new.post_id;
  for rec in
    select distinct p.id as user_id
    from regexp_matches(new.content, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.author_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.author_id,
      'tagged',
      'You were tagged',
      v_name || ' tagged you in a comment.',
      jsonb_build_object(
        'post_id', new.post_id,
        'comment_id', new.id,
        'challenge_id', v_challenge
      )
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists comments_notify_tags on public.comments;
create trigger comments_notify_tags
  after insert on public.comments
  for each row execute function public.trg_notify_comment_tags();

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when others then
  null;
end $$;
