-- One settle Bell/push per viewer + challenge. Check-in digest per period.
-- Void/forfeit copy stays. No extra won/placed/payout pushes.
-- High-five opens one existing challenge thread or one group/1:1. Does not send.

create or replace function public.winner_digest_line(
  p_challenge_title text,
  p_friend_names text[],
  p_viewer_finished boolean
)
returns text
language plpgsql
immutable
as $$
declare
  v_title text := coalesce(nullif(btrim(p_challenge_title), ''), 'this challenge');
  v_names text[] := coalesce(p_friend_names, '{}');
  v_n int := coalesce(cardinality(v_names), 0);
begin
  if p_viewer_finished then
    if v_n = 0 then
      return 'Nice work! You finished ' || v_title || '.';
    end if;
    if v_n = 1 then
      return 'Nice work! You and ' || v_names[1] || ' all won ' || v_title || '! Send a high-five!';
    end if;
    if v_n = 2 then
      return 'Nice work! You, ' || v_names[1] || ', and ' || v_names[2] || ' all won ' || v_title || '! Send a high-five!';
    end if;
    if v_n = 3 then
      return 'Nice work! You, ' || v_names[1] || ', ' || v_names[2] || ', and ' || v_names[3] || ' all won ' || v_title || '! Send a high-five!';
    end if;
    return 'Nice work! You, ' || v_names[1] || ', ' || v_names[2] || ', and ' || (v_n - 2)::text
      || ' others all won ' || v_title || '! Send a high-five!';
  end if;

  if v_n = 0 then
    return v_title || ' ended.';
  end if;
  if v_n = 1 then
    return v_names[1] || ' won ' || v_title || '.';
  end if;
  if v_n = 2 then
    return v_names[1] || ' and ' || v_names[2] || ' won ' || v_title || '.';
  end if;
  if v_n = 3 then
    return v_names[1] || ', ' || v_names[2] || ', and ' || v_names[3] || ' won ' || v_title || '.';
  end if;
  return v_names[1] || ', ' || v_names[2] || ', and ' || (v_n - 2)::text || ' others won ' || v_title || '.';
end;
$$;

revoke all on function public.winner_digest_line(text, text[], boolean) from public;
grant execute on function public.winner_digest_line(text, text[], boolean) to service_role;

