-- Auto-friend official Bob on signup, backfill missing rows, and let Home
-- read every post authored by an is_official profile (even friends-only).

create or replace function public.official_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select id
      from public.profiles
      where id = '81dfe427-d413-4c60-bd4a-e710c95077ad'::uuid
        and coalesce(is_official, false)
    ),
    (
      select id
      from public.profiles
      where coalesce(is_official, false)
      limit 1
    )
  );
$$;

create or replace function public.ensure_official_friendship(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bob uuid;
begin
  v_bob := public.official_profile_id();
  if v_bob is null or p_user_id is null or p_user_id = v_bob then
    return;
  end if;

  insert into public.friendships (
    user_a_id, user_b_id, status, requested_by, created_at, accepted_at
  )
  values (
    least(p_user_id, v_bob),
    greatest(p_user_id, v_bob),
    'accepted',
    v_bob,
    now(),
    now()
  )
  on conflict (user_a_id, user_b_id) do update
    set status = 'accepted',
        requested_by = excluded.requested_by,
        accepted_at = coalesce(public.friendships.accepted_at, excluded.accepted_at);
exception when others then
  null;
end;
$$;

create or replace function public.sync_official_friendships(p_official uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_official is null then
    return;
  end if;

  insert into public.friendships (
    user_a_id, user_b_id, status, requested_by, created_at, accepted_at
  )
  select
    least(p.id, p_official),
    greatest(p.id, p_official),
    'accepted',
    p_official,
    now(),
    now()
  from public.profiles p
  where p.id <> p_official
    and coalesce(p.is_official, false) = false
  on conflict (user_a_id, user_b_id) do update
    set status = 'accepted',
        requested_by = excluded.requested_by,
        accepted_at = coalesce(public.friendships.accepted_at, excluded.accepted_at);
exception when others then
  null;
end;
$$;

create or replace function public.trg_friend_official_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(NEW.is_official, false) then
    perform public.sync_official_friendships(NEW.id);
    return NEW;
  end if;
  perform public.ensure_official_friendship(NEW.id);
  return NEW;
exception when others then
  return NEW;
end;
$$;

drop trigger if exists profiles_friend_official on public.profiles;
create trigger profiles_friend_official
  after insert or update of is_official on public.profiles
  for each row execute function public.trg_friend_official_account();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  v_official boolean;
begin
  v_official := lower(coalesce(new.email, '')) = 'danielpadraic@gmail.com';
  base_username := case
    when v_official then 'blob'
    else 'blob_' || substr(replace(new.id::text, '-', ''), 1, 10)
  end;

  if v_official then
    update public.profiles
    set username = 'blob_' || substr(replace(id::text, '-', ''), 1, 10)
    where lower(username) = 'blob'
      and id <> new.id;
  end if;

  insert into public.profiles (id, username, display_name, is_official)
  values (
    new.id,
    lower(base_username),
    case when v_official then 'Bob LeBlob' else null end,
    v_official
  )
  on conflict (id) do nothing;

  if not v_official then
    begin
      perform public.ensure_official_friendship(new.id);
    exception when others then
      null;
    end;
    begin
      perform public.claim_user_grant(new.id, 'signup_100');
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$$;

-- Official-authored posts are visible on Home without follow/friend, including
-- friends-only audience. Body metrics stay off this path.
create or replace function public.can_read_post(
  p_author_id uuid,
  p_audience text,
  p_audience_user_ids uuid[],
  p_challenge_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not distinct from p_author_id
    or p_audience = 'public'
    or exists (
      select 1
      from public.profiles pr
      where pr.id = p_author_id
        and coalesce(pr.is_official, false)
    )
    or (
      p_audience = 'friends'
      and auth.uid() is not null
      and exists (
        select 1
        from public.friendships f
        where f.status = 'accepted'
          and f.user_a_id = least(auth.uid(), p_author_id)
          and f.user_b_id = greatest(auth.uid(), p_author_id)
      )
    )
    or (
      p_audience = 'specific'
      and auth.uid() = any (coalesce(p_audience_user_ids, '{}'))
    )
    or (
      p_challenge_id is not null
      and auth.uid() is not null
      and exists (
        select 1
        from public.challenge_participants cp
        where cp.challenge_id = p_challenge_id
          and cp.user_id = auth.uid()
      )
    );
$$;

grant execute on function public.can_read_post(uuid, text, uuid[], uuid) to anon, authenticated;
grant execute on function public.ensure_official_friendship(uuid) to postgres, service_role;
revoke all on function public.official_profile_id() from public, anon, authenticated;
revoke all on function public.sync_official_friendships(uuid) from public, anon, authenticated;
revoke all on function public.ensure_official_friendship(uuid) from public, anon, authenticated;

do $$
declare
  v_bob uuid := '81dfe427-d413-4c60-bd4a-e710c95077ad'::uuid;
begin
  if exists (select 1 from public.profiles where id = v_bob) then
    update public.profiles
    set is_official = false
    where coalesce(is_official, false)
      and id <> v_bob;
    update public.profiles
    set is_official = true
    where id = v_bob
      and coalesce(is_official, false) = false;
  end if;

  delete from public.mutes m
  using public.profiles p
  where m.muted_user_id = p.id
    and coalesce(p.is_official, false);

  perform public.sync_official_friendships(public.official_profile_id());
end $$;
