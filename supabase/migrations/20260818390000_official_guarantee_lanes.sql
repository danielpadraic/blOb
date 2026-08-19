-- Official series: 10+ / everyone split P; else split G; 0 finishers pro-rata or roll G.
-- A valid Official day is pre + post + (HR screenshot or attached health workout).
-- User-created join/settle math is unchanged.

alter table public.workout_submissions
  add column if not exists proof_parts jsonb not null default '{}'::jsonb;

alter table public.workout_submissions
  add column if not exists proof_kind text;

alter table public.workout_submissions
  add column if not exists health_workout_id uuid;

alter table public.wallet_ledger
  alter column user_id drop not null;

create or replace function public.official_submission_is_valid(
  p_pre text,
  p_post text,
  p_hr text,
  p_health_workout_id uuid,
  p_proof_kind text
)
returns boolean
language sql
immutable
as $$
  select coalesce(p_pre, '') <> ''
     and coalesce(p_post, '') <> ''
     and (
       coalesce(p_hr, '') <> ''
       or p_health_workout_id is not null
       or coalesce(p_proof_kind, '') = 'health_workout'
     );
$$;

create or replace function public.official_credit_payout(
  p_challenge_id uuid,
  p_user_id uuid,
  p_currency text,
  p_amount numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null or coalesce(p_amount, 0) <= 0 then
    return;
  end if;
  if p_currency = 'coins' then
    update profiles set coins = coins + p_amount where id = p_user_id;
  else
    update profiles set bucks = bucks + p_amount where id = p_user_id;
  end if;
  insert into challenge_payouts (challenge_id, user_id, amount)
  values (p_challenge_id, p_user_id, p_amount);
  insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
  values (
    p_user_id,
    p_challenge_id,
    p_currency,
    p_amount,
    'distribute_win',
    p_reason,
    '{}'::jsonb
  );
end;
$$;

create or replace function public.distribute_official_guarantee(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_p numeric;
  v_g numeric;
  v_n int;
  v_finisher_c int;
  v_required int;
  v_day_total int;
  v_pay numeric;
  v_platform numeric;
  v_lane text;
  v_fill uuid;
  v_share numeric;
  v_paid numeric := 0;
  v_left numeric;
  rec record;
  v_i int := 0;
  v_count int;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND';
  end if;
  if v_c.distributed_at is not null then
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  v_p := round(coalesce(v_c.prize_pool, 0), 2);
  v_g := round(greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0), 2);
  if v_g > v_p then
    v_g := v_p;
  end if;
  v_required := greatest(
    coalesce(v_c.target_count, 0),
    coalesce(v_c.days_required, 0),
    coalesce(v_c.required_checkins, 0),
    1
  );

  select count(*) into v_n
  from challenge_participants
  where challenge_id = p_challenge_id
    and status is distinct from 'refunded_pre_start';

  select count(*) into v_finisher_c
  from challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.status is distinct from 'refunded_pre_start'
    and (
      select count(*)
      from workout_submissions s
      where s.challenge_id = p.challenge_id
        and s.user_id = p.user_id
        and public.official_submission_is_valid(
          s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
        )
    ) >= v_required;

  select coalesce(sum(d.cnt), 0) into v_day_total
  from (
    select (
      select count(*)
      from workout_submissions s
      where s.challenge_id = p.challenge_id
        and s.user_id = p.user_id
        and public.official_submission_is_valid(
          s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
        )
    ) as cnt
    from challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.status is distinct from 'refunded_pre_start'
  ) d;

  if v_finisher_c >= 10 or (v_finisher_c = v_n and v_finisher_c >= 1) then
    v_lane := 'split_pot';
    v_pay := v_p;
    v_platform := 0;
  elsif v_finisher_c >= 1 then
    v_lane := 'split_guarantee';
    v_pay := v_g;
    v_platform := round(v_p - v_g, 2);
  elsif v_day_total > 0 then
    v_lane := 'prorata_guarantee';
    v_pay := v_g;
    v_platform := round(v_p - v_g, 2);
  else
    v_lane := 'roll_guarantee';
    v_pay := 0;
    v_platform := round(v_p - v_g, 2);
    if v_g > 0 and v_c.series_id is not null then
      v_fill := public.official_series_insert_filling(v_c.series_id, v_g);
    end if;
  end if;

  if v_platform < 0 then
    v_platform := 0;
  end if;

  if v_lane = 'split_pot' or v_lane = 'split_guarantee' then
    v_count := v_finisher_c;
    v_share := round(v_pay / v_count, 2);
    v_left := round(v_pay - (v_share * v_count), 2);
    for rec in
      select p.user_id
      from challenge_participants p
      where p.challenge_id = p_challenge_id
        and p.status is distinct from 'refunded_pre_start'
        and (
          select count(*)
          from workout_submissions s
          where s.challenge_id = p.challenge_id
            and s.user_id = p.user_id
            and public.official_submission_is_valid(
              s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
            )
        ) >= v_required
      order by p.joined_at asc, p.user_id asc
    loop
      v_i := v_i + 1;
      perform public.official_credit_payout(
        p_challenge_id,
        rec.user_id,
        v_c.currency,
        v_share + case when v_i = v_count then v_left else 0 end,
        'distribute_win'
      );
      v_paid := v_paid + v_share + case when v_i = v_count then v_left else 0 end;
    end loop;
  elsif v_lane = 'prorata_guarantee' then
    select count(*) into v_count
    from challenge_participants p
    where p.challenge_id = p_challenge_id
      and p.status is distinct from 'refunded_pre_start'
      and (
        select count(*)
        from workout_submissions s
        where s.challenge_id = p.challenge_id
          and s.user_id = p.user_id
          and public.official_submission_is_valid(
            s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
          )
      ) > 0;
    for rec in
      select
        p.user_id,
        (
          select count(*)
          from workout_submissions s
          where s.challenge_id = p.challenge_id
            and s.user_id = p.user_id
            and public.official_submission_is_valid(
              s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
            )
        ) as days
      from challenge_participants p
      where p.challenge_id = p_challenge_id
        and p.status is distinct from 'refunded_pre_start'
      order by p.joined_at asc, p.user_id asc
    loop
      if rec.days <= 0 then
        continue;
      end if;
      v_i := v_i + 1;
      v_share := round(v_pay * rec.days / v_day_total, 2);
      if v_i = v_count then
        v_share := round(v_pay - v_paid, 2);
      end if;
      perform public.official_credit_payout(p_challenge_id, rec.user_id, v_c.currency, v_share, 'distribute_win');
      v_paid := v_paid + v_share;
    end loop;
  end if;

  if v_platform > 0 then
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (
      null,
      p_challenge_id,
      v_c.currency,
      v_platform,
      'platform_retain',
      'official_platform',
      jsonb_build_object(
        'lane', v_lane,
        'P', v_p,
        'G', v_g,
        'C', v_finisher_c,
        'N', v_n
      )
    );
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object(
    'ok', true,
    'lane', v_lane,
    'P', v_p,
    'G', v_g,
    'C', v_finisher_c,
    'N', v_n,
    'paid', v_paid,
    'platform', v_platform,
    'filling_id', v_fill,
    'distributed_at', now()
  );
end;
$$;

grant execute on function public.distribute_official_guarantee(uuid) to authenticated;

create or replace function public.refresh_participant_progress(
  p_challenge_id uuid,
  p_user_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_days int := 0;
  v_target int := 1;
  v_task_count int := 0;
begin
  select * into ch
  from public.challenges
  where id = p_challenge_id;

  if not found then
    return 0;
  end if;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select count(distinct tid) into v_task_count
    from public.workout_submissions s
    cross join lateral jsonb_array_elements_text(coalesce(s.task_ids, '[]'::jsonb)) as tid
    where s.challenge_id = p_challenge_id
      and s.user_id = p_user_id
      and length(trim(tid)) > 0;

    if coalesce(v_task_count, 0) > 0 then
      v_days := v_task_count;
    else
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id;
    end if;

    v_target := greatest(
      coalesce(jsonb_array_length(coalesce(ch.tasks, '[]'::jsonb)), 0),
      coalesce(ch.target_count, 1),
      1
    );
  else
    if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id
        and public.official_submission_is_valid(
          s.pre_selfie_url, s.post_selfie_url, s.hr_monitor_url, s.health_workout_id, s.proof_kind
        );
    else
      select count(*) into v_days
      from public.workout_submissions s
      where s.challenge_id = p_challenge_id
        and s.user_id = p_user_id;
    end if;

    v_target := greatest(coalesce(ch.target_count, ch.days_required), 1);
  end if;

  v_days := greatest(coalesce(v_days, 0), 0);

  update public.challenge_participants
    set days_completed = v_days,
        completed_at = case
          when coalesce(ch.is_unlimited, false) then completed_at
          when v_days >= v_target then coalesce(completed_at, now())
          else null
        end,
        status = case
          when coalesce(status, 'joined') = 'withdrawn' then status
          when coalesce(ch.is_unlimited, false) then status
          when v_days >= v_target then 'completed'
          when status = 'completed' then 'joined'
          else status
        end
    where challenge_id = p_challenge_id
      and user_id = p_user_id;

  return v_days;
end;
$$;

create or replace function public.distribute_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_open_disputes int;
  v_active int;
  v_winner uuid;
  v_pool numeric;
  v_share numeric;
  v_completers uuid[];
  v_even boolean;
begin
  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.distributed_at is not null then
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if exists (select 1 from challenge_payouts where challenge_id = p_challenge_id) then
    update challenges
      set distributed_at = coalesce(distributed_at, now()), status = 'settled', updated_at = now()
      where id = p_challenge_id;
    raise exception 'ALREADY_DISTRIBUTED';
  end if;

  if v_c.official_started_at is null then
    raise exception 'NOT_STARTED';
  end if;

  v_even := coalesce(v_c.payout_mode, 'even_split_remaining') = 'even_split_remaining'
    and coalesce(v_c.prize_structure, 'equal_split') not in ('winner_take_all', 'top_places')
    and coalesce(v_c.is_unlimited, false) = false
    and coalesce(v_c.end_mode, '') is distinct from 'indefinite_lms';

  if v_c.end_mode = 'indefinite_lms' or v_c.is_unlimited = true then
    select count(*) into v_active from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null;
    if v_active <> 1 then
      raise exception 'LMS_NOT_FINISHED';
    end if;
  else
    if v_c.ends_at is null then
      raise exception 'NO_END_TIME';
    end if;
    if not v_even and now() < v_c.ends_at + interval '1 hour' then
      raise exception 'COOLDOWN_ACTIVE';
    end if;
    if v_even and now() < v_c.ends_at then
      raise exception 'CHALLENGE_NOT_ENDED';
    end if;
  end if;

  select count(*) into v_open_disputes from challenge_disputes
  where challenge_id = p_challenge_id and status = 'open';
  if v_open_disputes > 0 then
    raise exception 'OPEN_DISPUTES';
  end if;

  if coalesce(v_c.is_official, false) and coalesce(v_c.series_id, '') <> '' then
    return public.distribute_official_guarantee(p_challenge_id);
  end if;

  v_pool := coalesce(v_c.prize_pool, 0);

  if v_even then
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id
      and eliminated_at is null
      and status in ('active', 'completed', 'joined')
      and status is distinct from 'refunded_pre_start';

    if v_completers is null or array_length(v_completers, 1) is null then
      update challenges
      set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
      where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
    end if;

    if v_pool <= 0 then
      update challenges set distributed_at = now(), status = 'settled', updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'paid', 0);
    end if;

    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, amount)
      values (p_challenge_id, v_winner, v_share);
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb);
    end loop;

    update challenges
    set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
    where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'distributed_at', now(), 'paid', v_share);
  end if;

  if v_pool <= 0 then
    update challenges set distributed_at = now(), status = 'settled', updated_at = now() where id = p_challenge_id;
    return jsonb_build_object('ok', true, 'paid', 0);
  end if;

  if v_c.prize_structure = 'solo_return' or (v_c.max_participants = 1) then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and status in ('active', 'completed', 'joined') and eliminated_at is null
    limit 1;
    if v_winner is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'solo_forfeit', true);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, amount)
    values (p_challenge_id, v_winner, v_pool);
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb);
  elsif v_c.prize_structure = 'winner_take_all' then
    select user_id into v_winner from challenge_participants
    where challenge_id = p_challenge_id and eliminated_at is null and status <> 'refunded_pre_start'
    order by points desc, days_completed desc, joined_at asc
    limit 1;
    if v_winner is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
    end if;
    if v_c.currency = 'coins' then
      update profiles set coins = coins + v_pool where id = v_winner;
    else
      update profiles set bucks = bucks + v_pool where id = v_winner;
    end if;
    insert into challenge_payouts (challenge_id, user_id, amount)
    values (p_challenge_id, v_winner, v_pool);
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb);
  else
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id and status = 'completed' and eliminated_at is null;
    if v_completers is null or array_length(v_completers, 1) is null then
      select array_agg(user_id) into v_completers from challenge_participants
      where challenge_id = p_challenge_id and eliminated_at is null and status in ('active', 'completed', 'joined');
    end if;
    if v_completers is null or array_length(v_completers, 1) is null then
      update challenges set distributed_at = now(), status = 'settled', prize_pool = 0, updated_at = now() where id = p_challenge_id;
      return jsonb_build_object('ok', true, 'forfeit', true, 'paid', 0);
    end if;
    v_share := round(v_pool / array_length(v_completers, 1), 2);
    foreach v_winner in array v_completers loop
      if v_c.currency = 'coins' then
        update profiles set coins = coins + v_share where id = v_winner;
      else
        update profiles set bucks = bucks + v_share where id = v_winner;
      end if;
      insert into challenge_payouts (challenge_id, user_id, amount)
      values (p_challenge_id, v_winner, v_share);
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb);
    end loop;
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'distributed_at', now());
end;
$$;

