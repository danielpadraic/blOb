-- Waves / Rounds inherit audience from the linked posts row.
-- Missing post_id is Friends, never public. Official authors stay visible.

create or replace function public.can_read_clip(p_author_id uuid, p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not distinct from p_author_id
    or exists (
      select 1
      from public.profiles pr
      where pr.id = p_author_id
        and (
          coalesce(pr.is_official, false)
          or lower(coalesce(pr.username, '')) = 'blob'
        )
    )
    or (
      p_post_id is null
      and auth.uid() is not null
      and public.are_accepted_friends(auth.uid(), p_author_id)
    )
    or exists (
      select 1
      from public.posts p
      where p.id = p_post_id
        and coalesce(p.deleted_at, 'epoch'::timestamptz) = 'epoch'::timestamptz
        and (
          coalesce(p.audience, 'friends') = 'public'
          or (
            coalesce(p.audience, 'friends') = 'friends'
            and auth.uid() is not null
            and public.are_accepted_friends(auth.uid(), p_author_id)
          )
          or (
            coalesce(p.audience, 'friends') in ('specific', 'people')
            and auth.uid() = any (coalesce(p.audience_user_ids, '{}'))
          )
        )
    );
$$;

grant execute on function public.can_read_clip(uuid, uuid) to anon, authenticated;

drop policy if exists "Anyone can view reels" on public.reels;
drop policy if exists "Reels are readable" on public.reels;
create policy "Reels are readable"
  on public.reels for select
  to authenticated
  using (public.can_read_clip(user_id, post_id));

drop policy if exists "Users can view non-expired stories" on public.stories;
drop policy if exists "Active stories are readable" on public.stories;
drop policy if exists "Stories are readable" on public.stories;
create policy "Stories are readable"
  on public.stories for select
  to authenticated
  using (
    public.can_read_clip(user_id, post_id)
    and (expires_at > now() or auth.uid() = user_id)
  );
