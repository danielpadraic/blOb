-- Unlimited / last-man-standing challenges.
-- Safe to re-run.

alter table public.challenges
  add column if not exists is_unlimited boolean default false;

update public.challenges
  set is_unlimited = false
  where is_unlimited is null;

alter table public.challenges
  alter column is_unlimited set default false;

alter table public.challenges
  alter column is_unlimited set not null;

alter table public.challenges
  alter column ends_at drop not null;

alter table public.challenges
  drop constraint if exists challenge_window;

alter table public.challenges
  add constraint challenge_window check (
    (is_unlimited = true and ends_at is null)
    or (is_unlimited = false and ends_at is not null and ends_at > starts_at)
  );

comment on column public.challenges.is_unlimited is 'Last-man-standing: no end date. Continues until one eligible participant remains.';
comment on column public.challenges.ends_at is 'End of a fixed window. Null when is_unlimited.';

alter table public.challenge_participants
  add column if not exists eliminated_at timestamptz;

comment on column public.challenge_participants.eliminated_at is 'When a last-man-standing joiner missed a required period and was eliminated.';

create index if not exists challenge_participants_eliminated_idx
  on public.challenge_participants (challenge_id)
  where eliminated_at is null;

-- Join: unlimited challenges have no end date.
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

  if ch.ends_at is not null and now() >= ch.ends_at then
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

-- Eliminate joiners who missed the last completed period, then auto-settle
-- when one eligible person remains.
create or replace function public.sync_unlimited_eliminations()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  period_start date;
  period_end date;
  eligible int;
  eliminated int;
begin
  for ch in
    select *
    from public.challenges
    where coalesce(is_unlimited, false) = true
      and status in ('upcoming', 'open', 'in_progress')
      and now() >= starts_at
  loop
    if coalesce(ch.frequency, 'daily') = 'weekly' then
      period_start := (date_trunc('week', current_date::timestamp) - interval '7 days')::date;
      period_end := (date_trunc('week', current_date::timestamp) - interval '1 day')::date;
    elsif coalesce(ch.frequency, 'daily') = 'monthly' then
      period_start := (date_trunc('month', current_date::timestamp) - interval '1 month')::date;
      period_end := (date_trunc('month', current_date::timestamp) - interval '1 day')::date;
    else
      period_start := current_date - 1;
      period_end := current_date - 1;
    end if;

    if ch.starts_at::date > period_start then
      continue;
    end if;

    update public.challenge_participants p
      set eliminated_at = now(),
          status = 'failed'
    where p.challenge_id = ch.id
      and p.eliminated_at is null
      and coalesce(p.status, 'joined') <> 'withdrawn'
      and p.joined_at::date <= period_start
      and (
        select count(*)
        from public.workout_submissions s
        where s.challenge_id = ch.id
          and s.user_id = p.user_id
          and s.submission_date >= period_start
          and s.submission_date <= period_end
      ) < greatest(coalesce(ch.target_count, 1), 1);

    select
      count(*) filter (
        where eliminated_at is null and coalesce(status, 'joined') <> 'withdrawn'
      ),
      count(*) filter (where eliminated_at is not null)
    into eligible, eliminated
    from public.challenge_participants
    where challenge_id = ch.id;

    if eligible = 1 and eliminated >= 1 and auth.uid() is not null then
      begin
        perform public.settle_challenge(ch.id);
      exception
        when others then
          null;
      end;
    end if;
  end loop;
end;
$$;

grant execute on function public.sync_unlimited_eliminations() to authenticated;

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
      and (ends_at is null or now() < ends_at);

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false;

  perform public.sync_unlimited_eliminations();
end;
$$;

-- Updated settlement for last-man-standing.
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
     and ch.status is distinct from 'judging' then
    if coalesce(ch.is_unlimited, false) then
      select count(*) into n
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and p.eliminated_at is null
        and coalesce(p.status, 'joined') <> 'withdrawn';
      if n <> 1 then
        raise exception 'Only the creator can end this challenge while more than one person is still in'
          using errcode = '42501';
      end if;
      n := 0;
    elsif ch.ends_at is not null and now() < ch.ends_at then
      raise exception 'Only the creator can close this challenge before it ends'
        using errcode = '42501';
    end if;
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

  if coalesce(ch.is_unlimited, false) then
    v_structure := 'winner_take_all';
    for rec in
      select p.user_id, p.days_completed::numeric as score
      from public.challenge_participants p
      where p.challenge_id = ch.id
        and p.eliminated_at is null
        and coalesce(p.status, 'joined') <> 'withdrawn'
      order by p.days_completed desc, p.joined_at asc
      limit 1
    loop
      ids := array_append(ids, rec.user_id);
      scores := array_append(scores, rec.score);
    end loop;

  elsif v_structure = 'winner_take_all' then
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
      if coalesce(ch.is_unlimited, false) then
        v_amount := v_remaining;
        v_reason := 'Last person still meeting the requirement — takes the entire prize pool.';
      elsif v_structure = 'winner_take_all' then
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
      if coalesce(ch.is_unlimited, false) then
        v_reason := 'Last person still meeting the requirement. The pool was empty, so no Coins moved.';
      elsif v_structure = 'winner_take_all' then
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

  if coalesce(ch.is_unlimited, false) then
    update public.challenge_participants
      set status = 'completed',
          completed_at = coalesce(completed_at, now())
      where challenge_id = ch.id
        and eliminated_at is null
        and coalesce(status, 'joined') <> 'withdrawn';
  else
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
  end if;

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

