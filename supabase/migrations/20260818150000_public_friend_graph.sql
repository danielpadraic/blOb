-- Accepted friendships can be listed on public profiles (Facebook-style friend grid).
-- Pending/blocked rows stay visible only to the two people involved.

drop policy if exists "Users read own friendships" on public.friendships;
create policy "Users read own or accepted friendships"
  on public.friendships for select
  to authenticated
  using (
    auth.uid() = user_a_id
    or auth.uid() = user_b_id
    or status = 'accepted'
  );

create or replace function public.friend_count(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.friendships
  where status = 'accepted'
    and (user_a_id = p_user_id or user_b_id = p_user_id);
$$;

grant execute on function public.friend_count(uuid) to authenticated;

comment on function public.friend_count(uuid) is
  'Count of accepted friends for a profile. Does not expose pending requests.';
