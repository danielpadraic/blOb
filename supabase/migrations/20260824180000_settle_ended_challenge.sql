-- Atomic even-split settlement. Idempotent. Remaining = proven check-in progress.
-- 0 remaining → forfeit, no refund. Auto-runs from tick_settlements().

alter table public.challenges drop constraint if exists challenges_status_allowed;
alter table public.challenges
  add constraint challenges_status_allowed
  check (status = any (array[
    'draft', 'upcoming', 'open', 'starting', 'in_progress', 'filling', 'arming',
    'live', 'ended', 'settling', 'judging', 'distributing', 'settled',
    'cancelled_underfilled', 'cancelled'
  ]));

create unique index if not exists challenge_settlements_challenge_id_uidx
  on public.challenge_settlements (challenge_id);

create or replace function public.even_split_shares(p_pool numeric, p_count int)
returns numeric[]
language plpgsql
immutable
as $$
declare
  v_share numeric;
  v_left numeric;
  v_i int;
  v_out numeric[] := '{}';
begin
  if p_count is null or p_count <= 0 then
    return '{}';
  end if;
  v_share := round(coalesce(p_pool, 0) / p_count, 2);
  v_left := round(coalesce(p_pool, 0) - (v_share * p_count), 2);
  for v_i in 1..p_count loop
    v_out := v_out || (v_share + case when v_i = p_count then v_left else 0 end);
  end loop;
  return v_out;
end;
$$;

create or replace function public.settlement_required_days(p_challenge public.challenges)
returns int
language sql
immutable
as $$
  select greatest(
    coalesce(p_challenge.target_count, 0),
    coalesce(p_challenge.days_required, 0),
    coalesce(p_challenge.required_checkins, 0),
    1
  );
$$;

create or replace function public.settlement_proven_days(p_challenge_id uuid, p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_official boolean;
  v_days int := 0;
begin
  select coalesce(is_official, false) into v_official
  from public.challenges
  where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  if v_official then
    begin
      return public.official_valid_day_count(p_challenge_id, p_user_id);
    exception when others then
      null;
    end;
  end if;
  select coalesce(days_completed, 0) into v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;
  return coalesce(v_days, 0);
end;
$$;

create or replace function public.settlement_is_even_split(p_challenge public.challenges)
returns boolean
language sql
immutable
as $$
  select coalesce(p_challenge.is_unlimited, false) = false
    and coalesce(p_challenge.end_mode, '') is distinct from 'indefinite_lms'
    and coalesce(p_challenge.challenge_type, '') is distinct from 'lms'
    and coalesce(p_challenge.prize_structure, 'equal_split') not in ('winner_take_all', 'top_places');
$$;

create or replace function public.settlement_clock_ended(p_challenge public.challenges)
returns boolean
language sql
stable
as $$
  select p_challenge.ends_at is not null and now() >= p_challenge.ends_at;
$$;

create or replace function public.settlement_all_remaining_submitted(p_challenge_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_need int;
  v_in int := 0;
  v_done int := 0;
begin
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return false;
  end if;
  v_need := public.settlement_required_days(v_c);
  select count(*) into v_in
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed');
  select count(*) into v_done
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;
  return v_in > 0 and v_in = v_done;
end;
$$;

create or replace function public.settlement_should_run(p_challenge public.challenges)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_challenge.distributed_at is not null or p_challenge.status = 'settled' then
    return false;
  end if;
  if p_challenge.status in ('cancelled', 'cancelled_underfilled', 'draft') then
    return false;
  end if;
  if not public.settlement_is_even_split(p_challenge) then
    return false;
  end if;
  if public.settlement_clock_ended(p_challenge) then
    return true;
  end if;
  return public.settlement_all_remaining_submitted(p_challenge.id);
end;
$$;

create or replace function public.settlement_format_amount(p_amount numeric, p_currency text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_currency, 'coins') = 'coins' then
      trim(to_char(round(coalesce(p_amount, 0), 2), 'FM999999990.##'))
    else
      '$' || to_char(round(coalesce(p_amount, 0), 2), 'FM999999990.00')
  end;
$$;

create or replace function public.get_challenge_settlement(p_challenge_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s public.challenge_settlements%rowtype;
begin
  select * into v_s from public.challenge_settlements where challenge_id = p_challenge_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'already_settled', true,
    'ok', true,
    'forfeit', coalesce(v_s.winner_count, 0) = 0,
    'settlement', jsonb_build_object(
      'id', v_s.id,
      'challenge_id', v_s.challenge_id,
      'settled_by', v_s.settled_by,
      'prize_pool', v_s.prize_pool,
      'distributed', v_s.distributed,
      'prize_structure', v_s.prize_structure,
      'winner_count', v_s.winner_count,
      'settled_at', v_s.settled_at,
      'currency', v_s.currency
    ),
    'payouts', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', p.user_id,
          'amount', p.amount,
          'place', 1,
          'score', 0,
          'reason', 'distribute_win'
        )
        order by p.created_at, p.user_id
      )
      from public.challenge_payouts p
      where p.challenge_id = p_challenge_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.notify_challenge_settled(
  p_challenge_id uuid,
  p_title text,
  p_forfeit boolean,
  p_post_id uuid,
  p_currency text default 'coins'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  win record;
  v_name text;
  v_pronoun text;
  v_copy text;
  v_host uuid;
begin
  select created_by into v_host from public.challenges where id = p_challenge_id;
  if p_forfeit then
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        p_title || ' settled. Nobody remaining. Prize forfeited.',
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'forfeit', true,
          'dedupe_key', 'settle:' || p_challenge_id
        )
      );
    end loop;
    return;
  end if;

  for win in
    select user_id, amount from public.challenge_payouts where challenge_id = p_challenge_id
  loop
    v_name := public.profile_display_name(win.user_id);
    v_pronoun := coalesce(public.profile_object_pronoun(win.user_id), 'them');
    v_copy := v_name || ' Settled @' || p_title || '. Congratulate ' || v_pronoun || '.';
    perform public.notify_user(
      win.user_id,
      v_host,
      'payout_received',
      'You received ' || public.settlement_format_amount(win.amount, p_currency) || ' from @' || p_title || '.',
      null,
      jsonb_build_object(
        'type', 'payout_received',
        'challengeId', p_challenge_id,
        'challenge_id', p_challenge_id,
        'amount', win.amount,
        'dedupe_key', 'payout:' || p_challenge_id || ':' || win.user_id
      )
    );
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and user_id is distinct from win.user_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        win.user_id,
        'challenge_settled',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'actorId', win.user_id,
          'postId', p_post_id,
          'dedupe_key', 'settle:' || p_challenge_id || ':' || win.user_id
        )
      );
    end loop;
  end loop;
