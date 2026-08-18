-- Direct messages. Safe to re-run. Group chats and media can use the same tables later.

create table if not exists public.conversations (
  id            uuid primary key default gen_random_uuid(),
  is_group      boolean not null default false,
  challenge_id  uuid references public.challenges(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists conversations_updated_at_idx on public.conversations (updated_at desc);
create index if not exists conversations_challenge_id_idx on public.conversations (challenge_id);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index if not exists conversation_members_user_id_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.profiles(id) on delete cascade,
  body             text,
  media_url        text,
  created_at       timestamptz not null default now(),
  check (body is not null or media_url is not null)
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create or replace function public.is_conversation_member(p_conversation_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_members
    where conversation_id = p_conversation_id
      and user_id = p_user_id
  );
$$;

drop policy if exists "Members read conversations" on public.conversations;
create policy "Members read conversations"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "Users create conversations" on public.conversations;
create policy "Users create conversations"
  on public.conversations for insert
  to authenticated
  with check (true);

drop policy if exists "Members update conversations" on public.conversations;
create policy "Members update conversations"
  on public.conversations for update
  to authenticated
  using (public.is_conversation_member(id))
  with check (public.is_conversation_member(id));

drop policy if exists "Members read membership" on public.conversation_members;
create policy "Members read membership"
  on public.conversation_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Users join or add members" on public.conversation_members;
create policy "Users join or add members"
  on public.conversation_members for insert
  to authenticated
  with check (
    auth.uid() = user_id
    or public.is_conversation_member(conversation_id)
  );

drop policy if exists "Users update own membership" on public.conversation_members;
create policy "Users update own membership"
  on public.conversation_members for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Members read messages" on public.messages;
create policy "Members read messages"
  on public.messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "Members send messages" on public.messages;
create policy "Members send messages"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and public.is_conversation_member(conversation_id)
  );

create or replace function public.get_or_create_direct_conversation(p_other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_row public.conversations;
begin
  if v_me is null then
    raise exception 'Not authenticated';
  end if;
  if p_other_user_id is null or p_other_user_id = v_me then
    raise exception 'You can’t message yourself.';
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

grant select, insert, update on public.conversations to authenticated;
grant select, insert, update on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;
grant execute on function public.is_conversation_member(uuid, uuid) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
