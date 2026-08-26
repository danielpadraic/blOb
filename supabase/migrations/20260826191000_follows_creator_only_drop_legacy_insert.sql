-- Live already had extra permissive INSERT policies on follows.
-- Postgres ORs them, so Creator-only would not hold until these are gone.

drop policy if exists "Users can follow" on public.follows;
drop policy if exists "Users can follow others" on public.follows;
drop policy if exists "insert follow as self" on public.follows;
