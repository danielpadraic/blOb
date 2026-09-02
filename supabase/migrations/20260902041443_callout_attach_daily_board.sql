-- Callout Slice 3: Board bind. Consistency = days. Points = task points (Prayer).
-- Accept still holds money. tick_settlements still skips is_callout.
-- Safe to re-run.

create or replace function public.attach_callout_challenge(p_callout public.callouts)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_task text;
  v_days int;
  v_ends timestamptz;
  v_id uuid;
  v_proofs jsonb;
  v_format text;
  v_points boolean;
  v_hr int;
begin
  if p_callout.challenge_id is not null then
    return p_callout.challenge_id;
  end if;

  v_title := coalesce(nullif(btrim(p_callout.win_condition), ''), nullif(btrim(p_callout.title), ''), 'Callout:');
  if lower(v_title) not like 'callout:%' then
    v_title := 'Callout: ' || v_title;
  end if;
  v_task := btrim(substr(v_title, 9));
  v_ends := coalesce(p_callout.deadline, now() + interval '7 days');
  v_days := greatest(1, ceil(extract(epoch from (v_ends - now())) / 86400.0)::int);
  v_proofs := public.callout_normalized_proofs(p_callout.proofs);
  v_format := public.callout_normalized_format(p_callout.format);
  v_points := v_format = 'points';
  v_hr := coalesce(
    (
      select max(greatest(coalesce((elem->>'minutes')::int, 30), 1))
      from jsonb_array_elements(v_proofs) elem
      where elem->>'method' = 'hr'
    ),
    30
  );

  insert into public.challenges (
    title,
    description,
    rules,
    created_by,
    buy_in_amount,
    days_required,
    min_minutes,
    proof_requirements,
    proofs,
    proof_type,
    proof_review,
    status,
    starts_at,
    ends_at,
    timezone,
    prize_pool,
    prize_structure,
    funding_model,
    creator_contribution,
    max_participants,
    min_participants,
    is_unlimited,
    category,
    challenge_type,
    visibility,
    privacy_mode,
    challenge_lane,
    currency,
    host_funded,
    host_budget,
    format,
    misses_allowed,
    payout_mode,
    start_rule,
    frequency,
    target_count,
    task,
    tasks,
    is_official,
    is_callout,
    is_sponsored,
    creator_participating,
    length_value,
    length_unit,
    scoring_method,
    profile_visibility
  ) values (
    v_title,
    v_task,
    v_title,
    p_callout.challenger_id,
    p_callout.stake_amount,
    v_days,
    v_hr,
    public.callout_proof_requirements(v_proofs),
    v_proofs,
    public.callout_first_proof_type(v_proofs),
    'auto',
    'live',
    now(),
    v_ends,
    'UTC',
    round(p_callout.stake_amount * 2, 2),
    case when v_points then 'winner_take_all' else 'equal_split' end,
    'participants',
    0,
    2,
    2,
    false,
    'other',
    v_format,
    'private',
    'private',
    'private',
    p_callout.currency,
    false,
    0,
    v_format,
    0,
    case when v_points then 'winner_take_all' else 'even_split_remaining' end,
    'legacy',
    'daily',
    v_days,
    v_task,
    case when v_points then jsonb_build_array(
      jsonb_build_object(
        'id', 'callout_task',
        'title', v_task,
        'points', 10,
        'proof_required', true,
        'once', false
      )
    ) else '[]'::jsonb end,
    false,
    true,
    false,
    true,
    v_days,
    'days',
    case when v_points then 'ranked' else 'consistency' end,
    'friends'
  )
  returning id into v_id;

  insert into public.challenge_participants (
    challenge_id, user_id, status, buy_in_paid, currency, result
  ) values
    (v_id, p_callout.challenger_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending'),
    (v_id, p_callout.opponent_id, 'active', p_callout.stake_amount, p_callout.currency, 'pending');

  update public.callouts
  set challenge_id = v_id, updated_at = now()
  where id = p_callout.id;

  return v_id;
end;
$$;

revoke all on function public.attach_callout_challenge(public.callouts) from public, anon, authenticated;
