-- Reading a profile requires an account.
--
-- The SELECT policy on profiles was `to public using (true)`, and `public` in Postgres includes the
-- signed-out `anon` role. Anyone on the internet could therefore read every column of every profile
-- without an account -- names and avatars, but also body weight, body fat percentage, goal weight,
-- date of birth, and the wallet balance. The phone and address columns are empty today, so nothing
-- has leaked through them, but they would have been readable the moment a user filled them in.
--
-- The app never reads a profile while signed out: RootNavigator sends a session-less visitor to the
-- auth screen before any profile query runs, and the username-availability check happens during
-- onboarding, which is after the account exists. So requiring an account costs nothing today.
--
-- This is only the outer door. It stops strangers on the internet; it does not yet stop a signed-in
-- stranger from reading another member's body metrics. That is a column-level change and is handled
-- separately, because names and avatars are embedded in feeds, comments, and challenge lists all
-- over the app and must keep working.

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;

create policy "Profiles are viewable by signed-in members"
  on public.profiles
  for select
  to authenticated
  using (true);

-- Belt and braces: even if a future policy is written `to public` by accident, the signed-out role
-- has no privilege on the table to exercise it.
revoke select on public.profiles from anon;
