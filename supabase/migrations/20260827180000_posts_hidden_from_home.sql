-- Whole-post Hide from Home. Lobby proof stays sharp. Extra photos may leave the post.

alter table public.posts
  add column if not exists hidden_from_home boolean not null default false;

comment on column public.posts.hidden_from_home is
  'Author hid this post from Home / public profile / public social. Lobby feed ignores this flag.';

create index if not exists posts_hidden_from_home_idx
  on public.posts (hidden_from_home)
  where hidden_from_home = true;

grant update (hidden_from_home) on public.posts to authenticated;

create or replace function public.set_post_hidden_from_home(
  p_post_id uuid,
  p_hidden boolean
)
returns public.posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_post public.posts%rowtype;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.posts
  set hidden_from_home = coalesce(p_hidden, false)
  where id = p_post_id
    and author_id = v_uid
    and deleted_at is null
  returning * into v_post;

  if not found then
    raise exception 'Post not found' using errcode = 'P0002';
  end if;

  return v_post;
end;
$$;

revoke all on function public.set_post_hidden_from_home(uuid, boolean) from public;
grant execute on function public.set_post_hidden_from_home(uuid, boolean) to authenticated;

-- Extra photos may be dropped from the post. Required proof URLs always stay.
-- Signature unchanged. hidden_media_urls is legacy and is no longer used to blur lobby proof.
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
  v_media text[];
  v_required text[] := '{}';
  v_parts jsonb;
  v_key text;
  v_part jsonb;
  v_urls text[];
  v_new text;
  v_old text;
  v_caption text;
  v_replaced text[] := '{}';
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

  if v_post.checkin_id is not null then
    select * into v_checkin from public.challenge_checkins where id = v_post.checkin_id for update;
    if not found then
      raise exception 'Check-in not found' using errcode = 'P0002';
    end if;
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
          v_replaced := public.checkin_unique_urls(v_replaced || array[v_old]);
        end if;
        v_parts := v_parts || jsonb_build_object(
          v_key,
          (v_part - 'hidden_urls') || jsonb_build_object('url', v_new, 'urls', to_jsonb(v_urls))
        );
      end loop;
    end if;

    for v_key, v_part in
      select key, value from jsonb_each(v_parts)
    loop
      v_old := nullif(v_part->>'url', '');
      v_urls := public.checkin_unique_urls(
        coalesce(
          array(select jsonb_array_elements_text(coalesce(v_part->'urls', '[]'::jsonb))),
          '{}'
        ) || array[v_old]
      );
      if v_old is not null then
        v_required := public.checkin_unique_urls(v_required || array[v_old]);
      elsif cardinality(v_urls) > 0 then
        v_required := public.checkin_unique_urls(v_required || array[v_urls[1]]);
      end if;
      v_parts := v_parts || jsonb_build_object(v_key, v_part - 'hidden_urls');
    end loop;

    if p_media_urls is not null then
      v_media := public.checkin_unique_urls(p_media_urls);
    else
      v_media := public.checkin_unique_urls(coalesce(v_post.media_urls, '{}'));
    end if;

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

    -- Required slots stay. Extra files in p_media_urls stay. Dropped extras stay dropped.
    v_media := public.checkin_unique_urls(coalesce(v_media, '{}') || v_required);

    update public.challenge_checkins
    set
      proof_parts = v_parts,
      updated_at = now()
    where id = v_checkin.id;
  else
    v_media := public.checkin_unique_urls(coalesce(p_media_urls, v_post.media_urls, '{}'));
  end if;

  if coalesce(v_post.content, '') is distinct from coalesce(v_caption, '') then
    insert into public.post_edits (post_id, author_id, caption)
    values (v_post.id, v_uid, v_post.content);
  end if;

  update public.posts
  set
    content = v_caption,
    media_urls = v_media,
    hidden_media_urls = coalesce(v_post.hidden_media_urls, '{}'),
    edited_at = now()
  where id = v_post.id
  returning * into v_post;

  return v_post;
end;
$$;

revoke all on function public.edit_post(uuid, text, text[], text[], jsonb) from public;
grant execute on function public.edit_post(uuid, text, text[], text[], jsonb) to authenticated;
