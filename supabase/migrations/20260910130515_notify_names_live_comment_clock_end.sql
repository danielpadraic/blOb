-- Notification names (Your/The Challenge: “Title”), jargon purge, clock-end sync.
-- Paste in SQL Editor on blOb-app. Do not db push --include-all.
-- Does not GRANT write_coin_ledger or tick_settlements.

create or replace function public.named_challenge_phrase(
  p_title text,
  p_kind text default 'your',
  p_max int default 80
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_prefix text := case
    when lower(coalesce(p_kind, 'your')) = 'the' then 'The Challenge: '
    else 'Your Challenge: '
  end;
  v_raw text := coalesce(nullif(btrim(p_title), ''), 'this challenge');
  v_title text;
  v_min int;
  v_cap int;
  v_inside int;
begin
  v_min := char_length(v_prefix) + 3;
  v_cap := greatest(v_min, coalesce(nullif(p_max, 0), 80));
  v_inside := greatest(1, v_cap - char_length(v_prefix) - 2);
  if char_length(v_raw) > v_inside then
    v_title := btrim(left(v_raw, greatest(1, v_inside - 1))) || '…';
  else
    v_title := v_raw;
  end if;
  return v_prefix || '“' || v_title || '”';
end;
$$;

revoke all on function public.named_challenge_phrase(text, text, int) from public, anon;
grant execute on function public.named_challenge_phrase(text, text, int) to authenticated, service_role;

create or replace function public.bob_subst_line(
  p_template text,
  p_n int,
  p_challenge text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
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
    v_tpl := regexp_replace(v_tpl, '[.!?]+\s*$', '') || ' — {challenge}.';
  end if;
  v_after := replace(v_tpl, '{n}', coalesce(p_n::text, ''));
  v_slots := greatest(1, (length(v_after) - length(replace(v_after, '{challenge}', ''))) / length('{challenge}'));
  v_left := 140 - length(replace(v_after, '{challenge}', ''));
  v_max := greatest(1, least(80, v_left / v_slots));
  v_title := public.named_challenge_phrase(v_raw, 'your', v_max);
  v_after := btrim(regexp_replace(replace(v_after, '{challenge}', v_title), '\s+', ' ', 'g'));
  if v_after = '' or char_length(v_after) > 140 then
    return '';
  end if;
  return v_after;
end;
$$;

create or replace function public.notify_start_rolled(ch public.challenges)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_when text;
  v_title text;
  v_body text;
  v_keep int;
  v_remain interval;
  v_name text;
begin
  if ch.created_by is null then
    return;
  end if;
  v_when := public.format_start_roll_when(ch.starts_at, ch.timezone);
  v_name := public.named_challenge_phrase(public.challenge_display_title(ch), 'your', 64);
  v_title := v_name || ' — not enough people yet.';
  v_body := case
    when v_when is null or btrim(v_when) = '' then 'Start moved.'
    else 'Start moved to ' || v_when || '.'
  end;
  v_keep := greatest(coalesce(ch.start_roll_keep_days, 1), 1);
  v_remain := case
    when ch.ends_at is null then interval '1 day'
    else ch.ends_at - ch.starts_at
  end;
  perform public.notify_user(
    ch.created_by,
    'start_rolled',
    v_title,
    v_body,
    ch.id,
    null,
    null,
    jsonb_build_object(
      'challenge_id', ch.id,
      'challenge_title', public.challenge_display_title(ch),
      'starts_at', ch.starts_at,
      'keep_days', v_keep,
      'can_shorten', (ch.ends_at is not null and v_remain >= interval '1 day'),
      'dedupe_key', 'start_rolled:' || ch.id::text || ':' || ch.starts_at::text
    )
  );
end;
$$;

create or replace function public.checkin_risk_line(
  p_offset_hours int,
  p_seed text,
  p_challenge text,
  p_tone text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_lines text[];
  v_idx int;
  v_template text;
  v_name text;
  v_overhead int;
  v_max_name int;
begin
  if p_tone = 'honest' then
    if p_offset_hours = 8 then
      v_lines := array[
        'Check in for {challenge} or you are on the clock.',
        '{challenge} still needs a check-in. Do it today.',
        'Don’t ghost {challenge}. Check in while you can.'
      ];
    elsif p_offset_hours = 4 then
      v_lines := array[
        'Four hours on {challenge}. Check in or lose your seat.',
        '{challenge}: four hours. Check in.',
        'Four hours left. Check in for {challenge}.'
      ];
    else
      v_lines := array[
        'Two hours on {challenge}. Check in or you’re out.',
        '{challenge}: two hours. Check in now.',
        'Last two on {challenge}. Check in. No later.'
      ];
    end if;
  else
    if p_offset_hours = 8 then
      v_lines := array[
        'Check in for {challenge} — stay in it.',
        '{challenge} is still open. Check in when you can.',
        '{challenge} is open today. One check-in keeps you in.'
      ];
    elsif p_offset_hours = 4 then
      v_lines := array[
        'Four hours on {challenge}. Check in and stay in it.',
        '{challenge}: four hours left. Check in.',
        'Four hours left on {challenge}. Check in.'
      ];
    else
      v_lines := array[
        'Two hours on {challenge}. Check in — stay in it.',
        '{challenge}: two hours. Check in now.',
        'Last two hours on {challenge}. Check in.'
      ];
    end if;
  end if;
  v_idx := 1 + mod(abs(hashtext(coalesce(p_seed, ''))), greatest(cardinality(v_lines), 1));
  v_template := v_lines[v_idx];
  v_overhead := greatest(char_length(v_template) - char_length('{challenge}'), 0);
  v_max_name := greatest(140 - v_overhead, 19);
  v_name := public.named_challenge_phrase(
    coalesce(nullif(p_challenge, ''), 'this challenge'),
    'your',
    v_max_name
  );
  return left(replace(v_template, '{challenge}', v_name), 140);
end;
$$;

create or replace function public.sync_challenge_statuses()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.challenges
    set status = 'in_progress'
    where status in ('upcoming', 'open')
      and now() >= starts_at
      and (ends_at is null or now() < ends_at);

  update public.challenges
    set status = 'judging'
    where status in ('upcoming', 'open', 'in_progress', 'live', 'filling', 'arming')
      and ends_at is not null
      and now() >= ends_at
      and coalesce(is_unlimited, false) = false;

  perform public.sync_unlimited_eliminations();
end;
$$;

grant execute on function public.sync_challenge_statuses() to authenticated, service_role;

update public.notifications n
set data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object('challenge_title', public.challenge_display_title(c))
from public.challenges c
where (n.data->>'challenge_id')::uuid = c.id
  and nullif(n.data->>'challenge_title', '') is null
  and n.type in (
    'start_rolled',
    'live_checkin',
    'live_message',
    'live_reply',
    'challenge_checkin',
    'bob_encouragement',
    'challenge_settled',
    'payout_received',
    'friend_challenge'
  );

update public.bob_encouragement_catalog
set lines = array(
  select
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      line,
      '{n} check-ins on {challenge} is the work.',
      '{n} check-ins on {challenge} is the check-in.'),
      'Check today’s window on',
      'Check today on'),
      'Home is not the work.',
      'Home is not the check-in.'),
      'Check in before the window ends.',
      'Check in before tonight.'),
      'still has today’s window.',
      'still has today.'),
      'The window on',
      'Today on'),
      'Check in before the window.',
      'Check in today.'),
      'Same check-in. Same window.',
      'Same check-in. Check in tonight.'),
      '3 days left. Window, check-in, sleep.',
      '3 days left. Check in, then rest.'),
      'Post the work you actually did',
      'Post the check-in you actually did')
  from unnest(lines) as t(line)
);
