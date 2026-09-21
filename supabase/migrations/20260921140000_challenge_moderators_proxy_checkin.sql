-- Moderators + proxy check-in.
-- Does not change check-in scoring math, settlement, prize_pool, or admin_mass_join.
-- Apply on blOb-app (tguzdtwsajnnczdxjqyq). Do not db push --include-all.

alter table public.challenge_checkins
  add column if not exists logged_by uuid references public.profiles(id) on delete set null;

comment on column public.challenge_checkins.logged_by is
  'Host or moderator who wrote this check-in for the participant. Null when the participant logged themselves.';

drop policy if exists challenge_moderators_select on public.challenge_moderators;
create policy challenge_moderators_select
  on public.challenge_moderators
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_official_ops()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_moderators.challenge_id
        and c.created_by = auth.uid()
    )
    or exists (
      select 1 from public.challenge_moderators staff
      where staff.challenge_id = challenge_moderators.challenge_id
        and staff.user_id = auth.uid()
    )
  );

drop policy if exists challenge_moderators_insert on public.challenge_moderators;
create policy challenge_moderators_insert
  on public.challenge_moderators
  for insert
  to authenticated
  with check (
    public.is_official_ops()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_moderators.challenge_id
        and c.created_by = auth.uid()
        and coalesce(c.host_rigor, 'normal') is distinct from 'strict'
        and lower(coalesce(c.status, '')) not in (
          'ended', 'settled', 'settling', 'judging', 'distributing',
          'cancelled', 'cancelled_underfilled'
        )
    )
  );

drop policy if exists challenge_moderators_delete on public.challenge_moderators;
create policy challenge_moderators_delete
  on public.challenge_moderators
  for delete
  to authenticated
  using (
    public.is_official_ops()
    or exists (
      select 1 from public.challenges c
      where c.id = challenge_moderators.challenge_id
        and c.created_by = auth.uid()
    )
  );

grant select, insert, delete on table public.challenge_moderators to authenticated;
revoke update on table public.challenge_moderators from anon, authenticated, public;

create or replace function public.checkin_is_staff(ch public.challenges)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and (
      public.is_official_ops()
      or ch.created_by = auth.uid()
      or exists (
        select 1
        from public.challenge_moderators m
        where m.challenge_id = ch.id
          and m.user_id = auth.uid()
      )
    );
$$;

