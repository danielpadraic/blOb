-- Swapping the picture on a workout proof card that has already been posted.
--
-- save_checkin_proof cannot do this. It derives the period from now(), so it only ever writes the
-- current period's row -- pointing it at a check-in from an earlier day would quietly rewrite today's
-- instead. Repairing a card needs to name the check-in.
--
-- This is deliberately the narrowest possible write. It only ever replaces the image on a slot that
-- already holds a vendor Health receipt, and it touches nothing that decides whether the check-in
-- counts: not status, not submitted_at, not the period, not the health snapshot, not the caption, not
-- the content hash. A card is a picture of numbers that are already stored; drawing it again cannot
-- earn anybody a check-in they had not already earned.

create or replace function public.repair_checkin_workout_card(
  p_checkin_id uuid,
  p_proof_id text,
  p_url text,
  p_card_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c public.challenge_checkins%rowtype;
  ch public.challenges%rowtype;
  v_parts jsonb;
  v_part jsonb;
  v_name text;
  v_is_hr boolean;
  v_media text[];
  v_old_media text[];
  v_old_url text;
  v_captions text[];
  v_new_captions text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if coalesce(p_url, '') = '' then
    raise exception 'MISSING_CARD';
  end if;

  select * into c from public.challenge_checkins where id = p_checkin_id;
  -- Owner only. Nobody repairs a card on somebody else's check-in, even an admin.
  if not found or c.user_id is distinct from v_uid then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  select * into ch from public.challenges where id = c.challenge_id;
  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  v_parts := coalesce(c.proof_parts, '{}'::jsonb);
  v_part := v_parts -> p_proof_id;
  if v_part is null or v_part = 'null'::jsonb then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  -- The gate that keeps this from becoming a way to post arbitrary proof: the slot must already be a
  -- Health attach. A photo slot, an honor slot or a typed slot is refused outright.
  if coalesce(v_part->>'healthWorkoutId', '') = ''
     or (v_part->'health') is null
     or (v_part->'health') = 'null'::jsonb then
    raise exception 'NOT_A_WORKOUT_SLOT';
  end if;

  -- Kept so the caption and the legacy mirror that belonged to the old card can follow it.
  v_old_url := coalesce(v_part->>'url', '');

  select lower(coalesce(elem->>'name', '')) into v_name
  from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
  where coalesce(elem->>'id', '') = p_proof_id
  limit 1;
  v_is_hr := coalesce(v_part->>'method', '') = 'hr' or coalesce(v_name, '') like '%heart%';

  v_part := v_part || jsonb_build_object(
    'url', p_url,
    'urls', jsonb_build_array(p_url),
    'cardVersion', greatest(coalesce(p_card_version, 1), 1)
  );
  v_parts := v_parts || jsonb_build_object(p_proof_id, v_part);

  -- The media list is rebuilt from the slots PLUS these legacy single-url mirrors, so leaving a mirror
  -- pointing at the old file would put the old card on the post right beside the new one.
  update public.challenge_checkins
  set proof_parts = v_parts,
      hr_monitor_url = case
        when v_is_hr then p_url
        when v_old_url <> '' and hr_monitor_url = v_old_url then p_url
        else hr_monitor_url
      end,
      pre_selfie_url = case
        when v_old_url <> '' and pre_selfie_url = v_old_url then p_url
        else pre_selfie_url
      end,
      post_selfie_url = case
        when v_old_url <> '' and post_selfie_url = v_old_url then p_url
        else post_selfie_url
      end,
      updated_at = now()
  where id = c.id
  returning * into c;

  v_media := public.checkin_unique_urls(public.checkin_proof_media_urls(ch, v_parts, c));

  -- Captions are positional against media_urls, and a slot that had no card gains one, which shifts
  -- every position after it. So they are carried across by URL rather than by index: each picture keeps
  -- its own words, and a picture that is new to the array simply has none.
  select p.media_urls, p.media_captions into v_old_media, v_captions
  from public.posts p
  where p.checkin_id = c.id and p.deleted_at is null
  limit 1;

  if v_captions is not null then
    select array_agg(v_captions[array_position(v_old_media, look.url)] order by m.ord)
      into v_new_captions
    from unnest(v_media) with ordinality as m(url, ord)
    cross join lateral (
      -- The card's file name changes when it is drawn again, so its own caption is looked up under the
      -- URL it is replacing. Every other picture is matched by itself.
      select case when m.url = p_url and v_old_url <> '' then v_old_url else m.url end as url
    ) look;
  end if;

  update public.posts
  set media_urls = v_media,
      media_captions = v_new_captions
  where checkin_id = c.id and deleted_at is null;

  return jsonb_build_object('checkin_id', c.id, 'media', to_jsonb(v_media));
end;
$$;

revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer) from public;
revoke all on function public.repair_checkin_workout_card(uuid, text, text, integer) from anon;
grant execute on function public.repair_checkin_workout_card(uuid, text, text, integer) to authenticated;
