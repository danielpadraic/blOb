-- Realtime board + lobby feed after check-in. Replica identity so
-- challenge_id filters work. Does not change scoring or proof rules.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_participants'
  ) then
    execute 'alter publication supabase_realtime add table public.challenge_participants';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'challenge_checkins'
  ) then
    execute 'alter publication supabase_realtime add table public.challenge_checkins';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'posts'
  ) then
    execute 'alter publication supabase_realtime add table public.posts';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

alter table public.challenge_participants replica identity full;
alter table public.challenge_checkins replica identity full;
alter table public.posts replica identity full;
alter table public.notifications replica identity full;

notify pgrst, 'reload schema';
