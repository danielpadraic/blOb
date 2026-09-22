create or replace function public.host_add_participant(
  p_challenge_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.challenges%rowtype;
  v_cur text;
  v_fee numeric := 0;
  v_balance numeric := 0;
  v_status text;
  v_friendly boolean;
  v_staff boolean;
begin
  if auth.uid() is null or p_challenge_id is null or p_user_id is null then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  select * into v_c from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_friendly := lower(coalesce(v_c.host_rigor, 'normal')) = 'friendly';
  v_staff := public.is_official_ops()
    or v_c.created_by is not distinct from auth.uid()
    or exists (
      select 1 from public.challenge_moderators
      where challenge_id = p_challenge_id and user_id = auth.uid()
    );

  if not v_staff then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  if not v_friendly and not public.is_official_ops() then
    raise exception 'Couldn’t add them.' using errcode = 'P0001';
  end if;

  v_status := lower(coalesce(v_c.status, ''));
  if v_status in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'That challenge already settled.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.challenge_participants
    where challenge_id = p_challenge_id and user_id = p_user_id
  ) then
    raise exception 'They’re already in.' using errcode = 'P0001';
  end if;

  v_cur := case when coalesce(v_c.currency, '') = 'bucks' then 'bucks' else 'coins' end;
  v_fee := greatest(coalesce(v_c.buy_in_amount, 0), 0);

  if v_fee > 0 then
    if v_cur = 'coins' then
      select coalesce(coins, credits, 0) into v_balance from public.profiles where id = p_user_id for update;
    else
      select coalesce(bucks, 0) into v_balance from public.profiles where id = p_user_id for update;
    end if;
    if coalesce(v_balance, 0) < v_fee then
      raise exception 'Couldn’t add them.' using errcode = 'P0001';
    end if;
    if v_cur = 'coins' then
      update public.profiles
        set coins = coalesce(coins, credits, 0) - v_fee
      where id = p_user_id;
    else
      update public.profiles set bucks = bucks - v_fee where id = p_user_id;
    end if;
    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + v_fee, updated_at = now()
    where id = p_challenge_id;
    insert into public.wallet_ledger (
      user_id, challenge_id, currency, amount, entry_type, reason, metadata, reference_id
    ) values (
      p_user_id, p_challenge_id, v_cur, -v_fee,
      'join_escrow', 'join_escrow',
      jsonb_build_object('kind', 'host_add'),
      p_challenge_id
    );
  end if;

  insert into public.challenge_participants (challenge_id, user_id, buy_in_paid, currency, status)
  values (p_challenge_id, p_user_id, v_fee, v_cur, 'active');

  begin
    perform public.announce_challenge_join(p_challenge_id, p_user_id);
  exception when others then
    null;
  end;

  return jsonb_build_object(
    'ok', true,
    'challenge_id', p_challenge_id,
    'user_id', p_user_id,
    'prize_pool', (select prize_pool from public.challenges where id = p_challenge_id)
  );
end;
$$;

create or replace function public.notify_live_thread(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_mentioned_ids uuid[] default '{}',
  p_parent_author_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_user uuid;
  v_id uuid;
  v_push uuid[] := '{}';
  v_notify uuid[] := '{}';
  v_mute text;
  v_mentioned uuid[] := coalesce(p_mentioned_ids, '{}');
  v_parents uuid[] := coalesce(p_parent_author_ids, '{}');
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_key text;
begin
  if p_challenge_id is null or p_actor_id is null or coalesce(p_title, '') = '' then
    return;
  end if;
  if p_type not in ('live_message', 'live_checkin', 'live_reply') then
    return;
  end if;

  v_key := nullif(v_data->>'dedupe_key', '');

  for rec in
    select staff.user_id, coalesce(cp.live_mute, 'all') as live_mute
    from (
      select cp2.user_id
      from public.challenge_participants cp2
      where cp2.challenge_id = p_challenge_id
        and public.live_joined_participant(cp2.status, cp2.eliminated_at)
      union
      select c.created_by
      from public.challenges c
      where c.id = p_challenge_id
        and c.created_by is not null
      union
      select m.user_id
      from public.challenge_moderators m
      where m.challenge_id = p_challenge_id
      union
      select public.official_ops_user_id()
      where public.official_ops_user_id() is not null
    ) staff
    left join public.challenge_participants cp
      on cp.challenge_id = p_challenge_id
     and cp.user_id = staff.user_id
    where staff.user_id is distinct from p_actor_id
  loop
    v_user := rec.user_id;
    if v_user is null then
      continue;
    end if;
    if public.users_blocked(p_actor_id, v_user) then
      continue;
    end if;
    v_mute := rec.live_mute;
    if v_mute = 'off' then
      continue;
    end if;
    if v_mute = 'mentions'
       and not (
         v_user = any (v_mentioned)
         or v_user = any (v_parents)
       ) then
      continue;
    end if;

    v_id := null;
    begin
      insert into public.notifications (user_id, actor_id, type, title, body, data)
      select v_user, p_actor_id, p_type, p_title, p_body, v_data
      where v_key is null or not exists (
        select 1 from public.notifications n
        where n.user_id = v_user
          and n.type = p_type
          and n.data->>'dedupe_key' = v_key
      )
      returning id into v_id;
    exception when unique_violation then
      v_id := null;
    end;

    if v_id is null then
      continue;
    end if;
    v_notify := v_notify || v_id;
    if not public.live_thread_focused(v_user, p_challenge_id) then
      v_push := v_push || v_user;
    end if;
  end loop;

  if cardinality(v_push) > 0 then
    perform public.send_push_to_users(
      v_push,
      p_title,
      coalesce(nullif(p_body, ''), p_title),
      v_data || jsonb_build_object('type', p_type),
      v_notify
    );
  end if;
exception when others then
  raise warning 'notify_live_thread failed: %', sqlerrm;
end;
$$;

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
  v_name text;
  v_title text;
  v_pronoun text;
  v_copy text;
  v_href text;
  v_mentioned uuid[] := '{}';
begin
  if p_challenge_id is null or p_actor_id is null then
    return;
  end if;

  v_name := public.profile_display_name(p_actor_id);
  v_pronoun := coalesce(public.profile_object_pronoun(p_actor_id), 'them');
  select coalesce(nullif(btrim(c.title), ''), 'this challenge')
    into v_title
  from public.challenges c
  where c.id = p_challenge_id;
  if v_title is null then
    return;
  end if;

  v_copy := v_name || ' Check-In @' || v_title || '. Congratulate ' || v_pronoun || '.';
  v_href := public.live_href(p_challenge_id, p_post_id, null);
  if p_post_id is not null then
    select public.live_mentioned_user_ids(p.content, p_actor_id)
      into v_mentioned
    from public.posts p
    where p.id = p_post_id;
  end if;

  perform public.notify_live_thread(
    p_challenge_id,
    p_actor_id,
    'live_checkin',
    v_copy,
    v_copy,
    jsonb_build_object(
      'type', 'live_checkin',
      'challengeId', p_challenge_id,
      'postId', p_post_id,
      'actorId', p_actor_id,
      'challenge_id', p_challenge_id,
      'post_id', p_post_id,
      'actor_id', p_actor_id,
      'href', v_href,
      'url', v_href,
      'dedupe_key', 'live-checkin:' || p_challenge_id || ':' || p_actor_id || ':' || coalesce(p_post_id::text, to_char((timezone('utc', now()))::date, 'YYYY-MM-DD'))
    ),
    coalesce(v_mentioned, '{}'::uuid[]),
    '{}'::uuid[]
  );
exception when others then
  null;
end;
$$;
