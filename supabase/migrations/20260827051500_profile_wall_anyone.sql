-- Wall posts: anyone signed in, unless blocked or official-locked.
-- Friends-only profiles stay friends-only. Owner can still turn the wall off.

create or replace function public.can_post_on_profile(p_host_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and p_host_id is not null
    and auth.uid() is distinct from p_host_id
    and not public.friendship_is_blocked(auth.uid(), p_host_id)
    and exists (
      select 1
      from public.profiles host
      where host.id = p_host_id
        and coalesce(host.allow_profile_posts, true)
        and coalesce(host.is_official, false) = false
        and lower(coalesce(host.username, '')) is distinct from 'blob'
        and (
          coalesce(host.profile_visibility, 'public') = 'public'
          or (
            coalesce(host.profile_visibility, 'public') = 'friends'
            and exists (
              select 1
              from public.friendships f
              where f.status = 'accepted'
                and f.user_a_id = least(auth.uid(), p_host_id)
                and f.user_b_id = greatest(auth.uid(), p_host_id)
            )
          )
        )
    );
$$;

grant execute on function public.can_post_on_profile(uuid) to authenticated;
