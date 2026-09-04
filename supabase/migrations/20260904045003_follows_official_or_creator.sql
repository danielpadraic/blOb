create policy "Users follow official as themselves"
  on public.follows for insert
  to authenticated
  with check (
    auth.uid() = follower_id
    and follower_id <> following_id
    and exists (
      select 1
      from public.profiles p
      where p.id = following_id
        and p.is_official = true
    )
  );
