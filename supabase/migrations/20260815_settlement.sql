-- Challenge lifecycle, winner determination, and Coin settlement.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.challenge_settlements (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null unique references public.challenges(id) on delete cascade,
  settled_by uuid references public.profiles(id),
  prize_pool numeric(12,2) not null default 0,
  distributed numeric(12,2) not null default 0,
  prize_structure text not null,
  winner_count int not null default 0,
  settled_at timestamptz not null default now()
);

create table if not exists public.challenge_payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.challenge_settlements(id) on delete cascade,
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  place int not null,
  score numeric(12,2) not null default 0,
  amount numeric(12,2) not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);

create index if not exists challenge_payouts_challenge_place_idx
  on public.challenge_payouts (challenge_id, place);

comment on table public.challenge_settlements is 'One row per settled challenge. Unique challenge_id makes payout idempotent.';
comment on table public.challenge_payouts is 'Coins credited to each winner when a challenge settles.';

alter table public.challenge_settlements enable row level security;
alter table public.challenge_payouts enable row level security;

drop policy if exists "Settlements are readable" on public.challenge_settlements;
create policy "Settlements are readable"
  on public.challenge_settlements for select
  using (true);

drop policy if exists "Payouts are readable" on public.challenge_payouts;
create policy "Payouts are readable"
  on public.challenge_payouts for select
  using (true);

grant select on public.challenge_settlements to anon, authenticated;
grant select on public.challenge_payouts to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Status machine: open/upcoming → in_progress at start, → judging at end.
-- Never touches settled rows. Does not pay Coins.
-- ---------------------------------------------------------------------------

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.challenges
    set status = 'in_progress'
    where status in ('upcoming', 'open')
      and now() >= starts_at
      and now() < ends_at;

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and now() >= ends_at;
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;

-- ---------------------------------------------------------------------------
-- Block client writes from marking a challenge settled (must use settle_challenge).
-- SECURITY DEFINER functions run as the owner, so current_user <> session_user.
-- ---------------------------------------------------------------------------

create or replace function public.guard_challenge_settlement()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'settled' and new.status is distinct from 'settled' then
    raise exception 'A settled challenge cannot change status' using errcode = 'P0001';
  end if;

  if new.status = 'settled' and old.status is distinct from 'settled' then
    if current_user = session_user then
      raise exception 'Use settle_challenge() to pay out and settle' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists challenges_guard_settlement on public.challenges;
create trigger challenges_guard_settlement
  before update on public.challenges
  for each row execute function public.guard_challenge_settlement();

-- ---------------------------------------------------------------------------
-- Read a settlement as JSON for the client.
-- ---------------------------------------------------------------------------

create or replace function public.get_challenge_settlement(p_challenge_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'already_settled', true,
    'settlement', jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'settled_by', s.settled_by,
      'prize_pool', s.prize_pool,
      'distributed', s.distributed,
      'prize_structure', s.prize_structure,
      'winner_count', s.winner_count,
      'settled_at', s.settled_at
    ),
    'payouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'place', p.place,
          'score', p.score,
          'amount', p.amount,
          'reason', p.reason
        )
        order by p.place, p.user_id
      )
      from public.challenge_payouts p
      where p.challenge_id = s.challenge_id
    ), '[]'::jsonb)
  )
  from public.challenge_settlements s
  where s.challenge_id = p_challenge_id;
$$;

