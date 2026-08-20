-- Friend-accept alert is a separate row from the coin grant.
-- Auto-Bob INSERT accepted does not notify. Idempotent via dedupe_key.

create or replace function public.trg_notify_friendship()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other uuid;
  v_name text;
  v_username text;
begin
  -- Auto-accepted inserts (official Bob friendship) must not notify.
  if tg_op = 'INSERT' and new.status = 'accepted' then
    return new;
  end if;

  if tg_op = 'INSERT' and new.status = 'pending' and new.requested_by is not null then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    select username into v_username from public.profiles where id = new.requested_by;
    v_name := coalesce(nullif(public.profile_display_name(new.requested_by), ''), coalesce(v_username, 'Someone'));
    perform public.notify_user(
      v_other,
      new.requested_by,
      'friend_request',
      v_name || ' sent a friend request.',
      null,
      jsonb_build_object(
        'username', v_username,
        'dedupe_key', 'friend_request:' || new.user_a_id::text || ':' || new.user_b_id::text
      )
    );
  elsif tg_op = 'UPDATE'
     and old.status = 'pending'
     and new.status = 'accepted'
     and new.requested_by is not null then
    v_other := case when new.requested_by = new.user_a_id then new.user_b_id else new.user_a_id end;
    select username into v_username from public.profiles where id = v_other;
    v_name := coalesce(nullif(public.profile_display_name(v_other), ''), coalesce(v_username, 'Someone'));
    perform public.notify_user(
      new.requested_by,
      v_other,
      'friend_accepted',
      v_name || ' accepted your friend request.',
      null,
      jsonb_build_object(
        'username', v_username,
        'dedupe_key', 'friend_accepted:' || new.user_a_id::text || ':' || new.user_b_id::text
      )
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists friendships_notify on public.friendships;
create trigger friendships_notify
  after insert or update of status on public.friendships
  for each row execute function public.trg_notify_friendship();
