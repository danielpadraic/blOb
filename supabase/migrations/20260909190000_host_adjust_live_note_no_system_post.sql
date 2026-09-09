-- Host Count / Excuse / Remove: Board RPC only. Do not insert posts.
-- The client writes one normal Live/lobby post (no system_kind).
-- host_counted_day is not written. Many Counts in one challenge must all succeed.
-- Does not change save_checkin_proof / submit_checkin, settlement, wallets,
-- or write_coin_ledger grants.
-- Apply in SQL Editor on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

create or replace function public.host_adjust_checkin(
  p_challenge_id uuid,
  p_user_id uuid,
  p_action text,
  p_period_start timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  cp public.challenge_participants%rowtype;
  v_action text;
  v_row public.challenge_checkins%rowtype;
  v_honor jsonb := jsonb_build_object('honor', jsonb_build_object('method', 'honor'));
  v_name text;
  v_days int := 0;
  v_misses int := 0;
  v_allow int := 0;
  v_status text;
  v_period_key date := null;
  v_day_n int := null;
  v_win_start timestamptz := null;
  v_deleted int := 0;
  v_complete boolean := false;
begin
  v_action := lower(btrim(coalesce(p_action, '')));
  if auth.uid() is null then
    raise exception 'Only the host can change the Board.';
  end if;
  if v_action not in ('count_honor', 'excuse_miss', 'remove_counted') then
    raise exception 'Only the host can change the Board.';
  end if;

  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;
  if not public.host_adjust_is_actor(ch) then
    raise exception 'Only the host can change the Board.';
  end if;

  if coalesce(ch.is_official, false)
     or coalesce(ch.series_id, '') <> ''
     or coalesce(ch.host_budget, 0) > 0 then
    raise exception 'This Official challenge can’t be adjusted.';
  end if;

  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'This challenge has already ended.';
  end if;

  if lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative')
     or lower(coalesce(ch.format, '')) in ('points', 'cumulative')
     or coalesce(ch.scoring_method, '') = 'comparable_points' then
    raise exception 'Only the host can change the Board.';
  end if;

  select * into cp
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Only the host can change the Board.';
  end if;
  if coalesce(cp.status, '') = 'refunded_pre_start' then
    raise exception 'Only the host can change the Board.';
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');
  v_allow := greatest(coalesce(ch.misses_allowed, 0), 0);

  if v_action <> 'excuse_miss' then
    if p_period_start is null then
      raise exception 'Only the host can change the Board.';
    end if;
    select w.day_n, w.period_key, w.starts_at
      into v_day_n, v_period_key, v_win_start
    from public.host_adjust_windows(ch) w
    where w.starts_at <= now()
      and (
        abs(extract(epoch from (w.starts_at - p_period_start))) < 2
        or w.period_key = (timezone(coalesce(nullif(btrim(ch.timezone), ''), 'America/Denver'), p_period_start))::date
      )
    order by abs(extract(epoch from (w.starts_at - p_period_start)))
    limit 1;
    if not found or v_period_key is null then
      raise exception 'Only the host can change the Board.';
    end if;
  end if;

  if v_action = 'count_honor' then
    select exists (
      select 1
      from public.challenge_checkins k
      where k.challenge_id = p_challenge_id
        and k.user_id = p_user_id
        and k.period_key = v_period_key
        and k.status = 'submitted'
        and k.submitted_at is not null
    ) into v_complete;
    if v_complete then
      raise exception 'That day already counts.';
    end if;

    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key
      and (status is distinct from 'submitted' or submitted_at is null)
    order by checkin_slot
    limit 1
    for update;

    if found then
      update public.challenge_checkins
        set status = 'submitted',
            submitted_at = coalesce(submitted_at, now()),
            proof_parts = case
              when proof_parts ? 'honor' then proof_parts
              else coalesce(proof_parts, '{}'::jsonb) || v_honor
            end,
            notes = coalesce(nullif(btrim(notes), ''), 'Honor check-in'),
            updated_at = now()
      where id = v_row.id;
    else
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, checkin_slot, status, proof_parts, notes,
        started_at, submitted_at
      ) values (
        p_user_id, p_challenge_id, v_period_key, 1, 'submitted', v_honor, 'Honor check-in',
        v_win_start, v_win_start
      );
    end if;

    insert into public.workout_submissions (
      challenge_id, user_id, submission_date, notes, status, proof_parts, proof_kind, checkin_slot
    ) values (
      p_challenge_id, p_user_id, v_period_key, 'Honor check-in', 'approved', v_honor, 'honor', 1
    )
    on conflict (challenge_id, user_id, submission_date, checkin_slot) do nothing;

    delete from public.challenge_period_misses
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key;
  elsif v_action = 'excuse_miss' then
    delete from public.challenge_period_misses
    where ctid in (
      select m.ctid
      from public.challenge_period_misses m
      where m.challenge_id = p_challenge_id
        and m.user_id = p_user_id
      order by m.period_key desc
      limit 1
    );
    get diagnostics v_deleted = row_count;
    if v_deleted = 0 then
      raise exception 'They don’t have a miss to excuse.';
    end if;
  elsif v_action = 'remove_counted' then
    select * into v_row
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and period_key = v_period_key
      and status = 'submitted'
      and submitted_at is not null
    order by checkin_slot
    limit 1
    for update;
    if not found then
      raise exception 'Only the host can change the Board.';
    end if;
    update public.challenge_checkins
      set status = 'in_progress',
          updated_at = now()
    where id = v_row.id;
    insert into public.challenge_period_misses (challenge_id, user_id, period_key)
    values (p_challenge_id, p_user_id, v_period_key)
    on conflict do nothing;
  end if;

  perform public.refresh_participant_progress(p_challenge_id, p_user_id);

  select count(*)::int into v_misses
  from public.challenge_period_misses
  where challenge_id = p_challenge_id and user_id = p_user_id;

  select status, days_completed into v_status, v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;

  if coalesce(v_status, '') in ('eliminated', 'failed') and v_misses <= v_allow then
    update public.challenge_participants
      set status = 'joined',
          eliminated_at = null
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and status in ('eliminated', 'failed');
    v_status := 'joined';
  elsif v_action = 'remove_counted'
        and coalesce(v_status, '') not in ('withdrawn', 'completed', 'refunded_pre_start')
        and v_misses > v_allow then
    update public.challenge_participants
      set status = 'eliminated',
          eliminated_at = coalesce(eliminated_at, now())
    where challenge_id = p_challenge_id
      and user_id = p_user_id;
    v_status := 'eliminated';
  end if;

  begin
    insert into public.host_adjust_audit (challenge_id, actor_id, target_user_id, action, period_key)
    values (p_challenge_id, auth.uid(), p_user_id, v_action, v_period_key);
  exception when others then
    null;
  end;

  select days_completed into v_days
  from public.challenge_participants
  where challenge_id = p_challenge_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'action', v_action,
    'user_id', p_user_id,
    'display_name', v_name,
    'status', v_status,
    'days_completed', coalesce(v_days, 0),
    'misses_used', v_misses,
    'period_key', v_period_key,
    'day_n', v_day_n
  );
end;
$$;

revoke execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) from anon, public;
grant execute on function public.host_adjust_checkin(uuid, uuid, text, timestamp with time zone) to authenticated;

notify pgrst, 'reload schema';

select
  p.proname,
  pg_get_functiondef(p.oid) like '%host_counted_day%' as writes_host_counted_day,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_ex,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ex
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('host_adjust_checkin', 'write_coin_ledger')
order by p.proname;
