-- Official Weekly $10 Guarantee as a recurring series (slug week_10).
-- User-created join/settle math is unchanged. Official 0-finishers roll the pot.

create table if not exists public.official_series (
  slug text primary key,
  title text not null,
  duration_days int not null default 7,
  guarantee_cents int not null,
  buyin_cents int not null,
  currency text not null check (currency in ('coins', 'bucks')),
  misses_allowed int not null default 0,
  min_minutes int not null default 30,
  fee_bps int not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.official_series is
  'Catalog of Official recurring series. Instances are challenges rows.';

alter table public.official_series enable row level security;
drop policy if exists "Anyone can read official series" on public.official_series;
create policy "Anyone can read official series"
  on public.official_series for select
  to anon, authenticated
  using (true);

grant select on public.official_series to anon, authenticated;

alter table public.challenges
  add column if not exists series_id text references public.official_series(slug),
  add column if not exists armed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id);

comment on column public.challenges.series_id is
  'Official series slug. Null for user-created challenges.';
comment on column public.challenges.armed_at is
  'When an Official filling instance armed. Live starts armed_at + 1 hour.';

alter table public.challenges drop constraint if exists challenges_status_allowed;
alter table public.challenges add constraint challenges_status_allowed
  check (status in (
    'draft', 'upcoming', 'open', 'starting', 'in_progress', 'filling', 'arming', 'live',
    'ended', 'judging', 'distributing', 'settled', 'cancelled_underfilled', 'cancelled'
  ));

create unique index if not exists challenges_one_open_official_series_idx
  on public.challenges (series_id)
  where is_official
    and series_id is not null
    and status in ('filling', 'arming');

insert into public.official_series (
  slug, title, duration_days, guarantee_cents, buyin_cents, currency, misses_allowed, min_minutes, fee_bps
) values (
  'week_10', 'Weekly $10 Guarantee', 7, 1000, 100, 'bucks', 0, 30, 0
)
on conflict (slug) do update
set
  title = excluded.title,
  duration_days = excluded.duration_days,
  guarantee_cents = excluded.guarantee_cents,
  buyin_cents = excluded.buyin_cents,
  currency = excluded.currency,
  misses_allowed = excluded.misses_allowed,
  min_minutes = excluded.min_minutes,
  fee_bps = excluded.fee_bps;

create or replace function public.official_series_host_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host uuid := '81dfe427-d413-4c60-bd4a-e710c95077ad';
begin
  if exists (select 1 from public.profiles where id = v_host) then
    return v_host;
  end if;
  return public.official_profile_id();
end;
$$;

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
    'Show up every day. Thirty honest minutes. A picture before, a picture after, elevated heart rate.',
    'Complete 7 workouts of at least 30 minutes in 7 days. Miss a required day and you are out. Finishers split the pot. If nobody finishes, the pot rolls into the next Official week.',
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

create or replace function public.tick_official_series()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_s public.official_series%rowtype;
  v_duration int;
begin
  for v_s in select * from public.official_series loop
    perform pg_advisory_xact_lock(hashtext('official_series:' || v_s.slug));

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'live'
        and ends_at is not null
        and now() >= ends_at
        and distributed_at is null
      for update skip locked
    loop
      begin
        perform public.distribute_challenge(rec.id);
      exception when others then
        null;
      end;
    end loop;

    update public.challenges
    set
      status = 'arming',
      armed_at = coalesce(armed_at, now()),
      updated_at = now()
    where series_id = v_s.slug
      and is_official
      and status = 'filling'
      and 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0) > 0
      and coalesce(prize_pool, 0) >= 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0);

    v_duration := coalesce(v_s.duration_days, 7);
    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'arming'
        and armed_at is not null
        and now() >= armed_at + interval '1 hour'
      for update skip locked
    loop
      update public.challenges
      set
        status = 'live',
        starts_at = now(),
        ends_at = now() + make_interval(days => v_duration),
        official_started_at = coalesce(official_started_at, now()),
        updated_at = now()
      where id = rec.id;
      perform public.official_series_insert_filling(v_s.slug, 0);
    end loop;

    if not exists (
      select 1 from public.challenges
      where series_id = v_s.slug and status in ('filling', 'arming')
    ) then
      perform public.official_series_insert_filling(v_s.slug, 0);
    end if;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.list_official_joinable()
returns setof public.challenges
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  return query
  select c.*
  from public.challenges c
  where c.is_official
    and c.series_id is not null
    and c.status in ('filling', 'arming')
    and (
      v_uid is null
      or not exists (
        select 1 from public.challenge_participants p
        where p.challenge_id = c.id and p.user_id = v_uid
      )
    )
    and (
      v_uid is null
      or public.challenge_available_in_jurisdiction(c.id, v_uid)
    )
  order by c.created_at asc;
