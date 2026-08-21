-- Bug reports: any signed-in user can insert their own row.
-- Select stays official / admin / @blob (is_official_viewer).

drop policy if exists "Users insert own bug reports" on public.bug_reports;
create policy "Users insert own bug reports"
  on public.bug_reports for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Official read bug reports" on public.bug_reports;
create policy "Official read bug reports"
  on public.bug_reports for select
  to authenticated
  using (public.is_official_viewer());

grant insert on public.bug_reports to authenticated;
grant select on public.bug_reports to authenticated;

drop policy if exists "Users upload own bug reports" on storage.objects;
create policy "Users upload own bug reports"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bug-reports'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Official read bug report images" on storage.objects;
create policy "Official read bug report images"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bug-reports'
    and public.is_official_viewer()
  );

notify pgrst, 'reload schema';
