-- blOb: award badges once, return only inserts from THIS evaluate_badges call.
-- Safe to re-run. Clients never write user_badges or profiles.coins.

-- ---------------------------------------------------------------------------
-- Table shape
-- ---------------------------------------------------------------------------

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null,
  title text,
  coin_reward numeric(12,2) not null default 0,
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_key)
);

alter table public.user_badges
  add column if not exists id uuid default gen_random_uuid();
alter table public.user_badges
  add column if not exists title text;
alter table public.user_badges
  add column if not exists awarded_at timestamptz default now();

do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'user_badges'
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ilike '%user_id%'
      and pg_get_indexdef(i.indexrelid) ilike '%badge_key%'
  ) then
    create unique index user_badges_user_key_uidx
      on public.user_badges (user_id, badge_key);
  end if;
end $$;

update public.user_badges ub
set title = b.name
from public.badges b
where b.key = ub.badge_key
  and ub.title is null;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_badges'
      and column_name = 'earned_at'
  ) then
    update public.user_badges
    set awarded_at = earned_at
    where awarded_at is null;
  end if;
end $$;

alter table public.user_badges enable row level security;

drop policy if exists "Users read own badges" on public.user_badges;
create policy "Users read own badges"
  on public.user_badges for select
  to authenticated
  using (auth.uid() = user_id);

-- Public profiles still show earned titles. Awards stay insert-only via RPC.
drop policy if exists "Anyone can read earned badges" on public.user_badges;
create policy "Anyone can read earned badges"
  on public.user_badges for select
  to anon, authenticated
  using (true);

grant select on public.user_badges to anon, authenticated;

comment on table public.user_badges is
  'Earned badges. Unique (user_id, badge_key). Inserts happen only inside evaluate_badges().';

-- ---------------------------------------------------------------------------
-- Catalog: first_join / first_log are 5 Coins, first award only
-- ---------------------------------------------------------------------------

insert into public.badges (key, name, description, icon, tone, coin_reward, metric, threshold, tier, sort_order)
values
  ('first_join', 'First join', 'You jumped in. That’s a real start.', 'check', 'teal', 5, 'challenges_joined', 1, 1, 20),
  ('first_log', 'First log', 'First log in the books. Keep going.', 'streak', 'gold', 5, 'proofs_submitted', 1, 1, 40)
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  tone = excluded.tone,
  coin_reward = 5,
  metric = excluded.metric,
  threshold = 1,
  tier = excluded.tier,
  sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- first_join = at least one active participant row
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
    select count(*) into v
    from public.challenge_participants
    where user_id = p_user_id
      and coalesce(status, 'joined') in ('active', 'joined')
      and eliminated_at is null;
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
-- Award: insert-only, return only rows created in this call
-- ---------------------------------------------------------------------------

drop function if exists public.evaluate_badges(uuid);
drop function if exists public.evaluate_badges();
drop function if exists public.award_new_badges(uuid);

create or replace function public.award_new_badges(p_user_id uuid)
returns jsonb
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
  v_key text;
  v_list jsonb := '[]'::jsonb;
begin
  v_user := coalesce(p_user_id, auth.uid());
  if v_user is null then
    return jsonb_build_object('newly_awarded', '[]'::jsonb);
  end if;
  if not exists (select 1 from public.profiles where id = v_user) then
    return jsonb_build_object('newly_awarded', '[]'::jsonb);
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
      if v_value < v_badge.threshold then
        continue;
      end if;

      insert into public.user_badges (user_id, badge_key, coin_reward, title, awarded_at)
      values (v_user, v_badge.key, v_badge.coin_reward, v_badge.name, now())
      on conflict (user_id, badge_key) do nothing
      returning badge_key into v_key;

      if not found or v_key is null then
        continue;
      end if;

      v_awarded := v_awarded + 1;
      v_key := null;

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
          'You earned this: ' || v_badge.name,
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

      v_list := v_list || jsonb_build_array(jsonb_build_object(
        'key', v_badge.key,
        'title', v_badge.name,
        'coin_reward', v_badge.coin_reward
      ));
    end loop;

    exit when v_awarded = 0 or v_pass >= 4;
  end loop;

  return jsonb_build_object('newly_awarded', v_list);
end;
$$;

create or replace function public.evaluate_badges()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.award_new_badges(auth.uid());
end;
$$;

comment on function public.evaluate_badges() is
  'Awards any newly earned badges for the current user. Returns only badges inserted in this call. Never double-awards.';

revoke all on function public.award_new_badges(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_badges() to authenticated;

-- Client activity (join, log, post, …) calls evaluate_badges for the one-shot modal.
-- Drop table triggers so this RPC is the insert; otherwise newly_awarded would be [].
drop trigger if exists challenge_participants_evaluate_badges on public.challenge_participants;
drop trigger if exists challenges_evaluate_badges on public.challenges;
drop trigger if exists workout_submissions_evaluate_badges on public.workout_submissions;
drop trigger if exists coin_transfers_evaluate_badges on public.coin_transfers;
drop trigger if exists challenge_payouts_evaluate_badges on public.challenge_payouts;
drop trigger if exists posts_evaluate_badges on public.posts;
drop trigger if exists follows_evaluate_badges on public.follows;
drop trigger if exists callouts_evaluate_badges on public.callouts;

create or replace function public.trg_evaluate_badges_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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
  return new;
end;
$$;

notify pgrst, 'reload schema';