create or replace function public.checkin_resolve_subject(
  ch public.challenges,
  p_for_user_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_target uuid := coalesce(p_for_user_id, v_actor);
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_target = v_actor then
    return v_actor;
  end if;
  if not public.checkin_is_staff(ch) then
    raise exception 'Only the host can check in for someone.';
  end if;
  if not exists (
    select 1
    from public.challenge_participants p
    where p.challenge_id = ch.id
      and p.user_id = v_target
      and coalesce(p.status, '') is distinct from 'refunded_pre_start'
  ) then
    raise exception 'Join this challenge before you check in.';
  end if;
  return v_target;
end;
$$;

create or replace function public.checkin_assert_proxy_open(
  ch public.challenges,
  part public.challenge_participants
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_can_restore boolean;
begin
  v_can_restore := public.is_official_ops()
    or coalesce(ch.host_rigor, 'normal') in ('friendly', 'normal');
  if part.eliminated_at is not null and not v_can_restore then
    raise exception 'They already dropped.';
  end if;
  if ch.status is distinct from 'live' then
    raise exception 'NOT_STARTED';
  end if;
  if ch.starts_at is not null and now() < ch.starts_at then
    raise exception 'NOT_STARTED';
  end if;
  if ch.status in ('judging', 'settled', 'cancelled', 'cancelled_underfilled') then
    raise exception 'Check-in is closed for this challenge.';
  end if;
  if coalesce(ch.is_unlimited, false) = false
     and ch.ends_at is not null
     and now() >= ch.ends_at then
    raise exception 'Check-in is closed for this challenge.';
  end if;
  if coalesce(part.status, 'joined') = 'withdrawn' then
    raise exception 'Join this challenge before you check in.';
  end if;
end;
$$;

create or replace function public.appoint_challenge_moderator(
  p_challenge_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  v_actor uuid := auth.uid();
  v_host_name text;
  v_title text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Only the host can add a moderator.';
  end if;
  if not (public.is_official_ops() or ch.created_by = v_actor) then
    raise exception 'Only the host can add a moderator.';
  end if;
  if lower(coalesce(ch.status, '')) in (
    'ended', 'settled', 'settling', 'judging', 'distributing',
    'cancelled', 'cancelled_underfilled'
  ) then
    raise exception 'This challenge has already ended.';
  end if;
  if coalesce(ch.host_rigor, 'normal') = 'strict' and not public.is_official_ops() then
    raise exception 'Strict challenges do not have moderators.';
  end if;
  if p_user_id is null or p_user_id = v_actor then
    raise exception 'Pick someone else.';
  end if;
  insert into public.challenge_moderators (challenge_id, user_id, assigned_by)
  values (p_challenge_id, p_user_id, v_actor)
  on conflict (challenge_id, user_id) do nothing;

  v_host_name := coalesce(nullif(public.profile_display_name(v_actor), ''), 'Someone');
  v_title := coalesce(nullif(btrim(ch.title), ''), 'this challenge');
  perform public.notify_user(
    p_user_id,
    'challenge_moderator',
    v_host_name || ' made you a moderator on ' || v_title || '.',
    null,
    p_challenge_id,
    null,
    v_actor,
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'href', '/challenges/' || p_challenge_id::text
    )
  );
  begin
    insert into public.host_adjust_audit (challenge_id, actor_id, target_user_id, action)
    values (p_challenge_id, v_actor, p_user_id, 'add_moderator');
  exception when others then
    null;
  end;
end;
$$;

create or replace function public.remove_challenge_moderator(
  p_challenge_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  ch public.challenges%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into ch from public.challenges where id = p_challenge_id for update;
  if not found then
    raise exception 'Only the host can remove a moderator.';
  end if;
  if not (public.is_official_ops() or ch.created_by = v_actor) then
    raise exception 'Only the host can remove a moderator.';
  end if;
  delete from public.challenge_moderators
  where challenge_id = p_challenge_id and user_id = p_user_id;
  begin
    insert into public.host_adjust_audit (challenge_id, actor_id, target_user_id, action)
    values (p_challenge_id, v_actor, p_user_id, 'remove_moderator');
  exception when others then
    null;
  end;
end;
$$;

revoke execute on function public.checkin_is_staff(public.challenges) from anon, public;
revoke execute on function public.checkin_resolve_subject(public.challenges, uuid) from anon, public;
revoke execute on function public.checkin_assert_proxy_open(public.challenges, public.challenge_participants) from anon, public;
grant execute on function public.appoint_challenge_moderator(uuid, uuid) to authenticated;
grant execute on function public.remove_challenge_moderator(uuid, uuid) to authenticated;

create or replace function public.checkin_stamp_proxy(
  p_challenge_id uuid,
  p_checkin_id uuid,
  p_actor uuid,
  p_subject uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_name text;
  v_who text;
  v_title text;
  v_body text;
  v_caption text;
begin
  if p_actor is null or p_subject is null or p_actor = p_subject then
    return;
  end if;
  v_actor_name := coalesce(nullif(public.profile_display_name(p_actor), ''), 'Someone');
  v_who := coalesce(nullif(public.profile_display_name(p_subject), ''), 'Someone');
  v_caption := nullif(btrim(coalesce(p_notes, '')), '');
  if v_caption is not null and v_caption in ('Check-in Complete', 'Check In Complete') then
    v_caption := null;
  end if;
  v_body := v_actor_name || ' checked in for ' || v_who || '.';
  if v_caption is not null then
    v_body := v_body || E'\n\n' || v_caption;
  end if;

  update public.challenge_checkins
    set logged_by = p_actor, updated_at = now()
  where id = p_checkin_id;

  update public.posts
    set
      content = v_body,
      author_id = p_subject,
      checkin_stats = coalesce(checkin_stats, '{}'::jsonb) || jsonb_build_object(
        'logged_by', p_actor,
        'logged_by_name', v_actor_name
      )
  where checkin_id = p_checkin_id
    and deleted_at is null;

  select coalesce(nullif(btrim(title), ''), 'this challenge') into v_title
  from public.challenges
  where id = p_challenge_id;

  perform public.notify_user(
    p_subject,
    'proxy_checkin',
    v_actor_name || ' checked you in on ' || v_title || '.',
    null,
    p_challenge_id,
    (select id from public.posts where checkin_id = p_checkin_id and deleted_at is null order by created_at asc limit 1),
    p_actor,
    jsonb_build_object(
      'challenge_id', p_challenge_id,
      'href', '/challenges/' || p_challenge_id::text || '?tab=feed'
    )
  );

  begin
    insert into public.host_adjust_audit (challenge_id, actor_id, target_user_id, action)
    values (p_challenge_id, p_actor, p_subject, 'proxy_checkin');
  exception when others then
    null;
  end;
end;
$$;

grant execute on function public.checkin_stamp_proxy(uuid, uuid, uuid, uuid, text) to authenticated;
