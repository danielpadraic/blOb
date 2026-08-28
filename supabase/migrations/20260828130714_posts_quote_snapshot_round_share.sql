-- Keep Round-share extras (reel_id, kind, cover) when the quote trigger fills author fields.

create or replace function public.trg_posts_quote_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post public.posts%rowtype;
  v_name text;
  v_username text;
  v_avatar text;
  v_preview text;
  v_incoming jsonb;
begin
  if new.quoted_post_id is null then
    return new;
  end if;
  if new.quoted_post_id = new.id then
    raise exception 'CANT_QUOTE_SELF_ROW' using errcode = 'P0001';
  end if;
  if not public.can_read_post_id(new.quoted_post_id) then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select * into v_post from public.posts where id = new.quoted_post_id;
  if not found or v_post.deleted_at is not null then
    raise exception 'POST_UNAVAILABLE' using errcode = 'P0002';
  end if;

  select display_name, username, avatar_url
    into v_name, v_username, v_avatar
  from public.profiles
  where id = v_post.author_id;

  if coalesce(array_length(v_post.media_urls, 1), 0) > 0 then
    v_preview := v_post.media_urls[1];
  else
    v_preview := null;
  end if;

  v_incoming := coalesce(new.quote_snapshot, '{}'::jsonb);

  new.quote_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'author_id', v_post.author_id,
    'display_name', coalesce(nullif(trim(v_name), ''), v_username, 'Someone'),
    'username', coalesce(v_username, 'blob'),
    'avatar_url', v_avatar,
    'body', left(coalesce(v_post.content, ''), 140),
    'media_preview_url', coalesce(nullif(v_incoming->>'media_preview_url', ''), v_preview),
    'created_at', v_post.created_at,
    'audience', v_post.audience,
    'reel_id', nullif(v_incoming->>'reel_id', ''),
    'kind', nullif(v_incoming->>'kind', '')
  ));
  return new;
end;
$$;
