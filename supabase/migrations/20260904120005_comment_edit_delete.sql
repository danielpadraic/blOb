alter table public.comments
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz;

create table if not exists public.comment_edits (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comment_edits_comment_created_idx
  on public.comment_edits (comment_id, created_at);

alter table public.comment_edits enable row level security;

drop policy if exists comment_edits_readable on public.comment_edits;
create policy comment_edits_readable
  on public.comment_edits
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.comments c
      where c.id = comment_id
        and (
          auth.uid() is not distinct from c.author_id
          or public.user_can_see_post(auth.uid(), c.post_id)
        )
    )
  );

grant select on public.comment_edits to anon, authenticated;

create or replace function public.trg_snapshot_comment_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.content is distinct from old.content
     and old.deleted_at is null
     and new.deleted_at is null then
    insert into public.comment_edits (comment_id, author_id, body)
    values (old.id, old.author_id, old.content);
    if new.edited_at is null or new.edited_at is not distinct from old.edited_at then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$fn$;

drop trigger if exists comments_snapshot_edit on public.comments;
create trigger comments_snapshot_edit
  before update on public.comments
  for each row
  execute function public.trg_snapshot_comment_edit();

drop policy if exists "Authors can update their comments" on public.comments;
create policy "Authors can update their comments"
  on public.comments
  for update
  to authenticated
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "Authors can delete their comments" on public.comments;
create policy "Authors can delete their comments"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = author_id);

grant select on public.comments to anon, authenticated;
grant insert, update, delete on public.comments to authenticated;

drop policy if exists "Authors delete comment mentions" on public.comment_mentions;
create policy "Authors delete comment mentions"
  on public.comment_mentions
  for delete
  to authenticated
  using (
    auth.uid() = author_id
    and exists (
      select 1
      from public.comments c
      where c.id = comment_id
        and c.author_id = auth.uid()
    )
  );

grant delete on public.comment_mentions to authenticated;
