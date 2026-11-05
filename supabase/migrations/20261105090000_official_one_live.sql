-- Official Fitness is one conversation. Weekly and Monthly stay two scored rooms, but a check-in
-- posts to ONE Live: the weekly host. The monthly room no longer gets a Live row.
-- Scoring, dual-stamp check-in copy, windows, and auto re-roll are unchanged. Old monthly Live
-- rows stay in the database. Does not touch proof rules, money, auth, or RLS.

create or replace function public.perform_official_pair_live(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src_checkin public.challenge_checkins%rowtype;
  v_src public.challenges%rowtype;
  v_dst public.challenges%rowtype;
  v_dst_checkin public.challenge_checkins%rowtype;
  v_period date;
  v_src_post public.posts%rowtype;
  v_media text[] := '{}';
  v_content text;
  v_stage text;
  v_stats jsonb;
  v_weekly_id uuid;
  v_monthly_id uuid;
  v_weekly_post uuid;
  v_monthly_post uuid;
  v_weekly_open boolean := false;
  v_monthly_open boolean := false;
  v_room public.challenges%rowtype;
  v_checkin public.challenge_checkins%rowtype;
  v_post_id uuid;
  v_existing text[] := '{}';
  v_next text[] := '{}';
  v_keeper uuid;
  v_ids jsonb;
  v_titles jsonb;
  v_missing text := null;
begin
  if p_checkin_id is null then
    return jsonb_build_object('missing', null, 'post_ids', '[]'::jsonb);
  end if;

  select * into v_src_checkin from public.challenge_checkins where id = p_checkin_id;
  if not found then
    return jsonb_build_object('missing', null, 'post_ids', '[]'::jsonb);
  end if;

  select * into v_src from public.challenges where id = v_src_checkin.challenge_id;
  if not found or not public.is_official_coin_challenge(v_src) then
    return jsonb_build_object('missing', null, 'post_ids', '[]'::jsonb);
  end if;

  v_period := v_src_checkin.period_key;
  v_weekly_id := public.official_coin_challenge_id('coin_weekly');
  v_monthly_id := public.official_coin_challenge_id('coin_monthly');

  select * into v_dst
  from public.challenges
  where official_kind = case
    when v_src.official_kind = 'coin_weekly' then 'coin_monthly'
    else 'coin_weekly'
  end;

  if found and exists (
    select 1 from public.challenge_participants
    where challenge_id = v_dst.id and user_id = v_src_checkin.user_id
  ) and public.official_coin_period_open(v_dst, v_period) then
    select * into v_dst_checkin
    from public.challenge_checkins
    where challenge_id = v_dst.id
      and user_id = v_src_checkin.user_id
      and period_key = v_period
    order by created_at asc
    limit 1;

    if not found then
      insert into public.challenge_checkins (
        user_id, challenge_id, period_key, status, started_at
      ) values (
        v_src_checkin.user_id,
        v_dst.id,
        v_period,
        'in_progress',
        coalesce(v_src_checkin.started_at, now())
      )
      on conflict (challenge_id, user_id, period_key, checkin_slot) do nothing;

      select * into v_dst_checkin
      from public.challenge_checkins
      where challenge_id = v_dst.id
        and user_id = v_src_checkin.user_id
        and period_key = v_period
      order by created_at asc
      limit 1;
    end if;

    if v_dst_checkin.id is not null then
      begin
        update public.challenge_checkins
        set
          proof_parts = coalesce(v_src_checkin.proof_parts, '{}'::jsonb),
          pre_selfie_url = v_src_checkin.pre_selfie_url,
          post_selfie_url = v_src_checkin.post_selfie_url,
          hr_monitor_url = v_src_checkin.hr_monitor_url,
          notes = coalesce(v_src_checkin.notes, notes),
          health_workout_id = v_src_checkin.health_workout_id,
          distance_meters = v_src_checkin.distance_meters,
          status = case
            when status = 'submitted' then status
            else v_src_checkin.status
          end,
          submitted_at = case
            when status = 'submitted' then submitted_at
            else v_src_checkin.submitted_at
          end,
          updated_at = now()
        where id = v_dst_checkin.id;
      exception when others then
        raise log 'official pair check-in copy skip % %', sqlstate, sqlerrm;
      end;
    end if;
  end if;

  select * into v_src_post
  from public.posts
  where checkin_id = v_src_checkin.id
    and challenge_id = v_src.id
    and deleted_at is null
    and source = 'checkin'
  order by created_at asc
  limit 1;

  if v_src_post.id is null then
    select * into v_src_post
    from public.posts
    where author_id = v_src_checkin.user_id
      and challenge_id = v_src.id
      and deleted_at is null
      and source = 'checkin'
      and checkin_id in (
        select id from public.challenge_checkins
        where challenge_id = v_src.id
          and user_id = v_src_checkin.user_id
          and period_key = v_period
      )
    order by created_at asc
    limit 1;
  end if;

  v_media := coalesce(v_src_post.media_urls, '{}');
  if coalesce(array_length(v_media, 1), 0) = 0 then
    v_media := public.checkin_proof_media_urls(v_src, v_src_checkin.proof_parts, v_src_checkin);
  end if;
  v_content := nullif(btrim(coalesce(v_src_post.content, v_src_checkin.notes, '')), '');
  v_stage := coalesce(v_src_post.checkin_stage, case
    when v_src_checkin.status = 'submitted' then 'complete'
    else 'proof'
  end);
  v_stats := coalesce(v_src_post.checkin_stats, public.checkin_fitness_stats(v_src_checkin.id));

  if public.official_coin_period_open(v_src, v_period) then
    if v_src.official_kind = 'coin_weekly' then
      v_weekly_open := true;
    else
      v_monthly_open := true;
    end if;
  end if;
  if v_dst.id is not null and public.official_coin_period_open(v_dst, v_period) and exists (
    select 1 from public.challenge_participants
    where challenge_id = v_dst.id and user_id = v_src_checkin.user_id
  ) then
    if v_dst.official_kind = 'coin_weekly' then
      v_weekly_open := true;
    else
      v_monthly_open := true;
    end if;
  end if;

  -- One Official Live. Only the weekly host room gets a post; the monthly room scores the same
  -- check-in but never gets a second Live row.
  for v_room in
    select * from public.challenges
    where id = v_weekly_id
      and v_weekly_open
  loop
    select * into v_checkin
    from public.challenge_checkins
    where challenge_id = v_room.id
      and user_id = v_src_checkin.user_id
      and period_key = v_period
    order by created_at asc
    limit 1;

    v_post_id := null;
    v_existing := '{}';
    if v_checkin.id is not null then
      select id, media_urls
        into v_post_id, v_existing
      from public.posts
      where author_id = v_src_checkin.user_id
        and challenge_id = v_room.id
        and deleted_at is null
        and source = 'checkin'
        and checkin_id = v_checkin.id
      order by created_at asc
      limit 1;
    end if;

    if v_post_id is null then
      select id, media_urls
        into v_post_id, v_existing
      from public.posts
      where author_id = v_src_checkin.user_id
        and challenge_id = v_room.id
        and deleted_at is null
        and source = 'checkin'
        and checkin_id = v_src_checkin.id
      order by created_at asc
      limit 1;
    end if;

    v_next := public.checkin_unique_urls(coalesce(v_media, '{}') || coalesce(v_existing, '{}'));
    if coalesce(array_length(v_next, 1), 0) = 0 and v_content is null then
      continue;
    end if;

    if v_post_id is not null then
      update public.posts
      set
        media_urls = v_next,
        content = coalesce(v_content, content),
        checkin_stage = coalesce(v_stage, checkin_stage),
        source = 'checkin',
        checkin_stats = coalesce(v_stats, checkin_stats)
      where id = v_post_id;
    elsif v_checkin.id is not null then
      begin
        insert into public.posts (
          author_id,
          challenge_id,
          content,
          media_urls,
          audience,
          audience_user_ids,
          checkin_id,
          checkin_stage,
          source,
          checkin_stats,
          hidden_from_home
        ) values (
          v_src_checkin.user_id,
          v_room.id,
          v_content,
          v_next,
          coalesce(v_src_post.audience, 'public'),
          coalesce(v_src_post.audience_user_ids, '{}'),
          v_checkin.id,
          v_stage,
          'checkin',
          v_stats,
          false
        )
        returning id into v_post_id;
      exception when unique_violation then
        select id into v_post_id
        from public.posts
        where challenge_id = v_room.id
          and checkin_id = v_checkin.id
          and deleted_at is null
        order by created_at asc
        limit 1;
        if v_post_id is not null then
          update public.posts
          set
            media_urls = v_next,
            content = coalesce(v_content, content),
            checkin_stage = coalesce(v_stage, checkin_stage),
            source = 'checkin'
          where id = v_post_id;
        end if;
      when others then
        raise log 'official pair live insert % %', sqlstate, sqlerrm;
        v_post_id := null;
      end;
    end if;

    if v_room.official_kind = 'coin_weekly' then
      v_weekly_post := v_post_id;
    else
      v_monthly_post := v_post_id;
    end if;
  end loop;

  -- A check-in that started on the monthly room moves its Live card to the weekly host.
  if v_src.official_kind = 'coin_monthly' and v_weekly_post is not null then
    update public.posts
    set hidden_from_home = true
    where challenge_id = v_src.id
      and checkin_id = v_src_checkin.id
      and deleted_at is null;
  end if;

  if v_weekly_open and v_weekly_post is null then
    v_missing := 'Weekly';
  end if;

  return jsonb_build_object(
    'missing', v_missing,
    'post_ids', (
      select coalesce(jsonb_agg(id), '[]'::jsonb)
      from (
        select v_weekly_post as id
        union all
        select v_monthly_post
      ) s
      where id is not null
    )
  );
end;
$$;

revoke all on function public.perform_official_pair_live(uuid) from public, anon, authenticated;

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
  v_existing text[] := '{}';
  v_stats jsonb;
  v_card text;
  v_audience text;
begin
  -- The monthly room only scores. Its check-in posts once, on the weekly host Live.
  if exists (
    select 1 from public.challenges c
    where c.id = p_challenge_id and c.official_kind = 'coin_monthly'
  ) and exists (
    select 1
    from public.challenge_participants cp
    join public.challenges w on w.id = cp.challenge_id
    where cp.user_id = p_user_id and w.official_kind = 'coin_weekly'
  ) then
    begin
      perform public.perform_official_pair_live(p_checkin_id);
    exception when others then
      raise log 'official host live skip % %', sqlstate, sqlerrm;
    end;
    return;
  end if;

  select id, media_urls
    into v_id, v_existing
  from public.posts
  where checkin_id = p_checkin_id
    and deleted_at is null
    and (challenge_id = p_challenge_id or challenge_id is null)
  order by case when challenge_id = p_challenge_id then 0 else 1 end, created_at asc, id asc
  limit 1;

  v_stats := public.checkin_fitness_stats(p_checkin_id);
  v_card := nullif(btrim(coalesce(v_stats->>'card_url', '')), '');
  v_media := public.checkin_media_stills_then_recap(
    coalesce(v_existing, '{}') || coalesce(p_media, '{}'),
    v_card
  );
  v_audience := public.content_audience_for_privacy_mode(
    (select c.privacy_mode from public.challenges c where c.id = p_challenge_id)
  );

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
      challenge_id = coalesce(challenge_id, p_challenge_id),
      checkin_stats = coalesce(v_stats, checkin_stats),
      audience = case
        when public.challenge_is_private_corporate(p_challenge_id) then v_audience
        else audience
      end
    where id = v_id;
  else
    begin
      insert into public.posts (
        author_id,
        challenge_id,
        content,
        media_urls,
        audience,
        audience_user_ids,
        checkin_id,
        checkin_stage,
        source,
        checkin_stats
      ) values (
        p_user_id,
        p_challenge_id,
        nullif(btrim(p_content), ''),
        v_media,
        v_audience,
        '{}',
        p_checkin_id,
        p_stage,
        'checkin',
        v_stats
      );
    exception when unique_violation then
      update public.posts
      set
        content = coalesce(nullif(btrim(p_content), ''), content),
        media_urls = v_media,
        checkin_stage = p_stage,
        source = 'checkin',
        checkin_stats = coalesce(v_stats, checkin_stats)
      where challenge_id = p_challenge_id
        and checkin_id = p_checkin_id
        and deleted_at is null;
    end;
  end if;

  begin
    perform public.perform_official_pair_live(p_checkin_id);
  exception when others then
    raise log 'official pair live skip % %', sqlstate, sqlerrm;
  end;
end;
$$;

notify pgrst, 'reload schema';
