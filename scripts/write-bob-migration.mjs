import { readFileSync, writeFileSync } from 'node:fs';

const catalog = JSON.parse(
  readFileSync(new URL('../copy/bobCatalog.generated.json', import.meta.url), 'utf8'),
);
const dest = new URL('../supabase/migrations/20260831133845_bob_miss_gate_and_copy.sql', import.meta.url);

const sql = `-- Miss gate: only daily consistency / Official week write misses or Bob miss copy.
-- Bob catalog 2026-08-31: gentle | honest. Neutral → gentle. Always name {challenge}.
-- Does not change notify_challenge_settled (6-arg void) or High-five digest.

create or replace function public.challenge_has_daily_checkin_duty(ch public.challenges)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case
    when coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then true
    when lower(coalesce(ch.challenge_type, '')) in ('points', 'cumulative') then false
    when lower(coalesce(ch.format, 'consistency')) in ('cumulative', 'points') then false
    when lower(coalesce(ch.frequency, 'daily')) in (
      'weekly', 'week', 'monthly', 'month', 'once', 'custom', '3x_week'
    ) then false
    when lower(coalesce(ch.frequency, 'daily')) in ('daily', 'day') then true
    else false
  end;
$$;

create or replace function public.challenge_requires_period_checkin(
  ch public.challenges,
  p_period date
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_period is not null and public.challenge_has_daily_checkin_duty(ch);
$$;

create or replace function public.bob_named_challenge(
  p_user_id uuid,
  p_challenge_id uuid default null,
  p_title text default null
)
returns table (challenge_id uuid, title text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_title text;
begin
  if p_challenge_id is not null then
    select c.id, c.title into v_id, v_title
    from public.challenges c
    where c.id = p_challenge_id;
    v_title := coalesce(nullif(btrim(p_title), ''), nullif(btrim(v_title), ''));
    if v_id is not null and v_title is not null then
      challenge_id := v_id;
      title := v_title;
      return next;
      return;
    end if;
  end if;

  select c.id, c.title into v_id, v_title
  from public.challenge_participants p
  join public.challenges c on c.id = p.challenge_id
  where p.user_id = p_user_id
    and coalesce(p.status, 'joined') not in ('withdrawn', 'refunded_pre_start')
    and c.status in ('live', 'filling', 'arming', 'ended', 'judging')
    and coalesce(nullif(btrim(c.title), ''), '') <> ''
  order by
    (c.status = 'live') desc,
    (coalesce(p.status, 'joined') in ('active', 'joined', 'completed')) desc,
    c.updated_at desc
  limit 1;

  if v_id is null or v_title is null then
    return;
  end if;
  challenge_id := v_id;
  title := v_title;
  return next;
end;
$$;

create or replace function public.bob_subst_line(
  p_template text,
  p_n int,
  p_challenge text
)
returns text
language plpgsql
immutable
as $$
declare
  v_tpl text := coalesce(p_template, '');
  v_raw text := coalesce(nullif(btrim(p_challenge), ''), '');
  v_title text;
  v_after text;
  v_left int;
  v_slots int;
  v_max int;
begin
  if v_raw = '' then
    return '';
  end if;
  v_tpl := regexp_replace(v_tpl, 'the next field', '{challenge}', 'gi');
  v_tpl := regexp_replace(v_tpl, 'this field', '{challenge}', 'gi');
  v_tpl := regexp_replace(v_tpl, 'a field', '{challenge}', 'gi');
  v_tpl := regexp_replace(v_tpl, 'the field', '{challenge}', 'gi');
  if position('{challenge}' in v_tpl) = 0 then
    v_tpl := regexp_replace(v_tpl, '[.!?]+\\s*$', '') || ' — {challenge}.';
  end if;
  v_after := replace(v_tpl, '{n}', coalesce(p_n::text, ''));
  v_slots := greatest(1, (length(v_after) - length(replace(v_after, '{challenge}', ''))) / length('{challenge}'));
  v_left := 140 - length(replace(v_after, '{challenge}', ''));
  v_max := greatest(1, least(48, v_left / v_slots));
  if char_length(v_raw) > v_max then
    v_title := btrim(left(v_raw, greatest(1, v_max - 1))) || '…';
  else
    v_title := v_raw;
  end if;
  v_after := btrim(regexp_replace(replace(v_after, '{challenge}', v_title), '\\s+', ' ', 'g'));
  if v_after = '' or char_length(v_after) > 140 then
    return '';
  end if;
  return v_after;
end;
$$;

create or replace function public.pick_bob_line(
  p_user_id uuid,
  p_category text,
  p_n int default null,
  p_challenge text default null
)
returns table(line_index int, body text)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_tone text;
  v_lines text[];
  v_used int[];
  v_i int;
  v_text text;
  v_pick int;
  v_eligible int[] := '{}';
begin
  select coalesce(nullif(encouragement_tone, ''), 'gentle') into v_tone
  from public.profiles
  where id = p_user_id;
  if v_tone is distinct from 'honest' then
    v_tone := 'gentle';
  end if;

  select c.lines into v_lines
  from public.bob_encouragement_catalog c
  where c.category = p_category and c.tone = v_tone;
  if v_lines is null or array_length(v_lines, 1) is null then
    return;
  end if;

  select coalesce(array_agg(s.line_index), '{}') into v_used
  from public.bob_encouragement_sends s
  where s.user_id = p_user_id
    and s.category = p_category
    and s.sent_at > now() - interval '7 days';

  for v_i in 0 .. (array_length(v_lines, 1) - 1) loop
    if v_used is not null and v_i = any (v_used) then
      continue;
    end if;
    v_text := public.bob_subst_line(v_lines[v_i + 1], p_n, p_challenge);
    if v_text is null or v_text = '' or char_length(v_text) > 140 then
      continue;
    end if;
    v_eligible := v_eligible || v_i;
  end loop;

  if array_length(v_eligible, 1) is null then
    return;
  end if;
  v_pick := v_eligible[1 + floor(random() * array_length(v_eligible, 1))::int];
  line_index := v_pick;
  body := public.bob_subst_line(v_lines[v_pick + 1], p_n, p_challenge);
  return next;
end;
$$;

create or replace function public.send_bob_encouragement(
  p_user_id uuid,
  p_category text,
  p_event_key text,
  p_challenge_id uuid default null,
  p_n int default null,
  p_challenge_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_notify uuid;
  v_line record;
  v_href text;
  v_title text;
  v_named record;
begin
  if p_user_id is null or coalesce(p_category, '') = '' or coalesce(p_event_key, '') = '' then
    return null;
  end if;

  select * into v_named
  from public.bob_named_challenge(p_user_id, p_challenge_id, p_challenge_title)
  limit 1;
  if v_named.title is null then
    return null;
  end if;

  if v_named.challenge_id is not null and exists (
    select 1
    from public.notifications n
    where n.user_id = p_user_id
      and n.type = 'challenge_settled'
      and n.created_at > now() - interval '1 hour'
      and (
        n.data->>'challenge_id' = v_named.challenge_id::text
        or n.data->>'challengeId' = v_named.challenge_id::text
        or n.data->>'dedupe_key' like 'settle:' || v_named.challenge_id::text || '%'
      )
  ) then
    return null;
  end if;

  select id into v_id
  from public.bob_encouragement_sends
  where event_key = p_event_key
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if p_category in ('gone_3', 'gone_7', 'gone_14')
     and exists (
       select 1 from public.bob_encouragement_sends s
       where s.user_id = p_user_id
         and s.category = p_category
         and s.sent_at > now() - interval '7 days'
     ) then
    return null;
  end if;

  select * into v_line
  from public.pick_bob_line(p_user_id, p_category, p_n, v_named.title)
  limit 1;
  if v_line.body is null then
    return null;
  end if;

  insert into public.bob_encouragement_sends (
    user_id, category, line_index, event_key, challenge_id
  ) values (
    p_user_id, p_category, v_line.line_index, p_event_key, v_named.challenge_id
  )
  returning id into v_id;

  if v_named.challenge_id is not null then
    v_href := '/challenges/' || v_named.challenge_id::text;
  else
    v_href := '/feed';
  end if;
  v_title := v_line.body;

  v_notify := public.insert_notification(
    p_user_id,
    'bob_encouragement',
    v_title,
    null,
    jsonb_build_object(
      'category', p_category,
      'line_index', v_line.line_index,
      'challenge_id', v_named.challenge_id,
      'href', v_href,
      'dedupe_key', p_event_key
    ),
    null
  );
  if v_notify is null then
    delete from public.bob_encouragement_sends where id = v_id;
    return null;
  end if;
  return v_id;
exception when unique_violation then
  select id into v_id from public.bob_encouragement_sends where event_key = p_event_key limit 1;
  return v_id;
when others then
  return null;
end;
$$;

create or replace function public.notify_bob_on_open(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_today date := public.chicago_today();
  v_last date;
  v_created date;
  v_gap int;
  v_cat text;
  v_key text;
  v_named record;
begin
  if v_uid is null then
    return;
  end if;
  select timezone('America/Chicago', created_at)::date
    into v_created
  from public.profiles
  where id = v_uid;
  if v_created = v_today then
    return;
  end if;

  select max(chicago_date) into v_last
  from public.user_grants
  where user_id = v_uid and grant_key = 'daily_login';

  if v_last is null then
    v_gap := v_today - v_created;
  else
    v_gap := v_today - v_last;
  end if;
  if v_gap is null or v_gap < 2 then
    return;
  end if;

  if v_gap >= 14 then
    v_cat := 'gone_14';
  elsif v_gap = 7 then
    v_cat := 'gone_7';
  elsif v_gap = 3 then
    v_cat := 'gone_3';
  else
    v_cat := 'login_after_gap';
  end if;

  select * into v_named from public.bob_named_challenge(v_uid, null, null) limit 1;
  if v_named.title is null then
    return;
  end if;

  v_key := v_uid::text || ':' || v_today::text || ':' || v_cat;
  perform public.send_bob_encouragement(v_uid, v_cat, v_key, v_named.challenge_id, v_gap, v_named.title);
end;
$$;

create or replace function public.sync_challenge_misses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_period record;
  v_new record;
  v_allow int;
  v_missed int;
  v_out boolean;
  v_missed_n int := 0;
  v_dropped int := 0;
begin
  for ch in
    select *
    from public.challenges
    where status = 'live'
      and coalesce(is_unlimited, false) = false
      and starts_at is not null
      and now() >= starts_at
  loop
    begin
      if not public.challenge_has_daily_checkin_duty(ch) then
        continue;
      end if;

      v_allow := public.challenge_misses_allowed(ch);

      for v_period in
        select * from public.closed_checkin_periods(ch) order by ends_at
      loop
        if not public.challenge_requires_period_checkin(ch, v_period.period_key) then
          continue;
        end if;
        for v_new in
          insert into public.challenge_period_misses (challenge_id, user_id, period_key)
          select ch.id, p.user_id, v_period.period_key
          from public.challenge_participants p
          where p.challenge_id = ch.id
            and p.eliminated_at is null
            and coalesce(p.status, 'joined') in ('active', 'joined', 'completed')
            and coalesce(p.status, 'joined') is distinct from 'withdrawn'
            and coalesce(p.status, 'joined') is distinct from 'refunded_pre_start'
            and not public.period_was_submitted(ch.id, p.user_id, v_period.period_key)
          on conflict do nothing
          returning user_id, period_key
        loop
          v_missed_n := v_missed_n + 1;
          select count(*)::int into v_missed
          from public.challenge_period_misses
          where challenge_id = ch.id and user_id = v_new.user_id;

          v_out := v_missed > v_allow;
          if v_out then
            update public.challenge_participants
            set
              status = 'eliminated',
              eliminated_at = coalesce(eliminated_at, now())
            where challenge_id = ch.id
              and user_id = v_new.user_id
              and eliminated_at is null;
            if found then
              v_dropped := v_dropped + 1;
            end if;
          end if;

          begin
            perform public.send_bob_encouragement(
              v_new.user_id,
              case when v_out then 'miss_removed' else 'miss_still_in' end,
              v_new.user_id::text || ':' || ch.id::text || ':' || v_new.period_key::text || ':'
                || case when v_out then 'miss_removed' else 'miss_still_in' end,
              ch.id,
              null,
              ch.title
            );
          exception when others then
            null;
          end;
        end loop;
      end loop;
    exception when others then
      null;
    end;
  end loop;

  return jsonb_build_object('ok', true, 'missed', v_missed_n, 'dropped', v_dropped);
end;
$$;

create or replace function public.tick_bob_encouragements()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  ch public.challenges%rowtype;
  v_period date;
  v_closed date;
  v_missed boolean;
  v_prior int;
  v_key text;
  v_expect date;
  v_out boolean;
  d record;
begin
  for rec in
    select p.user_id, p.challenge_id, p.status, p.eliminated_at, c.title
    from public.challenge_participants p
    join public.challenges c on c.id = p.challenge_id
    where c.status = 'live'
      and coalesce(c.is_unlimited, false) = false
      and c.starts_at is not null
      and now() >= c.starts_at
  loop
    begin
      v_out := false;
      select * into ch from public.challenges where id = rec.challenge_id;
      v_period := public.checkin_period_for(ch);
      v_closed := public.bob_closed_period(ch);

      if rec.eliminated_at is not null
         and rec.eliminated_at > now() - interval '36 hours'
         and coalesce(rec.status, '') in ('eliminated', 'failed')
         and public.challenge_requires_period_checkin(ch, coalesce(v_closed, v_period)) then
        v_key := rec.user_id::text || ':' || rec.challenge_id::text || ':' || coalesce(v_closed::text, v_period::text) || ':miss_removed';
        perform public.send_bob_encouragement(
          rec.user_id, 'miss_removed', v_key, rec.challenge_id, null, rec.title
        );
        v_out := true;
      elsif rec.eliminated_at is not null
         or coalesce(rec.status, 'joined') in ('eliminated', 'failed', 'withdrawn', 'refunded_pre_start') then
        v_out := true;
      end if;

      if not v_out then
        perform public.notify_bob_challenge_progress(rec.user_id, rec.challenge_id, v_period);

        if v_closed is not null
           and public.challenge_requires_period_checkin(ch, v_closed) then
          v_missed := not exists (
            select 1 from public.challenge_checkins k
            where k.challenge_id = rec.challenge_id
              and k.user_id = rec.user_id
              and k.period_key = v_closed
              and k.submitted_at is not null
          );
          if v_missed then
            v_prior := 0;
            v_expect := v_closed - 1;
            for d in
              select period_key
              from public.challenge_checkins
              where challenge_id = rec.challenge_id
                and user_id = rec.user_id
                and submitted_at is not null
                and period_key < v_closed
              order by period_key desc
            loop
              if d.period_key = v_expect then
                v_prior := v_prior + 1;
                v_expect := v_expect - 1;
              else
                exit;
              end if;
            end loop;

            if v_prior >= 2 then
              v_key := rec.user_id::text || ':' || rec.challenge_id::text || ':' || v_closed::text || ':streak_broke';
              perform public.send_bob_encouragement(
                rec.user_id, 'streak_broke', v_key, rec.challenge_id, v_prior, rec.title
              );
            end if;
            v_key := rec.user_id::text || ':' || rec.challenge_id::text || ':' || v_closed::text || ':miss_still_in';
            perform public.send_bob_encouragement(
              rec.user_id, 'miss_still_in', v_key, rec.challenge_id, null, rec.title
            );
          end if;
        end if;
      end if;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

delete from public.bob_encouragement_catalog;

insert into public.bob_encouragement_catalog (category, tone, lines)
select
  cat.key,
  tone.key,
  (
    select array_agg(elem order by ord)
    from jsonb_array_elements_text(tone.value) with ordinality as t(elem, ord)
  )
from jsonb_each($bobcat$${JSON.stringify(catalog)}$bobcat$::jsonb) as cat(key, value)
cross join lateral jsonb_each(cat.value) as tone(key, value);

grant execute on function public.challenge_has_daily_checkin_duty(public.challenges) to authenticated, service_role;
grant execute on function public.challenge_requires_period_checkin(public.challenges, date) to authenticated, service_role;
grant execute on function public.sync_challenge_misses() to authenticated, service_role;

notify pgrst, 'reload schema';
`;

writeFileSync(dest, sql);
console.log('wrote', dest.pathname);
