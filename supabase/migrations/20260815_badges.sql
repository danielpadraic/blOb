-- Badge catalog, awards, Coin rewards, and a wallet ledger.
-- Safe to re-run. Badge Coin grants are RPC/trigger-only.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.badges (
  key text primary key,
  name text not null,
  description text not null,
  icon text not null default 'sparkle',
  tone text not null default 'teal',
  coin_reward numeric(12,2) not null default 0 check (coin_reward >= 0),
  metric text not null,
  threshold numeric(12,2) not null default 1 check (threshold >= 0),
  tier int not null default 1,
  sort_order int not null default 0
);

comment on table public.badges is 'Badge definitions. Coin rewards are soft currency only.';

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null references public.badges(key) on delete cascade,
  earned_at timestamptz not null default now(),
  coin_reward numeric(12,2) not null default 0,
  primary key (user_id, badge_key)
);

comment on table public.user_badges is 'Earned badges. Inserts happen only inside evaluate_badges().';

create index if not exists user_badges_user_earned_idx
  on public.user_badges (user_id, earned_at desc);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  currency text not null default 'coins' check (currency in ('coins', 'bucks')),
  amount numeric(12,2) not null,
  reason text not null,
  ref_type text,
  ref_id text,
  created_at timestamptz not null default now()
);

comment on table public.wallet_ledger is 'Wallet movement log. Badge Coin rewards write reason = badge_reward.';

create index if not exists wallet_ledger_user_created_idx
  on public.wallet_ledger (user_id, created_at desc);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;
alter table public.wallet_ledger enable row level security;

drop policy if exists "Anyone can read badges" on public.badges;
create policy "Anyone can read badges"
  on public.badges for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read earned badges" on public.user_badges;
create policy "Anyone can read earned badges"
  on public.user_badges for select
  to anon, authenticated
  using (true);

drop policy if exists "Users read own wallet ledger" on public.wallet_ledger;
create policy "Users read own wallet ledger"
  on public.wallet_ledger for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.badges to anon, authenticated;
grant select on public.user_badges to anon, authenticated;
grant select on public.wallet_ledger to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

