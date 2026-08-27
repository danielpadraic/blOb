-- One writer for challenge_checkin: the posts trigger after final Send.
-- Copy stays: {Name} Check-In @{challenge}. Congratulate {her/him/them}.
-- Client notifyChallengeCheckinAfterPost must not insert.

drop trigger if exists workout_submissions_notify_checkin on public.workout_submissions;
drop function if exists public.trg_notify_checkin();

create or replace function public.notify_challenge_checkin(
  p_challenge_id uuid,
  p_actor_id uuid,
  p_post_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_title text;
  v_pronoun text;
  v_copy text;
  v_corporate boolean := false;
  v_day text := to_char((timezone('utc', now()))::date, 'YYYY-MM-DD');
  rec record;
begin
  if p_challenge_id is null or p_actor_id is null then
    return;
  end if;

  v_name := public.profile_display_name(p_actor_id);
  v_pronoun := coalesce(public.profile_object_pronoun(p_actor_id), 'them');
  select
    coalesce(nullif(btrim(c.title), ''), 'this challenge'),
    lower(coalesce(c.privacy_mode, '')) = 'private_corporate'
    into v_title, v_corporate
  from public.challenges c
  where c.id = p_challenge_id;
  if v_title is null then
    return;
  end if;

  v_copy := v_name || ' Check-In @' || v_title || '. Congratulate ' || v_pronoun || '.';

  for rec in
    select cp.user_id
    from public.challenge_participants cp
    where cp.challenge_id = p_challenge_id
      and cp.user_id is distinct from p_actor_id
      and coalesce(cp.status, 'joined') not in ('refunded_pre_start', 'withdrawn')
    union
    select case
      when f.user_a_id = p_actor_id then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where not v_corporate
      and f.status = 'accepted'
      and (f.user_a_id = p_actor_id or f.user_b_id = p_actor_id)
  loop
    if rec.user_id is null or rec.user_id = p_actor_id then
      continue;
    end if;
    perform public.notify_user(
      rec.user_id,
      p_actor_id,
      'challenge_checkin',
      v_copy,
      null,
      jsonb_build_object(
        'type', 'challenge_checkin',
        'challengeId', p_challenge_id,
        'postId', p_post_id,
        'actorId', p_actor_id,
        'challenge_id', p_challenge_id,
        'post_id', p_post_id,
        'actor_id', p_actor_id,
        'dedupe_key', 'checkin:' || p_challenge_id || ':' || p_actor_id || ':' || v_day
      )
    );
  end loop;
exception when others then
  null;
end;
$$;

revoke all on function public.notify_challenge_checkin(uuid, uuid, uuid) from public, anon, authenticated;

comment on function public.notify_challenge_checkin(uuid, uuid, uuid) is
  'Triggered on the final check-in post only. Peers get Name Check-In @title. Congratulate pronoun. Not the actor.';
