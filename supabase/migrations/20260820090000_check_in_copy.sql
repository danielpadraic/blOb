-- Display copy only. Does not rename columns, RPCs, or grant keys.
-- Challenge action Log → Check in. Auth login copy is unchanged.

create or replace function public.grant_copy(p_grant_key text, p_amount numeric)
returns table (title text, body text)
language sql
immutable
as $$
  select
    ('+' || trim(to_char(p_amount, 'FM999999990')) || ' coins · ' ||
      case p_grant_key
        when 'signup_100' then 'welcome to blOb'
        when 'fitness_profile_complete' then 'fitness profile complete'
        when 'daily_login' then 'you showed up today'
        when 'streak_3' then '3-day streak'
        when 'streak_7' then '7-day streak'
        when 'streak_30' then '30-day streak'
        when 'first_challenge_created' then 'you created your first challenge'
        when 'first_challenge_completed' then 'you finished your first challenge'
        when 'first_proof' then 'your first check-in'
        when 'first_friend' then 'you made a friend'
        when 'first_official_join' then 'you joined Official'
        else p_grant_key
      end
    )::text,
    case p_grant_key
      when 'signup_100' then 'Coins are for showing up. They are not cash.'
      when 'fitness_profile_complete' then 'Those details stay private unless you share them.'
      when 'daily_login' then 'First open of the Chicago day. That is the whole trick.'
      when 'streak_3' then 'You showed up three days. That is the habit starting.'
      when 'streak_7' then 'A week. The thing is becoming who you are.'
      when 'streak_30' then 'Thirty days. You did the thing.'
      when 'first_challenge_created' then 'You hosted. Someone else can now show up with you.'
      when 'first_challenge_completed' then 'You finished without dropping. Keep that.'
      when 'first_proof' then 'Proof on the board. Not a speech.'
      when 'first_friend' then 'Bob was already here. This one is yours.'
      when 'first_official_join' then 'Entry fees are not refundable. Finishers are paid from the prize.'
      else null
    end;
$$;

update public.badges
set
  name = 'First check-in',
  description = 'First check-in in the books. Keep going.'
where key = 'first_log';

update public.badges
set description = 'Checked in 7 days.'
where key = 'logs_7';

update public.badges
set description = 'Checked in 30 days.'
where key = 'logs_30';

create or replace function public.trg_notify_challenge_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_when text;
  v_tz text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'in_progress' then
    v_tz := coalesce(nullif(new.timezone, ''), 'UTC');
    begin
      v_when := trim(to_char(new.starts_at at time zone v_tz, 'FMHH12:MI AM'));
    exception when others then
      v_when := trim(to_char(new.starts_at, 'FMHH12:MI AM'));
    end;
    for rec in
      select p.user_id
      from public.challenge_participants p
      where p.challenge_id = new.id
        and p.status is distinct from 'refunded_pre_start'
        and p.eliminated_at is null
    loop
      perform public.notify_user(
        rec.user_id,
        null,
        'challenge_starting',
        coalesce(new.title, 'Challenge') || ' starts at ' || coalesce(v_when, 'start') || '.',
        null,
        jsonb_build_object('challenge_id', new.id, 'dedupe_key', 'start:' || new.id::text)
      );
    end loop;
  end if;

  if new.status = 'live' then
    for rec in
      select p.user_id
      from public.challenge_participants p
      where p.challenge_id = new.id
        and p.status is distinct from 'refunded_pre_start'
        and p.eliminated_at is null
    loop
      perform public.notify_user(
        rec.user_id,
        null,
        'official_started',
        coalesce(new.title, 'Official') || ' is live.',
        'Your Official window is open. Check in.',
        jsonb_build_object(
          'challenge_id', new.id,
          'dedupe_key', 'official_start:' || new.id::text
        )
      );
    end loop;
  end if;

  return new;
exception when others then
  return new;
end;
$$;

create or replace function public.trg_notify_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  select title into v_title from public.challenges where id = new.challenge_id;
  perform public.notify_user(
    new.user_id,
    null,
    'challenge_checkin',
    'Checked in for ' || coalesce(v_title, 'your Challenge') || '.',
    null,
    jsonb_build_object(
      'challenge_id', new.challenge_id,
      'dedupe_key', 'checkin:' || new.challenge_id::text || ':' || new.submission_date::text
    )
  );
  return new;
exception when others then
  return new;
end;
$$;
