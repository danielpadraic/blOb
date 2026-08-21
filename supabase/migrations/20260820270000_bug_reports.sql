-- In-app bug reports. Insert own row; select official/admin (is_official_viewer) only.

create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  route text,
  message text,
  image_path text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bug_reports_created_at_idx on public.bug_reports (created_at desc);

alter table public.bug_reports enable row level security;

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

grant insert, select on public.bug_reports to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'bug-reports',
  'bug-reports',
  false,
  8388608,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

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
