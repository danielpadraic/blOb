-- Paste in Supabase SQL editor. Applied live as private_corporate_containment + private_corporate_lock_join.

alter table public.posts drop constraint if exists posts_audience_check;
alter table public.posts
  add constraint posts_audience_check
  check (audience in ('public', 'friends', 'specific', 'people', 'only_me', 'challenge_only'));

create or replace function public.content_audience_for_privacy_mode(p_mode text)
returns text
language sql
immutable
as $$
  select case
    when lower(coalesce(p_mode, '')) = 'private_corporate' then 'challenge_only'
    when lower(coalesce(p_mode, '')) = 'private' then 'friends'
    else 'public'
  end;
$$;

create or replace function public.challenge_is_private_corporate(p_challenge_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.challenges c
    where c.id = p_challenge_id
      and c.privacy_mode = 'private_corporate'
  );
$$;

create or replace function public.user_is_corporate_room_reader(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
begin
  if p_challenge_id is null or p_user_id is null then
    return false;
  end if;
  if public.is_official_ops() then
    return true;
  end if;
  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return false;
  end if;
  if v_c.created_by is not distinct from p_user_id then
    return true;
  end if;
  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;
  if exists (
    select 1 from public.challenge_moderators
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.user_can_select_corporate_challenge(p_challenge_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.user_is_corporate_room_reader(p_challenge_id, p_user_id) then
    return true;
  end if;
  if p_user_id is null or p_challenge_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.challenge_invites i
    where i.challenge_id = p_challenge_id
      and i.invitee_id = p_user_id
      and i.status in ('pending', 'accepted')
  );
end;
$$;

revoke all on function public.content_audience_for_privacy_mode(text) from public;
grant execute on function public.content_audience_for_privacy_mode(text) to anon, authenticated;

revoke all on function public.challenge_is_private_corporate(uuid) from public;
grant execute on function public.challenge_is_private_corporate(uuid) to anon, authenticated;

revoke all on function public.user_is_corporate_room_reader(uuid, uuid) from public;
grant execute on function public.user_is_corporate_room_reader(uuid, uuid) to anon, authenticated;

revoke all on function public.user_can_select_corporate_challenge(uuid, uuid) from public;
grant execute on function public.user_can_select_corporate_challenge(uuid, uuid) to anon, authenticated;

create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_official_ops()
    or auth.uid() is not distinct from p_author_id
    or (
      not public.friendship_is_blocked(auth.uid(), p_author_id)
      and p_audience is distinct from 'only_me'
      and (
        case
          when public.challenge_is_private_corporate(p_challenge_id) then
            public.user_is_corporate_room_reader(p_challenge_id, auth.uid())
          else
            (
              p_audience = 'public'
              or exists (
                select 1
                from public.profiles pr
                where pr.id = p_author_id
                  and coalesce(pr.is_official, false)
              )
              or (
                p_audience = 'friends'
                and auth.uid() is not null
                and exists (
                  select 1
                  from public.friendships f
                  where f.status = 'accepted'
                    and f.user_a_id = least(auth.uid(), p_author_id)
                    and f.user_b_id = greatest(auth.uid(), p_author_id)
                )
              )
              or (
                p_audience in ('specific', 'people')
                and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
              )
              or (
                p_challenge_id is not null
                and auth.uid() is not null
                and exists (
                  select 1
                  from public.challenge_participants cp
                  where cp.challenge_id = p_challenge_id
                    and cp.user_id = auth.uid()
                )
              )
              or (
                p_challenge_id is not null
                and auth.uid() is not null
                and public.is_callout_challenge_observer(p_challenge_id, auth.uid())
              )
            )
        end
      )
    );
$$;

create or replace function public.announce_challenge_join(p_challenge_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c public.challenges%rowtype;
  v_name text;
  v_title text;
  v_audience text;
  v_lobby_audience text;
begin
  if p_challenge_id is null or p_user_id is null then
    return;
  end if;

  select * into v_c from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;

  v_name := coalesce(nullif(public.profile_display_name(p_user_id), ''), 'Someone');
  v_title := coalesce(nullif(btrim(v_c.title), ''), 'a challenge');
  v_lobby_audience := public.content_audience_for_privacy_mode(v_c.privacy_mode);

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_challenge_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' has joined the challenge!',
      '{}',
      v_lobby_audience,
      '{}',
      'challenge',
      'join_challenge_feed'
    );
  end if;

  if not public.challenge_allows_main_feed_announce(v_c) then
    return;
  end if;

  v_audience := case
    when lower(coalesce(v_c.visibility, '')) = 'friends' then 'friends'
    else 'public'
  end;

  if not exists (
    select 1
    from public.posts
    where author_id = p_user_id
      and challenge_id = p_challenge_id
      and system_kind = 'join_main_feed'
  ) then
    insert into public.posts (
      author_id,
      challenge_id,
      content,
      media_urls,
      audience,
      audience_user_ids,
      source,
      system_kind
    ) values (
      p_user_id,
      p_challenge_id,
      v_name || ' joined ' || v_title,
      '{}',
      v_audience,
      '{}',
      'feed',
      'join_main_feed'
    );
  end if;
exception when others then
  null;
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
  order by created_at asc, id asc
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
end;
$$;

update public.posts p
set audience = 'challenge_only'
from public.challenges c
where p.challenge_id = c.id
  and c.privacy_mode = 'private_corporate'
  and p.audience is distinct from 'challenge_only';

drop policy if exists "Challenges are viewable by everyone" on public.challenges;
create policy "Challenges are viewable by everyone"
  on public.challenges
  for select
  using (
    privacy_mode is distinct from 'private_corporate'
    or public.user_can_select_corporate_challenge(id, auth.uid())
  );

drop policy if exists "Users can read challenges" on public.challenges;
create policy "Users can read challenges"
  on public.challenges
  for select
  to authenticated
  using (
    (
      visibility = 'public'
      or visibility is null
      or created_by = auth.uid()
      or is_official = true
    )
    and (
      privacy_mode is distinct from 'private_corporate'
      or public.user_can_select_corporate_challenge(id, auth.uid())
    )
  );

drop policy if exists "Participants are viewable by everyone" on public.challenge_participants;
create policy "Participants are viewable by everyone"
  on public.challenge_participants
  for select
  using (
    not public.challenge_is_private_corporate(challenge_id)
    or public.user_can_select_corporate_challenge(challenge_id, auth.uid())
  );

drop policy if exists "Corporate staff read checkins" on public.challenge_checkins;
create policy "Corporate staff read checkins"
  on public.challenge_checkins
  for select
  to authenticated
  using (
    public.challenge_is_private_corporate(challenge_id)
    and public.user_is_corporate_room_reader(challenge_id, auth.uid())
  );

drop policy if exists "Authenticated users can create posts" on public.posts;
create policy "Authenticated users can create posts"
  on public.posts
  for insert
  to authenticated
  with check (
    (auth.uid() = author_id)
    and ((circle_id is null) or is_circle_member(circle_id, auth.uid()))
    and (
      challenge_id is null
      or (
        case
          when public.challenge_is_private_corporate(challenge_id)
            then public.user_is_corporate_room_reader(challenge_id, auth.uid())
          else public.user_can_access_challenge(challenge_id, auth.uid())
        end
      )
    )
    and (
      (challenge_id is null)
      or (circle_id is null)
      or ((type = 'circle_challenge_share') and user_can_access_challenge(challenge_id, auth.uid()))
    )
    and (
      (wall_host_id is null)
      or (wall_host_id = auth.uid())
      or can_post_on_profile(wall_host_id)
    )
  );

create or replace function public.accept_challenge_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv public.challenge_invites%rowtype;
  v_host uuid;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_inv from challenge_invites where token = p_token for update;
  if not found then raise exception 'INVITE_NOT_FOUND'; end if;
  if v_inv.status = 'revoked' then raise exception 'INVITE_REVOKED'; end if;

  select created_by into v_host from public.challenges where id = v_inv.challenge_id;
  if public.friendship_is_blocked(v_uid, v_host) then
    raise exception 'This invite isn’t available.' using errcode = 'P0001';
  end if;

  update challenge_invites
  set status = 'accepted',
      invitee_id = coalesce(invitee_id, v_uid),
      accepted_at = now()
  where id = v_inv.id;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', v_inv.challenge_id,
    'invite_id', v_inv.id
  );
end;
$$;



create or replace function public.update_user_challenge(p_challenge_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  ch public.challenges%rowtype;
  v_min int;
  v_unlimited boolean;
  v_starts timestamptz;
  v_days int;
  v_ends timestamptz;
  v_format text;
  v_prize_structure text;
  v_payout_mode text;
  v_ops boolean := false;
  v_next_privacy text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  v_ops := public.is_official_ops();
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'CHALLENGE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if ch.created_by is distinct from v_uid and not v_ops then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not v_ops and (coalesce(ch.is_official, false) or coalesce(ch.series_id, '') <> '') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    if v_ops and lower(coalesce(ch.status, '')) in ('ended', 'settled', 'settling', 'judging', 'distributing') then
      raise exception 'That challenge already settled.' using errcode = 'P0001';
    end if;
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if not v_ops and ch.status = 'live' then
    raise exception 'ALREADY_STARTED';
  end if;
  if not v_ops and exists (select 1 from public.workout_submissions s where s.challenge_id = p_challenge_id) then
    raise exception 'ALREADY_STARTED';
  end if;

  if p_payload ? 'privacy_mode' then
    v_next_privacy := nullif(btrim(p_payload->>'privacy_mode'), '');
    if v_next_privacy is not null and v_next_privacy is distinct from ch.privacy_mode then
      if not v_ops
         and (
           exists (select 1 from public.challenge_participants where challenge_id = p_challenge_id)
           or exists (
             select 1 from public.challenge_invites
             where challenge_id = p_challenge_id
               and status = 'accepted'
               and invitee_id is distinct from ch.created_by
           )
         )
      then
        raise exception 'Privacy is locked. After someone joins, you cannot turn off or downgrade this setting.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  v_min := greatest(coalesce(nullif(p_payload->>'min_participants', '')::int, ch.min_participants, 2), 2);
  v_unlimited := coalesce((p_payload->>'is_unlimited')::boolean, ch.is_unlimited);
  v_starts := coalesce(nullif(p_payload->>'starts_at', '')::timestamptz, ch.starts_at);
  v_days := case
    when v_unlimited then null
    else greatest(
      coalesce(
        nullif(p_payload->>'duration_days', '')::int,
        nullif(p_payload->>'length_value', '')::int,
        nullif(p_payload->>'days_required', '')::int,
        ch.length_value,
        ch.days_required,
        1
      ),
      1
    )
  end;
  v_ends := case
    when v_unlimited then null
    else public.user_challenge_ends_at(v_starts, v_days)
  end;
  v_format := coalesce(nullif(p_payload->>'format', ''), ch.format);
  v_prize_structure := coalesce(nullif(p_payload->>'prize_structure', ''), ch.prize_structure);
  v_payout_mode := coalesce(nullif(p_payload->>'payout_mode', ''), ch.payout_mode);
  if p_payload ? 'format' or p_payload ? 'prize_structure' or p_payload ? 'payout_mode' then
    perform public.assert_format_payout_pair(v_format, v_prize_structure, v_payout_mode);
  end if;

  update public.challenges
  set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), title),
    description = coalesce(p_payload->>'description', description),
    rules = coalesce(p_payload->>'rules', rules),
    starts_at = v_starts,
    ends_at = v_ends,
    is_unlimited = v_unlimited,
    min_participants = v_min,
    days_required = coalesce(v_days, days_required),
    target_count = case
      when v_format = 'points' then coalesce(nullif(p_payload->>'target_count', '')::int, target_count)
      else coalesce(v_days, target_count)
    end,
    min_minutes = coalesce(nullif(p_payload->>'min_minutes', '')::int, min_minutes),
    frequency = coalesce(p_payload->>'frequency', frequency),
    proofs = coalesce(p_payload->'proofs', proofs),
    proof_requirements = coalesce(p_payload->'proof_requirements', proof_requirements),
    tasks = coalesce(p_payload->'tasks', tasks),
    rules_list = coalesce(p_payload->'rules_list', rules_list),
    visibility = coalesce(p_payload->>'visibility', visibility),
    discoverability = coalesce(p_payload->>'discoverability', discoverability),
    privacy_mode = coalesce(nullif(p_payload->>'privacy_mode', ''), privacy_mode),
    task = coalesce(p_payload->>'task', task),
    length_value = v_days,
    length_unit = case
      when v_unlimited then null
      else coalesce(p_payload->>'length_unit', length_unit, 'days')
    end,
    required_checkins = coalesce(v_days, required_checkins),
    misses_allowed = coalesce(nullif(p_payload->>'misses_allowed', '')::int, misses_allowed),
    proof_type = coalesce(p_payload->>'proof_type', proof_type),
    cover_image_url = coalesce(p_payload->>'cover_image_url', cover_image_url),
    rules_video_url = coalesce(p_payload->>'rules_video_url', rules_video_url),
    format = coalesce(nullif(p_payload->>'format', ''), format),
    challenge_type = coalesce(nullif(p_payload->>'challenge_type', ''), challenge_type),
    prize_structure = coalesce(nullif(p_payload->>'prize_structure', ''), prize_structure),
    payout_mode = coalesce(nullif(p_payload->>'payout_mode', ''), payout_mode),
    top_places_mode = case
      when p_payload ? 'top_places_mode' then nullif(p_payload->>'top_places_mode', '')
      else top_places_mode
    end,
    top_places_value = case
      when p_payload ? 'top_places_value' then nullif(p_payload->>'top_places_value', '')::numeric
      else top_places_value
    end,
    top_places_distribution = case
      when p_payload ? 'top_places_distribution' then nullif(p_payload->>'top_places_distribution', '')
      else top_places_distribution
    end,
    start_roll_pending = false,
    start_roll_shift_days = 0,
    updated_at = now()
  where id = p_challenge_id
  returning * into ch;

  if v_ops then
    perform public.official_ops_log(p_challenge_id, ch.created_by, 'edit', '{}'::jsonb);
  end if;

  return to_jsonb(ch);
