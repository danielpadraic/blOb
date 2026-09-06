-- Put Apple's own word for the workout on the card.
--
-- The card's headline is the activity, and a card drawn from the post's numbers could only humanize
-- the stored type: "other" became "Other" on a game of pickleball, and "strength" became "Strength"
-- on High Intensity Interval Training. Apple's wording was captured at attach time and is sitting in
-- health_workouts.activity_label, but that table is owner-only, so a viewer cannot read it.
--
-- checkin_fitness_stats already runs as security definer to read the check-in, so it can read the
-- label too and publish it with the rest. An activity name is display-safe: it is not a vendor
-- workout id and not a body metric, and it is the same word already shown to anyone who can see the
-- picture of the card.
--
-- Same body as the card_url version plus activity_label.

create or replace function public.checkin_fitness_stats(p_checkin_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_challenge_id uuid;
  v_user_id uuid;
  v_category text;
  v_health jsonb;
  v_card_url text;
  v_workout_ref text;
  v_label text;
  v_pronoun text;
  v_stats jsonb := '{}'::jsonb;
  v_value numeric;
begin
  if p_checkin_id is null then
    return null;
  end if;

  select c.challenge_id, c.user_id into v_challenge_id, v_user_id
  from public.challenge_checkins c
  where c.id = p_checkin_id;

  if v_challenge_id is null then
    return null;
  end if;

  select lower(btrim(coalesce(ch.category, ''))) into v_category
  from public.challenges ch
  where ch.id = v_challenge_id;

  if coalesce(v_category, '') <> 'fitness' then
    return null;
  end if;

  -- The slot's URL and its workout reference ride along with its snapshot, selected together so a
  -- snapshot is never paired with another slot's photo or another workout's name.
  select
      part.value -> 'health',
      nullif(btrim(coalesce(part.value ->> 'url', '')), ''),
      nullif(btrim(coalesce(part.value ->> 'healthWorkoutId', '')), '')
    into v_health, v_card_url, v_workout_ref
  from public.challenge_checkins c
  cross join lateral jsonb_each(coalesce(c.proof_parts, '{}'::jsonb)) as part
  where c.id = p_checkin_id
    and jsonb_typeof(part.value -> 'health') = 'object'
  limit 1;

  if v_health is null then
    return null;
  end if;

  if coalesce(btrim(v_health ->> 'activityType'), '') <> '' then
    v_stats := v_stats || jsonb_build_object('activity', btrim(v_health ->> 'activityType'));
  end if;

  -- Checked against the uuid shape before casting: the slot is jsonb written by the client, and a
  -- malformed reference would otherwise abort the whole stats build over a cosmetic label.
  if v_workout_ref is not null and v_workout_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select nullif(btrim(coalesce(hw.activity_label, '')), '')
      into v_label
    from public.health_workouts hw
    where hw.id = v_workout_ref::uuid;
  end if;

  -- Subject pronoun for the prose, from the author's own profile. pronoun wins over gender.
  -- Only the pronoun travels onto the post; gender itself never leaves the profile.
  select case
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('he', 'him', 'he/him') then 'he'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('she', 'her', 'she/her') then 'she'
    when lower(btrim(coalesce(pr.pronoun, ''))) in ('they', 'them', 'they/them') then 'they'
    when lower(btrim(coalesce(pr.gender, ''))) = 'male' then 'he'
    when lower(btrim(coalesce(pr.gender, ''))) = 'female' then 'she'
    else null
  end
  into v_pronoun
  from public.profiles pr
  where pr.id = v_user_id;

  if v_pronoun is not null then
    v_stats := v_stats || jsonb_build_object('pronoun', v_pronoun);
  end if;

  v_value := public.checkin_stat_number(v_health, 'durationSec');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('duration_sec', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'activeEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('active_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'totalEnergyKcal');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('total_cal', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'minHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_min', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'avgHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_avg', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'maxHrBpm');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('hr_max', round(v_value));
  end if;

  v_value := public.checkin_stat_number(v_health, 'distanceMeters');
  if v_value is not null then
    v_stats := v_stats || jsonb_build_object('distance_m', round(v_value));
  end if;

  -- Activity, label and pronoun alone are not a stats line. Checked before the card URL and the
  -- label are added, so a slot holding only a picture does not become a stats row.
  if v_stats - 'activity' - 'pronoun' = '{}'::jsonb then
    return null;
  end if;

  if v_label is not null then
    v_stats := v_stats || jsonb_build_object('activity_label', v_label);
  end if;

  if v_card_url is not null then
    v_stats := v_stats || jsonb_build_object('card_url', v_card_url);
  end if;

  return v_stats;
end;
$$;

grant execute on function public.checkin_fitness_stats(uuid) to authenticated, service_role;

-- Existing workout posts pick up the label, so cards already in the feed name the activity Apple
-- named. coalesce keeps a post's stats when the function declines to build any.
update public.posts p
set checkin_stats = coalesce(public.checkin_fitness_stats(p.checkin_id), p.checkin_stats)
where p.checkin_id is not null
  and p.deleted_at is null
  and p.checkin_stats is not null;
