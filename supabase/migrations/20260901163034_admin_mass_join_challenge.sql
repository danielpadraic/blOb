-- One-shot admin mass-join. SQL Editor / service_role only.
-- Not granted to anon or authenticated. PostgREST does not expose `internal`.
--
-- Target this morning: 30-Day Consistency
--   id = f28b5591-6c32-4d82-8218-a13b3cafe8a1
--   live, public, 20 coins entry
--
-- Eligibility (edit the insert into _plan if the seed set changes):
--   named profiles
--   not the @blob / official house wallet (81dfe427-d413-4c60-bd4a-e710c95077ad)
--   already-joined rows are listed with skip_reason = already_participant and are not charged
-- Tighten examples (do not enable unless you mean it):
--   and p.body_metrics_completed_at is not null
--   and p.created_at < timestamptz '2026-09-01 00:00:00+00'
--
-- Money: reuse the live join_challenge debit (profiles.coins decrement + wallet_ledger).
-- public.wallet_debit is not installed on this project. Never invent a second wallet.
-- Never decrement without a ledger row (entry_type challenge_join, reason admin_seed).
-- Prize pool gets the FULL entry (user + house).
-- skip_feed default true: no join announce posts. Corporate never writes join_main_feed.

create schema if not exists internal;

create or replace function internal.admin_mass_join_challenge(
  p_challenge_id uuid,
  p_dry_run boolean default true,
  p_skip_feed boolean default true
)
returns table (
  kind text,
  user_id uuid,
  coins_before numeric,
  debit_user numeric,
  debit_house numeric,
  skip_reason text,
  rows_written integer,
  prize_pool_before numeric,
  prize_pool_after numeric,
  house_before numeric,
  house_after numeric
)
language plpgsql
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_house uuid := '81dfe427-d413-4c60-bd4a-e710c95077ad';
  v_c public.challenges%rowtype;
  v_entry numeric;
  v_pool_before numeric;
  v_pool_after numeric;
  v_house_before numeric;
  v_house_after numeric;
  v_house_need numeric := 0;
  v_plan record;
  v_written int;