grant execute on function public.get_challenge_settlement(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Atomic settlement. Locks the challenge, pays winners, marks settled.
-- Idempotent: a second call returns the existing settlement and pays nothing.
-- ---------------------------------------------------------------------------

create or replace function public.settle_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_target int;
  v_pool numeric(12,2);
  v_structure text;
  v_mode text;
  v_places int;
  v_dist text;
  v_settlement_id uuid;
  v_distributed numeric(12,2) := 0;
  rec record;
  n int := 0;
  take_n int := 0;
  i int;
  v_weight_sum int;
  v_amount numeric(12,2);
  v_remaining numeric(12,2);
  v_reason text;
  ids uuid[] := '{}';
  scores numeric[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_settlements where challenge_id = p_challenge_id
  ) then
    update public.challenges
      set status = 'settled'
      where id = p_challenge_id
        and status is distinct from 'settled';
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  if ch.status = 'settled' then
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  if auth.uid() is distinct from ch.created_by
     and now() < ch.ends_at
     and ch.status is distinct from 'judging' then
    raise exception 'Only the creator can close this challenge before it ends'
      using errcode = '42501';
  end if;

  update public.challenges
    set status = 'judging'
    where id = ch.id
      and status is distinct from 'settled';

  v_pool := round(coalesce(ch.prize_pool, 0), 2);
  v_structure := coalesce(nullif(ch.prize_structure, ''), 'equal_split');
  v_mode := coalesce(nullif(ch.top_places_mode, ''), 'percent');
  v_places := greatest(coalesce(ch.top_places_value, 10), 1);
  v_dist := coalesce(nullif(ch.top_places_distribution, ''), 'even');

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    v_target := greatest(coalesce(ch.target_count, ch.days_required), 1);
  end if;

  if v_structure = 'winner_take_all' then
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) > 0
      order by p.days_completed desc, p.joined_at asc
      limit 1
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;

  elsif v_structure = 'top_places' then
    select count(*) into n
    from public.challenge_participants p
    where p.challenge_id = ch.id
      and coalesce(p.status, 'joined') <> 'withdrawn'
      and coalesce(p.days_completed, 0) >= v_target;

    if n = 0 then
      select count(*) into n
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) > 0;
    end if;

    if n > 0 then
      if v_mode = 'count' then
        take_n := least(v_places, n);
      else
        take_n := least(n, greatest(1, ceil(n * v_places / 100.0)::int));
      end if;

      for rec in
        select p.user_id, p.days_completed::numeric as score
        from public.challenge_participants p
        where p.challenge_id = ch.id
          and coalesce(p.status, 'joined') <> 'withdrawn'
          and (
            (
              (select count(*) from public.challenge_participants c
                where c.challenge_id = ch.id
                  and coalesce(c.status, 'joined') <> 'withdrawn'
                  and coalesce(c.days_completed, 0) >= v_target) = 0
              and coalesce(p.days_completed, 0) > 0
            )
            or coalesce(p.days_completed, 0) >= v_target
          )
        order by p.days_completed desc, p.joined_at asc
        limit take_n
      loop
        ids := array_append(ids, rec.user_id);
        scores := array_append(scores, rec.score);
      end loop;
    end if;

  else
    -- equal_split: everyone who hit the completion bar
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and coalesce(p.status, 'joined') <> 'withdrawn'
        and coalesce(p.days_completed, 0) >= v_target
      order by p.days_completed desc, p.joined_at asc
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;
  end if;

  n := coalesce(array_length(ids, 1), 0);

  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count
  ) values (
    ch.id, auth.uid(), v_pool, 0, v_structure, n
  )
  returning id into v_settlement_id;

  if n > 0 and v_pool > 0 then
    v_remaining := v_pool;
    v_weight_sum := n * (n + 1) / 2;

    for i in 1..n loop
      if v_structure = 'winner_take_all' then
        v_amount := v_remaining;
        v_reason := 'Highest rank — takes the entire prize pool.';
      elsif v_structure = 'top_places' and v_dist = 'scaled' then
        if i < n then
          v_amount := round(v_pool * (n - i + 1) / v_weight_sum, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Finished in the top places. Higher place earns more.';
      elsif v_structure = 'top_places' then
        if i < n then
          v_amount := round(v_pool / n, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Finished in the top places and splits the pool evenly.';
      else
        if i < n then
          v_amount := round(v_pool / n, 2);
        else
          v_amount := v_remaining;
        end if;
        v_reason := 'Completed the required logs and splits the pool evenly.';
      end if;

      if v_amount < 0 then
        v_amount := 0;
      end if;

      insert into public.challenge_payouts (
        settlement_id, challenge_id, user_id, place, score, amount, reason
      ) values (
        v_settlement_id, ch.id, ids[i], i, scores[i], v_amount, v_reason
      );

      update public.profiles
        set credits = credits + v_amount
        where id = ids[i];

      v_distributed := v_distributed + v_amount;
      v_remaining := v_remaining - v_amount;
    end loop;
  elsif n > 0 then
    for i in 1..n loop
      if v_structure = 'winner_take_all' then
        v_reason := 'Highest rank — the pool was empty, so no Coins moved.';
      elsif v_structure = 'top_places' then
        v_reason := 'Finished in the top places. The pool was empty, so no Coins moved.';
      else
        v_reason := 'Completed the required logs. The pool was empty, so no Coins moved.';
      end if;

      insert into public.challenge_payouts (
        settlement_id, challenge_id, user_id, place, score, amount, reason
      ) values (
        v_settlement_id, ch.id, ids[i], i, scores[i], 0, v_reason
      );
    end loop;
  end if;

  update public.challenge_settlements
    set distributed = v_distributed,
        winner_count = n
    where id = v_settlement_id;

  update public.challenge_participants
    set status = 'completed',
        completed_at = coalesce(completed_at, now())
    where challenge_id = ch.id
      and coalesce(status, 'joined') <> 'withdrawn'
      and coalesce(days_completed, 0) >= v_target;

  update public.challenge_participants
    set status = 'failed'
    where challenge_id = ch.id
      and coalesce(status, 'joined') not in ('withdrawn', 'completed')
      and coalesce(days_completed, 0) < v_target;

  update public.challenges
    set status = 'settled',
        prize_pool = case when n > 0 then greatest(v_pool - v_distributed, 0) else v_pool end
    where id = ch.id;

  return public.get_challenge_settlement(p_challenge_id);

exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

grant execute on function public.settle_challenge(uuid) to authenticated;

-- Join stays open during in_progress; blocked in judging/settled.
create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  participant public.challenge_participants%rowtype;
  my_credits numeric(12,2);
  joiner_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status not in ('upcoming', 'open', 'in_progress') then
    raise exception 'This challenge is no longer accepting joiners' using errcode = 'P0001';
  end if;

  if now() >= ch.ends_at then
    raise exception 'Challenge has ended' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  ) then
    raise exception 'Already joined this challenge' using errcode = '23505';
  end if;

  if ch.max_participants is not null then
    select count(*) into joiner_count
    from public.challenge_participants
    where challenge_id = p_challenge_id;
    if joiner_count >= ch.max_participants then
      raise exception 'This challenge is full' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(ch.buy_in_amount, 0) > 0 then
    select credits into my_credits
    from public.profiles
    where id = auth.uid()
    for update;

    if my_credits < ch.buy_in_amount then
      raise exception 'Insufficient credits' using errcode = 'P0001';
    end if;

    update public.profiles
      set credits = credits - ch.buy_in_amount
      where id = auth.uid();

    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + ch.buy_in_amount
      where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, status)
  values (p_challenge_id, auth.uid(), 'joined')
  returning * into participant;

  return participant;
end;
$$;
