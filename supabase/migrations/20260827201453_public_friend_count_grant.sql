-- Public profile header needs the accepted-friend count without exposing the list.
-- Count is the same definition as the owner's Friends tab: accepted rows where
-- the profile user is either side of the pair.

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

revoke all on function public.friend_count(uuid) from public;
grant execute on function public.friend_count(uuid) to anon, authenticated;

comment on function public.friend_count(uuid) is
  'Accepted friend count for a public profile. Does not return the friend list.';