end;
$$;

create or replace function public.join_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.series_id is not null then
    if v_c.status not in ('filling', 'arming') then
      raise exception 'ALREADY_STARTED';
    end if;
  elsif v_c.is_official then
    raise exception 'NOT_JOINABLE';
  elsif coalesce(v_c.start_rule, 'legacy') is distinct from 'at_starts_at' then
    if v_c.official_started_at is not null then
      raise exception 'ALREADY_STARTED';
    end if;
    if v_c.status not in ('open', 'starting', 'upcoming', 'in_progress') then
      raise exception 'NOT_JOINABLE';
    end if;
  else
    if v_c.status is distinct from 'open' then
      raise exception 'NOT_JOINABLE';
    end if;
    if v_c.starts_at is not null and now() >= v_c.starts_at then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.official_started_at is not null then
      raise exception 'ALREADY_STARTED';
    end if;
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is distinct from v_uid
     and not public.are_accepted_friends(v_c.created_by, v_uid) then
    raise exception 'FRIENDS_ONLY';
  end if;

  if public.is_invite_only_challenge(v_c)
     and not public.user_can_access_challenge(p_challenge_id, v_uid) then
    raise exception 'NOT_INVITED';
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if v_c.is_official then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  if v_c.currency = 'coins' then
    select coins into v_balance from profiles where id = v_uid for update;
  else
    select bucks into v_balance from profiles where id = v_uid for update;
  end if;

  if v_balance < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_c.currency = 'coins' then
      update profiles set coins = coins - v_c.buy_in_amount where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (
      v_uid, p_challenge_id, v_c.currency, -v_c.buy_in_amount, 'join_escrow', 'join_escrow',
      '{}'::jsonb, 'challenge', p_challenge_id::text
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_c.currency, 'active');

  update public.challenge_invites
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now())
  where challenge_id = p_challenge_id
    and invitee_id = v_uid
    and status = 'pending';

  if v_c.series_id is not null then
    select 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0)
      into v_need
    from public.challenges
    where id = p_challenge_id;
    if v_need > 0 then
      update public.challenges
      set status = 'arming', armed_at = coalesce(armed_at, now()), updated_at = now()
      where id = p_challenge_id
        and status = 'filling'
        and coalesce(prize_pool, 0) >= v_need;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

