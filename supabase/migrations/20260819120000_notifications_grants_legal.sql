-- blOb: in-app notifications (push best-effort), coin grants, legal accept, tutorial flag.
-- Safe to re-run. Never credit Official pot money as coins.

-- ---------------------------------------------------------------------------
-- Notification types + insert_notification: row commits even if push throws
-- ---------------------------------------------------------------------------

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
    perform public.send_push_to_user(p_user_id, p_title, p_body, v_data || jsonb_build_object(
      'notification_id', v_id,
      'type', p_type
    ));
  exception when others then
    null;
  end;

  return v_id;
exception when others then
  return null;
end;
$$;

alter table public.notifications enable row level security;

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

grant select, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- DM → in-app row
-- ---------------------------------------------------------------------------

create or replace function public.trg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_preview text;
begin
  v_name := public.profile_display_name(new.sender_id);
  v_preview := nullif(left(btrim(coalesce(new.body, '')), 80), '');
  for rec in
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id is distinct from new.sender_id
  loop
    perform public.notify_user(
      rec.user_id,
      new.sender_id,
      'message',
      v_name || ' sent you a message.',
      v_preview,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'href', '/messages/' || new.conversation_id::text
      )
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

do $$
begin
  drop trigger if exists messages_notify_members on public.messages;
  create trigger messages_notify_members
    after insert on public.messages
    for each row execute function public.trg_notify_message();
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- Official start (status → live) + keep in_progress starting notify
-- ---------------------------------------------------------------------------

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

  if new.status = 'live' then
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
        'official_started',
        coalesce(new.title, 'Official') || ' is live.',
        'Your Official window is open. Log the work.',
        jsonb_build_object(
          'challenge_id', new.id,
          'dedupe_key', 'official_start:' || new.id::text
        )
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

-- ---------------------------------------------------------------------------
-- Proof flag → author
-- ---------------------------------------------------------------------------

create or replace function public.flag_challenge_proof(p_post_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts%rowtype;
  v_count int;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_notify uuid;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_post from public.posts where id = p_post_id;
  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;
  if v_post.challenge_id is null then
    raise exception 'NOT_A_CHALLENGE_PROOF';
  end if;
  if v_post.author_id = v_uid then
    raise exception 'CANNOT_FLAG_OWN';
  end if;

  insert into public.challenge_proof_flags (post_id, challenge_id, flagged_by, reason)
  values (
    p_post_id,
    v_post.challenge_id,
    v_uid,
    coalesce(v_reason, 'HR proof missing / not 30 min / not their workout.')
  )
  on conflict (post_id, flagged_by) do update
    set reason = coalesce(excluded.reason, public.challenge_proof_flags.reason);

  select count(*) into v_count
  from public.challenge_proof_flags
  where post_id = p_post_id;

  v_notify := public.insert_notification(
    v_post.author_id,
    'proof_flagged',
    'Your proof was flagged.',
    'A competitor flagged this workout proof. Review the Official rules.',
    jsonb_build_object(
      'post_id', p_post_id,
      'challenge_id', v_post.challenge_id
    ),
    v_uid
  );
  if v_notify is null then
    raise exception 'NOTIFY_FAILED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'hidden', false,
    'flag_count', v_count
  );
end;
$$;

