-- Hide is blur-in-place. Required files stay on the check-in and the post row.
-- hidden_media_urls + proof_parts.hidden_urls mark what the public grid blurs.

alter table public.posts
  add column if not exists edited_at timestamptz,
  add column if not exists hidden_media_urls text[] not null default '{}';

create or replace function public.edit_post(
  p_post_id uuid,
  p_caption text default null,
  p_media_urls text[] default null,
  p_hidden_media_urls text[] default null,
  p_proof_replacements jsonb default null
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts%rowtype;
  v_checkin public.challenge_checkins%rowtype;
  v_ch public.challenges%rowtype;
  v_media text[];
  v_hidden text[];
  v_parts jsonb;
  v_elem jsonb;
  v_key text;
  v_part jsonb;
  v_urls text[];
  v_new text;
  v_old text;
  v_caption text;
  v_replaced text[] := '{}';
  v_part_hidden text[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_post from public.posts where id = p_post_id for update;
  if not found or v_post.deleted_at is not null then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;
  if v_post.author_id <> v_uid then
    raise exception 'Not your post' using errcode = '42501';
  end if;

  v_caption := coalesce(p_caption, v_post.content);
  v_hidden := public.checkin_unique_urls(coalesce(p_hidden_media_urls, v_post.hidden_media_urls, '{}'));

  if v_post.checkin_id is not null then
    select * into v_checkin from public.challenge_checkins where id = v_post.checkin_id for update;
    if not found then
      raise exception 'Check-in not found' using errcode = 'P0002';
    end if;
    select * into v_ch from public.challenges where id = v_checkin.challenge_id;
    v_parts := coalesce(v_checkin.proof_parts, '{}'::jsonb);

    if p_proof_replacements is not null then
      for v_key, v_new in
        select key, nullif(value, '')
        from jsonb_each_text(p_proof_replacements)
      loop
        if v_new is null then
          continue;
        end if;
        v_part := coalesce(v_parts -> v_key, '{}'::jsonb);
        v_old := nullif(v_part->>'url', '');
        v_urls := public.checkin_unique_urls(
          coalesce(
            array(select jsonb_array_elements_text(coalesce(v_part->'urls', '[]'::jsonb))),
            '{}'
          ) || array[v_old, v_new]
        );
        if v_old is not null and v_old <> v_new then
          v_hidden := public.checkin_unique_urls(v_hidden || array[v_old]);
          v_replaced := public.checkin_unique_urls(v_replaced || array[v_old]);
        end if;
        v_parts := v_parts || jsonb_build_object(
          v_key,
          v_part || jsonb_build_object('url', v_new, 'urls', to_jsonb(v_urls))
        );
      end loop;
    end if;

    for v_key, v_part in
      select key, value from jsonb_each(v_parts)
    loop
      v_urls := public.checkin_unique_urls(
        coalesce(
          array(select jsonb_array_elements_text(coalesce(v_part->'urls', '[]'::jsonb))),
          '{}'
        ) || array[nullif(v_part->>'url', '')]
      );
      if cardinality(v_urls) = 0 then
        continue;
      end if;
      v_part_hidden := coalesce(
        array(
          select u
          from unnest(v_hidden) as t(u)
          where u = any (v_urls)
        ),
        '{}'
      );
      v_parts := v_parts || jsonb_build_object(
        v_key,
        v_part || jsonb_build_object('hidden_urls', to_jsonb(v_part_hidden))
      );
    end loop;

    v_media := public.checkin_unique_urls(
      coalesce(v_post.media_urls, '{}')
      || coalesce(p_media_urls, '{}')
      || coalesce(
           array(
             select nullif(value, '')
             from jsonb_each_text(coalesce(p_proof_replacements, '{}'::jsonb))
           ),
           '{}'
         )
    );
    if cardinality(v_replaced) > 0 then
      v_media := coalesce(
        array(
          select u
          from unnest(v_media) as t(u)
          where u <> all (v_replaced)
        ),
        '{}'
      );
    end if;
    -- Hidden files stay on the post so the card can blur them.
    v_media := public.checkin_unique_urls(v_media || v_hidden);

    update public.challenge_checkins
    set
      proof_parts = v_parts,
      updated_at = now()
    where id = v_checkin.id;
  else
    v_media := public.checkin_unique_urls(coalesce(p_media_urls, v_post.media_urls, '{}'));
    v_hidden := public.checkin_unique_urls(
      coalesce(
        array(
          select u
          from unnest(v_hidden) as t(u)
          where u = any (v_media)
        ),
        '{}'
      )
    );
  end if;

  if coalesce(v_post.content, '') is distinct from coalesce(v_caption, '') then
    insert into public.post_edits (post_id, author_id, caption)
    values (v_post.id, v_uid, v_post.content);
  end if;

  update public.posts
  set
    content = v_caption,
    media_urls = v_media,
    hidden_media_urls = v_hidden,
    edited_at = now()
  where id = v_post.id
  returning * into v_post;

  return v_post;
end;
$$;

revoke all on function public.edit_post(uuid, text, text[], text[], jsonb) from public;
grant execute on function public.edit_post(uuid, text, text[], text[], jsonb) to authenticated;
