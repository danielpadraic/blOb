-- One Official check-in is on both Lives. One recap is the last slide.
-- Does not change which proof counts. A card file is not a selfie.

create or replace function public.collapse_post_recap_media(p_urls text[], p_card text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  v_url text;
  v_path text;
  v_stills text[] := '{}';
  v_extras text[] := '{}';
  v_seen text[] := '{}';
  v_card text := nullif(btrim(coalesce(p_card, '')), '');
begin
  if v_card is not null and position('workout_card' in split_part(v_card, '?', 1)) = 0 then
    v_card := null;
  end if;
  foreach v_url in array coalesce(p_urls, '{}')
  loop
    v_url := btrim(coalesce(v_url, ''));
    v_path := split_part(v_url, '?', 1);
    if v_url = '' or v_url like 'file:%' or v_url like 'health:%' or position('blob-workout-proof' in v_url) > 0 then
      continue;
    end if;
    if position('workout_card' in v_path) > 0 then
      if v_card is null then
        v_card := v_url;
      end if;
      continue;
    end if;
    if v_path = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_path;
    if position('checkin-extra-' in v_path) > 0 then
      v_extras := v_extras || v_url;
    else
      v_stills := v_stills || v_url;
    end if;
  end loop;
  if v_card is null then
    v_stills := v_stills || v_extras;
  else
    v_stills := v_stills || v_card;
  end if;
  return v_stills;
end;
$$;

revoke all on function public.collapse_post_recap_media(text[], text) from public, anon, authenticated;

update public.posts p
set media_urls = public.collapse_post_recap_media(p.media_urls, p.checkin_stats->>'card_url')
where p.deleted_at is null
  and p.source = 'checkin'
  and p.media_urls is not null
  and (
    exists (
      select 1 from unnest(p.media_urls) u
      where u like 'file:%'
         or position('blob-workout-proof' in u) > 0
         or (
           position('workout_card' in split_part(u, '?', 1)) > 0
           and position('checkin-extra-' in array_to_string(p.media_urls, ' ')) > 0
         )
    )
    or (
      select count(*) from unnest(p.media_urls) u
      where position('workout_card' in split_part(u, '?', 1)) > 0
    ) > 1
  );

-- Move a recap JPEG off the selfie slot. Health still satisfies the slot.
update public.challenge_checkins c
set proof_parts = repaired.parts
from (
  select
    id,
    (
      select jsonb_object_agg(slot, part)
      from (
        select
          e.key as slot,
          case
            when position('workout_card' in split_part(coalesce(e.value->>'url', ''), '?', 1)) > 0
              and coalesce(e.value->>'healthWorkoutId', e.value->>'health_workout_id', '') <> ''
            then (e.value - 'urls')
              || jsonb_build_object(
                'url', '',
                'urls', '[]'::jsonb,
                'cardUrl', coalesce(nullif(e.value->>'cardUrl', ''), e.value->>'url')
              )
            else e.value
          end as part
        from jsonb_each(proof_parts) e
      ) s
    ) as parts
  from public.challenge_checkins
  where proof_parts is not null
) repaired
where c.id = repaired.id
  and c.proof_parts::text like '%workout_card%'
  and repaired.parts is not null
  and repaired.parts is distinct from c.proof_parts;

-- Today's Chicago day: a Weekly Live post with no Monthly Live post gets the twin.
do $$
declare
  rec record;
  v_day date := (now() at time zone 'America/Chicago')::date;
begin
  for rec in
    select ch.id
    from public.challenge_checkins ch
    join public.challenges c on c.id = ch.challenge_id
    where c.official_kind = 'coin_weekly'
      and ch.period_key = v_day
      and exists (
        select 1 from public.posts p
        where p.checkin_id = ch.id
          and p.deleted_at is null
          and p.source = 'checkin'
          and p.challenge_id = ch.challenge_id
      )
      and not exists (
        select 1
        from public.challenge_checkins m
        join public.challenges mc on mc.id = m.challenge_id and mc.official_kind = 'coin_monthly'
        join public.posts mp on mp.checkin_id = m.id
          and mp.challenge_id = m.challenge_id
          and mp.deleted_at is null
          and mp.source = 'checkin'
        where m.user_id = ch.user_id
          and m.period_key = ch.period_key
      )
  loop
    perform public.perform_official_pair_live(rec.id);
  end loop;
end;
$$;
