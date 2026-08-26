-- 1:1 DMs are open to any signed-in user except self / blocked / missing profile.
-- Groups stay friends (or an existing group with those members).
-- Message notify uses the existing notify_user pipeline and skips muted recipients.

create or replace function public.direct_thread_is_blocked(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    join public.conversation_members a
      on a.conversation_id = c.id
    join public.conversation_members b
      on b.conversation_id = c.id
     and b.user_id > a.user_id
    where c.id = p_conversation_id
      and c.is_group = false
      and public.friendship_is_blocked(a.user_id, b.user_id)
  );
$$;

revoke all on function public.direct_thread_is_blocked(uuid) from public, anon;
grant execute on function public.direct_thread_is_blocked(uuid) to authenticated;

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row public.conversations;
  v_other public.profiles%rowtype;
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'You can’t message yourself.' using errcode = 'P0001';
  end if;

  select * into v_other
  from public.profiles
  where id = p_other_user_id;

  if not found then
    raise exception 'That person isn’t on the map.' using errcode = 'P0001';
  end if;

  if public.friendship_is_blocked(v_me, p_other_user_id) then
    raise exception 'You can’t message this person.' using errcode = 'P0001';
  end if;

  select c.*
    into v_row
  from public.conversations c
  join public.conversation_members a
    on a.conversation_id = c.id and a.user_id = v_me
  join public.conversation_members b
    on b.conversation_id = c.id and b.user_id = p_other_user_id
  where c.is_group = false
  order by c.created_at
  limit 1;

  if found then
    return v_row;
  end if;

  insert into public.conversations (is_group, challenge_id)
  values (false, null)
  returning * into v_row;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_row.id, v_me), (v_row.id, p_other_user_id);

  return v_row;
end;
$$;

grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

comment on function public.get_or_create_direct_conversation(uuid) is
  'Open or create a 1:1 thread. Friends are not required. Denies self, missing profile, and blocked either direction.';

-- Adding the other person to a new 1:1 is allowed when the caller is already a member
-- and the pair is not blocked. Creating a conversation still uses with check (true).
drop policy if exists "Users join or add members" on public.conversation_members;
create policy "Users join or add members"
  on public.conversation_members for insert
  to authenticated
  with check (
    (
      auth.uid() = user_id
      or public.is_conversation_member(conversation_id)
    )
    and not public.direct_thread_is_blocked(conversation_id)
  );

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
    and not public.direct_thread_is_blocked(conversation_id)
  );

create or replace function public.create_group_conversation(p_member_ids uuid[])
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

  select array_agg(distinct id order by id)
    into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as id
  where id is not null and id is distinct from v_me;

  if v_ids is null or coalesce(cardinality(v_ids), 0) < 2 then
    raise exception 'Pick at least two friends for a group.' using errcode = 'P0001';
  end if;

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
    return v_row;
  end if;

  foreach v_other in array v_ids loop
    if not public.are_accepted_friends(v_me, v_other) then
      raise exception 'Groups are for accepted friends.' using errcode = 'P0001';
    end if;
  end loop;

  insert into public.conversations (is_group, challenge_id)
  values (true, null)
  returning * into v_row;

  insert into public.conversation_members (conversation_id, user_id)
  select v_row.id, v_me
  union
  select v_row.id, id from unnest(v_ids) as id;

  return v_row;
end;
$$;

grant execute on function public.create_group_conversation(uuid[]) to authenticated;

create or replace function public.trg_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_name text;
  v_preview text;
  v_prior int;
begin
  select count(*)::int
    into v_prior
  from public.messages
  where conversation_id = new.conversation_id
    and id is distinct from new.id;

  -- First message in the thread notifies via the existing pipeline. Later
  -- messages keep the same path so ongoing chats are not silent.
  if v_prior is null then
    v_prior := 0;
  end if;

  v_name := public.profile_display_name(new.sender_id);
  v_preview := nullif(left(btrim(coalesce(new.body, '')), 80), '');
  for rec in
    select m.user_id
    from public.conversation_members m
    where m.conversation_id = new.conversation_id
      and m.user_id is distinct from new.sender_id
  loop
    if public.friendship_is_blocked(new.sender_id, rec.user_id) then
      continue;
    end if;
    if exists (
      select 1
      from public.mutes mu
      where mu.user_id = rec.user_id
        and mu.muted_user_id = new.sender_id
    ) then
      continue;
    end if;
    perform public.notify_user(
      rec.user_id,
      new.sender_id,
      'message',
      v_name || ' sent you a message.',
      v_preview,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'href', '/messages/' || new.conversation_id::text,
        'dedupe_key', case
          when v_prior = 0 then 'dm_first:' || new.conversation_id::text
          else 'dm:' || new.id::text
        end
      )
    );
  end loop;
  return new;
exception when others then
  raise warning 'message notify failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists messages_notify_members on public.messages;
create trigger messages_notify_members
  after insert on public.messages
  for each row execute function public.trg_notify_message();

notify pgrst, 'reload schema';
