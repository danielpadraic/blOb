-- Live shows other people's comments and reactions without a refresh.
-- Adds the two tables to the realtime publication. Row-level security is unchanged: each viewer
-- only receives rows their own policies already let them read.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
     ) then
    execute 'alter publication supabase_realtime add table public.comments';
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reactions'
     ) then
    execute 'alter publication supabase_realtime add table public.reactions';
  end if;
end $$;
