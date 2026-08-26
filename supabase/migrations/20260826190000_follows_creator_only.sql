-- Follow is Creator-only. UI hide is not enough; INSERT must fail for non-creators.
-- Drop every permissive INSERT policy so OR-combined leftovers cannot bypass this.

drop policy if exists "Users can follow" on public.follows;
drop policy if exists "Users can follow others" on public.follows;
drop policy if exists "insert follow as self" on public.follows;
drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves"
  on public.follows for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and exists (
      select 1
      from public.profiles p
      where p.id = following_id
        and p.is_creator = true
    )
  );

-- Keep own-row unfollow.
drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

-- Drop leftover follows onto accounts that are not Creators.
delete from public.follows f
using public.profiles p
where f.following_id = p.id
  and coalesce(p.is_creator, false) = false;
