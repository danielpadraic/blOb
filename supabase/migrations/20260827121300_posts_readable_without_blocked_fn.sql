-- Home/feed SELECT was failing: Posts are readable called friendship_is_blocked
-- directly, and that function is revoked from authenticated/anon.
-- Keep the block check, but only inside a security definer helper.

create or replace function public.can_read_wall_as_host(
  p_author_id uuid,
  p_audience text,
  p_wall_host_id uuid,
  p_wall_removed_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_wall_host_id is not distinct from auth.uid()
    and p_wall_removed_at is null
    and p_audience is distinct from 'only_me'
    and not public.friendship_is_blocked(p_author_id, auth.uid());
$$;

grant execute on function public.can_read_wall_as_host(uuid, text, uuid, timestamptz) to anon, authenticated;

drop policy if exists "Posts are readable" on public.posts;
create policy "Posts are readable"
  on public.posts for select
  using (
    deleted_at is null
    and (
      public.can_read_post(author_id, audience, audience_user_ids, challenge_id)
      or public.can_read_wall_as_host(author_id, audience, wall_host_id, wall_removed_at)
    )
  );