insert into public.badges (key, name, description, icon, tone, coin_reward, metric, threshold, tier, sort_order)
values
  ('on_the_map', 'On the map', 'You made a home in the blobverse.', 'sparkle', 'mint', 5, 'signed_up', 1, 1, 10),
  ('first_join', 'First buy-in', 'Joined your first challenge.', 'check', 'teal', 10, 'challenges_joined', 1, 1, 20),
  ('first_host', 'First host', 'Created your first challenge.', 'flag', 'charcoal', 15, 'challenges_hosted', 1, 1, 30),
  ('first_log', 'First proof', 'Logged your first day.', 'streak', 'gold', 5, 'proofs_submitted', 1, 1, 40),
  ('first_post', 'First post', 'Said something in the feed.', 'sparkle', 'mint', 5, 'posts_count', 1, 1, 50),
  ('first_bucks', 'Real stakes', 'Played a Bucks challenge.', 'crown', 'green', 15, 'bucks_challenges', 1, 1, 60),
  ('first_payout', 'Paid out', 'Took home a prize.', 'crown', 'gold', 15, 'payouts_count', 1, 1, 70),
  ('completer_1', 'Completer', 'Finished a challenge.', 'check', 'teal', 15, 'challenges_completed', 1, 1, 80),
  ('completer_5', 'Five finishes', 'Completed 5 challenges.', 'check', 'teal', 35, 'challenges_completed', 5, 2, 90),
  ('completer_10', 'Ten finishes', 'Completed 10 challenges.', 'check', 'teal', 60, 'challenges_completed', 10, 3, 100),
  ('host_1', 'Host', 'Hosted a challenge.', 'flag', 'charcoal', 15, 'challenges_hosted', 1, 1, 110),
  ('host_5', 'Seasoned host', 'Hosted 5 challenges.', 'flag', 'charcoal', 40, 'challenges_hosted', 5, 2, 120),
  ('official_1', 'Official finisher', 'Completed an official challenge.', 'star', 'teal', 25, 'official_completed', 1, 1, 130),
  ('coins_50', 'Coin earner', 'Earned 50 Coins in prizes and badges.', 'crown', 'gold', 10, 'coins_earned', 50, 1, 140),
  ('coins_250', 'Coin whale', 'Earned 250 Coins.', 'crown', 'gold', 25, 'coins_earned', 250, 2, 150),
  ('bucks_10', 'Cash winner', 'Earned 10 Bucks.', 'crown', 'green', 15, 'bucks_earned', 10, 1, 160),
  ('bucks_50', 'High roller', 'Earned 50 Bucks.', 'crown', 'green', 40, 'bucks_earned', 50, 2, 170),
  ('coins_sent_10', 'Generous', 'Sent 10 Coins to other blobs.', 'people', 'mint', 10, 'coins_sent', 10, 1, 180),
  ('coins_sent_100', 'Patron', 'Sent 100 Coins.', 'people', 'mint', 25, 'coins_sent', 100, 2, 190),
  ('bucks_sent_1', 'Bankroll', 'Sent Bucks to someone.', 'people', 'green', 15, 'bucks_sent', 1, 1, 200),
  ('logs_7', 'Week of proof', 'Logged 7 days.', 'streak', 'gold', 15, 'days_logged', 7, 1, 210),
  ('logs_30', 'Month of proof', 'Logged 30 days.', 'streak', 'gold', 40, 'days_logged', 30, 2, 220),
  ('streak_3', 'On a run', '3 days in a row.', 'streak', 'gold', 15, 'consecutive_days', 3, 1, 230),
  ('streak_7', 'Week streak', '7 days in a row.', 'streak', 'gold', 30, 'consecutive_days', 7, 2, 240),
  ('proofs_10', 'Proof stack', 'Submitted 10 workout proofs.', 'check', 'teal', 15, 'proofs_submitted', 10, 1, 250),
  ('proofs_50', 'Proof vault', 'Submitted 50 workout proofs.', 'check', 'teal', 40, 'proofs_submitted', 50, 2, 260),
  ('callout_win_1', 'Call-out winner', 'Won a 1-on-1 call-out.', 'swords', 'charcoal', 20, 'callouts_won', 1, 1, 270),
  ('callout_win_3', 'Rival', 'Won 3 call-outs.', 'swords', 'charcoal', 40, 'callouts_won', 3, 2, 280),
  ('callout_done_1', 'Answered the call', 'Finished a call-out.', 'swords', 'charcoal', 10, 'callouts_completed', 1, 1, 290),
  ('posts_5', 'Talkative', 'Posted 5 times.', 'sparkle', 'mint', 10, 'posts_count', 5, 1, 300),
  ('followers_5', 'Known blob', '5 followers.', 'people', 'mint', 15, 'followers_count', 5, 1, 310),
  ('followers_25', 'Crowd', '25 followers.', 'people', 'mint', 30, 'followers_count', 25, 2, 320)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tone = excluded.tone,
  coin_reward = excluded.coin_reward,
  metric = excluded.metric,
  threshold = excluded.threshold,
  tier = excluded.tier,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Metrics
-- ---------------------------------------------------------------------------

