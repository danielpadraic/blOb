-- Allow pre-auth register/login failures to land in app_errors for Official.
drop policy if exists "Anon insert auth errors" on public.app_errors;
create policy "Anon insert auth errors"
  on public.app_errors for insert
  to anon
  with check (user_id is null and route like 'auth/%');

grant insert on public.app_errors to anon;