-- Same 6-arg live signature. Digest path instead of N payout/won/placed loops.
create or replace function public.notify_challenge_settled(
  p_challenge_id uuid,
  p_title text,
  p_kind text,
  p_post_id uuid,
  p_currency text default 'coins'::text,
  p_void_copy text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_host uuid;
  v_href text;
  v_copy text;
  v_viewer_finished boolean;
  v_friend_ids uuid[];
  v_friend_names text[];
  v_amount numeric;
  v_high_five boolean;
begin
  select created_by into v_host from public.challenges where id = p_challenge_id;
  v_href := '/challenges/' || p_challenge_id::text;

  if p_kind = 'void' then
    v_copy := p_title || ' settled. ' || coalesce(
      nullif(btrim(p_void_copy), ''),
      public.void_settlement_copy(true, false)
    );
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        v_copy,
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'challenge_title', p_title,
          'void', true,
          'href', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id || ':' || rec.user_id
        )
      );
    end loop;
    return;
  end if;

  if p_kind = 'forfeit' then
    for rec in
      select user_id from public.challenge_participants
      where challenge_id = p_challenge_id
        and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    loop
      perform public.notify_user(
        rec.user_id,
        v_host,
        'challenge_settled',
        p_title || ' settled. Nobody remaining. Prize forfeited.',
        null,
        jsonb_build_object(
          'type', 'challenge_settled',
          'challengeId', p_challenge_id,
          'challenge_id', p_challenge_id,
          'challenge_title', p_title,
          'forfeit', true,
          'href', v_href,
          'tab', 'overview',
          'dedupe_key', 'settle:' || p_challenge_id || ':' || rec.user_id
        )
      );
    end loop;
    return;
  end if;

  for rec in
    select user_id from public.challenge_participants
    where challenge_id = p_challenge_id
      and coalesce(status, 'joined') not in ('refunded_pre_start', 'withdrawn')
  loop
    select amount into v_amount
    from public.challenge_payouts
    where challenge_id = p_challenge_id and user_id = rec.user_id
    limit 1;
    v_viewer_finished := v_amount is not null;

    select coalesce(array_agg(x.friend_id order by x.amount desc, x.nm), '{}')
      into v_friend_ids
    from (
      select
        pay.user_id as friend_id,
        pay.amount,
        public.profile_display_name(pay.user_id) as nm
      from public.challenge_payouts pay
      join public.friendships f
        on f.status = 'accepted'
       and (
         (f.user_a_id = rec.user_id and f.user_b_id = pay.user_id)
         or (f.user_b_id = rec.user_id and f.user_a_id = pay.user_id)
       )
      where pay.challenge_id = p_challenge_id
        and pay.user_id is distinct from rec.user_id
    ) x;

    select coalesce(
        array_agg(coalesce(nullif(public.profile_display_name(fid), ''), 'Someone') order by ord),
        '{}'
      )
      into v_friend_names
    from unnest(v_friend_ids) with ordinality as t(fid, ord);

    v_high_five := v_viewer_finished and coalesce(cardinality(v_friend_ids), 0) >= 1;
    v_copy := public.winner_digest_line(p_title, v_friend_names, v_viewer_finished);

    perform public.notify_user(
      rec.user_id,
      case when coalesce(cardinality(v_friend_ids), 0) >= 1 then v_friend_ids[1] else v_host end,
      'challenge_settled',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_settled',
        'challengeId', p_challenge_id,
        'challenge_id', p_challenge_id,
        'challenge_title', p_title,
        'postId', p_post_id,
        'post_id', p_post_id,
        'href', v_href,
        'tab', 'overview',
        'high_five', v_high_five,
        'winner_ids', to_jsonb(coalesce(v_friend_ids, '{}')),
        'amount', v_amount,
        'currency', p_currency,
        'dedupe_key', 'settle:' || p_challenge_id || ':' || rec.user_id
      )
    );
  end loop;
end;
$$;

-- Old status/payout triggers stacked extra won/placed/settled rows.
create or replace function public.trg_notify_challenge_settled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

create or replace function public.trg_notify_challenge_placed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  return new;
end;
$$;

drop trigger if exists challenges_notify_settled on public.challenges;
drop trigger if exists challenge_payouts_notify_placed on public.challenge_payouts;

