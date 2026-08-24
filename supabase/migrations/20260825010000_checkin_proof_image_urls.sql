-- Include proof_parts.urls[] when building the check-in feed media list.
-- Older rows still only have `url`; that path is unchanged.

create or replace function public.checkin_proof_media_urls(
  ch public.challenges,
  p_parts jsonb,
  p_row public.challenge_checkins
)
returns text[]
language plpgsql
stable
set search_path = public
as $$
declare
  v_media text[] := '{}';
  v_elem jsonb;
  v_url text;
  v_urls jsonb;
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_url := coalesce(nullif(p_parts -> coalesce(v_elem->>'id', '') ->> 'url', ''), '');
    if v_url <> '' and not (v_url = any (v_media)) then
      v_media := v_media || v_url;
    end if;
    v_urls := p_parts -> coalesce(v_elem->>'id', '') -> 'urls';
    if jsonb_typeof(v_urls) = 'array' then
      for v_url in
        select jsonb_array_elements_text(v_urls)
      loop
        if coalesce(v_url, '') <> '' and not (v_url = any (v_media)) then
          v_media := v_media || v_url;
        end if;
      end loop;
    end if;
  end loop;
  foreach v_url in array array[
    p_row.pre_selfie_url,
    p_row.post_selfie_url,
    p_row.hr_monitor_url
  ]
  loop
    if coalesce(v_url, '') <> '' and not (v_url = any (v_media)) then
      v_media := v_media || v_url;
    end if;
  end loop;
  return v_media;
end;
$$;

grant execute on function public.checkin_proof_media_urls(public.challenges, jsonb, public.challenge_checkins) to authenticated;
