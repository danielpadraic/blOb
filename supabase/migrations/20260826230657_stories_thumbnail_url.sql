-- Wave posters. User-facing name stays Wave. Table name stays stories.

alter table public.stories
  add column if not exists thumbnail_url text;

drop policy if exists "Users can update their own stories" on public.stories;
create policy "Users can update their own stories"
  on public.stories for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant update on public.stories to authenticated;
