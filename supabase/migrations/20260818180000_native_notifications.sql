-- Native notifications: extra types, insert helper, push tokens, event wiring,
-- check-in + profile reminder jobs. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
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

alter table public.profiles
  add column if not exists timezone text,
  add column if not exists profile_incomplete_notified_at timestamptz,
  add column if not exists acked_profile_fields_version int not null default 0;

comment on column public.profiles.timezone is 'IANA timezone from the device. Used for check-in morning reminders.';
comment on column public.profiles.profile_incomplete_notified_at is 'One-shot incomplete-profile reminder. Never daily.';
comment on column public.profiles.acked_profile_fields_version is 'Last profile-fields version the user completed. Bump CURRENT in enqueue_profile_reminders to send one update reminder.';

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "Users read own push tokens" on public.push_tokens;
create policy "Users read own push tokens"
  on public.push_tokens for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users upsert own push tokens" on public.push_tokens;
create policy "Users upsert own push tokens"
  on public.push_tokens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users update own push tokens" on public.push_tokens;
create policy "Users update own push tokens"
  on public.push_tokens for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own push tokens" on public.push_tokens;
create policy "Users delete own push tokens"
  on public.push_tokens for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.push_tokens to authenticated;

create or replace function public.register_push_token(p_token text, p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(btrim(p_token)) < 10 then
    return;
  end if;
  insert into public.push_tokens (token, user_id, platform, updated_at)
  values (btrim(p_token), v_uid, nullif(btrim(coalesce(p_platform, '')), ''), now())
  on conflict (token) do update
    set user_id = excluded.user_id,
        platform = coalesce(excluded.platform, public.push_tokens.platform),
        updated_at = now();
end;
$$;

grant execute on function public.register_push_token(text, text) to authenticated;

create or replace function public.clear_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  delete from public.push_tokens
  where token = btrim(p_token)
    and user_id = auth.uid();
end;
$$;

grant execute on function public.clear_push_token(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Push send (pg_net if available; never fails the source write)
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
  rec record;
  v_payload jsonb;
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
    v_payload := jsonb_build_object(
      'to', rec.token,
      'title', p_title,
      'body', coalesce(p_body, p_title),
      'sound', 'default',
      'data', coalesce(p_data, '{}'::jsonb)
    );
    begin
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Accept', 'application/json'
        ),
        body := v_payload
      );
    exception when others then
      null;
    end;
  end loop;
exception when others then
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- insert_notification / notify_user
-- ---------------------------------------------------------------------------
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

  perform public.send_push_to_user(p_user_id, p_title, p_body, v_data || jsonb_build_object(
    'notification_id', v_id,
    'type', p_type
  ));
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

-- Client helper for the Official / paid gate screen. Own row only.
create or replace function public.notify_my_profile_gate(p_missing text default 'physical details')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_missing text := coalesce(nullif(btrim(p_missing), ''), 'physical details');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  return public.insert_notification(
    v_uid,
    'profile_incomplete',
    'Add ' || v_missing || ' to continue.',
    null,
    jsonb_build_object('dedupe_key', 'gate:' || v_missing, 'href', '/profile/body-metrics'),
    null
  );
end;
$$;

