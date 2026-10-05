-- Official Weekly and Official Monthly each keep their own Live post.
-- One post per check-in stays per room. A unique index on checkin_id alone
-- was dropping the second Live insert when both rooms shared that id.
-- Private challenges are unchanged: a private check-in still belongs to one room.
-- Does not change proof rules or settlement.

drop index if exists public.posts_one_live_checkin_idx;

create unique index if not exists posts_one_live_checkin_room_idx
  on public.posts (challenge_id, checkin_id)
  where checkin_id is not null
    and challenge_id is not null
    and deleted_at is null;

create unique index if not exists posts_one_live_checkin_nochal_idx
  on public.posts (checkin_id)
  where checkin_id is not null
    and challenge_id is null
    and deleted_at is null;

create or replace function public.official_room_label(p_kind text)
returns text
language sql
immutable
set search_path = public
as $$
  select case p_kind
    when 'coin_weekly' then 'Weekly'
    when 'coin_monthly' then 'Monthly'
    else null
  end;
$$;

create or replace function public.official_coin_period_open(
  ch public.challenges,
  p_period date
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_period is not null
    and p_period >= (timezone(public.official_coin_tz(), ch.starts_at))::date
    and (
      ch.ends_at is null
      or p_period < (timezone(public.official_coin_tz(), ch.ends_at))::date
    );
$$;

-- A Chicago day counts when every required Official slot is filled.
-- Same rule the board uses. Legacy columns and the workout id fill a slot
-- the part bag has not copied yet.
create or replace function public.official_checkin_is_complete(
  ch public.challenges,
  p_row public.challenge_checkins
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_parts jsonb := coalesce(p_row.proof_parts, '{}'::jsonb);
  v_id text;
  v_required integer := 0;
  v_met integer := 0;
begin
  if not public.is_official_coin_challenge(ch) then
    return false;
  end if;

  if coalesce(btrim(p_row.pre_selfie_url), '') <> ''
    and coalesce(v_parts #>> '{pre,url}', '') = '' then
    v_parts := jsonb_set(
      v_parts,
      '{pre}',
      coalesce(v_parts -> 'pre', '{}'::jsonb) || jsonb_build_object('method', 'photo', 'url', p_row.pre_selfie_url),
      true
    );
  end if;
  if coalesce(btrim(p_row.post_selfie_url), '') <> ''
    and coalesce(v_parts #>> '{post,url}', '') = '' then
    v_parts := jsonb_set(
      v_parts,
      '{post}',
      coalesce(v_parts -> 'post', '{}'::jsonb) || jsonb_build_object('method', 'photo', 'url', p_row.post_selfie_url),
      true
    );
  end if;
  if coalesce(btrim(p_row.hr_monitor_url), '') <> ''
    and coalesce(v_parts #>> '{hr,url}', '') = '' then
    v_parts := jsonb_set(
      v_parts,
      '{hr}',
      coalesce(v_parts -> 'hr', '{}'::jsonb) || jsonb_build_object('method', 'hr', 'url', p_row.hr_monitor_url),
      true
    );
  end if;
  if p_row.health_workout_id is not null
    and coalesce(v_parts #>> '{hr,url}', '') = ''
    and coalesce(v_parts #>> '{hr,healthWorkoutId}', '') = ''
    and coalesce(v_parts #>> '{hr,health_workout_id}', '') = '' then
    v_parts := jsonb_set(
      v_parts,
      '{hr}',
      coalesce(v_parts -> 'hr', '{}'::jsonb) || jsonb_build_object(
        'method', 'hr',
        'healthWorkoutId', p_row.health_workout_id::text
      ),
      true
    );
  end if;

  for v_id in
    select elem->>'id'
    from jsonb_array_elements(coalesce(ch.proofs, '[]'::jsonb)) elem
    where public.checkin_slot_is_required(ch, elem->>'id')
  loop
    v_required := v_required + 1;
    if public.checkin_slot_satisfied(ch, v_parts, v_id) then
      v_met := v_met + 1;
    end if;
  end loop;

  return v_required > 0 and v_met = v_required;
end;
$$;

-- Write this Chicago day onto both Official Lives. Copies media and caption.
-- Inserts a room only when that room has no Live post. Later calls append.
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

  for v_room in
    select * from public.challenges
    where id in (v_weekly_id, v_monthly_id)
      and (
        (official_kind = 'coin_weekly' and v_weekly_open)
        or (official_kind = 'coin_monthly' and v_monthly_open)
      )
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

  if v_weekly_post is not null and v_monthly_post is not null then
    select id into v_keeper
    from public.posts
    where id in (v_weekly_post, v_monthly_post)
    order by created_at asc, id asc
    limit 1;

    v_ids := jsonb_build_array(v_weekly_id, v_monthly_id);
    v_titles := jsonb_build_array('Weekly Fitness Challenge', 'Monthly Fitness Challenge');

    update public.posts
    set
      hidden_from_home = id is distinct from v_keeper,
      checkin_stats = coalesce(checkin_stats, '{}'::jsonb) || jsonb_build_object(
        'paired_challenge_ids', v_ids,
        'paired_titles', v_titles
      )
    where id in (v_weekly_post, v_monthly_post);
  end if;

  if v_weekly_open and v_weekly_post is null then
    v_missing := 'Weekly';
  elsif v_monthly_open and v_monthly_post is null then
    v_missing := 'Monthly';
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

create or replace function public.ensure_official_pair_live(p_checkin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select user_id into v_owner
  from public.challenge_checkins
  where id = p_checkin_id;

  if v_owner is distinct from auth.uid() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  return public.perform_official_pair_live(p_checkin_id);
end;
$$;

revoke all on function public.ensure_official_pair_live(uuid) from public;
grant execute on function public.ensure_official_pair_live(uuid) to authenticated;

-- This room's post only. A sibling Live row that shares checkin_id must stay.
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

-- Current windows only. A complete day on one Official room and no Live post
-- on the other gets a copy of the media. A room that already has the post is left.
do $$
declare
  rec record;
begin
  for rec in
    select c.id
    from public.challenge_checkins c
    join public.challenges ch on ch.id = c.challenge_id
    where ch.official_kind in ('coin_weekly', 'coin_monthly')
      and public.official_coin_period_open(ch, c.period_key)
      and public.official_checkin_is_complete(ch, c)
  loop
    perform public.perform_official_pair_live(rec.id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