end;
$$;

create or replace function public.join_challenge_ungated(p_challenge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.challenges%rowtype;
  v_balance numeric;
  v_count int;
  v_need numeric;
  v_cur text;
  v_dob text;
  v_until timestamptz;
begin
  if v_uid is null then raise exception 'NOT_AUTHENTICATED'; end if;

  select * into v_c from challenges where id = p_challenge_id for update;
  if not found then raise exception 'CHALLENGE_NOT_FOUND'; end if;

  if public.friendship_is_blocked(v_uid, v_c.created_by) then
    raise exception 'NOT_INVITED';
  end if;

  if coalesce(v_c.is_callout, false) then
    raise exception 'This Callout is cheer only. Watching — no entry, no prize.' using errcode = 'P0001';
  end if;

  if v_c.is_official
     and not public.challenge_available_in_jurisdiction(p_challenge_id, v_uid) then
    raise exception 'GEO_BLOCKED';
  end if;

  if v_c.series_id is not null then
    if v_c.status not in ('filling', 'arming') then
      raise exception 'ALREADY_STARTED';
    end if;
  elsif v_c.is_official then
    raise exception 'NOT_JOINABLE';
  else
    if v_c.status in (
      'judging', 'settled',
      'cancelled', 'cancelled_underfilled', 'distributing'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    if v_c.status not in (
      'open', 'upcoming', 'starting', 'in_progress', 'live', 'filling', 'arming'
    ) then
      raise exception 'JOIN_CLOSED';
    end if;
    v_until := coalesce(v_c.join_until_at, v_c.starts_at);
    if v_until is not null and now() >= v_until then
      raise exception 'JOIN_CLOSED';
    end if;
  end if;

  if exists (select 1 from challenge_participants where challenge_id = p_challenge_id and user_id = v_uid) then
    raise exception 'ALREADY_JOINED';
  end if;

  if coalesce(v_c.visibility, '') = 'friends'
     and v_c.created_by is distinct from v_uid
     and not public.are_accepted_friends(v_c.created_by, v_uid) then
    raise exception 'FRIENDS_ONLY';
  end if;

  if public.is_invite_only_challenge(v_c)
     and v_c.created_by is distinct from v_uid then
    if not public.user_can_access_challenge(p_challenge_id, v_uid) then
      raise exception 'NOT_INVITED';
    end if;
  end if;

  select count(*) into v_count from challenge_participants
  where challenge_id = p_challenge_id and status <> 'refunded_pre_start';

  if v_c.max_participants is not null and v_count >= v_c.max_participants then
    raise exception 'LOBBY_FULL';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if coalesce(v_c.is_official, false) then
    v_dob := public.official_dob_status(v_uid);
    if v_dob = 'DOB_REQUIRED' then
      raise exception 'DOB_REQUIRED';
    end if;
    if v_dob = 'UNDERAGE' then
      raise exception 'UNDERAGE';
    end if;
  end if;

  if public.requires_official_body_metrics(v_c) then
    if not exists (
      select 1 from public.profiles
      where id = v_uid and body_metrics_completed_at is not null
    ) then
      raise exception 'BODY_METRICS_REQUIRED';
    end if;
  end if;

  v_cur := case when v_c.currency = 'bucks' then 'bucks' else 'coins' end;
  if v_cur = 'coins' then
    select coalesce(coins, credits, 0) into v_balance from profiles where id = v_uid for update;
  else
    select coalesce(bucks, 0) into v_balance from profiles where id = v_uid for update;
  end if;

  if coalesce(v_balance, 0) < v_c.buy_in_amount then
    raise exception 'INSUFFICIENT_FUNDS';
  end if;

  if v_c.buy_in_amount > 0 then
    if v_cur = 'coins' then
      update profiles
      set coins = coalesce(coins, credits, 0) - v_c.buy_in_amount
      where id = v_uid;
    else
      update profiles set bucks = bucks - v_c.buy_in_amount where id = v_uid;
    end if;
    update challenges set prize_pool = prize_pool + v_c.buy_in_amount where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      v_uid, p_challenge_id, v_cur, -v_c.buy_in_amount,
      'join_escrow', 'join_escrow',
      '{}'::jsonb,
      p_challenge_id
    );
  end if;

  insert into challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, v_uid, v_c.buy_in_amount, v_cur, 'active');

  begin
    update public.challenge_invites
    set status = 'accepted',
        accepted_at = coalesce(accepted_at, now())
    where challenge_id = p_challenge_id
      and invitee_id = v_uid
      and status = 'pending';
  exception when others then
    null;
  end;

  if v_c.series_id is not null then
    select 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0)
      into v_need
    from public.challenges
    where id = p_challenge_id;
    if v_need > 0 then
      update public.challenges
      set status = 'arming', armed_at = coalesce(armed_at, now()), updated_at = now()
      where id = p_challenge_id
        and status = 'filling'
        and coalesce(prize_pool, 0) >= v_need;
    end if;
  elsif coalesce(v_c.is_official, false) = false then
    begin
      perform public.tick_one_user_challenge_start(p_challenge_id);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'prize_pool', (select prize_pool from challenges where id = p_challenge_id)
  );
end;
$$;