end;
$$;

create or replace function public.settle_ended_challenge(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_need int;
  v_pool numeric;
  v_winners uuid[];
  v_shares numeric[];
  v_i int;
  v_slices jsonb := '[]'::jsonb;
  v_existing jsonb;
  v_title text;
  v_author uuid;
  v_post uuid;
  v_count int := 0;
  v_currency text;
begin
  if p_challenge_id is null then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_existing := public.get_challenge_settlement(p_challenge_id);
  if v_existing is not null then
    if v_c.status is distinct from 'settled' then
      update public.challenges
      set status = 'settled',
          distributed_at = coalesce(distributed_at, now()),
          updated_at = now()
      where id = p_challenge_id;
    end if;
    return v_existing;
  end if;

  if v_c.distributed_at is not null or v_c.status = 'settled' then
    return jsonb_build_object(
      'already_settled', true,
      'ok', true,
      'forfeit', true,
      'payouts', '[]'::jsonb
    );
  end if;

  if not public.settlement_is_even_split(v_c) then
    raise exception 'NOT_EVEN_SPLIT';
  end if;

  if not public.settlement_should_run(v_c) then
    raise exception 'CHALLENGE_NOT_ENDED';
  end if;

  if v_c.status is distinct from 'settling' then
    update public.challenges
    set status = 'settling', updated_at = now()
    where id = p_challenge_id;
  end if;

  v_need := public.settlement_required_days(v_c);
  v_pool := round(coalesce(v_c.prize_pool, 0), 2);
  v_currency := coalesce(v_c.currency, 'coins');
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'this challenge');
  v_author := coalesce(
    v_c.created_by,
    (select user_id from public.challenge_participants where challenge_id = p_challenge_id limit 1)
  );

  select coalesce(array_agg(p.user_id order by p.joined_at, p.user_id), '{}')
    into v_winners
  from public.challenge_participants p
  where p.challenge_id = p_challenge_id
    and p.eliminated_at is null
    and coalesce(p.status, 'joined') not in ('refunded_pre_start', 'withdrawn', 'eliminated', 'failed')
    and public.settlement_proven_days(p_challenge_id, p.user_id) >= v_need;

  v_count := coalesce(array_length(v_winners, 1), 0);
  v_shares := public.even_split_shares(v_pool, v_count);

  if v_count = 0 or v_pool <= 0 then
    insert into public.challenge_settlements (
      challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
    ) values (
      p_challenge_id, null, v_pool, '[]'::jsonb, 'equal_split', 0, v_currency
    )
    on conflict (challenge_id) do nothing;

    update public.challenges
    set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
    where id = p_challenge_id;

    insert into public.posts (
      author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
    )
    select
      v_author,
      p_challenge_id,
      v_title || ' settled. Nobody remaining. Prize forfeited.',
      '{}',
      'public',
      '{}',
      'challenge',
      'settlement_result'
    where v_author is not null
      and not exists (
        select 1 from public.posts
        where challenge_id = p_challenge_id
          and system_kind = 'settlement_result'
          and deleted_at is null
      )
    returning id into v_post;

    if v_author is not null
      and public.challenge_allows_main_feed_announce(v_c)
      and not exists (
        select 1 from public.posts
        where challenge_id = p_challenge_id
          and system_kind = 'settlement_result_main'
          and deleted_at is null
      )
    then
      insert into public.posts (
        author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
      ) values (
        v_author,
        p_challenge_id,
        v_title || ' settled. Nobody remaining. Prize forfeited.',
        '{}',
        'public',
        '{}',
        'feed',
        'settlement_result_main'
      );
    end if;

    perform public.notify_challenge_settled(p_challenge_id, v_title, true, v_post, v_currency);
    return public.get_challenge_settlement(p_challenge_id);
  end if;

  for v_i in 1..v_count loop
    perform public.official_credit_payout(
      p_challenge_id,
      v_winners[v_i],
      v_currency,
      v_shares[v_i],
      'distribute_win'
    );
    update public.wallet_ledger
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'stripe_transfer_status', 'pending_internal',
      'settlement', true
    )
    where challenge_id = p_challenge_id
      and user_id = v_winners[v_i]
      and entry_type = 'distribute_win';
    v_slices := v_slices || jsonb_build_array(jsonb_build_object(
      'user_id', v_winners[v_i],
      'amount', v_shares[v_i],
      'place', 1,
      'reason', 'distribute_win'
    ));
  end loop;

  insert into public.challenge_settlements (
    challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, currency
  ) values (
    p_challenge_id, null, v_pool, v_slices, 'equal_split', v_count, v_currency
  )
  on conflict (challenge_id) do nothing;

  update public.challenges
  set prize_pool = 0, distributed_at = now(), status = 'settled', updated_at = now()
  where id = p_challenge_id;

  insert into public.posts (
    author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
  )
  select
    v_author,
    p_challenge_id,
    v_title || ' settled. ' || v_count || ' remaining split the prize.',
    '{}',
    'public',
    '{}',
    'challenge',
    'settlement_result'
  where v_author is not null
    and not exists (
      select 1 from public.posts
      where challenge_id = p_challenge_id
        and system_kind = 'settlement_result'
        and deleted_at is null
    )
  returning id into v_post;

  if v_author is not null
    and public.challenge_allows_main_feed_announce(v_c)
    and not exists (
      select 1 from public.posts
      where challenge_id = p_challenge_id
        and system_kind = 'settlement_result_main'
        and deleted_at is null
    )
  then
    insert into public.posts (
      author_id, challenge_id, content, media_urls, audience, audience_user_ids, source, system_kind
    ) values (
      v_author,
      p_challenge_id,
      v_title || ' settled. ' || v_count || ' remaining split the prize.',
      '{}',
      'public',
      '{}',
      'feed',
      'settlement_result_main'
    );
  end if;

  perform public.notify_challenge_settled(p_challenge_id, v_title, false, v_post, v_currency);
  return public.get_challenge_settlement(p_challenge_id);
