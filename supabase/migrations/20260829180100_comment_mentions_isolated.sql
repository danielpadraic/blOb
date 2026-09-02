-- Isolated comment @mentions. Does not rewrite can_read_post, quote triggers,
-- Circles RPCs, settlement, posts_type_allowed, or notifications_type_known.
-- Attaches to the live trg_notify_comment_mention (does not replace it).

create table if not exists public.comment_mentions (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id uuid references public.challenges(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists comment_mentions_mentioned_idx
  on public.comment_mentions (mentioned_user_id, created_at desc);

alter table public.comment_mentions drop constraint if exists comment_mentions_comment_id_mentioned_user_id_key;
create unique index if not exists comment_mentions_user_pair_idx
  on public.comment_mentions (comment_id, mentioned_user_id)
  where mentioned_user_id is not null;
create unique index if not exists comment_mentions_challenge_pair_idx
  on public.comment_mentions (comment_id, challenge_id)
  where challenge_id is not null;
create unique index if not exists comment_mentions_circle_pair_idx
  on public.comment_mentions (comment_id, circle_id)
  where circle_id is not null;

alter table public.comment_mentions enable row level security;

drop policy if exists "Comment mentions readable" on public.comment_mentions;
create policy "Comment mentions readable"
  on public.comment_mentions for select
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

drop policy if exists "Authors insert comment mentions" on public.comment_mentions;
create policy "Authors insert comment mentions"
  on public.comment_mentions for insert
  to authenticated
  with check (
    auth.uid() = author_id
    and exists (
      select 1
      from public.comments c
      where c.id = comment_id
        and c.author_id = auth.uid()
        and public.user_can_see_post(auth.uid(), c.post_id)
    )
  );

grant select on public.comment_mentions to anon, authenticated;
grant insert on public.comment_mentions to authenticated;

create or replace function public.users_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.friendship_is_blocked(p_a, p_b);
$fn$;

revoke all on function public.users_blocked(uuid, uuid) from public, anon, authenticated;

drop trigger if exists comment_mentions_notify on public.comment_mentions;
create trigger comment_mentions_notify
  after insert on public.comment_mentions
  for each row
  execute function public.trg_notify_comment_mention();

notify pgrst, 'reload schema';
