-- Honor increments for comparable_points: many check-ins + Live posts
-- while live. Each Send is a new challenge_checkins row (new checkin_id)
-- and a new Live post. Board SUMs increments. Author may edit THAT
-- increment. 30-Day / consistency stays one required proof per period.
--
-- Do NOT touch posts_one_live_checkin_idx. That index is unique on
-- checkin_id (one Live post per honor/fitness check-in), which is correct.
-- Do NOT db push --include-all. Paste this file in the SQL editor.
-- Do NOT mutate TEST — Rookies vs. Veterans (8fce711b).

create or replace function public.challenge_is_quantity_or_points_race(ch public.challenges)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    coalesce(ch.scoring_method, '') = 'comparable_points'
    or lower(coalesce(ch.format, '')) in ('points', 'cumulative', 'distance', 'goal')
    or lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative', 'distance', 'goal')
    or public.challenge_is_cumulative(ch)
    or coalesce(ch.cumulative_target, 0) > 0
    or coalesce(ch.title, '') ~* '[1-9][0-9]+(\.[0-9]+)?\s*(mi|miles?)\b'
    or coalesce(ch.task, '') ~* '[1-9][0-9]+(\.[0-9]+)?\s*(mi|miles?)\b'
    or (
      jsonb_typeof(coalesce(ch.metrics, '[]'::jsonb)) = 'array'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(ch.metrics, '[]'::jsonb)) elem
        where case
          when jsonb_typeof(elem->'target') = 'number' then (elem->>'target')::numeric
          when coalesce(elem->>'target', '') ~ '^[0-9]+(\.[0-9]+)?$' then (elem->>'target')::numeric
          else 0
        end > 0
      )
    );
$$;

comment on function public.challenge_is_quantity_or_points_race(public.challenges) is
  'True when Check In may insert another row on the same period_key: comparable_points, quantity, or points races. Consistency / 30-Day stay one per period.';

create or replace function public.edit_honor_checkin_increment(
  p_checkin_id uuid,
  p_metric_values jsonb,
  p_notes text default null,
  p_log_choices jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.challenge_checkins%rowtype;
  ch public.challenges%rowtype;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_amount numeric;
  v_parts jsonb;
  v_caption text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_checkin_id is null then
    raise exception 'Check-in not found' using errcode = 'P0002';
  end if;

  select * into v_row
  from public.challenge_checkins
  where id = p_checkin_id
  for update;
  if not found then
    raise exception 'Check-in not found' using errcode = 'P0002';
  end if;
  if v_row.user_id is distinct from v_uid then
    raise exception 'You can only edit your own check-in.';
  end if;

  select * into ch
  from public.challenges
  where id = v_row.challenge_id
  for update;
  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;
  if coalesce(ch.scoring_method, '') is distinct from 'comparable_points' then
    raise exception 'This check-in cannot be edited.';
  end if;
  if coalesce(ch.status, '') in (
    'settled',
    'settling',
    'ended',
    'cancelled',
    'cancelled_underfilled',
    'judging',
    'distributing'
  ) then
    raise exception 'This challenge is settled.';
  end if;

  if jsonb_typeof(coalesce(p_metric_values, '{}'::jsonb)) = 'object' then
    for v_key, v_amount in
      select e.key, e.value::numeric
      from jsonb_each_text(p_metric_values) as e(key, value)
    loop
      if v_key <> '' and v_amount is not null and v_amount >= 0 then
        v_clean := v_clean || jsonb_build_object(v_key, v_amount);
      end if;
    end loop;
  end if;

  v_parts := coalesce(v_row.proof_parts, '{}'::jsonb);
  if p_log_choices is not null and jsonb_typeof(p_log_choices) = 'object' then
    v_parts := v_parts || jsonb_build_object('log_choices', p_log_choices);
  end if;

  v_caption := nullif(btrim(coalesce(p_notes, v_row.notes, '')), '');
  if v_caption is null then
    v_caption := 'Check-in Complete';
  end if;

  update public.challenge_checkins
    set metric_values = v_clean,
        notes = v_caption,
        proof_parts = v_parts,
        updated_at = now()
    where id = v_row.id
    returning * into v_row;

  perform public.apply_comparable_points(v_row.challenge_id, v_row.user_id, v_row.id);
  perform public.refresh_participant_progress(v_row.challenge_id, v_row.user_id);

  update public.posts
    set content = v_caption,
        edited_at = now()
    where checkin_id = v_row.id
      and deleted_at is null;

  return public.checkin_row_json(v_row.id);
end;
$$;

revoke all on function public.edit_honor_checkin_increment(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.edit_honor_checkin_increment(uuid, jsonb, text, jsonb) to authenticated, service_role;

comment on function public.edit_honor_checkin_increment(uuid, jsonb, text, jsonb) is
  'Author edits one comparable_points honor increment. Board recalculates from all increments. Live shows Edited. No delete. No edit after settled.';