exception
  when unique_violation then
    return public.get_challenge_settlement(p_challenge_id);
end;
$$;

create or replace function public.tick_settlements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select c.id
    from public.challenges c
    where c.distributed_at is null
      and c.status in ('live', 'in_progress', 'ended', 'settling', 'judging', 'distributing')
      and public.settlement_is_even_split(c)
      and public.settlement_should_run(c)
    for update skip locked
  loop
    begin
      update public.challenges
      set status = 'settling', updated_at = now()
      where id = rec.id and status is distinct from 'settled';
      perform public.settle_ended_challenge(rec.id);
    exception when others then
      null;
    end;
  end loop;
end;
$$;

revoke all on function public.settle_ended_challenge(uuid) from public, anon;
grant execute on function public.settle_ended_challenge(uuid) to authenticated, service_role;
grant execute on function public.tick_settlements() to authenticated, service_role;
grant execute on function public.get_challenge_settlement(uuid) to anon, authenticated, service_role;
grant execute on function public.even_split_shares(numeric, int) to anon, authenticated, service_role;
grant execute on function public.settlement_proven_days(uuid, uuid) to authenticated, service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenges'
  ) then
    execute 'alter publication supabase_realtime add table public.challenges';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenge_settlements'
  ) then
    execute 'alter publication supabase_realtime add table public.challenge_settlements';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'challenge_payouts'
  ) then
    execute 'alter publication supabase_realtime add table public.challenge_payouts';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallet_ledger'
  ) then
    execute 'alter publication supabase_realtime add table public.wallet_ledger';
  end if;
end $$;

alter table public.challenges replica identity full;
alter table public.challenge_settlements replica identity full;
alter table public.challenge_payouts replica identity full;
alter table public.wallet_ledger replica identity full;

notify pgrst, 'reload schema';