grant execute on function public.join_challenge(uuid) to authenticated;

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
  v_fill uuid;
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

  v_pool := coalesce(v_c.prize_pool, 0);

  if v_even then
    select array_agg(user_id) into v_completers from challenge_participants
    where challenge_id = p_challenge_id
      and eliminated_at is null
      and status in ('active', 'completed', 'joined')
      and status is distinct from 'refunded_pre_start';

    if v_completers is null or array_length(v_completers, 1) is null then
      if v_c.is_official and v_c.series_id is not null then
        v_fill := public.official_series_insert_filling(v_c.series_id, v_pool);
        update challenges
        set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
        where id = p_challenge_id;
        return jsonb_build_object('ok', true, 'rolled', true, 'paid', 0, 'filling_id', v_fill);
      end if;
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
      insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
      values (p_challenge_id, v_winner, v_c.currency, v_share, null, 'distribute_win')
      on conflict (challenge_id, user_id) do nothing;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
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
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
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
    insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
    values (p_challenge_id, v_winner, v_c.currency, v_pool, 1, 'distribute_win')
    on conflict (challenge_id, user_id) do nothing;
    insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
    values (v_winner, p_challenge_id, v_c.currency, v_pool, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
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
      insert into challenge_payouts (challenge_id, user_id, currency, amount, place, reason)
      values (p_challenge_id, v_winner, v_c.currency, v_share, null, 'distribute_win')
      on conflict (challenge_id, user_id) do nothing;
      insert into wallet_ledger (user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id)
      values (v_winner, p_challenge_id, v_c.currency, v_share, 'distribute_win', 'distribute_win', '{}'::jsonb, 'challenge', p_challenge_id::text);
    end loop;
  end if;

  update challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  return jsonb_build_object('ok', true, 'distributed_at', now());
end;
$$;

grant execute on function public.distribute_challenge(uuid) to authenticated;

create or replace function public.sync_challenge_misses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch record;
  v_expected int;
  v_elapsed_days int;
  v_weeks int;
begin
  for ch in
    select *
    from public.challenges
    where status in ('in_progress', 'live')
      and coalesce(format, 'consistency') = 'consistency'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
  loop
    v_elapsed_days := greatest(
      floor(extract(epoch from (least(now(), coalesce(ch.ends_at, now())) - ch.starts_at)) / 86400)::int,
      0
    );

    if ch.frequency in ('once') then
      continue;
    elsif ch.frequency in ('3x_week', 'weekly') then
      v_weeks := greatest(ceil(v_elapsed_days / 7.0)::int, 0);
      if ch.frequency = '3x_week' then
        v_expected := v_weeks * 3;
      else
        v_expected := v_weeks * greatest(coalesce(ch.target_count, 1), 1);
      end if;
    elsif ch.frequency = 'custom' then
      v_expected := least(
        coalesce(ch.required_checkins, ch.target_count, 1),
        v_elapsed_days
      );
    else
      v_expected := v_elapsed_days;
    end if;

    v_expected := greatest(v_expected, 0);

    update public.challenge_participants p
    set
      status = 'eliminated',
      eliminated_at = coalesce(p.eliminated_at, now())
    where p.challenge_id = ch.id
      and p.status in ('active', 'joined')
      and p.eliminated_at is null
      and (coalesce(p.days_completed, 0) + coalesce(ch.misses_allowed, 0)) < v_expected;
  end loop;
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
  perform public.tick_official_series();

  for rec in
    select id, min_participants, start_rule, starts_at
    from public.challenges
    where status in ('upcoming', 'open')
      and series_id is null
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

  perform public.sync_challenge_misses();
  perform public.sync_unlimited_eliminations();

  for rec in
    select id
    from public.challenges
    where status in ('in_progress', 'live')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and coalesce(payout_mode, 'even_split_remaining') = 'even_split_remaining'
      and coalesce(prize_structure, 'equal_split') not in ('winner_take_all', 'top_places')
      and distributed_at is null
    for update skip locked
  loop
    begin
      perform public.distribute_challenge(rec.id);
    exception when others then
      update public.challenges
      set status = 'judging'
      where id = rec.id and status in ('in_progress', 'live') and series_id is null;
    end;
  end loop;

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress')
      and series_id is null
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false
      and distributed_at is null;
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated;

create or replace function public.guard_workout_on_closed_challenge()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status
  from public.challenges
  where id = new.challenge_id;

  if v_status in ('filling', 'arming', 'cancelled', 'cancelled_underfilled', 'settled', 'judging') then
    raise exception 'Logging is closed for this challenge.';
  end if;
  return new;
end;
$$;

create or replace function public.cancel_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_official boolean := false;
  v_others int := 0;
  v_p record;
  v_host_amt numeric := 0;
  v_refunded uuid[] := '{}';
  v_host_coin_back boolean := false;
  v_notified_host boolean := false;
  v_body text;
  v_paid boolean;
  v_cur text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_c
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_c.status = 'settled' then
    raise exception 'ALREADY_SETTLED';
  end if;

  if v_c.status in ('cancelled', 'cancelled_underfilled') then
    raise exception 'ALREADY_CANCELLED';
  end if;

  select coalesce(is_official, false) into v_official
  from public.profiles
  where id = v_uid;

  if not v_official then
    if v_c.created_by is distinct from v_uid then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    if v_c.starts_at is null or v_c.starts_at <= now() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    select count(*) into v_others
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id is distinct from v_c.created_by
      and coalesce(status, 'joined') is distinct from 'refunded_pre_start';
    if coalesce(v_others, 0) > 0 then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;

  for v_p in
    select *
    from public.challenge_participants
    where challenge_id = p_challenge_id
    for update
  loop
    v_cur := coalesce(v_p.currency, v_c.currency, 'coins');
    if coalesce(v_p.buy_in_paid, 0) > 0
       and coalesce(v_p.status, 'joined') is distinct from 'refunded_pre_start'
       and (v_cur = 'coins' or v_c.is_official) then
      if v_cur = 'bucks' then
        update public.profiles
        set bucks = bucks + v_p.buy_in_paid
        where id = v_p.user_id;
      else
        update public.profiles
        set coins = coins + v_p.buy_in_paid
        where id = v_p.user_id;
      end if;
      update public.challenges
      set prize_pool = greatest(prize_pool - v_p.buy_in_paid, 0)
      where id = p_challenge_id;
      insert into public.wallet_ledger (
        user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
      ) values (
        v_p.user_id, p_challenge_id, v_cur, v_p.buy_in_paid,
        'challenge_cancel_refund', 'challenge_cancel_refund',
        jsonb_build_object('kind', 'buy_in'),
        'challenge', p_challenge_id::text
      );
      v_refunded := array_append(v_refunded, v_p.user_id);
      if v_p.user_id = v_c.created_by then
        v_host_coin_back := true;
      end if;
    end if;
  end loop;

  select * into v_c from public.challenges where id = p_challenge_id;
  v_host_amt := greatest(coalesce(v_c.host_budget, v_c.creator_contribution, 0), 0);
  v_host_amt := least(v_host_amt, greatest(coalesce(v_c.prize_pool, 0), 0));
  if v_host_amt > 0 and v_c.created_by is not null then
    if coalesce(v_c.currency, 'coins') = 'coins' then
      update public.profiles set coins = coins + v_host_amt where id = v_c.created_by;
      v_host_coin_back := true;
    else
      update public.profiles set bucks = bucks + v_host_amt where id = v_c.created_by;
    end if;
    update public.challenges
    set prize_pool = greatest(prize_pool - v_host_amt, 0)
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
    ) values (
      v_c.created_by, p_challenge_id, coalesce(v_c.currency, 'coins'), v_host_amt,
      'challenge_cancel_refund', 'challenge_cancel_host_release',
      jsonb_build_object('kind', 'host_escrow'),
      'challenge', p_challenge_id::text
    );
  end if;

  update public.challenges
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = v_uid,
    updated_at = now()
  where id = p_challenge_id;

  for v_p in
    select *
    from public.challenge_participants
    where challenge_id = p_challenge_id
  loop
    v_paid := v_p.user_id = any (v_refunded)
      or (v_p.user_id = v_c.created_by and v_host_coin_back);
    v_body := 'This challenge was cancelled.';
    if v_paid then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_p.user_id,
      v_uid,
      'challenge_cancelled',
      v_c.title,
      v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_paid)
    );
    if v_p.user_id = v_c.created_by then
      v_notified_host := true;
    end if;
  end loop;

  if v_official
     and v_c.created_by is not null
     and v_c.created_by is distinct from v_uid
     and not v_notified_host then
    v_body := 'This challenge was cancelled.';
    if v_host_coin_back then
      v_body := v_body || ' Your coins were returned.';
    end if;
    perform public.notify_user(
      v_c.created_by,
      v_uid,
      'challenge_cancelled',
      v_c.title,
      v_body,
      jsonb_build_object('challenge_id', p_challenge_id, 'refunded', v_host_coin_back)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cancel_challenge(uuid) to authenticated;

-- Official leftovers without series_id: refund and cancel. Does not spawn filling.
do $$
declare
  v_c public.challenges%rowtype;
  v_p record;
  v_cur text;
  v_host uuid := public.official_series_host_id();
begin
  for v_c in
    select * from public.challenges
    where is_official
      and series_id is null
      and status not in ('cancelled', 'cancelled_underfilled', 'settled')
    for update
  loop
    for v_p in
      select * from public.challenge_participants
      where challenge_id = v_c.id
      for update
    loop
      v_cur := coalesce(v_p.currency, v_c.currency, 'coins');
      if coalesce(v_p.buy_in_paid, 0) > 0
         and coalesce(v_p.status, 'joined') is distinct from 'refunded_pre_start' then
        if v_cur = 'bucks' then
          update public.profiles set bucks = bucks + v_p.buy_in_paid where id = v_p.user_id;
        else
          update public.profiles set coins = coins + v_p.buy_in_paid where id = v_p.user_id;
        end if;
        insert into public.wallet_ledger (
          user_id, challenge_id, currency, amount, entry_type, reason, metadata, ref_type, ref_id
        ) values (
          v_p.user_id, v_c.id, v_cur, v_p.buy_in_paid,
          'challenge_cancel_refund', 'challenge_cancel_refund',
          jsonb_build_object('kind', 'buy_in', 'orphan_official', true),
          'challenge', v_c.id::text
        );
      end if;
    end loop;

    update public.challenges
    set
      prize_pool = 0,
      status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_host,
      updated_at = now()
    where id = v_c.id;
  end loop;
end $$;

grant execute on function public.tick_official_series() to authenticated, service_role;
grant execute on function public.list_official_joinable() to authenticated, anon;
grant execute on function public.official_series_insert_filling(text, numeric) to service_role;
revoke all on function public.official_series_insert_filling(text, numeric) from public, anon, authenticated;
revoke all on function public.official_series_host_id() from public, anon, authenticated;

do $$
begin
  perform public.tick_official_series();
exception when others then
  raise notice 'official series seed skipped: %', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule(j.jobid)
      from cron.job j
      where j.jobname = 'tick-official-series';
    exception when others then
      null;
    end;
    perform cron.schedule('tick-official-series', '* * * * *', 'select public.tick_official_series()');
  end if;
exception when others then
  raise notice 'pg_cron skipped: %', sqlerrm;
end $$;

notify pgrst, 'reload schema';
