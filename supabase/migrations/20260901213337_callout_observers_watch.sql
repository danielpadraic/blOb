-- Callout Slice 1b: cheer-only watchers. No stakes, no second opponent.
-- Safe to re-run.

create table if not exists public.callout_observers (
  callout_id uuid not null references public.callouts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (callout_id, user_id)
);

create index if not exists callout_observers_user_id_idx on public.callout_observers (user_id, created_at desc);

comment on table public.callout_observers is 'Cheer-only watchers. Not participants. No stake, no prize.';

alter table public.callout_observers enable row level security;

create or replace function public.is_callout_reader(p_callout_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.callouts c
    where c.id = p_callout_id
      and (
        auth.uid() = c.challenger_id
        or auth.uid() = c.opponent_id
        or exists (
          select 1
          from public.callout_observers o
          where o.callout_id = p_callout_id
            and o.user_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.is_callout_reader(uuid) from public, anon;
grant execute on function public.is_callout_reader(uuid) to authenticated;

drop policy if exists "Users read own callouts" on public.callouts;
create policy "Users read own callouts"
  on public.callouts for select
  to authenticated
  using (public.is_callout_reader(id));

drop policy if exists "Callout observers read party" on public.callout_observers;
create policy "Callout observers read party"
  on public.callout_observers for select
  to authenticated
  using (public.is_callout_reader(callout_id));

drop policy if exists "Fighters invite callout observers" on public.callout_observers;
create policy "Fighters invite callout observers"
  on public.callout_observers for insert
  to authenticated
  with check (
    auth.uid() = invited_by
    and exists (
      select 1
      from public.callouts c
      where c.id = callout_id
        and auth.uid() in (c.challenger_id, c.opponent_id)
        and user_id not in (c.challenger_id, c.opponent_id)
    )
  );

drop policy if exists "Observers leave callout watch" on public.callout_observers;
create policy "Observers leave callout watch"
  on public.callout_observers for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, delete on public.callout_observers to authenticated;

create or replace function public.invite_callout_observer(p_callout_id uuid, p_user_id uuid)
returns public.callout_observers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.callouts%rowtype;
  v_obs public.callout_observers%rowtype;
  v_name text;
  v_title text;
begin
  v_me := auth.uid();
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = v_me then
    raise exception 'Pick someone else to watch' using errcode = 'P0001';
  end if;

  select * into v_row from public.callouts where id = p_callout_id for update;
  if not found then
    raise exception 'Call-out not found' using errcode = 'P0002';
  end if;
  if v_me not in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'Only the two in this Callout can invite watchers' using errcode = '42501';
  end if;
  if p_user_id in (v_row.challenger_id, v_row.opponent_id) then
    raise exception 'That person is already in this Callout' using errcode = 'P0001';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'This Callout was cancelled' using errcode = 'P0001';
  end if;
  if not public.callout_opponent_allowed(v_me, p_user_id) then
    raise exception 'You can only invite a friend or someone in a live challenge with you' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.callout_observers
    where callout_id = p_callout_id and user_id = p_user_id
  ) then
    select * into v_obs
    from public.callout_observers
    where callout_id = p_callout_id and user_id = p_user_id;
    return v_obs;
  end if;

  insert into public.callout_observers (callout_id, user_id, invited_by)
  values (p_callout_id, p_user_id, v_me)
  returning * into v_obs;

  v_name := public.profile_display_name(v_me);
  v_title := coalesce(nullif(btrim(v_row.win_condition), ''), 'Callout:');
  begin
    perform public.notify_user(
      p_user_id, v_me, 'callout_observer_invited',
      v_title,
      v_name || ' invited you to watch. Watching — no entry, no prize.',
      jsonb_build_object('callout_id', p_callout_id, 'title', v_title)
    );
  exception when others then
    null;
  end;

  return v_obs;
end;
$$;

grant execute on function public.invite_callout_observer(uuid, uuid) to authenticated;

alter table public.notifications drop constraint if exists notifications_type_known;
alter table public.notifications add constraint notifications_type_known check (type in (
  'challenge_invite',
  'challenge_new',
  'tagged',
  'mentioned',
  'profile_wall',
  'challenge_joined',
  'challenge_join_confirmed',
  'follow',
  'friend_request',
  'friend_accepted',
  'friend_challenge',
  'post_comment',
  'post_reaction',
  'post_reposted',
  'story_reaction',
  'story_comment',
  'story_shared',
  'coins_received',
  'coin_grant',
  'challenge_settled',
  'challenge_placed',
  'challenge_eliminated',
  'challenge_starting',
  'challenge_checkin_reminder',
  'challenge_checkin',
  'competitor_dropped',
  'challenge_won',
  'challenge_lost',
  'payout_received',
  'profile_incomplete',
  'callout_received',
  'callout_accepted',
  'callout_resolved',
  'callout_disputed',
  'callout_cancelled',
  'callout_observer_invited',
  'badge_unlocked',
  'challenge_cancelled',
  'message',
  'official_started',
  'proof_flagged',
  'start_rolled',
  'bob_encouragement',
  'circle_invite',
  'circle_invite_accepted',
  'circle_join',
  'circle_post',
  'circle_challenge_share'
));