grant execute on function public.distribute_challenge(uuid) to authenticated;

drop function if exists public.log_workout(uuid, date, text, text, text, text, jsonb, jsonb);
drop function if exists public.log_workout(uuid, text, text, text, text);

create or replace function public.log_workout(
  p_challenge_id uuid,
  p_submission_date date default (timezone('utc', now()))::date,
  p_pre_selfie_url text default null,
  p_post_selfie_url text default null,
  p_hr_monitor_url text default null,
  p_notes text default null,
  p_task_ids jsonb default '[]'::jsonb,
  p_proof_parts jsonb default '{}'::jsonb,
  p_health_workout_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  part public.challenge_participants%rowtype;
  v_uid uuid := auth.uid();
  v_tasks text[] := '{}';
  v_valid text[] := '{}';
  v_unknown text[] := '{}';
  v_id uuid;
  v_days int;
  rec record;
  v_proofs jsonb;
  v_part jsonb;
  v_method text;
  v_has_parts boolean;
  v_hr_ok boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_submission_date is null then
    p_submission_date := (timezone('utc', now()))::date;
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.starts_at is not null and now() < ch.starts_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.official_started_at is not null and now() < ch.official_started_at then
    raise exception 'NOT_STARTED';
  end if;

  if ch.status in ('judging', 'settled') then
    raise exception 'Logging is closed for this challenge.';
  end if;

  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Logging is closed for this challenge.';
  end if;

  select * into part
  from public.challenge_participants
  where challenge_id = p_challenge_id
    and user_id = v_uid
  for update;

  if not found then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join the challenge before you log a workout.';
  end if;

  if part.eliminated_at is not null then
    raise exception 'You have been eliminated from this challenge.';
  end if;

  if exists (
    select 1
    from public.workout_submissions s
    where s.challenge_id = p_challenge_id
      and s.user_id = v_uid
      and s.submission_date = p_submission_date
  ) then
    raise exception 'You’ve already logged a workout for today.';
  end if;

  if p_health_workout_id is not null then
    if to_regclass('public.health_workouts') is null then
      raise exception 'That workout is not available.';
    elsif not exists (
      select 1 from public.health_workouts hw
      where hw.id = p_health_workout_id and hw.user_id = v_uid
    ) then
      raise exception 'That workout is not available.';
    end if;
  end if;

  v_hr_ok := coalesce(p_hr_monitor_url, '') <> '' or p_health_workout_id is not null;

  if coalesce(ch.challenge_type, 'consistency') = 'points' then
    select coalesce(array_agg(trim(tid)), '{}') into v_tasks
    from (
      select distinct trim(tid) as tid
      from jsonb_array_elements_text(coalesce(p_task_ids, '[]'::jsonb)) as tid
      where length(trim(tid)) > 0
    ) cleaned;

    if coalesce(array_length(v_tasks, 1), 0) = 0 then
      raise exception 'Pick at least one task you completed.';
    end if;

    select coalesce(array_agg(t->>'id'), '{}') into v_valid
    from jsonb_array_elements(coalesce(ch.tasks, '[]'::jsonb)) t
    where coalesce(t->>'id', '') <> '';

    select coalesce(array_agg(tid), '{}') into v_unknown
    from unnest(v_tasks) as tid
    where tid <> all (coalesce(v_valid, '{}'));

    if coalesce(array_length(v_unknown, 1), 0) > 0 then
      raise exception 'Those tasks are not part of this challenge.';
    end if;
  else
    v_tasks := '{}';
    v_proofs := coalesce(ch.proofs, '[]'::jsonb);
    v_has_parts := jsonb_typeof(coalesce(p_proof_parts, '{}'::jsonb)) = 'object'
      and coalesce(p_proof_parts, '{}'::jsonb) <> '{}'::jsonb;
    if v_has_parts and jsonb_typeof(v_proofs) = 'array' and jsonb_array_length(v_proofs) > 0 then
      for rec in
        select elem
        from jsonb_array_elements(v_proofs) elem
      loop
        v_method := coalesce(rec.elem->>'method', 'photo');
        v_part := coalesce(p_proof_parts -> coalesce(rec.elem->>'id', ''), '{}'::jsonb);
        if v_method = 'honor' then
          continue;
        elsif v_method = 'checkin' then
          if coalesce(nullif(v_part->>'text', ''), nullif(v_part->>'url', ''), '') = '' then
            raise exception 'MISSING_PROOFS';
          end if;
        elsif v_method = 'hr' then
          if coalesce(v_part->>'url', '') = ''
             and coalesce(v_part->>'healthWorkoutId', '') = ''
             and not v_hr_ok then
            raise exception 'MISSING_PROOFS';
          end if;
        else
          if coalesce(v_part->>'url', '') = '' then
            raise exception 'MISSING_PROOFS';
          end if;
        end if;
      end loop;
    else
      for rec in
        select coalesce(req->>'type', '') as proof_type
        from jsonb_array_elements(coalesce(ch.proof_requirements, '[]'::jsonb)) req
        where coalesce((req->>'required')::boolean, true)
      loop
        if rec.proof_type = 'pre_selfie' and coalesce(p_pre_selfie_url, '') = '' then
          raise exception 'Upload every required proof before you log.';
        end if;
        if rec.proof_type = 'post_selfie' and coalesce(p_post_selfie_url, '') = '' then
          raise exception 'Upload every required proof before you log.';
        end if;
        if rec.proof_type = 'hr_monitor' and not v_hr_ok then
          raise exception 'Upload every required proof before you log.';
        end if;
      end loop;
    end if;
  end if;

  insert into public.workout_submissions (
    challenge_id,
    user_id,
    submission_date,
    pre_selfie_url,
    post_selfie_url,
    hr_monitor_url,
    notes,
    status,
    task_ids,
    proof_parts,
    proof_kind,
    health_workout_id
  ) values (
    p_challenge_id,
    v_uid,
    p_submission_date,
    p_pre_selfie_url,
    p_post_selfie_url,
    p_hr_monitor_url,
    p_notes,
    'pending_review',
    to_jsonb(coalesce(v_tasks, '{}')),
    coalesce(p_proof_parts, '{}'::jsonb),
    case when p_health_workout_id is not null then 'health_workout' else 'camera' end,
    p_health_workout_id
  )
  returning id into v_id;

  v_days := public.refresh_participant_progress(p_challenge_id, v_uid);

  return (
    select jsonb_build_object(
      'id', s.id,
      'challenge_id', s.challenge_id,
      'user_id', s.user_id,
      'submission_date', s.submission_date,
      'pre_selfie_url', s.pre_selfie_url,
      'post_selfie_url', s.post_selfie_url,
      'hr_monitor_url', s.hr_monitor_url,
      'notes', s.notes,
      'status', s.status,
      'created_at', s.created_at,
      'task_ids', s.task_ids,
      'proof_parts', s.proof_parts,
      'proof_kind', s.proof_kind,
      'health_workout_id', s.health_workout_id,
      'days_completed', v_days
    )
    from public.workout_submissions s
    where s.id = v_id
  );
exception
  when unique_violation then
    raise exception 'You’ve already logged a workout for today.';
end;
$$;

grant execute on function public.log_workout(uuid, date, text, text, text, text, jsonb, jsonb, uuid) to authenticated;

create or replace function public.guard_official_health_only()
returns trigger
language plpgsql
as $$
declare
  v_official boolean := false;
begin
  select coalesce(is_official, false) and coalesce(series_id, '') <> ''
    into v_official
  from public.challenges
  where id = new.challenge_id;
  if v_official
     and coalesce(new.pre_selfie_url, '') = ''
     and coalesce(new.post_selfie_url, '') = '' then
    raise exception 'OFFICIAL_NEEDS_CAMERA_PROOFS';
  end if;
  return new;
end;
$$;

drop trigger if exists workout_submissions_official_proofs on public.workout_submissions;
create trigger workout_submissions_official_proofs
  before insert or update of pre_selfie_url, post_selfie_url, hr_monitor_url, health_workout_id, proof_kind
  on public.workout_submissions
  for each row execute function public.guard_official_health_only();

create table if not exists public.challenge_proof_flags (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  flagged_by uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (post_id, flagged_by)
);

alter table public.challenge_proof_flags
  add column if not exists reason text;

drop function if exists public.flag_challenge_proof(uuid);

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

  return jsonb_build_object(
    'ok', true,
    'hidden', false,
    'flag_count', v_count
  );
end;
$$;

grant execute on function public.flag_challenge_proof(uuid, text) to authenticated;

update public.challenges
set
  rules = 'Complete 7 workouts of at least 30 minutes in 7 days. Each required day needs a pre-selfie, a post-selfie, and HR proof (a Fitness screenshot or an attached workout). If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee. If nobody finishes and there are no valid days, the guarantee rolls into the next Official week.',
  description = 'Show up every day. Thirty honest minutes. A picture before, a picture after, and HR proof — screenshot is enough.'
where is_official
  and series_id is not null
  and status in ('filling', 'arming', 'live');

do $$
declare
  rec record;
begin
  for rec in
    select distinct s.challenge_id, s.user_id
    from public.workout_submissions s
    join public.challenges c on c.id = s.challenge_id
    where c.is_official and coalesce(c.series_id, '') <> ''
  loop
    perform public.refresh_participant_progress(rec.challenge_id, rec.user_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

create or replace function public.official_series_insert_filling(
  p_slug text,
  p_rolled_pot numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s public.official_series%rowtype;
  v_host uuid;
  v_id uuid;
  v_title text;
  v_buyin numeric(12,2);
  v_guarantee numeric(12,2);
  v_proofs jsonb;
begin
  perform pg_advisory_xact_lock(hashtext('official_series:' || coalesce(p_slug, '')));

  select * into v_s from public.official_series where slug = p_slug;
  if not found then
    raise exception 'OFFICIAL_SERIES_NOT_FOUND';
  end if;

  select id into v_id
  from public.challenges
  where series_id = p_slug
    and status in ('filling', 'arming')
  order by created_at desc
  limit 1
  for update;

  if v_id is not null then
    if coalesce(p_rolled_pot, 0) > 0 then
      update public.challenges
      set prize_pool = prize_pool + coalesce(p_rolled_pot, 0), updated_at = now()
      where id = v_id;
    end if;
    return v_id;
  end if;

  v_host := public.official_series_host_id();
  if v_host is null then
    raise exception 'OFFICIAL_HOST_MISSING';
  end if;

  v_buyin := round(v_s.buyin_cents / 100.0, 2);
  v_guarantee := round(v_s.guarantee_cents / 100.0, 2);
  v_title := case
    when v_s.currency = 'bucks' then v_s.title
    else '10 Coin Guarantee'
  end;
  v_proofs := jsonb_build_array(
    jsonb_build_object('id', 'pre', 'name', 'Pre-selfie', 'method', 'photo'),
    jsonb_build_object('id', 'post', 'name', 'Post-selfie', 'method', 'photo'),
    jsonb_build_object('id', 'hr', 'name', 'Heart rate', 'method', 'hr')
  );

  insert into public.challenges (
    title,
    description,
    rules,
    is_official,
    series_id,
    created_by,
    buy_in_amount,
    host_budget,
    creator_contribution,
    prize_pool,
    days_required,
    target_count,
    required_checkins,
    min_minutes,
    misses_allowed,
    status,
    starts_at,
    ends_at,
    armed_at,
    official_started_at,
    category,
    challenge_type,
    format,
    visibility,
    discoverability,
    challenge_lane,
    frequency,
    proofs,
    proof_requirements,
    proof_type,
    proof_review,
    tasks,
    prize_structure,
    payout_mode,
    funding_model,
    max_participants,
    min_participants,
    is_unlimited,
    currency,
    start_rule,
    start_mode,
    end_mode,
    length_value,
    length_unit,
    creator_participating,
    host_funded,
    task,
    timezone
  ) values (
    v_title,
    'Show up every day. Thirty honest minutes. A picture before, a picture after, and HR proof — screenshot is enough.',
    'Complete 7 workouts of at least 30 minutes in 7 days. Each required day needs a pre-selfie, a post-selfie, and HR proof (a Fitness screenshot or an attached workout). If 10+ finish (or everyone), they split the pot. If fewer, they split the guarantee. If nobody finishes and there are no valid days, the guarantee rolls into the next Official week.',
    true,
    p_slug,
    v_host,
    v_buyin,
    v_guarantee,
    v_guarantee,
    round(coalesce(p_rolled_pot, 0), 2),
    v_s.duration_days,
    v_s.duration_days,
    v_s.duration_days,
    v_s.min_minutes,
    v_s.misses_allowed,
    'filling',
    null,
    null,
    null,
    null,
    'fitness',
    'consistency',
    'consistency',
    'public',
    null,
    'coins',
    'daily',
    v_proofs,
    '[{"type":"pre_selfie","required":true},{"type":"post_selfie","required":true},{"type":"hr_monitor","required":true}]'::jsonb,
    'photo',
    'auto',
    '[]'::jsonb,
    'equal_split',
    'even_split_remaining',
    'participants',
    null,
    1,
    false,
    v_s.currency,
    'legacy',
    null,
    'length',
    v_s.duration_days,
    'days',
    false,
    false,
    '30 min elevated HR',
    'UTC'
  )
  returning id into v_id;

  return v_id;
end;
$$;