-- Check-in: n=1 keep congratulate copy. n>1 one friends digest. Feed posts unchanged.
create or replace function public.notify_challenge_checkin(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ch public.challenges%rowtype;
  v_name text;
  v_title text;
  v_pronoun text;
  v_period text;
  v_corporate boolean := false;
  rec record;
  v_key text;
  v_existing public.notifications%rowtype;
  v_ids uuid[];
  v_n int;
  v_copy text;
  v_data jsonb;
begin
  if p_challenge_id is null or p_actor_id is null then
    return;
  end if;

  v_name := public.profile_display_name(p_actor_id);
  v_pronoun := coalesce(public.profile_object_pronoun(p_actor_id), 'them');
  select * into v_ch from public.challenges where id = p_challenge_id;
  if not found then
    return;
  end if;
  v_title := coalesce(nullif(btrim(v_ch.title), ''), 'this challenge');
  v_corporate := lower(coalesce(v_ch.privacy_mode, '')) = 'private_corporate';
  v_period := to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
  begin
    v_period := public.checkin_period_for(v_ch)::text;
  exception when others then
    null;
  end;

  for rec in
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.user_id is distinct from p_actor_id
      and coalesce(cp.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    union
    select case
      when f.user_a_id = p_actor_id then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where not v_corporate
      and f.status = 'accepted'
      and (f.user_a_id = p_actor_id or f.user_b_id = p_actor_id)
  loop
    if rec.user_id is null or rec.user_id = p_actor_id then
      continue;
    end if;

    v_key := 'checkin-digest:' || p_challenge_id || ':' || rec.user_id || ':' || v_period;
    select * into v_existing
    from public.notifications
    where user_id = rec.user_id
      and type = 'challenge_checkin'
      and data->>'dedupe_key' = v_key
    limit 1;

    if found then
      v_ids := '{}';
      if jsonb_typeof(v_existing.data->'actor_ids') = 'array' then
        select coalesce(array_agg(distinct x::uuid), '{}')
          into v_ids
        from jsonb_array_elements_text(v_existing.data->'actor_ids') as x
        where x ~* '^[0-9a-f-]{36}$';
      end if;
      if v_existing.actor_id is not null and not (v_existing.actor_id = any (v_ids)) then
        v_ids := v_ids || v_existing.actor_id;
      end if;
      if not (p_actor_id = any (v_ids)) then
        v_ids := v_ids || p_actor_id;
      end if;
      v_n := coalesce(cardinality(v_ids), 1);
      if v_n <= 1 then
        continue;
      end if;
      v_copy := v_n::text || ' friends checked in on ' || v_title || '.';
      v_data := coalesce(v_existing.data, '{}'::jsonb) || jsonb_build_object(
        'actor_ids', to_jsonb(v_ids),
        'count', v_n,
        'period_key', v_period,
        'challenge_title', v_title,
        'postId', p_post_id,
        'post_id', p_post_id,
        'actorId', p_actor_id,
        'actor_id', p_actor_id
      );
      update public.notifications
      set title = v_copy,
          body = null,
          data = v_data,
          actor_id = v_ids[1]
      where id = v_existing.id;
      continue;
    end if;

    v_copy := v_name || ' Check-In @' || v_title || '. Congratulate ' || v_pronoun || '.';
    perform public.notify_user(
      rec.user_id,
      p_actor_id,
      'challenge_checkin',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_checkin',
        'challengeId', p_challenge_id,
        'postId', p_post_id,
        'actorId', p_actor_id,
        'challenge_id', p_challenge_id,
        'post_id', p_post_id,
        'actor_id', p_actor_id,
        'actor_ids', jsonb_build_array(p_actor_id),
        'count', 1,
        'period_key', v_period,
        'challenge_title', v_title,
        'dedupe_key', v_key
      )
    );
  end loop;
exception when others then
  null;
end;
$$;

revoke all on function public.notify_challenge_checkin(uuid, uuid, uuid) from public, anon, authenticated;

-- Skip Bob for this challenge in the same hour as its settle digest.
create or replace function public.send_bob_encouragement(
  p_user_id uuid,
  p_category text,
  p_event_key text,
  p_challenge_id uuid default null,
  p_n int default null,
  p_challenge_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_notify uuid;
  v_line record;
  v_href text;
  v_title text;
begin
  if p_user_id is null or coalesce(p_category, '') = '' or coalesce(p_event_key, '') = '' then
    return null;
  end if;

  if p_challenge_id is not null and exists (
    select 1
    from public.notifications n
    where n.user_id = p_user_id
      and n.type = 'challenge_settled'
      and n.created_at > now() - interval '1 hour'
      and (
        n.data->>'challenge_id' = p_challenge_id::text
        or n.data->>'challengeId' = p_challenge_id::text
        or n.data->>'dedupe_key' like 'settle:' || p_challenge_id::text || '%'
      )
  ) then
    return null;
  end if;

  select id into v_id
  from public.bob_encouragement_sends
  where event_key = p_event_key
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if p_category in ('gone_3', 'gone_7', 'gone_14')
     and exists (
       select 1 from public.bob_encouragement_sends s
       where s.user_id = p_user_id
         and s.category = p_category
         and s.sent_at > now() - interval '7 days'
     ) then
    return null;
  end if;

  select * into v_line
  from public.pick_bob_line(p_user_id, p_category, p_n, p_challenge_title)
  limit 1;
  if v_line.body is null then
    return null;
  end if;

  insert into public.bob_encouragement_sends (
    user_id, category, line_index, event_key, challenge_id
  ) values (
    p_user_id, p_category, v_line.line_index, p_event_key, p_challenge_id
  )
  returning id into v_id;

  if p_challenge_id is not null then
    v_href := '/challenges/' || p_challenge_id::text;
  else
    v_href := '/feed';
  end if;
  v_title := v_line.body;

  v_notify := public.insert_notification(
    p_user_id,
    'bob_encouragement',
    v_title,
    null,
    jsonb_build_object(
      'category', p_category,
      'line_index', v_line.line_index,
      'challenge_id', p_challenge_id,
      'href', v_href,
      'dedupe_key', p_event_key
    ),
    null
  );
  if v_notify is null then
    delete from public.bob_encouragement_sends where id = v_id;
    return null;
  end if;
  return v_id;
exception when unique_violation then
  select id into v_id from public.bob_encouragement_sends where event_key = p_event_key limit 1;
  return v_id;
when others then
  return null;
end;
$$;

-- Official fill: one reminder per user per instance per 24h.
create or replace function public.insert_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_data jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_key text;
  v_created timestamptz;
begin
  if p_user_id is null or coalesce(p_title, '') = '' or coalesce(p_type, '') = '' then
    return null;
  end if;
  if p_actor_id is not null and p_user_id = p_actor_id then
    return null;
  end if;

  v_key := nullif(v_data->>'dedupe_key', '');
  if v_key is not null then
    select id, created_at into v_id, v_created
    from public.notifications
    where user_id = p_user_id
      and type = p_type
      and data->>'dedupe_key' = v_key
    limit 1;
    if v_id is not null then
      if v_key like 'official-fill:%' and v_created <= now() - interval '24 hours' then
        update public.notifications
        set title = p_title,
            body = p_body,
            data = v_data,
            actor_id = p_actor_id,
            read_at = null,
            created_at = now()
        where id = v_id;
        begin
          perform public.enqueue_notification_push(v_id);
        exception when others then
          null;
        end;
        return v_id;
      end if;
      return v_id;
    end if;
  end if;

  insert into public.notifications (user_id, actor_id, type, title, body, data)
  values (p_user_id, p_actor_id, p_type, p_title, p_body, v_data)
  returning id into v_id;

  begin
    perform public.enqueue_notification_push(v_id);
  exception when others then
    null;
  end;

  return v_id;
exception when others then
  return null;
end;
$$;

create or replace function public.invite_to_challenge(p_challenge_id uuid, p_invitee_id uuid)
returns public.challenge_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
  v_challenge public.challenges%rowtype;
  v_invite public.challenge_invites%rowtype;
  v_official_fill boolean;
  v_name text;
begin
  v_inviter := auth.uid();
  if v_inviter is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_invitee_id is null then
    raise exception 'Pick someone to invite' using errcode = 'P0001';
  end if;

  if p_invitee_id = v_inviter then
    raise exception 'You can’t invite yourself' using errcode = 'P0001';
  end if;

  if not public.are_accepted_friends(v_inviter, p_invitee_id) then
    raise exception 'Add a friend first' using errcode = 'P0001';
  end if;

  select * into v_challenge
  from public.challenges
  where id = p_challenge_id;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  v_official_fill :=
    coalesce(v_challenge.is_official, false)
    and coalesce(v_challenge.status, '') in ('filling', 'arming');

  if v_challenge.created_by is distinct from v_inviter and not v_official_fill then
    raise exception 'Only the host can invite people' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_invitee_id) then
    raise exception 'That blob isn’t on the map' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = p_invitee_id
  ) then
    raise exception 'They’re already in this challenge' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.challenge_invites
  where challenge_id = p_challenge_id
    and invitee_id = p_invitee_id
  limit 1;

  if found then
    raise exception 'You already invited them' using errcode = 'P0001';
  end if;

  insert into public.challenge_invites (challenge_id, inviter_id, invitee_id, status)
  values (p_challenge_id, v_inviter, p_invitee_id, 'pending')
  returning * into v_invite;

  begin
    v_name := coalesce(public.profile_display_name(v_inviter), 'Someone');
    perform public.notify_user(
      p_invitee_id,
      v_inviter,
      'challenge_invite',
      v_name || ' invited you to ' || coalesce(v_challenge.title, 'this challenge') || '.',
      null,
      case
        when v_official_fill then
          jsonb_build_object(
            'challenge_id', p_challenge_id,
            'dedupe_key', 'official-fill:' || p_challenge_id || ':' || p_invitee_id
          )
        else
          jsonb_build_object('challenge_id', p_challenge_id)
      end
    );
  exception when others then
    raise warning 'invite notify failed: %', sqlerrm;
  end;

  return v_invite;