begin
  if p_challenge_id is null then
    raise exception 'CHALLENGE_ID_REQUIRED';
  end if;

  if p_dry_run then
    select * into v_c from public.challenges where id = p_challenge_id;
  else
    select * into v_c from public.challenges where id = p_challenge_id for update;
  end if;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;

  if coalesce(v_c.currency, 'coins') <> 'coins' then
    raise exception 'COINS_ONLY';
  end if;

  v_entry := floor(greatest(coalesce(v_c.buy_in_amount, 0), 0));
  v_pool_before := coalesce(v_c.prize_pool, 0);
  v_pool_after := v_pool_before;

  if p_dry_run then
    select coalesce(coins, credits, 0) into v_house_before
    from public.profiles
    where id = v_house;
  else
    select coalesce(coins, credits, 0) into v_house_before
    from public.profiles
    where id = v_house
    for update;
  end if;
  if v_house_before is null then
    raise exception 'HOUSE_WALLET_NOT_FOUND';
  end if;
  v_house_after := v_house_before;

  drop table if exists pg_temp._amj_plan;
  create temporary table pg_temp._amj_plan (
    user_id uuid primary key,
    coins_before numeric not null,
    debit_user numeric not null,
    debit_house numeric not null,
    skip_reason text,
    rows_written integer not null default 0
  ) on commit drop;

  -- Eligibility. Documented above. Already-joined listed, not charged.
  insert into pg_temp._amj_plan (
    user_id, coins_before, debit_user, debit_house, skip_reason
  )
  select
    p.id,
    coalesce(p.coins, p.credits, 0),
    case
      when p.id = v_house then 0
      when exists (
        select 1
        from public.challenge_participants cp
        where cp.challenge_id = p_challenge_id
          and cp.user_id = p.id
      ) then 0
      else least(coalesce(p.coins, p.credits, 0), v_entry)
    end,
    case
      when p.id = v_house then 0
      when exists (
        select 1
        from public.challenge_participants cp
        where cp.challenge_id = p_challenge_id
          and cp.user_id = p.id
      ) then 0
      else v_entry - least(coalesce(p.coins, p.credits, 0), v_entry)
    end,
    case
      when p.id = v_house then 'house_wallet'
      when exists (
        select 1
        from public.challenge_participants cp
        where cp.challenge_id = p_challenge_id
          and cp.user_id = p.id
      ) then 'already_participant'
      else null
    end
  from public.profiles p
  where nullif(btrim(coalesce(p.username, '')), '') is not null;

  select coalesce(sum(pl.debit_house), 0) into v_house_need
  from pg_temp._amj_plan pl
  where pl.skip_reason is null;

  if v_house_need > v_house_before then
    if not p_dry_run then
      raise exception 'HOUSE_INSUFFICIENT need=% have=%', v_house_need, v_house_before;
    end if;
    return query
    select
      'skip'::text,
      pl.user_id,
      pl.coins_before,
      pl.debit_user,
      pl.debit_house,
      pl.skip_reason,
      0,
      v_pool_before,
      v_pool_before,
      v_house_before,
      v_house_before
    from pg_temp._amj_plan pl
    order by pl.skip_reason nulls last, pl.user_id;
    return query
    select
      'summary'::text,
      v_house,
      v_house_before,
      0::numeric,
      v_house_need,
      'house_insufficient'::text,
      0,
      v_pool_before,
      v_pool_before,
      v_house_before,
      v_house_before;
    return;
  end if;

  if not p_dry_run then
    for v_plan in
      select pl.*
      from pg_temp._amj_plan pl
      where pl.skip_reason is null
      order by pl.user_id
    loop
      v_written := 0;

      if exists (
        select 1
        from public.challenge_participants
        where challenge_id = p_challenge_id
          and user_id = v_plan.user_id
      ) then
        update pg_temp._amj_plan
        set skip_reason = 'already_participant',
            debit_user = 0,
            debit_house = 0
        where pg_temp._amj_plan.user_id = v_plan.user_id;
        continue;
      end if;

      perform 1 from public.profiles where id = v_plan.user_id for update;

      if v_plan.debit_user > 0 then
        -- Same coin decrement as public.join_challenge.
        update public.profiles
        set coins = coalesce(coins, credits, 0) - v_plan.debit_user
        where id = v_plan.user_id
          and coalesce(coins, credits, 0) >= v_plan.debit_user;
        if not found then
          raise exception 'USER_INSUFFICIENT user=%', v_plan.user_id;
        end if;
        insert into public.wallet_ledger (
          user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
        ) values (
          v_plan.user_id,
          p_challenge_id,
          'coins',
          -v_plan.debit_user,
          'challenge_join',
          'admin_seed',
          jsonb_build_object('source', 'admin_mass_join', 'portion', 'user'),
          p_challenge_id
        );
        v_written := v_written + 1;
      end if;

      if v_plan.debit_house > 0 then
        -- Same decrement as join_challenge, on the official house wallet.
        update public.profiles
        set coins = coalesce(coins, credits, 0) - v_plan.debit_house
        where id = v_house
          and coalesce(coins, credits, 0) >= v_plan.debit_house;
        if not found then
          raise exception 'HOUSE_INSUFFICIENT';
        end if;
        insert into public.wallet_ledger (
          user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
        ) values (
          v_house,
          p_challenge_id,
          'coins',
          -v_plan.debit_house,
          'challenge_join',
          'admin_seed',
          jsonb_build_object(
            'source', 'admin_mass_join',
            'portion', 'house',
            'for_user', v_plan.user_id
          ),
          p_challenge_id
        );
        v_written := v_written + 1;
        v_house_after := v_house_after - v_plan.debit_house;
      end if;

      if v_entry > 0 then
        update public.challenges
        set prize_pool = coalesce(prize_pool, 0) + v_entry
        where id = p_challenge_id;
        v_pool_after := v_pool_after + v_entry;
      end if;

      insert into public.challenge_participants (
        challenge_id, user_id, buy_in_paid, currency, status, joined_at
      ) values (
        p_challenge_id, v_plan.user_id, v_entry, 'coins', 'active', now()
      );
      v_written := v_written + 1;

      if not p_skip_feed then
        begin
          perform public.announce_challenge_join(p_challenge_id, v_plan.user_id);
        exception when others then
          null;
        end;
      end if;

      update pg_temp._amj_plan
      set rows_written = v_written
      where pg_temp._amj_plan.user_id = v_plan.user_id;
    end loop;
  else
    v_pool_after := v_pool_before + (
      select count(*) * v_entry
      from pg_temp._amj_plan pl
      where pl.skip_reason is null
    );
    v_house_after := v_house_before - v_house_need;
  end if;

  return query
  select
    case when pl.skip_reason is null then 'join' else 'skip' end,
    pl.user_id,
    pl.coins_before,
    pl.debit_user,
    pl.debit_house,
    pl.skip_reason,
    pl.rows_written,
    v_pool_before,
    v_pool_after,
    v_house_before,
    v_house_after
  from pg_temp._amj_plan pl
  order by pl.skip_reason nulls last, pl.user_id;

  return query
  select
    'summary'::text,
    null::uuid,
    v_house_before,
    0::numeric,
    v_house_need,
    case when p_dry_run then 'dry_run' else null end,
    (
      select count(*)::int
      from public.challenge_participants
      where challenge_id = p_challenge_id
    ),
    v_pool_before,
    v_pool_after,
    v_house_before,
    v_house_after;
end;
$fn$;

revoke all on function internal.admin_mass_join_challenge(uuid, boolean, boolean)
  from public, anon, authenticated;
grant execute on function internal.admin_mass_join_challenge(uuid, boolean, boolean)
  to service_role;

comment on function internal.admin_mass_join_challenge(uuid, boolean, boolean) is
  'SQL Editor / service_role mass-join. dry_run default true. skip_feed default true. Not for clients.';
