-- Name the picture that is the workout card, so the feed can draw the card instead of showing it.
--
-- The card is a flattened JPEG, which made the image the source of truth for its own numbers: a walk
-- whose miles were repaired in the database kept printing "0.00 mi", and a card rasterized at quarter
-- scale kept showing as a thumb in the corner of an empty frame. Both are fixed by rebuilding the
-- card at render time from `posts.checkin_stats`, which every viewer of the post can already read.
--
-- To do that the client has to know which of a post's media IS the card, and it cannot work that out
-- on its own: `media_urls` is a flat list of signed URLs, the file name follows the proof slot's
-- method rather than saying "card", and `challenge_checkins.proof_parts` is readable only by
-- participants of that challenge. The server knows, because it already reads the Health slot to build
-- the stats. So it publishes that slot's URL alongside them.
--
-- No new column, no new table. `card_url` points at media already on the post, so it discloses
-- nothing the viewer could not see, and it still carries no vendor workout id and no body metrics.
-- Settlement, save_checkin_proof and submit_checkin are untouched.

-- Same body as before plus card_url, taken from the same slot the Health snapshot came from.
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

  -- The slot's own URL rides along with its snapshot. Selected together on purpose: picking the
  -- Health slot and the card out of separate queries could pair a snapshot with another slot's photo.
  select part.value -> 'health', nullif(btrim(coalesce(part.value ->> 'url', '')), '')
    into v_health, v_card_url
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

  -- Activity and pronoun alone are not a stats line. Checked before card_url is added, so a slot
  -- that holds only a picture and no numbers does not become a stats row with a URL in it.
  if v_stats - 'activity' - 'pronoun' = '{}'::jsonb then
    return null;
  end if;

  if v_card_url is not null then
    v_stats := v_stats || jsonb_build_object('card_url', v_card_url);
  end if;

  return v_stats;
end;
$$;

grant execute on function public.checkin_fitness_stats(uuid) to authenticated, service_role;

-- Keep card_url pointing at the card after the file behind it changes.
--
-- A card gets redrawn (the repair pass) or replaced (a retake), and each of those writes a new file
-- name. Without this the stats would still name the file the post no longer carries, and the feed
-- would fall back to showing the picture. One trigger covers every path that touches a proof slot,
-- rather than each of them remembering to refresh the stats.
create or replace function public.sync_checkin_stats_from_proofs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.posts
  set checkin_stats = coalesce(public.checkin_fitness_stats(new.id), checkin_stats)
  where checkin_id = new.id
    and deleted_at is null;
  return new;
end;
$$;

drop trigger if exists trg_sync_checkin_stats_from_proofs on public.challenge_checkins;
create trigger trg_sync_checkin_stats_from_proofs
  after update of proof_parts on public.challenge_checkins
  for each row
  when (new.proof_parts is distinct from old.proof_parts)
  execute function public.sync_checkin_stats_from_proofs();

-- Every workout post already in the feed gains card_url, so the cards posted before today are drawn
-- from their numbers too. coalesce keeps a post's existing stats when the function declines to build
-- any, rather than emptying a row that is already correct.
update public.posts p
set checkin_stats = coalesce(public.checkin_fitness_stats(p.checkin_id), p.checkin_stats)
where p.checkin_id is not null
  and p.deleted_at is null
  and p.checkin_stats is not null;
