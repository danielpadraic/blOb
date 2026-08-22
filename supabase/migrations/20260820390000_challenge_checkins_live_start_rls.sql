-- Defense-in-depth: challenge_checkins owner writes require the same
-- live / start-window gates as save_checkin_proof / submit_checkin / log_workout.
-- SECURITY DEFINER RPCs stay the app write path and are unchanged.

drop policy if exists "Owners insert own checkins" on public.challenge_checkins;
create policy "Owners insert own checkins"
  on public.challenge_checkins for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.challenge_participants cp
      where cp.challenge_id = challenge_id
        and cp.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.challenges c
      where c.id = challenge_id
        and c.status = 'live'
        and (c.starts_at is null or now() >= c.starts_at)
        and (c.official_started_at is null or now() >= c.official_started_at)
    )
  );

drop policy if exists "Owners update own checkins" on public.challenge_checkins;
create policy "Owners update own checkins"
  on public.challenge_checkins for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.challenges c
      where c.id = challenge_checkins.challenge_id
        and c.status = 'live'
        and (c.starts_at is null or now() >= c.starts_at)
        and (c.official_started_at is null or now() >= c.official_started_at)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.challenges c
      where c.id = challenge_id
        and c.status = 'live'
        and (c.starts_at is null or now() >= c.starts_at)
        and (c.official_started_at is null or now() >= c.official_started_at)
    )
  );

notify pgrst, 'reload schema';