end;
$$;

grant execute on function public.invite_to_challenge(uuid, uuid) to authenticated;

create or replace function public.open_high_five_conversation(
  p_challenge_id uuid,
  p_member_ids uuid[]
)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_ids uuid[];
  v_other uuid;
  v_row public.conversations;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_challenge_id is null then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  select array_agg(distinct id order by id)
    into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as id
  where id is not null and id is distinct from v_me;

  if v_ids is null or coalesce(cardinality(v_ids), 0) < 1 then
    raise exception 'Nobody to high-five yet.' using errcode = 'P0001';
  end if;

  foreach v_other in array v_ids loop
    if public.friendship_is_blocked(v_me, v_other) then
      raise exception 'You can’t message this person.' using errcode = 'P0001';
    end if;
  end loop;

  select c.*
    into v_row
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id and me.user_id = v_me
  where c.challenge_id = p_challenge_id
  order by c.is_group desc, c.created_at
  limit 1;

  if found then
    foreach v_other in array v_ids loop
      if public.are_accepted_friends(v_me, v_other)
         and not exists (
           select 1 from public.conversation_members m
           where m.conversation_id = v_row.id and m.user_id = v_other
         ) then
        insert into public.conversation_members (conversation_id, user_id)
        values (v_row.id, v_other)
        on conflict do nothing;
      end if;
    end loop;
    return v_row;
  end if;

  if cardinality(v_ids) = 1 then
    v_row := public.get_or_create_direct_conversation(v_ids[1]);
    update public.conversations
    set challenge_id = p_challenge_id
    where id = v_row.id
      and challenge_id is null;
    select * into v_row from public.conversations where id = v_row.id;
    return v_row;
  end if;

  foreach v_other in array v_ids loop
    if not public.are_accepted_friends(v_me, v_other) then
      raise exception 'Groups are for accepted friends.' using errcode = 'P0001';
    end if;
  end loop;

  select c.*
    into v_row
  from public.conversations c
  where c.is_group = true
    and (
      select count(*) from public.conversation_members m where m.conversation_id = c.id
    ) = cardinality(v_ids) + 1
    and exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id and m.user_id = v_me
    )
    and not exists (
      select 1 from public.conversation_members m
      where m.conversation_id = c.id
        and m.user_id is distinct from v_me
        and m.user_id <> all (v_ids)
    )
  order by c.created_at
  limit 1;

  if found then
    update public.conversations
    set challenge_id = coalesce(challenge_id, p_challenge_id)
    where id = v_row.id;
    select * into v_row from public.conversations where id = v_row.id;
    return v_row;
  end if;

  insert into public.conversations (is_group, challenge_id)
  values (true, p_challenge_id)
  returning * into v_row;

  insert into public.conversation_members (conversation_id, user_id)
  select v_row.id, v_me
  union
  select v_row.id, id from unnest(v_ids) as id;

  return v_row;
end;
$$;

grant execute on function public.open_high_five_conversation(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