grant execute on function public.flag_challenge_proof(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile: legal + tutorial
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists tos_accepted_at timestamptz;
alter table public.profiles
  add column if not exists privacy_accepted_at timestamptz;
alter table public.profiles
  add column if not exists skill_attestation_at timestamptz;
alter table public.profiles
  add column if not exists tos_version text;
alter table public.profiles
  add column if not exists privacy_version text;
alter table public.profiles
  add column if not exists tutorial_completed_at timestamptz;

comment on column public.profiles.tos_accepted_at is 'When the user agreed to the Terms of Service and User Agreement.';
comment on column public.profiles.privacy_accepted_at is 'When the user agreed to the Privacy Policy.';
comment on column public.profiles.skill_attestation_at is 'When the user attested contests are personal effort and skill.';
comment on column public.profiles.tutorial_completed_at is 'When the first-run tour was skipped or finished.';

do $$
begin
  alter table public.profiles alter column coins set default 0;
exception when others then
  null;
end $$;

create or replace function public.protect_profiles_legal_tutorial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('blob.legal_write', true) = '1' then
    return NEW;
  end if;
  if tg_op = 'UPDATE' then
    NEW.tos_accepted_at := OLD.tos_accepted_at;
    NEW.privacy_accepted_at := OLD.privacy_accepted_at;
    NEW.skill_attestation_at := OLD.skill_attestation_at;
    NEW.tos_version := OLD.tos_version;
    NEW.privacy_version := OLD.privacy_version;
    NEW.tutorial_completed_at := OLD.tutorial_completed_at;
  end if;
  return NEW;
end;
$$;

drop trigger if exists profiles_protect_legal_tutorial on public.profiles;
create trigger profiles_protect_legal_tutorial
  before update on public.profiles
  for each row execute function public.protect_profiles_legal_tutorial();

create or replace function public.accept_legal(
  p_tos boolean,
  p_privacy boolean,
  p_skill boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tos text := '2026-08-19';
  v_privacy text := '2026-08-19';
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if p_tos is not true or p_privacy is not true or p_skill is not true then
    raise exception 'LEGAL_REQUIRED';
  end if;

  perform set_config('blob.legal_write', '1', true);

  update public.profiles
  set
    tos_accepted_at = coalesce(tos_accepted_at, v_now),
    privacy_accepted_at = coalesce(privacy_accepted_at, v_now),
    skill_attestation_at = coalesce(skill_attestation_at, v_now),
    tos_version = v_tos,
    privacy_version = v_privacy
  where id = v_uid;

  if not found then
    raise exception 'PROFILE_MISSING';
  end if;

  return jsonb_build_object(
    'ok', true,
    'tos_version', v_tos,
    'privacy_version', v_privacy,
    'accepted_at', v_now
  );
end;
$$;

grant execute on function public.accept_legal(boolean, boolean, boolean) to authenticated;

create or replace function public.complete_tutorial()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_at timestamptz;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform set_config('blob.legal_write', '1', true);
  update public.profiles
  set tutorial_completed_at = coalesce(tutorial_completed_at, now())
  where id = v_uid
  returning tutorial_completed_at into v_at;
  return v_at;
end;
$$;

create or replace function public.replay_tutorial()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform set_config('blob.legal_write', '1', true);
  update public.profiles
  set tutorial_completed_at = null
  where id = v_uid;
end;
$$;

grant execute on function public.complete_tutorial() to authenticated;
grant execute on function public.replay_tutorial() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants catalog
-- ---------------------------------------------------------------------------

create or replace function public.chicago_today()
returns date
language sql
stable
as $$
  select (timezone('utc', now()) at time zone 'America/Chicago')::date;
$$;

create or replace function public.grant_catalog_amount(p_grant_key text)
returns numeric
language sql
immutable
as $$
  select case p_grant_key
    when 'signup_100' then 100
    when 'fitness_profile_complete' then 50
    when 'daily_login' then 10
    when 'streak_3' then 10
    when 'streak_7' then 25
    when 'streak_30' then 50
    when 'first_challenge_created' then 25
    when 'first_challenge_completed' then 50
    when 'first_proof' then 25
    when 'first_friend' then 10
    when 'first_official_join' then 15
    else null
  end;
$$;

create table if not exists public.user_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  grant_key text not null,
  amount numeric(12,2) not null check (amount >= 10 and amount <= 100),
  chicago_date date not null default public.chicago_today(),
  created_at timestamptz not null default now()
);

create unique index if not exists user_grants_once_uidx
  on public.user_grants (user_id, grant_key)
  where grant_key is distinct from 'daily_login';

create unique index if not exists user_grants_daily_uidx
  on public.user_grants (user_id, grant_key, chicago_date)
  where grant_key = 'daily_login';

create index if not exists user_grants_user_created_idx
  on public.user_grants (user_id, created_at desc);

alter table public.user_grants enable row level security;

drop policy if exists "Users read own grants" on public.user_grants;
create policy "Users read own grants"
  on public.user_grants for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.user_grants to authenticated;

comment on table public.user_grants is 'Idempotent blob-coin grants. Never Official pot money.';

insert into public.badges (key, name, description, icon, tone, coin_reward, metric, threshold, tier, sort_order)
values
  ('streak_3', '3-day streak', 'Showed up three Chicago days in a row.', 'streak', 'gold', 0, 'login_streak', 3, 1, 81),
  ('streak_7', '7-day streak', 'Showed up seven Chicago days in a row.', 'streak', 'gold', 0, 'login_streak', 7, 2, 82),
  ('streak_30', '30-day streak', 'Showed up thirty Chicago days in a row.', 'streak', 'gold', 0, 'login_streak', 30, 3, 83)
on conflict (key) do nothing;

create or replace function public.grant_copy(p_grant_key text, p_amount numeric)
returns table (title text, body text)
language sql
immutable
as $$
  select
    ('+' || trim(to_char(p_amount, 'FM999999990')) || ' coins · ' ||
      case p_grant_key
        when 'signup_100' then 'welcome to blOb'
        when 'fitness_profile_complete' then 'fitness profile complete'
        when 'daily_login' then 'you showed up today'
        when 'streak_3' then '3-day streak'
        when 'streak_7' then '7-day streak'
        when 'streak_30' then '30-day streak'
        when 'first_challenge_created' then 'you created your first challenge'
        when 'first_challenge_completed' then 'you finished your first challenge'
        when 'first_proof' then 'you logged your first proof'
        when 'first_friend' then 'you made a friend'
        when 'first_official_join' then 'you joined Official'
        else p_grant_key
      end
    )::text,
    case p_grant_key
      when 'signup_100' then 'Coins are for showing up. They are not cash.'
      when 'fitness_profile_complete' then 'Those details stay private unless you share them.'
      when 'daily_login' then 'First open of the Chicago day. That is the whole trick.'
      when 'streak_3' then 'You showed up three days. That is the habit starting.'
      when 'streak_7' then 'A week. The thing is becoming who you are.'
      when 'streak_30' then 'Thirty days. You did the thing.'
      when 'first_challenge_created' then 'You hosted. Someone else can now show up with you.'
      when 'first_challenge_completed' then 'You finished without dropping. Keep that.'
      when 'first_proof' then 'Proof on the board. Not a speech.'
      when 'first_friend' then 'Bob was already here. This one is yours.'
      when 'first_official_join' then 'Skin in the game. Not a fortune.'
      else null
    end;
$$;

create or replace function public.write_coin_ledger(
  p_user_id uuid,
  p_amount numeric,
  p_grant_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata
    )
    values (
      p_user_id,
      null,
      'coins',
      p_amount,
      'coin_grant',
      p_grant_key,
      jsonb_build_object('grant_key', p_grant_key)
    );
    return;
  exception when others then
    null;
  end;

  begin
    insert into public.wallet_ledger (
      user_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    )
    values (
      p_user_id,
      'coins',
      p_amount,
      'coin_grant',
      p_grant_key,
      jsonb_build_object('grant_key', p_grant_key),
      'user_grant',
      p_grant_key
    );
    return;
  exception when others then
    null;
  end;

  insert into public.wallet_ledger (user_id, currency, amount, reason, ref_type, ref_id)
  values (p_user_id, 'coins', p_amount, p_grant_key, 'user_grant', p_grant_key);
end;
$$;

create or replace function public.award_streak_badge(p_user_id uuid, p_grant_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_grant_key not in ('streak_3', 'streak_7', 'streak_30') then
    return;
  end if;
  begin
    insert into public.user_badges (user_id, badge_key, coin_reward)
    values (p_user_id, p_grant_key, 0)
    on conflict do nothing;
  exception when others then
    begin
      insert into public.user_badges (user_id, badge_key, coin_reward, awarded_at)
      values (p_user_id, p_grant_key, 0, now())
      on conflict do nothing;
    exception when others then
      null;
    end;
  end;
end;
$$;

create or replace function public.claim_user_grant(p_user_id uuid, p_grant_key text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_amount numeric(12,2);
  v_today date := public.chicago_today();
  v_copy record;
  v_notify uuid;
  v_has_ledger boolean := false;
  v_inserted uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'granted', false, 'error', 'NO_USER');
  end if;

  v_amount := public.grant_catalog_amount(p_grant_key);
  if v_amount is null then
    return jsonb_build_object('ok', false, 'granted', false, 'error', 'UNKNOWN_GRANT');
  end if;

  if exists (select 1 from public.profiles where id = p_user_id and coalesce(is_official, false)) then
    return jsonb_build_object('ok', true, 'granted', false, 'grant_key', p_grant_key);
  end if;

  begin
    if p_grant_key = 'daily_login' then
      insert into public.user_grants (user_id, grant_key, amount, chicago_date)
      values (p_user_id, p_grant_key, v_amount, v_today)
      returning id into v_inserted;
    else
      insert into public.user_grants (user_id, grant_key, amount, chicago_date)
      values (p_user_id, p_grant_key, v_amount, v_today)
      returning id into v_inserted;
    end if;
  exception when unique_violation then
    return jsonb_build_object(
      'ok', true,
      'granted', false,
      'grant_key', p_grant_key,
      'amount', v_amount
    );
  end;

  if v_inserted is null then
    return jsonb_build_object('ok', true, 'granted', false, 'grant_key', p_grant_key);
  end if;

  select exists (
    select 1
    from public.wallet_ledger w
    where w.user_id = p_user_id
      and coalesce(w.currency, 'coins') = 'coins'
      and w.amount > 0
  ) into v_has_ledger;

  begin
    if p_grant_key = 'signup_100' and not v_has_ledger then
      update public.profiles
      set coins = v_amount, credits = v_amount
      where id = p_user_id;
    else
      update public.profiles
      set coins = coalesce(coins, 0) + v_amount,
          credits = coalesce(credits, coins, 0) + v_amount
      where id = p_user_id;
    end if;
  exception when others then
    if p_grant_key = 'signup_100' and not v_has_ledger then
      update public.profiles set coins = v_amount where id = p_user_id;
    else
      update public.profiles
      set coins = coalesce(coins, 0) + v_amount
      where id = p_user_id;
    end if;
  end;

  perform public.write_coin_ledger(p_user_id, v_amount, p_grant_key);

  select * into v_copy from public.grant_copy(p_grant_key, v_amount);

  v_notify := public.insert_notification(
    p_user_id,
    'coin_grant',
    v_copy.title,
    v_copy.body,
    jsonb_build_object(
      'grant_key', p_grant_key,
      'amount', v_amount,
      'currency', 'coins',
      'href', '/profile',
      'dedupe_key', 'grant:' || p_grant_key || case
        when p_grant_key = 'daily_login' then ':' || v_today::text
        else ''
      end
    ),
    null
  );
  if v_notify is null then
    v_notify := public.insert_notification(
      p_user_id,
      'coins_received',
      v_copy.title,
      v_copy.body,
      jsonb_build_object(
        'grant_key', p_grant_key,
        'amount', v_amount,
        'currency', 'coins',
        'href', '/profile',
        'dedupe_key', 'grant:' || p_grant_key || case
          when p_grant_key = 'daily_login' then ':' || v_today::text
          else ''
        end
      ),
      null
    );
  end if;
  if v_notify is null then
    raise exception 'NOTIFY_FAILED';
  end if;

  perform public.award_streak_badge(p_user_id, p_grant_key);

  return jsonb_build_object(
    'ok', true,
    'granted', true,
    'grant_key', p_grant_key,
    'amount', v_amount,
    'title', v_copy.title
  );
end;
$$;

create or replace function public.fitness_profile_is_complete(p public.profiles)
returns boolean
language sql
stable
as $$
  select
    p.body_metrics_completed_at is not null
    and p.gender in ('male', 'female')
    and p.height_cm is not null
    and p.current_weight is not null
    and p.body_fat_pct is not null
    and p.typical_weekly_workout_frequency is not null
    and coalesce(array_length(p.primary_activities, 1), 0) > 0
    and p.fitness_profile is not null
    and nullif(p.fitness_profile->>'experience_level', '') is not null
    and nullif(p.fitness_profile->>'training_days_per_week', '') is not null;
$$;

create or replace function public.login_streak_days(p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := public.chicago_today();
  v_expect date := v_today;
  v_count int := 0;
  rec record;
begin
  for rec in
    select chicago_date
    from public.user_grants
    where user_id = p_user_id
      and grant_key = 'daily_login'
    order by chicago_date desc
  loop
    if rec.chicago_date = v_expect then
      v_count := v_count + 1;
      v_expect := v_expect - 1;
    else
      exit;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.tick_user_grants()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  v_granted jsonb := '[]'::jsonb;
  v_row jsonb;
  v_streak int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_MISSING';
  end if;

  v_row := public.claim_user_grant(v_uid, 'signup_100');
  if coalesce((v_row->>'granted')::boolean, false) then
    v_granted := v_granted || jsonb_build_array(v_row);
  end if;

  v_row := public.claim_user_grant(v_uid, 'daily_login');
  if coalesce((v_row->>'granted')::boolean, false) then
    v_granted := v_granted || jsonb_build_array(v_row);
  end if;

  v_streak := public.login_streak_days(v_uid);
  if v_streak >= 3 then
    v_row := public.claim_user_grant(v_uid, 'streak_3');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;
  if v_streak >= 7 then
    v_row := public.claim_user_grant(v_uid, 'streak_7');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;
  if v_streak >= 30 then
    v_row := public.claim_user_grant(v_uid, 'streak_30');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if public.fitness_profile_is_complete(v_prof) then
    v_row := public.claim_user_grant(v_uid, 'fitness_profile_complete');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'grants', v_granted, 'streak', v_streak);
end;
$$;

grant execute on function public.tick_user_grants() to authenticated;
grant execute on function public.claim_user_grant(uuid, text) to service_role;

-- Fitness complete on profile save (body metrics stay private; this does not publish them)
create or replace function public.trg_grant_fitness_complete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.fitness_profile_is_complete(new) then
    perform public.claim_user_grant(new.id, 'fitness_profile_complete');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists profiles_grant_fitness_complete on public.profiles;
create trigger profiles_grant_fitness_complete
  after update on public.profiles
  for each row execute function public.trg_grant_fitness_complete();

create or replace function public.trg_grant_first_challenge_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    return new;
  end if;
  if coalesce(new.is_official, false) then
    return new;
  end if;
  perform public.claim_user_grant(new.created_by, 'first_challenge_created');
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenges_grant_first_created on public.challenges;
create trigger challenges_grant_first_created
  after insert on public.challenges
  for each row execute function public.trg_grant_first_challenge_created();

create or replace function public.trg_grant_first_challenge_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    perform public.claim_user_grant(new.user_id, 'first_challenge_completed');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists participants_grant_first_completed on public.challenge_participants;
create trigger participants_grant_first_completed
  after insert or update of status on public.challenge_participants
  for each row execute function public.trg_grant_first_challenge_completed();

create or replace function public.trg_grant_first_official_join()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official boolean;
begin
  select coalesce(is_official, false)
  into v_official
  from public.challenges
  where id = new.challenge_id;
  if v_official then
    perform public.claim_user_grant(new.user_id, 'first_official_join');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists participants_grant_first_official on public.challenge_participants;
create trigger participants_grant_first_official
  after insert on public.challenge_participants
  for each row execute function public.trg_grant_first_official_join();

create or replace function public.trg_grant_first_proof_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.challenge_id is not null and new.author_id is not null then
    perform public.claim_user_grant(new.author_id, 'first_proof');
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists posts_grant_first_proof on public.posts;
create trigger posts_grant_first_proof
  after insert on public.posts
  for each row execute function public.trg_grant_first_proof_post();

do $$
begin
  create or replace function public.trg_grant_first_proof_workout()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
  as $fn$
  begin
    if new.user_id is not null then
      perform public.claim_user_grant(new.user_id, 'first_proof');
    end if;
    return new;
  exception when others then
    return new;
  end;
  $fn$;

  drop trigger if exists workouts_grant_first_proof on public.workout_submissions;
  create trigger workouts_grant_first_proof
    after insert on public.workout_submissions
    for each row execute function public.trg_grant_first_proof_workout();
exception when others then
  null;
end $$;

create or replace function public.trg_grant_first_friend()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_official uuid;
begin
  if not (new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted')) then
    return new;
  end if;
  v_official := public.official_profile_id();
  if new.user_a_id is not distinct from v_official or new.user_b_id is not distinct from v_official then
    return new;
  end if;
  perform public.claim_user_grant(new.user_a_id, 'first_friend');
  perform public.claim_user_grant(new.user_b_id, 'first_friend');
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists friendships_grant_first_friend on public.friendships;
create trigger friendships_grant_first_friend
  after insert or update of status on public.friendships
  for each row execute function public.trg_grant_first_friend();

-- ---------------------------------------------------------------------------
-- Signup credit on profile create + backfill promised zeros
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  v_official boolean;
begin
  v_official := lower(coalesce(new.email, '')) = 'danielpadraic@gmail.com';
  base_username := case
    when v_official then 'blob'
    else 'blob_' || substr(replace(new.id::text, '-', ''), 1, 10)
  end;

  if v_official then
    update public.profiles
    set username = 'blob_' || substr(replace(id::text, '-', ''), 1, 10)
    where lower(username) = 'blob'
      and id <> new.id;
  end if;

  insert into public.profiles (id, username, display_name, is_official)
  values (
    new.id,
    lower(base_username),
    case when v_official then 'Bob LeBlob' else null end,
    v_official
  )
  on conflict (id) do nothing;

  if not v_official then
    begin
      perform public.claim_user_grant(new.id, 'signup_100');
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

do $$
declare
  rec record;
begin
  for rec in
    select p.id
    from public.profiles p
    where coalesce(p.is_official, false) = false
      and not exists (
        select 1 from public.user_grants g
        where g.user_id = p.id and g.grant_key = 'signup_100'
      )
      and not exists (
        select 1
        from public.wallet_ledger w
        where w.user_id = p.id
          and coalesce(w.currency, 'coins') = 'coins'
          and w.amount > 0
      )
  loop
    begin
      perform public.claim_user_grant(rec.id, 'signup_100');
    exception when others then
      null;
    end;
  end loop;
end $$;