create or replace function public.badge_metric(p_user_id uuid, p_metric text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v numeric := 0;
begin
  if p_user_id is null then
    return 0;
  end if;

  if p_metric = 'signed_up' then
    select 1 into v from public.profiles where id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'challenges_joined' then
    select count(*) into v from public.challenge_participants where user_id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'challenges_completed' then
    select count(*) into v
    from public.challenge_participants
    where user_id = p_user_id
      and (status = 'completed' or completed_at is not null);
    return coalesce(v, 0);
  end if;

  if p_metric = 'challenges_hosted' then
    select count(*) into v from public.challenges where created_by = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'official_completed' then
    select count(*) into v
    from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
    where p.user_id = p_user_id
      and c.is_official
      and (p.status = 'completed' or p.completed_at is not null);
    return coalesce(v, 0);
  end if;

  if p_metric = 'coins_earned' then
    select
      coalesce((
        select sum(p.amount)
        from public.challenge_payouts p
        join public.challenges c on c.id = p.challenge_id
        where p.user_id = p_user_id
          and coalesce(c.currency, 'coins') <> 'bucks'
      ), 0)
      + coalesce((
        select sum(co.stake_amount * 2)
        from public.callouts co
        where co.winner_id = p_user_id
          and co.status = 'settled'
          and coalesce(co.currency, 'coins') <> 'bucks'
      ), 0)
      + coalesce((
        select sum(l.amount)
        from public.wallet_ledger l
        where l.user_id = p_user_id
          and l.currency = 'coins'
          and l.reason = 'badge_reward'
      ), 0)
    into v;
    return coalesce(v, 0);
  end if;

  if p_metric = 'bucks_earned' then
    select
      coalesce((
        select sum(p.amount)
        from public.challenge_payouts p
        join public.challenges c on c.id = p.challenge_id
        where p.user_id = p_user_id
          and coalesce(c.currency, 'coins') = 'bucks'
      ), 0)
      + coalesce((
        select sum(co.stake_amount * 2)
        from public.callouts co
        where co.winner_id = p_user_id
          and co.status = 'settled'
          and coalesce(co.currency, 'coins') = 'bucks'
      ), 0)
    into v;
    return coalesce(v, 0);
  end if;

  if p_metric = 'coins_sent' then
    select coalesce(sum(amount), 0) into v
    from public.coin_transfers
    where sender_id = p_user_id
      and coalesce(currency, 'coins') <> 'bucks';
    return v;
  end if;

  if p_metric = 'bucks_sent' then
    select coalesce(sum(amount), 0) into v
    from public.coin_transfers
    where sender_id = p_user_id
      and coalesce(currency, 'coins') = 'bucks';
    return v;
  end if;

  if p_metric = 'days_logged' then
    select count(distinct submission_date) into v
    from public.workout_submissions
    where user_id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'proofs_submitted' then
    select count(*) into v from public.workout_submissions where user_id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'consecutive_days' then
    with days as (
      select distinct submission_date::date as d
      from public.workout_submissions
      where user_id = p_user_id
    ),
    marked as (
      select d, d - (row_number() over (order by d))::int as grp
      from days
    )
    select coalesce(max(cnt), 0) into v
    from (select count(*)::numeric as cnt from marked group by grp) s;
    return coalesce(v, 0);
  end if;

  if p_metric = 'callouts_won' then
    select count(*) into v
    from public.callouts
    where winner_id = p_user_id and status = 'settled';
    return coalesce(v, 0);
  end if;

  if p_metric = 'callouts_completed' then
    select count(*) into v
    from public.callouts
    where status = 'settled'
      and (challenger_id = p_user_id or opponent_id = p_user_id);
    return coalesce(v, 0);
  end if;

  if p_metric = 'bucks_challenges' then
    select count(*) into v
    from (
      select c.id
      from public.challenges c
      where c.created_by = p_user_id and coalesce(c.currency, 'coins') = 'bucks'
      union
      select c.id
      from public.challenge_participants p
      join public.challenges c on c.id = p.challenge_id
      where p.user_id = p_user_id and coalesce(c.currency, 'coins') = 'bucks'
    ) s;
    return coalesce(v, 0);
  end if;

  if p_metric = 'payouts_count' then
    select count(*) into v from public.challenge_payouts where user_id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'posts_count' then
    select count(*) into v from public.posts where author_id = p_user_id;
    return coalesce(v, 0);
  end if;

  if p_metric = 'followers_count' then
    select count(*) into v from public.follows where following_id = p_user_id;
    return coalesce(v, 0);
  end if;

  return 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- Award
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_badges(p_user_id uuid default auth.uid())
returns setof public.user_badges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_pass int := 0;
  v_awarded int;
  v_badge public.badges%rowtype;
  v_value numeric;
  v_row public.user_badges%rowtype;
begin
  v_user := coalesce(p_user_id, auth.uid());
  if v_user is null then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    return;
  end if;

  loop
    v_pass := v_pass + 1;
    v_awarded := 0;

    for v_badge in
      select b.*
      from public.badges b
      where not exists (
        select 1 from public.user_badges u
        where u.user_id = v_user and u.badge_key = b.key
      )
      order by b.sort_order, b.key
    loop
      v_value := public.badge_metric(v_user, v_badge.metric);
      if v_value >= v_badge.threshold then
        insert into public.user_badges (user_id, badge_key, coin_reward)
        values (v_user, v_badge.key, v_badge.coin_reward)
        on conflict (user_id, badge_key) do nothing
        returning * into v_row;

        if found then
          v_awarded := v_awarded + 1;
          if v_badge.coin_reward > 0 then
            begin
              perform public.wallet_credit(v_user, 'coins', v_badge.coin_reward);
            exception when undefined_function then
              update public.profiles
                set coins = coalesce(coins, credits, 0) + v_badge.coin_reward
                where id = v_user;
            end;
            insert into public.wallet_ledger (user_id, currency, amount, reason, ref_type, ref_id)
            values (v_user, 'coins', v_badge.coin_reward, 'badge_reward', 'badge', v_badge.key);
          end if;
          begin
            perform public.notify_user(
              v_user,
              null,
              'badge_unlocked',
              'Badge unlocked: ' || v_badge.name,
              v_badge.description || case
                when v_badge.coin_reward > 0
                  then ' +' || to_char(v_badge.coin_reward, 'FM999999990.00') || ' Coins.'
                else ''
              end,
              jsonb_build_object(
                'badge_key', v_badge.key,
                'coin_reward', v_badge.coin_reward
              )
            );
          exception when others then
            null;
          end;
          return next v_row;
        end if;
      end if;
    end loop;

    exit when v_awarded = 0 or v_pass >= 4;
  end loop;
end;
$$;

comment on function public.evaluate_badges(uuid) is
  'Awards any newly earned badges and credits Coin rewards. Idempotent. Never double-awards.';

grant execute on function public.evaluate_badges(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers (never fail the source write)
-- ---------------------------------------------------------------------------

create or replace function public.trg_evaluate_badges_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  if tg_table_name = 'challenges' then
    v_user := new.created_by;
  elsif tg_table_name = 'posts' then
    v_user := new.author_id;
  elsif tg_table_name = 'coin_transfers' then
    v_user := new.sender_id;
  else
    v_user := new.user_id;
  end if;
  if v_user is not null then
    perform public.evaluate_badges(v_user);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_evaluate_badges_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.evaluate_badges(new.following_id);
  perform public.evaluate_badges(new.follower_id);
  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_evaluate_badges_callout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'settled' then
    perform public.evaluate_badges(new.challenger_id);
    perform public.evaluate_badges(new.opponent_id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists challenge_participants_evaluate_badges on public.challenge_participants;
create trigger challenge_participants_evaluate_badges
  after insert or update of status, completed_at, days_completed
  on public.challenge_participants
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists challenges_evaluate_badges on public.challenges;
create trigger challenges_evaluate_badges
  after insert on public.challenges
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists workout_submissions_evaluate_badges on public.workout_submissions;
create trigger workout_submissions_evaluate_badges
  after insert on public.workout_submissions
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists coin_transfers_evaluate_badges on public.coin_transfers;
create trigger coin_transfers_evaluate_badges
  after insert on public.coin_transfers
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists challenge_payouts_evaluate_badges on public.challenge_payouts;
create trigger challenge_payouts_evaluate_badges
  after insert on public.challenge_payouts
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists posts_evaluate_badges on public.posts;
create trigger posts_evaluate_badges
  after insert on public.posts
  for each row execute function public.trg_evaluate_badges_user();

drop trigger if exists follows_evaluate_badges on public.follows;
create trigger follows_evaluate_badges
  after insert on public.follows
  for each row execute function public.trg_evaluate_badges_follow();

do $$
begin
  if to_regclass('public.callouts') is not null then
    drop trigger if exists callouts_evaluate_badges on public.callouts;
    create trigger callouts_evaluate_badges
      after update of status on public.callouts
      for each row execute function public.trg_evaluate_badges_callout();
  end if;
end $$;

-- Allow badge_unlocked notifications
do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
  alter table public.notifications add constraint notifications_type_known check (type in (
    'challenge_invite',
    'challenge_new',
    'tagged',
    'challenge_joined',
    'follow',
    'coins_received',
    'challenge_settled',
    'challenge_placed',
    'challenge_eliminated',
    'callout_received',
    'callout_accepted',
    'callout_resolved',
    'callout_disputed',
    'callout_cancelled',
    'badge_unlocked'
  ));
exception when others then
  null;
end $$;