grant execute on function public.notify_my_profile_gate(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Friend request / accepted
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
  v_name text;
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    v_name := public.profile_display_name(new.requested_by);
    perform public.notify_user(
      v_other,
      new.requested_by,
      'friend_request',
      v_name || ' sent a friend request.',
      null,
      jsonb_build_object('username', (select username from public.profiles where id = new.requested_by))
    );
  elsif tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'accepted' then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    v_name := public.profile_display_name(v_other);
    perform public.notify_user(
      new.requested_by,
      v_other,
      'friend_accepted',
      v_name || ' accepted your friend request.',
      null,
      jsonb_build_object('username', (select username from public.profiles where id = v_other))
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert or update of status on public.friendships
  for each row execute function public.trg_notify_friendship();

-- ---------------------------------------------------------------------------
-- Comments + reactions on their post / proof
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_challenge uuid;
  v_name text;
  v_kind text;
begin
  select author_id, challenge_id into v_author, v_challenge
  from public.posts
  where id = new.post_id;
  if v_author is null or v_author = new.author_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.author_id);
  v_kind := case when v_challenge is null then 'post' else 'proof' end;
  perform public.notify_user(
    v_author,
    new.author_id,
    'post_comment',
    v_name || ' commented on your ' || v_kind || '.',
    null,
    jsonb_build_object(
      'post_id', new.post_id,
      'comment_id', new.id,
      'challenge_id', v_challenge
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists comments_notify_author on public.comments;
create trigger comments_notify_author
  after insert on public.comments
  for each row execute function public.trg_notify_comment();

create or replace function public.trg_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
  v_challenge uuid;
  v_name text;
  v_kind text;
  v_verb text;
begin
  if new.post_id is not null then
    select author_id, challenge_id into v_author, v_challenge
    from public.posts
    where id = new.post_id;
    v_kind := case when v_challenge is null then 'post' else 'proof' end;
  elsif new.comment_id is not null then
    select p.author_id, po.challenge_id into v_author, v_challenge
    from public.comments p
    join public.posts po on po.id = p.post_id
    where p.id = new.comment_id;
    v_kind := 'comment';
  else
    return new;
  end if;
  if v_author is null or v_author = new.user_id then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  v_verb := case
    when new.reaction_type = 'fire' then 'sent fire on'
    else 'liked'
  end;
  perform public.notify_user(
    v_author,
    new.user_id,
    'post_reaction',
    v_name || ' ' || v_verb || ' your ' || v_kind || '.',
    null,
    jsonb_build_object(
      'post_id', new.post_id,
      'comment_id', new.comment_id,
      'challenge_id', v_challenge
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reactions_notify_author on public.reactions;
create trigger reactions_notify_author
  after insert on public.reactions
  for each row execute function public.trg_notify_reaction();

-- ---------------------------------------------------------------------------
-- Story tags
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_story_tags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
begin
  if coalesce(new.caption, '') = '' then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  for rec in
    select distinct p.id as user_id, p.username
    from regexp_matches(new.caption, '@([A-Za-z0-9_]+)', 'g') as m
    join public.profiles p on p.username = lower(m[1])
    where p.id is distinct from new.user_id
    limit 10
  loop
    perform public.notify_user(
      rec.user_id,
      new.user_id,
      'tagged',
      v_name || ' tagged you in a story.',
      null,
      jsonb_build_object('story_id', new.id, 'challenge_id', new.challenge_id, 'username', rec.username)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists stories_notify_tags on public.stories;
create trigger stories_notify_tags
  after insert on public.stories
  for each row execute function public.trg_notify_story_tags();

-- Sharpen post tag copy for reels vs posts
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
  if new.challenge_id is not null then
    v_kind := 'a proof';
  elsif coalesce(array_length(new.media_urls, 1), 0) > 0
     and exists (
       select 1 from unnest(new.media_urls) u
       where u ilike '%.mp4' or u ilike '%.mov' or u ilike '%.webm'
     ) then
    v_kind := 'a reel';
  else
    v_kind := 'a post';
  end if;
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
      v_name || ' tagged you in ' || v_kind || '.',
      null,
      jsonb_build_object('post_id', new.id, 'challenge_id', new.challenge_id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Invite copy + join confirmed + starts + dropped + check-in
-- ---------------------------------------------------------------------------
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
  if new.invitee_id is null then
    return new;
  end if;
  v_name := public.profile_display_name(new.inviter_id);
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.invitee_id,
    new.inviter_id,
    'challenge_invite',
    v_name || ' invited you to ' || coalesce(v_title, 'a Challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

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
    v_name || ' joined ' || coalesce(v_title, 'your Challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_join_confirmed',
    'You’re in ' || coalesce(v_title, 'the Challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_challenge_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_when text;
  v_tz text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'in_progress' then
    v_tz := coalesce(nullif(new.timezone, ''), 'UTC');
    begin
      v_when := trim(to_char(new.starts_at at time zone v_tz, 'FMHH12:MI AM'));
    exception when others then
      v_when := trim(to_char(new.starts_at, 'FMHH12:MI AM'));
    end;
    for rec in
      select p.user_id
      from public.challenge_participants p
      where p.challenge_id = new.id
        and p.status is distinct from 'refunded_pre_start'
        and p.eliminated_at is null
    loop
      perform public.notify_user(
        rec.user_id,
        null,
        'challenge_starting',
        coalesce(new.title, 'Challenge') || ' starts at ' || coalesce(v_when, 'start') || '.',
        null,
        jsonb_build_object('challenge_id', new.id, 'dedupe_key', 'start:' || new.id::text)
      );
    end loop;
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenges_notify_starting on public.challenges;
create trigger challenges_notify_starting
  after update of status on public.challenges
  for each row execute function public.trg_notify_challenge_status();

create or replace function public.trg_notify_challenge_eliminated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  rec record;
  v_name text;
begin
  if old.eliminated_at is not null or new.eliminated_at is null then
    return new;
  end if;
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_eliminated',
    'You dropped from ' || coalesce(v_title, 'a Challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id)
  );
  v_name := public.profile_display_name(new.user_id);
  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = new.challenge_id
      and p.user_id is distinct from new.user_id
      and p.eliminated_at is null
      and p.status is distinct from 'refunded_pre_start'
  loop
    perform public.notify_user(
      rec.user_id,
      new.user_id,
      'competitor_dropped',
      v_name || ' dropped from ' || coalesce(v_title, 'the Challenge') || '.',
      null,
      jsonb_build_object('challenge_id', new.challenge_id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_checkin',
    'Check-in logged for ' || coalesce(v_title, 'your Challenge') || '.',
    null,
    jsonb_build_object(
      'challenge_id', new.challenge_id,
      'dedupe_key', 'checkin:' || new.challenge_id::text || ':' || new.submission_date::text
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists workout_submissions_notify_checkin on public.workout_submissions;
create trigger workout_submissions_notify_checkin
  after insert on public.workout_submissions
  for each row execute function public.trg_notify_checkin();

-- ---------------------------------------------------------------------------
-- Won / lost / payout
-- ---------------------------------------------------------------------------
create or replace function public.trg_notify_challenge_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_amount text;
  v_currency text;
  v_noun text;
begin
  select title, currency into v_title, v_currency from public.challenges where id = new.challenge_id;
  v_noun := case when coalesce(v_currency, 'coins') = 'bucks' then 'bucks' else 'coins' end;
  v_amount := trim(to_char(coalesce(new.amount, 0), 'FM999999990'));
  perform public.notify_user(
    new.user_id,
    null,
    'payout_received',
    'You earned ' || v_amount || ' ' || v_noun || '.',
    null,
    jsonb_build_object(
      'challenge_id', new.challenge_id,
      'amount', new.amount,
      'place', new.place,
      'currency', coalesce(v_currency, 'coins')
    )
  );
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_won',
    'You won ' || coalesce(v_title, 'the Challenge') || '.',
    null,
    jsonb_build_object('challenge_id', new.challenge_id, 'amount', new.amount)
  );
  return new;
exception when others then
  return new;
end;
$$;

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
  v_title := coalesce(new.title, 'A Challenge');
  for rec in
    select p.user_id
    from public.challenge_participants p
    where p.challenge_id = new.id
      and p.status is distinct from 'refunded_pre_start'
      and not exists (
        select 1 from public.challenge_payouts pay
        where pay.challenge_id = new.id
          and pay.user_id = p.user_id
      )
  loop
    perform public.notify_user(
      rec.user_id,
      null,
      'challenge_lost',
      'You lost ' || v_title || '.',
      null,
      jsonb_build_object('challenge_id', new.id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

-- Ledger credits that aren't already covered by transfer / badge / payout triggers
create or replace function public.trg_notify_wallet_credit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_noun text;
  v_amount text;
  v_entry text;
  v_reason text;
begin
  if coalesce(new.amount, 0) <= 0 or new.user_id is null then
    return new;
  end if;
  v_entry := lower(coalesce(new.entry_type, ''));
  v_reason := lower(coalesce(new.reason, ''));
  if v_entry in ('refund_pre_start', 'buy_in', 'escrow_lock', 'debit', 'lock') then
    return new;
  end if;
  if v_reason like '%refund%' or v_reason in ('badge_reward', 'payout', 'challenge_payout') then
    return new;
  end if;
  if v_entry in ('payout', 'prize', 'challenge_payout') then
    return new;
  end if;
  v_noun := case when coalesce(new.currency, 'coins') = 'bucks' then 'bucks' else 'coins' end;
  v_amount := trim(to_char(new.amount, 'FM999999990'));
  perform public.notify_user(
    new.user_id,
    null,
    'coins_received',
    'You earned ' || v_amount || ' ' || v_noun || '.',
    null,
    jsonb_build_object(
      'amount', new.amount,
      'currency', coalesce(new.currency, 'coins'),
      'challenge_id', new.challenge_id
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists wallet_ledger_notify_credit on public.wallet_ledger;
create trigger wallet_ledger_notify_credit
  after insert on public.wallet_ledger
  for each row execute function public.trg_notify_wallet_credit();

-- ---------------------------------------------------------------------------
-- Reminder jobs
-- ---------------------------------------------------------------------------
create or replace function public.local_today(p_tz text)
returns date
language plpgsql
stable
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
begin
  begin
    return (timezone(v_tz, now()))::date;
  exception when others then
    return (timezone('UTC', now()))::date;
  end;
end;
$$;

create or replace function public.local_hour(p_tz text)
returns int
language plpgsql
stable
as $$
declare
  v_tz text := coalesce(nullif(btrim(p_tz), ''), 'UTC');
begin
  begin
    return extract(hour from timezone(v_tz, now()))::int;
  exception when others then
    return extract(hour from timezone('UTC', now()))::int;
  end;
end;
$$;

create or replace function public.enqueue_checkin_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_tz text;
  v_today date;
  v_hour int;
  v_dow int;
  v_start_dow int;
  v_week_logs int;
  v_logged_today boolean;
  v_required boolean;
  v_title text;
begin
  for rec in
    select
      p.user_id,
      p.challenge_id,
      c.title,
      c.frequency,
      c.timezone as challenge_tz,
      c.starts_at,
      c.ends_at,
      pr.timezone as profile_tz
    from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
    join public.profiles pr on pr.id = p.user_id
    where c.status = 'in_progress'
      and p.eliminated_at is null
      and p.status is distinct from 'refunded_pre_start'
      and (c.ends_at is null or now() < c.ends_at)
  loop
    v_tz := coalesce(nullif(rec.profile_tz, ''), nullif(rec.challenge_tz, ''), 'UTC');
    v_hour := public.local_hour(v_tz);
    if v_hour < 6 or v_hour >= 12 then
      continue;
    end if;
    v_today := public.local_today(v_tz);
    if rec.starts_at is not null and v_today < (rec.starts_at at time zone v_tz)::date then
      continue;
    end if;

    select exists (
      select 1 from public.workout_submissions s
      where s.challenge_id = rec.challenge_id
        and s.user_id = rec.user_id
        and s.submission_date = v_today
    ) into v_logged_today;
    if v_logged_today then
      continue;
    end if;

    v_dow := extract(isodow from v_today)::int;
    begin
      v_start_dow := extract(isodow from (rec.starts_at at time zone v_tz)::date)::int;
    exception when others then
      v_start_dow := 1;
    end;

    v_required := false;
    if rec.frequency in ('daily', 'custom') or rec.frequency is null then
      v_required := true;
    elsif rec.frequency = 'once' then
      v_required := not exists (
        select 1 from public.workout_submissions s
        where s.challenge_id = rec.challenge_id and s.user_id = rec.user_id
      );
    elsif rec.frequency in ('3x_week') then
      select count(*) into v_week_logs
      from public.workout_submissions s
      where s.challenge_id = rec.challenge_id
        and s.user_id = rec.user_id
        and s.submission_date >= date_trunc('week', v_today)::date
        and s.submission_date < (date_trunc('week', v_today) + interval '7 days')::date;
      v_required := coalesce(v_week_logs, 0) < 3 and v_dow in (1, 3, 5);
    elsif rec.frequency = 'weekly' then
      v_required := v_dow = v_start_dow;
    else
      v_required := true;
    end if;

    if not v_required then
      continue;
    end if;

    v_title := coalesce(rec.title, 'Challenge');
    perform public.notify_user(
      rec.user_id,
      null,
      'challenge_checkin_reminder',
      'Check in for ' || v_title || '.',
      null,
      jsonb_build_object(
        'challenge_id', rec.challenge_id,
        'dedupe_key', 'checkin-reminder:' || rec.challenge_id::text || ':' || v_today::text
      )
    );
  end loop;
end;
$$;

create or replace function public.enqueue_profile_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_current int := 1;
begin
  -- Version 1: physical details (body metrics) for Official / paid gates.
  for rec in
    select id, body_metrics_completed_at, profile_incomplete_notified_at, acked_profile_fields_version, created_at
    from public.profiles
    where created_at <= now() - interval '24 hours'
      and profile_incomplete_notified_at is null
  loop
    if rec.body_metrics_completed_at is not null then
      update public.profiles
      set acked_profile_fields_version = greatest(coalesce(acked_profile_fields_version, 0), v_current)
      where id = rec.id;
      continue;
    end if;
    perform public.notify_user(
      rec.id,
      null,
      'profile_incomplete',
      'Add physical details to join Official Challenges.',
      null,
      jsonb_build_object('dedupe_key', 'profile:' || v_current::text, 'href', '/profile/body-metrics')
    );
    update public.profiles
    set profile_incomplete_notified_at = now()
    where id = rec.id;
  end loop;

  update public.profiles
  set acked_profile_fields_version = v_current
  where body_metrics_completed_at is not null
    and acked_profile_fields_version < v_current;
end;
$$;

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_joined int;
  v_need int;
begin
  for rec in
    select id, min_participants, start_rule, starts_at
    from public.challenges
    where status in ('upcoming', 'open')
      and starts_at is not null
      and now() >= starts_at
      and (ends_at is null or now() < ends_at)
    for update skip locked
  loop
    select count(*) into v_joined
    from public.challenge_participants
    where challenge_id = rec.id
      and status is distinct from 'refunded_pre_start';

    if coalesce(rec.start_rule, 'legacy') = 'at_starts_at' then
      v_need := greatest(coalesce(rec.min_participants, 2), 2);
      if v_joined >= v_need then
        update public.challenges
        set
          status = 'in_progress',
          official_started_at = coalesce(official_started_at, starts_at)
        where id = rec.id;
      else
        update public.challenges
        set status = 'cancelled_underfilled'
        where id = rec.id;
        perform public.refund_challenge_underfilled(rec.id);
      end if;
    else
      update public.challenges
      set
        status = 'in_progress',
        official_started_at = coalesce(official_started_at, starts_at)
      where id = rec.id;
    end if;
  end loop;

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false;

  perform public.sync_challenge_misses();
  perform public.sync_unlimited_eliminations();
  perform public.enqueue_checkin_reminders();
  perform public.enqueue_profile_reminders();
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;
grant execute on function public.enqueue_checkin_reminders() to authenticated;
grant execute on function public.enqueue_profile_reminders() to authenticated;

create unique index if not exists notifications_dedupe_key_idx
  on public.notifications (user_id, type, (data->>'dedupe_key'))
  where coalesce(data->>'dedupe_key', '') <> '';

create or replace function public.trg_notify_coins_received()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount text;
  v_noun text;
begin
  v_noun := case when public.normalize_wallet_currency(new.currency) = 'bucks' then 'bucks' else 'coins' end;
  v_amount := trim(to_char(coalesce(new.amount, 0), 'FM999999990'));
  perform public.notify_user(
    new.recipient_id,
    new.sender_id,
    'coins_received',
    'You earned ' || v_amount || ' ' || v_noun || '.',
    null,
    jsonb_build_object('amount', new.amount, 'transfer_id', new.id, 'currency', coalesce(new.currency, 'coins'))
  );
  return new;
exception when others then
  return new;
end;
$$;
