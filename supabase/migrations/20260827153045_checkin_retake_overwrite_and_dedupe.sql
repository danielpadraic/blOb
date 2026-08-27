-- Retake overwrites the slot. Check-in posts replace media (no append of old selfies).
-- Same save_checkin_proof / submit_checkin signatures. Merge leftover live duplicates.

create or replace function public.checkin_unique_urls(p_urls text[])
returns text[]
language sql
immutable
set search_path = public
as $$
  select coalesce(
    (
      select array_agg(first_url order by ord)
      from (
        select
          (array_agg(u order by ord))[1] as first_url,
          min(ord) as ord
        from unnest(coalesce(p_urls, '{}'::text[])) with ordinality as t(u, ord)
        where coalesce(u, '') <> ''
        group by lower(split_part(u, '?', 1))
      ) s
    ),
    '{}'::text[]
  );
$$;

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
begin
  for v_elem in
    select value from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb))
  loop
    v_url := coalesce(nullif(p_parts -> coalesce(v_elem->>'id', v_elem->>'method') ->> 'url', ''), '');
    if v_url <> '' then
      v_media := v_media || v_url;
    end if;
  end loop;
  foreach v_url in array array[
    p_row.pre_selfie_url,
    p_row.post_selfie_url,
    p_row.hr_monitor_url
  ]
  loop
    if coalesce(v_url, '') <> '' then
      v_media := v_media || v_url;
    end if;
  end loop;
  return public.checkin_unique_urls(v_media);
end;
$$;

create or replace function public.post_checkin_stage(
  p_user_id uuid,
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_content text,
  p_media text[],
  p_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_media text[] := '{}';
begin
  select id
    into v_id
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
  order by created_at asc, id asc
  limit 1;

  v_media := public.checkin_unique_urls(coalesce(p_media, '{}'));

  if coalesce(btrim(p_content), '') = '' and coalesce(array_length(v_media, 1), 0) = 0 then
    return;
  end if;

  if v_id is not null then
    update public.posts
    set
      content = coalesce(nullif(btrim(p_content), ''), content),
      media_urls = v_media,
      checkin_stage = p_stage,
      source = 'checkin',
      challenge_id = coalesce(challenge_id, p_challenge_id)
    where id = v_id;
    return;
  end if;

  insert into public.posts (
    author_id,
    challenge_id,
    content,
    media_urls,
    audience,
    audience_user_ids,
    checkin_id,
    checkin_stage,
    source
  ) values (
    p_user_id,
    p_challenge_id,
    nullif(btrim(p_content), ''),
    v_media,
    'public',
    '{}',
    p_checkin_id,
    p_stage,
    'checkin'
  );
end;
$$;

-- Rebuild live check-in posts from current slot files + extras, dropping retired retakes.
do $$
declare
  v_post record;
  v_checkin public.challenge_checkins%rowtype;
  v_ch public.challenges%rowtype;
  v_media text[] := '{}';
  v_retired text[] := '{}';
  v_url text;
  v_part jsonb;
begin
  for v_post in
    select id, checkin_id, media_urls
    from public.posts
    where checkin_id is not null
      and deleted_at is null
  loop
    select * into v_checkin from public.challenge_checkins where id = v_post.checkin_id;
    if not found then
      continue;
    end if;
    select * into v_ch from public.challenges where id = v_checkin.challenge_id;
    v_media := public.checkin_proof_media_urls(v_ch, v_checkin.proof_parts, v_checkin);
    v_retired := '{}';
    for v_part in
      select value from jsonb_each(coalesce(v_checkin.proof_parts, '{}'::jsonb))
    loop
      if jsonb_typeof(v_part->'urls') = 'array' then
        for v_url in select jsonb_array_elements_text(v_part->'urls')
        loop
          if coalesce(v_url, '') <> ''
            and v_url is distinct from nullif(v_part->>'url', '')
          then
            v_retired := v_retired || v_url;
          end if;
        end loop;
      end if;
    end loop;
    if v_post.media_urls is not null then
      foreach v_url in array v_post.media_urls
      loop
        if coalesce(v_url, '') <> '' and not (v_url = any (v_retired)) then
          v_media := v_media || v_url;
        end if;
      end loop;
    end if;
    update public.posts
    set media_urls = public.checkin_unique_urls(v_media)
    where id = v_post.id;
  end loop;
end;
$$;

-- Slot urls[] is the current file only after retired retakes are dropped from posts.
update public.challenge_checkins
set
  proof_parts = (
    select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from (
      select
        e.key,
        case
          when nullif(e.value->>'url', '') is not null then
            e.value || jsonb_build_object('urls', jsonb_build_array(e.value->>'url'))
          else e.value
        end as value
      from jsonb_each(coalesce(proof_parts, '{}'::jsonb)) as e
    ) trimmed
  )
where proof_parts is not null
  and proof_parts <> '{}'::jsonb;

-- One live post per check-in. Keep the oldest row.
do $$
declare
  rec record;
  v_keep uuid;
  v_media text[] := '{}';
  v_url text;
  v_stage text;
  v_content text;
  v_row record;
begin
  for rec in
    select checkin_id
    from public.posts
    where checkin_id is not null
      and deleted_at is null
    group by checkin_id
    having count(*) > 1
  loop
    v_media := '{}';
    v_keep := null;
    v_stage := null;
    v_content := null;
    for v_row in
      select id, media_urls, checkin_stage, content
      from public.posts
      where checkin_id = rec.checkin_id
        and deleted_at is null
      order by created_at asc, id asc
    loop
      if v_keep is null then
        v_keep := v_row.id;
        v_content := v_row.content;
        v_stage := v_row.checkin_stage;
      end if;
      if v_row.media_urls is not null then
        foreach v_url in array v_row.media_urls loop
          if coalesce(v_url, '') <> '' then
            v_media := v_media || v_url;
          end if;
        end loop;
      end if;
      if v_row.checkin_stage in ('submitted', 'complete') then
        v_stage := v_row.checkin_stage;
        if coalesce(v_row.content, '') <> '' then
          v_content := v_row.content;
        end if;
      end if;
    end loop;
    update public.posts
    set
      media_urls = public.checkin_unique_urls(v_media),
      checkin_stage = coalesce(v_stage, checkin_stage),
      content = coalesce(v_content, content),
      source = 'checkin'
    where id = v_keep;
    update public.posts
    set deleted_at = now()
    where checkin_id = rec.checkin_id
      and id is distinct from v_keep
      and deleted_at is null;
  end loop;
end;
$$;

create unique index if not exists posts_one_live_checkin_idx
  on public.posts (checkin_id)
  where checkin_id is not null and deleted_at is null;

grant execute on function public.checkin_unique_urls(text[]) to authenticated;
grant execute on function public.checkin_proof_media_urls(public.challenges, jsonb, public.challenge_checkins) to authenticated;
grant execute on function public.post_checkin_stage(uuid, uuid, uuid, text, text[], text) to authenticated;

notify pgrst, 'reload schema';
