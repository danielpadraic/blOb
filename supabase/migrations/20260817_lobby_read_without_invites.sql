-- Do not reference challenge_invites in challenges RLS.
-- A missing invites table (PGRST205) must not block public Lobby reads.
-- Safe to re-run.

alter table public.challenges enable row level security;

drop policy if exists "Users can read challenges" on public.challenges;
drop policy if exists "Challenges are readable" on public.challenges;
create policy "Users can read challenges" on public.challenges
  for select to authenticated
  using (
    visibility in ('public', 'unlisted')
    or visibility is null
    or is_official = true
    or created_by = auth.uid()
    or exists (
      select 1 from public.challenge_participants cp
      where cp.challenge_id = challenges.id and cp.user_id = auth.uid()
    )
  );

drop policy if exists "Public read public challenges" on public.challenges;
create policy "Public read public challenges" on public.challenges
  for select to anon
  using (
    visibility in ('public', 'unlisted')
    or visibility is null
    or is_official = true
  );
