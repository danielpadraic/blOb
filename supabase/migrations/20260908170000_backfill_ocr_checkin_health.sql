-- Fill empty screenshot health on an existing check-in. Service role only.
--
-- The live Send path already stores proof_parts[slot].health with source = ocr and the stats
-- trigger copies that onto posts.checkin_stats. Old screenshot check-ins never got that write.
-- This helper is the same write, with extra locks so a backfill cannot:
--   - overwrite HealthKit / Health Connect
--   - invent numbers (the caller must pass a parsed ocr snapshot)
--   - clear or replace the proof photo
--   - create a second Live post
--   - touch settlement or the coin ledger
--
-- p_clear_proof is not a parameter. The slot URL is compared before and after and must not move.

create or replace function public.backfill_ocr_checkin_health(
  p_checkin_id uuid,
  p_proof_id text,
  p_health jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.challenge_checkins%rowtype;
  ch public.challenges%rowtype;
  v_parts jsonb;
  v_part jsonb;
  v_method text;
  v_url text;
  v_urls jsonb;
  v_old_url text;
  v_health jsonb;
  v_source text;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'SERVICE_ROLE_ONLY';
  end if;
  if p_checkin_id is null or coalesce(p_proof_id, '') = '' then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;
  if jsonb_typeof(p_health) is distinct from 'object' then
    raise exception 'BAD_HEALTH';
  end if;
  if coalesce(p_health->>'source', '') is distinct from 'ocr' then
    raise exception 'BAD_HEALTH';
  end if;
  if coalesce(public.checkin_stat_number(p_health, 'durationSec'), 0) <= 0
     and coalesce(public.checkin_stat_number(p_health, 'activeEnergyKcal'), 0) <= 0
     and coalesce(public.checkin_stat_number(p_health, 'totalEnergyKcal'), 0) <= 0
     and coalesce(public.checkin_stat_number(p_health, 'distanceMeters'), 0) <= 0
     and coalesce(public.checkin_stat_number(p_health, 'avgHrBpm'), 0) <= 0
     and coalesce(public.checkin_stat_number(p_health, 'maxHrBpm'), 0) <= 0 then
    raise exception 'BAD_HEALTH';
  end if;

  select * into c from public.challenge_checkins where id = p_checkin_id;
  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  select * into ch from public.challenges where id = c.challenge_id;
  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  v_parts := coalesce(c.proof_parts, '{}'::jsonb);
  v_part := v_parts -> p_proof_id;
  if v_part is null or v_part = 'null'::jsonb or jsonb_typeof(v_part) is distinct from 'object' then
    raise exception 'SLOT_NOT_FOUND';
  end if;

  v_old_url := coalesce(v_part->>'url', '');
  v_urls := v_part -> 'urls';

  v_method := lower(btrim(coalesce(v_part->>'method', '')));
  if v_method = '' then
    select lower(btrim(coalesce(p->>'method', ''))) into v_method
    from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) p
    where p->>'id' = p_proof_id
    limit 1;
  end if;
  if v_method is distinct from 'hr' and v_method is distinct from 'distance' then
    raise exception 'NOT_HR_DISTANCE';
  end if;

  if coalesce(v_part->>'healthWorkoutId', '') <> '' then
    raise exception 'HAS_WORKOUT_CARD';
  end if;

  v_url := coalesce(v_part->>'url', '');
  if v_url = '' or v_url like 'health:%' then
    if jsonb_typeof(v_urls) = 'array' and jsonb_array_length(v_urls) > 0 then
      if jsonb_typeof(v_urls -> 0) = 'string' then
        v_url := coalesce(v_urls ->> 0, '');
      elsif jsonb_typeof(v_urls -> 0) = 'object' then
        v_url := coalesce(v_urls -> 0 ->> 'url', '');
      end if;
    end if;
  end if;
  if v_url = '' or v_url like 'health:%' then
    raise exception 'NO_STILL';
  end if;
  if v_url ~* '\.(mov|mp4|m4v|webm|avi)(\?|$)'
     or coalesce(v_part->>'mime', '') ilike 'video/%'
     or coalesce(v_part->>'mimeType', '') ilike 'video/%' then
    raise exception 'VIDEO_STILL';
  end if;

  v_health := case
    when jsonb_typeof(v_part -> 'health') = 'object' then v_part -> 'health'
    else null
  end;
  v_source := lower(btrim(coalesce(v_health->>'source', '')));
  if v_source in ('healthkit', 'health_connect') then
    raise exception 'HAS_VENDOR';
  end if;
  if v_source = ''
     and coalesce(v_health->>'startedAt', '') <> ''
     and coalesce(v_health->>'endedAt', '') <> '' then
    raise exception 'HAS_VENDOR';
  end if;
  if coalesce(public.checkin_stat_number(v_health, 'durationSec'), 0) > 0
     or coalesce(public.checkin_stat_number(v_health, 'activeEnergyKcal'), 0) > 0
     or coalesce(public.checkin_stat_number(v_health, 'totalEnergyKcal'), 0) > 0
     or coalesce(public.checkin_stat_number(v_health, 'distanceMeters'), 0) > 0
     or coalesce(public.checkin_stat_number(v_health, 'avgHrBpm'), 0) > 0 then
    raise exception 'HAS_METRICS';
  end if;

  v_parts := jsonb_set(v_parts, array[p_proof_id, 'health'], p_health, true);

  -- Photo lock: health is the only key this write is allowed to add.
  if coalesce((v_parts -> p_proof_id) ->> 'url', '') is distinct from v_old_url then
    raise exception 'PROOF_URL_LOCKED';
  end if;
  if (v_parts -> p_proof_id) -> 'urls' is distinct from v_urls then
    raise exception 'PROOF_URL_LOCKED';
  end if;

  update public.challenge_checkins
  set proof_parts = v_parts
  where id = p_checkin_id
    and proof_parts is not distinct from c.proof_parts;

  if not found then
    raise exception 'CHECKIN_NOT_FOUND';
  end if;

  -- Trigger already copies stats. Repeat coalesce so a post with null stats still fills.
  update public.posts
  set checkin_stats = coalesce(public.checkin_fitness_stats(p_checkin_id), checkin_stats)
  where checkin_id = p_checkin_id
    and deleted_at is null;

  return jsonb_build_object(
    'ok', true,
    'checkin_id', p_checkin_id,
    'proof_id', p_proof_id
  );
end;
$$;

revoke all on function public.backfill_ocr_checkin_health(uuid, text, jsonb) from public;
revoke all on function public.backfill_ocr_checkin_health(uuid, text, jsonb) from anon;
revoke all on function public.backfill_ocr_checkin_health(uuid, text, jsonb) from authenticated;
grant execute on function public.backfill_ocr_checkin_health(uuid, text, jsonb) to service_role;
