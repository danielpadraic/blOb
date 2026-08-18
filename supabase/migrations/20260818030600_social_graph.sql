-- Social graph: one-way follows + mutual friendships.
-- Safe to re-run. `follows` may already exist from schema.sql.

create table if not exists public.follows (
  follower_id   uuid not null references public.profiles(id) on delete cascade,
  following_id  uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create index if not exists follows_following_id_idx on public.follows (following_id);
create index if not exists follows_follower_id_idx on public.follows (follower_id);

update public.follows set created_at = now() where created_at is null;
alter table public.follows alter column created_at set default now();
alter table public.follows alter column created_at set not null;

comment on table public.follows is 'One-way follow edges. Clients insert/delete as the follower.';

create table if not exists public.friendships (
  user_a_id     uuid not null references public.profiles(id) on delete cascade,
  user_b_id     uuid not null references public.profiles(id) on delete cascade,
  status        text not null check (status in ('pending', 'accepted', 'blocked')),
  requested_by  uuid not null references public.profiles(id),
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  primary key (user_a_id, user_b_id),
  check (user_a_id < user_b_id),
  check (requested_by = user_a_id or requested_by = user_b_id)
);

create index if not exists friendships_user_a_idx on public.friendships (user_a_id);
create index if not exists friendships_user_b_idx on public.friendships (user_b_id);
create index if not exists friendships_status_idx on public.friendships (status);

comment on table public.friendships is
  'Undirected friend pairs. Always store the lower uuid as user_a_id. pending → accepted | blocked.';

alter table public.follows enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Follows are readable" on public.follows;
create policy "Follows are readable"
  on public.follows for select
  to authenticated
  using (true);

drop policy if exists "Users follow as themselves" on public.follows;
create policy "Users follow as themselves"
  on public.follows for insert
  to authenticated
  with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.follows;
create policy "Users can unfollow"
  on public.follows for delete
  to authenticated
  using (auth.uid() = follower_id);

drop policy if exists "Users read own friendships" on public.friendships;
create policy "Users read own friendships"
  on public.friendships for select
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

drop policy if exists "Users request friendships as themselves" on public.friendships;
create policy "Users request friendships as themselves"
  on public.friendships for insert
  to authenticated
  with check (
    auth.uid() = requested_by
    and (auth.uid() = user_a_id or auth.uid() = user_b_id)
    and status = 'pending'
  );

drop policy if exists "Users update own friendships" on public.friendships;
create policy "Users update own friendships"
  on public.friendships for update
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id)
  with check (auth.uid() = user_a_id or auth.uid() = user_b_id);

drop policy if exists "Users delete own friendships" on public.friendships;
create policy "Users delete own friendships"
  on public.friendships for delete
  to authenticated
  using (auth.uid() = user_a_id or auth.uid() = user_b_id);

grant select, insert, delete on public.follows to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
