-- Bob encouragement notifications. Catalog matches copy/bobEncouragements.ts.

alter table public.profiles
  add column if not exists encouragement_tone text not null default 'neutral';

alter table public.profiles drop constraint if exists profiles_encouragement_tone_check;
alter table public.profiles
  add constraint profiles_encouragement_tone_check
  check (encouragement_tone in ('gentle', 'neutral', 'honest'));

comment on column public.profiles.encouragement_tone is
  'Bob encouragement alerts. gentle | neutral | honest. Owner-only. Default neutral.';

do $$
begin
  alter table public.notifications drop constraint if exists notifications_type_known;
exception when others then
  null;
end $$;

do $$
begin
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
    'badge_unlocked',
    'challenge_cancelled',
    'message',
    'official_started',
    'proof_flagged',
    'start_rolled',
    'bob_encouragement'
  ));
exception when others then
  alter table public.notifications drop constraint if exists notifications_type_known;
end $$;

create table if not exists public.bob_encouragement_catalog (
  category text not null,
  tone text not null,
  lines text[] not null,
  primary key (category, tone)
);

create table if not exists public.bob_encouragement_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  line_index int not null,
  event_key text not null,
  challenge_id uuid references public.challenges(id) on delete set null,
  sent_at timestamptz not null default now(),
  unique (event_key)
);

create index if not exists bob_encouragement_sends_user_cat_idx
  on public.bob_encouragement_sends (user_id, category, sent_at desc);

alter table public.bob_encouragement_catalog enable row level security;
alter table public.bob_encouragement_sends enable row level security;

revoke all on public.bob_encouragement_catalog from public, anon, authenticated;
revoke all on public.bob_encouragement_sends from public, anon, authenticated;

drop policy if exists bob_encouragement_sends_insert_own on public.bob_encouragement_sends;
create policy bob_encouragement_sends_insert_own
  on public.bob_encouragement_sends
  for insert
  to authenticated
  with check (auth.uid() = user_id);

grant insert on public.bob_encouragement_sends to authenticated;

insert into public.bob_encouragement_catalog (category, tone, lines)
select
  cat.key,
  tone.key,
  (
    select array_agg(elem order by ord)
    from jsonb_array_elements_text(tone.value) with ordinality as t(elem, ord)
  )
from jsonb_each($bobcat${"checkin_streak_5plus":{"gentle":["{n} days checked in on {challenge}. That is a real run. I am proud of the showing up.","Five-plus on {challenge}. Keep the thread. Check in when the window is open.","{n} in a row. Quiet work. The board noticed. So did I.","You kept {challenge} alive {n} days. That is the habit talking.","{n} check-ins stacked. Nobody did this for you. Come back tomorrow.","A streak of {n}. Soft shoulders. Still moving. That is enough.","{challenge}: {n} days. The couch did not win. Check in again when it is time.","{n} days of proof. I will not make a speech. Just keep going.","You showed up {n} times. {challenge} still needs the next one.","{n} days. Not luck. Check-ins. I like this version of you."],"neutral":["{n} days checked in on {challenge}. The streak is real. Keep it.","{n} in a row. Check in on the next open window.","{challenge}: {n} consecutive check-ins. Do the next one.","Streak {n}. Proof is on the board. Come back.","{n} days. No trophy for this. Just the next check-in.","You have checked in {n} days on {challenge}. Continue.","{n} check-ins stacked. Miss one and it resets. You know that.","{challenge} streak: {n}. Check in again.","{n} days of showing up. That is the whole sport.","Five-plus. {n} on {challenge}. Keep the chain."],"honest":["{n} days. That is not a vibe. That is work on {challenge}. Do not blow it.","{n} in a row. Impressive until you skip. Check in next window.","Streak {n}. The board does not care how you feel. Check in.","{challenge}: {n} days. You earned this. You can also lose it tomorrow.","{n} check-ins. Nobody is clapping in the street. Do the next one anyway.","Five-plus. Cute. The miss still counts. Check in.","{n} days on {challenge}. Do not get sentimental. Get the next proof in.","You showed up {n} times. That is the floor now. Stay on it.","{n} in a row. I have seen people drop on day {n}. Do not.","Streak {n}. Effort is weather. Check in when it is time. Not later."]},"checkin_streak_2":{"gentle":["Two days on {challenge}. A start. Check in again when the window opens.","Day two. That is how a run begins. I am with you.","Checked in twice. Small and real. Keep the thread.","Two in a row. Nobody else has to see it. I did.","{challenge}: two days. Gentle. Still a streak. Come back.","Second check-in. The first one was not a fluke if you return.","Two days. Soft. Honest. Check in tomorrow’s window.","You came back. That is the whole trick. Two on {challenge}.","Day 2. I will not oversell it. I will ask you to keep going.","Two check-ins stacked. That is a beginning. I like beginnings."],"neutral":["Two days checked in on {challenge}. Do it again.","Streak: 2. Check in on the next window.","Second check-in is on the board. Keep going.","{challenge}: two in a row. Continue.","Two days. A streak starts here. Check in again.","You checked in twice. The third one is the test.","Day two on {challenge}. Come back for day three.","Two check-ins. That is data. Add another.","Second day. No speech. Next window, check in.","Two in a row. Keep {challenge} moving."],"honest":["Two days. That is not a personality. Check in again on {challenge}.","Day two. Cute. Day three is where people flake. Don’t.","Two check-ins. Proof, not a mood. Do the next one.","{challenge}: two in a row. Nobody is impressed yet. Continue.","Second day. The first was luck until you repeat it.","Two days. I have seen this die on day three. Check in.","Streak 2. Thin ice. Show up anyway.","You came back once. That is the minimum. Check in again.","Two. Not five. Not done. Next window, check in.","Day two on {challenge}. Effort is the door. Open it again."]},"login_after_gap":{"gentle":["You were gone a bit. I kept the light on. Come in.","Welcome back. The work did not leave. Neither did I.","A gap. Then you. That still counts as returning.","Hey. No lecture. Check in if a window is open.","You opened the app. That is a start. I am glad you did.","Missed a day or two. The board waited. So did I.","Back. Soft landing. Pick a challenge and check in if you can.","The gap happened. You still walked in. Good.","I did not unfriend you. Open a challenge. See what is due.","Returned. No shame in the gap. Shame in never coming back, and you did."],"neutral":["You were out. You are in. Check what is due.","Gap closed. Open a live challenge and check in if the window is open.","Welcome back. The board did not pause for you.","You opened blOb. See if a check-in is waiting.","A couple days away. You are here. Continue.","Back. Look at your challenges. Check in if you can.","The gap is over. Work is not. Go.","Returned. No recap. Next check-in is what matters.","You came back. Open Home. See what moved.","Away, then here. Check in on what is live."],"honest":["You disappeared. You came back. Do not make a third act of it.","Gap. The challenges did not miss you. The windows still closed.","Welcome back. The work stacked while you were gone. Deal with it.","You opened the app. Good. Checking in is better.","Away days. Nobody saved your seat. Earn it again.","Returned. Cute. Open a challenge before you wander off.","The gap was a choice. So is opening the app. Check in if you can.","You left. You came back. I will not clap. I will wait for proof.","Missed days. The board is still the board. Move.","Here again. Fine. Do not ghost the next window."]},"streak_broke":{"gentle":["The streak on {challenge} paused. You are still in. Check in next window.","A miss. The chain snapped. You did not. Come back.","{challenge} missed a day. Still joined. That is the mercy.","Streak broke. The person did not. Next check-in starts another.","You missed. I noticed. I am not leaving. Check in when it opens.","The run ended. You are still on the board. That matters.","{challenge}: a gap in the days. You can still finish if you show up.","Broke the streak. Kept your seat. Use it.","A miss. Soft landing. Next window is a new count.","The chain is gone. You are not. Check in again."],"neutral":["Streak on {challenge} broke. You are still in. Check in next period.","Missed a window. Seat remains. Continue.","{challenge}: streak reset. Status is still in. Check in.","The run ended. The challenge did not. Show up.","Broke {n}-plus. Still joined. Next check-in is day one again.","A miss. You were not removed. Check in when it opens.","Streak over. Board still has you. Do the work.","{challenge} missed. You stay. That is the rule. Use it.","Chain snapped. Check in on the next window.","Missed this period. Still active. Continue {challenge}."],"honest":["You dropped the streak on {challenge}. You still have a seat. Barely interesting. Check in.","Missed. The chain is dead. You are not. Do not waste that.","Streak broke. Nobody is shocked. Next window, check in.","{challenge}: you missed. You are still in because the rules allowed it. Do not test them.","The run ended because you did not show up. That is the whole story.","Broke it. Still in. I will not pretend that is a win. Check in.","Gap on {challenge}. Seat kept. Proof is what keeps it next time.","You missed a period. The streak is gone. The entry fee is not. Move.","Chain snapped. Cute. Check in before the next miss is the last one.","Streak over. You stayed. Use the seat or lose it later. Your call."]},"gone_3":{"gentle":["Three days. I still have your spot. Open a challenge.","Three quiet days. Come in when you can. I kept the light on.","A short gap. You are not forgotten. Check in if a window is open.","Three days away. Welcome back if this is you. I hope it is.","Hey. Three days. No scolding. Just the door, open.","Three days. The board waited. Soft. Come look.","A small absence. I did not unfriend you. Come in.","Three days. Check what is live. Check in if you can.","The app missed you a little. Three days. Come back.","Three days out. You can still pick up {challenge} if it is open."],"neutral":["Three days since you opened blOb. Come in.","Three-day gap. Check live challenges. Check in if you can.","You were out three days. The windows did not wait.","Three days away. Open Home. See what is due.","Gap: 3 days. Return. Check in on what is live.","Three days. You have challenges. Look at them.","Short absence. You are here or you are not. Open the app.","Three days quiet. Check {challenge} if you are still in.","Three days. No recap. Next check-in is the recap.","Come back. Three days is enough gap."],"honest":["Three days gone. The challenges did not pause. You did.","Three days. That is a choice. Open the app or do not.","You vanished for three. Windows closed without you.","Three-day ghost. Cute. Check in or drop. Pick.","Three days. I will not hunt you. The board already moved.","Gone three. Come back with a check-in, not a feeling.","Three days out. {challenge} did not save you a speech.","You left for three. Fine. Do not leave for seven.","Three days. Effort is weather. This weather was you not showing up.","Three-day gap. Open it. Check in. Or admit you stopped."]},"gone_7":{"gentle":["A week. I kept the seat conceptually. Come see what is live.","Seven days. Soft knock. You can still walk in.","A week away. No shame. Open a challenge if you have one.","Seven quiet days. I am still here. So is the work.","A week. Come in when you can. I will not make it weird.","Seven days. The light stayed on. Check in if a window is open.","A week’s gap. Welcome back is available. Take it.","Seven days. {challenge} may still have you. Look.","A week. I missed the check-ins, not the performance.","Seven days out. Door’s open. That is the whole message."],"neutral":["Seven days since you opened blOb. Come in.","A week away. Check live challenges. Check in if you can.","Seven-day gap. The board moved. Catch up or read it.","A week. Open Home. See what is due.","Seven days quiet. You still have challenges. Look.","Week gap. Return. Check in on what is live.","Seven days. Windows closed without you. New ones may be open.","A week out. {challenge} is still a page you can open.","Seven days. No recap. Open the app.","Week away. Come back. Check in if you are still in."],"honest":["A week gone. That is not a busy calendar. That is a pause.","Seven days. The board forgot your face. Check in if you still have a seat.","A week. I stopped waiting mid-week. You can still show up.","Seven-day ghost. Challenges closed windows. You know this.","A week out. Do not write me a novel. Check in or don’t.","Seven days. {challenge} did not send flowers. Open it.","Week gap. Effort left the chat. You can rejoin it.","Seven days. Cute sabbatical. The miss still counted.","A week. Come back with proof, not a mood.","Seven days gone. I will not beg. The door is still a door."]},"gone_14":{"gentle":["Two weeks. I did not delete you. Come in if you want the work.","Fourteen days. Long gap. The door is still a door.","Two weeks away. Soft knock. You can still walk in.","Fourteen quiet days. I kept your name. Check what is live.","Two weeks. No lecture. Open a challenge if you have one.","A long gap. Welcome back is still on the table.","Fourteen days. I missed the check-ins. That is all.","Two weeks. {challenge} may have moved on. Look anyway.","Long quiet. You are allowed to return. I hope you do.","Fourteen days. The light is dimmer. It is not off."],"neutral":["Fourteen days since you opened blOb. Come in.","Two weeks away. Check what is still live. Check in if you can.","Fourteen-day gap. The board did not freeze.","Two weeks. Open Home. See what remains.","Fourteen days quiet. Challenges may have ended. Look.","Two-week gap. Return. Check in on what is live.","Fourteen days. Windows closed. New ones exist. Or not.","Two weeks out. {challenge} is a tap away if you are still in.","Fourteen days. No recap. Open the app or do not.","Two weeks. Come back. Check in if a seat remains."],"honest":["Two weeks. You left. The board kept score without you.","Fourteen days. That is not busy. That is gone.","Two weeks ghost. Do not expect a parade. Check in if you still can.","Fourteen days. Challenges ended. Some of them. You missed them.","Two weeks. I stopped drafting this in my head. Then you opened it.","Fourteen-day hole. {challenge} did not wait. Look anyway.","Two weeks. Come back with a check-in or do not come back as a brand.","Fourteen days. The miss is the story. Change it or don’t.","Two weeks gone. Effort is weather. This was drought.","Fourteen days. Door’s open. I will not hold it with both hands."]},"miss_still_in":{"gentle":["You missed this window on {challenge}. You are still in. Next one matters.","A miss. Seat kept. Check in when it opens again.","{challenge}: missed the period. Still joined. I am glad the rules allowed it.","Missed today. Still on the board. Come back for the next window.","You skipped a check-in. You were not removed. Use that.","A miss. Soft. You stay. Check in next time.","{challenge} missed. You remain. That is the mercy. Do not waste it.","Window closed without you. You are still in. Next window, check in.","Missed this period. Still active. I will see you on the next one.","A gap in the days. Seat still yours. Check in when you can."],"neutral":["Missed this period on {challenge}. You are still in. Check in next window.","No check-in this window. Status: still in. Continue.","{challenge}: missed. Not removed. Next period, check in.","Window closed. You stay. Do the next one.","Missed. Still joined. That is the rule. Use it.","No proof this period. Seat remains. Check in next time.","{challenge} miss. Still active. Next window is the recovery.","Missed this one. You were not dropped. Check in.","Period missed. Still in. Continue {challenge}.","A miss. Not an out. Check in on the next open window."],"honest":["You missed {challenge}. You are still in because the rules allowed a miss. Do not collect another.","No check-in. Seat kept. That is not a compliment. Check in next window.","Missed the period. Still joined. I would not push that luck.","{challenge}: you skipped. You were not removed. Yet.","Window closed empty. You stay. Next miss may not be so kind.","A miss. Cute. The board still has you. Bring proof next time.","You did not check in. You are still in. That gap is now on the record.","Missed. Not out. Do not confuse those. Check in.","{challenge} missed. Seat remains. Use it or lose it later.","No proof this period. Still active. I will remember if you miss again."]},"miss_removed":{"gentle":["You are out of {challenge}. Missed proof. The work you did still happened.","Removed for a miss. I am sorry it ended this way. The next one is open eventually.","{challenge} dropped you. The stake stays with the people who stayed. That is the sport.","Out. A missed window. You can join another. I will be there.","You missed, and the rules ran. You are out. The workouts already happened. I do not take those back.","Removed. Soft as I can say it: the board needed the check-in. It did not get it.","{challenge}: out for no proof. Come back on a new one when you are ready.","You dropped. The seat is gone. You are not gone from me.","Out. Missed the window. Next challenge, check in like it matters. It does.","Removed from {challenge}. The effort is not erased. The seat is."],"neutral":["You are out of {challenge}. Missed this period. No proof.","Eliminated: miss. The stake stays with who stayed.","{challenge}: removed for a missed window. Join the next one if you want.","Out. No check-in. That is the rule.","Missed. Removed. The board is public.","You dropped {challenge}. Check-in did not arrive. Seat is gone.","Eliminated for miss / no proof. Next challenge is a new seat.","Out of {challenge}. The people who checked in kept going.","Removed. Missed period. You can start another challenge later.","No proof. Out. That is the whole notice."],"honest":["You are out of {challenge}. You missed. The stake does not come with you.","Removed. No check-in. I will not dress it up.","{challenge} dropped you. The window closed. You were not in it.","Out. Missed proof. The board already moved.","You did not check in. You are out. That is the contract.","Eliminated. The workouts you did stay done. The prize does not.","Missed. Removed. Do not ask the board for a feeling.","{challenge}: out. Show up next time or do not buy in.","No proof. Seat gone. I do not take the work back. I take the seat.","You dropped. The people who checked in did not. That is the split."]},"final_week":{"gentle":["Last week of {challenge}. You are still in. Check in like it is the first day.","Seven days or less. I am still with you. One window at a time.","{challenge} is almost done. You stayed. Keep checking in.","Final stretch. Soft. The board still needs today’s proof.","Last week. You did not come this far to ghost a window.","{challenge}: the end is close. You are in. Check in.","A week or less. Quiet pride. Then the next check-in.","Final week. I will not crowd you. I will remind you the window opens.","Almost there. Still in. Check in until {challenge} ends.","Last days. You kept the seat. Keep the check-ins."],"neutral":["Final week of {challenge}. You are still in. Check in each window.","Seven days or less left. Stay on the board. Check in.","{challenge} ends soon. Still joined. Do the remaining check-ins.","Last week. No extra rules. Same check-in.","Under a week. You are in. Keep going.","{challenge}: final stretch. Check in while windows are open.","Ends in ≤7 days. Still active. Check in.","Last week. The board still counts days. Check in.","Almost over. You stayed. Finish the check-ins.","Final week of {challenge}. Continue."],"honest":["Last week of {challenge}. People drop here. Do not.","Seven days or less. You are in. That can change. Check in.","{challenge} is almost over. The remaining windows still count. All of them.","Final stretch. Cute if you make it. Not cute if you miss now.","Under a week. The miss in week one is forgotten. A miss now is the story.","Last week. Check in. Do not get poetic. Get proof in.","{challenge} ends soon. Still in is not finished. Check in.","Final week. I have seen seats lost here. Keep yours.","≤7 days. Same sport. Check in or get out the honest way.","Almost done. That is when people relax. Do not. Check in."]},"podium_d3":{"gentle":["Top three on {challenge}. Three days or less. Soft. Still check in.","You are placed. The window is short. I am proud. Check in anyway.","{challenge}: rank {n}. Almost over. Keep the seat you earned.","Podium range. Three days. Do not let a miss rewrite it.","You are up there. Quiet. The last windows still count.","Top 3. Short clock. Check in like you are still hungry. You should be.","{challenge} has you near the front. Three days. Stay kind to the work.","Placed. Not finished. Check in.","Rank {n}. Ends soon. I will watch the last windows with you.","Podium-close. Three days. You did the hard part. Do the last part."],"neutral":["Rank {n} on {challenge}. Three days or less. Check in.","Top three. Clock is short. Stay in. Check in.","{challenge}: placed 1–3. Ends soon. Do not miss.","Podium range. ≤3 days. Check in each remaining window.","You are 1st–3rd. Not over. Check in.","Rank {n}. Final three days. Keep the check-ins coming.","{challenge} podium watch. Still in. Check in.","Top 3. Short remaining time. Continue.","Placed. Ends in ≤3 days. Check in.","Rank {n} with three days left. Do the work."],"honest":["Rank {n} on {challenge}. Three days. A miss here is a story you will hate.","Top three. Cute. The last window can still dump you. Check in.","{challenge}: podium range. Do not coast. Check in.","You are placed. The clock is mean. Check in anyway.","Rank {n}. ≤3 days. I have seen fourth place born in a skipped window.","Top 3. Not done. Check in or donate the seat.","Podium. Three days. Effort is still the door. Open it.","{challenge} has you high. A miss is how that ends. Don’t.","Rank {n}. Short clock. No speeches. Check in.","Placed. Ends soon. The board does not save you a feeling. Check in."]}}$bobcat$::jsonb) as cat(key, value)
cross join lateral jsonb_each(cat.value) as tone(key, value)
on conflict (category, tone) do update set lines = excluded.lines;

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
  v_title text := coalesce(nullif(btrim(p_challenge), ''), 'this challenge');
  v_out text;
begin
  if char_length(v_title) > 48 then
    v_title := btrim(left(v_title, 45)) || '…';
  end if;
  v_out := p_template;
  v_out := replace(v_out, '{n}', coalesce(p_n::text, ''));
  v_out := replace(v_out, '{challenge}', v_title);
  v_out := btrim(regexp_replace(v_out, '\s+', ' ', 'g'));
  return v_out;
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
  select coalesce(nullif(encouragement_tone, ''), 'neutral') into v_tone
  from public.profiles
  where id = p_user_id;
  if v_tone not in ('gentle', 'neutral', 'honest') then
    v_tone := 'neutral';
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
begin
  if p_user_id is null or coalesce(p_category, '') = '' or coalesce(p_event_key, '') = '' then
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
  from public.pick_bob_line(p_user_id, p_category, p_n, p_challenge_title)
  limit 1;
  if v_line.body is null then
    return null;
  end if;

  insert into public.bob_encouragement_sends (
    user_id, category, line_index, event_key, challenge_id
  ) values (
    p_user_id, p_category, v_line.line_index, p_event_key, p_challenge_id
  )
  returning id into v_id;

  if p_challenge_id is not null then
    v_href := '/challenges/' || p_challenge_id::text;
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
      'challenge_id', p_challenge_id,
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

create or replace function public.bob_checkin_streak(p_challenge_id uuid, p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_period date;
  v_expect date;
  v_count int := 0;
  rec record;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found then
    return 0;
  end if;
  v_period := public.checkin_period_for(ch);
  v_expect := v_period;
  for rec in
    select period_key
    from public.challenge_checkins
    where challenge_id = p_challenge_id
      and user_id = p_user_id
      and submitted_at is not null
    order by period_key desc
  loop
    if rec.period_key = v_expect then
      v_count := v_count + 1;
      v_expect := v_expect - 1;
    elsif rec.period_key > v_expect then
      continue;
    else
      exit;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.bob_closed_period(ch public.challenges)
returns date
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_windows jsonb;
  v_date date;
begin
  if coalesce(ch.is_official, false) and coalesce(ch.series_id, '') <> '' then
    v_windows := public.official_ensure_windows(ch.id);
    select max((w->>'date')::date) into v_date
    from jsonb_array_elements(coalesce(v_windows, '[]'::jsonb)) w
    where now() > (w->>'ends_at')::timestamptz;
    return v_date;
  end if;
  if ch.starts_at is null or now() < ch.starts_at + interval '1 day' then
    return null;
  end if;
  return ((timezone('utc', now()))::date - 1);
end;
$$;

create or replace function public.bob_participant_rank(p_challenge_id uuid, p_user_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select r.rk::int
  from (
    select
      user_id,
      dense_rank() over (order by coalesce(days_completed, 0) desc, joined_at asc) as rk
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and coalesce(status, 'joined') not in ('eliminated', 'failed', 'withdrawn', 'refunded_pre_start')
      and eliminated_at is null
  ) r
  where r.user_id = p_user_id;
$$;

create or replace function public.notify_bob_challenge_progress(
  p_user_id uuid,
  p_challenge_id uuid,
  p_period date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_rank int;
  v_left interval;
  v_key text;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status is distinct from 'live' then
    return;
  end if;
  if ch.ends_at is null then
    return;
  end if;
  v_left := ch.ends_at - now();
  v_rank := public.bob_participant_rank(p_challenge_id, p_user_id);
  if v_rank is not null and v_rank <= 3 and v_left <= interval '3 days' then
    v_key := p_user_id::text || ':' || p_challenge_id::text || ':' || p_period::text || ':podium_d3';
    perform public.send_bob_encouragement(
      p_user_id, 'podium_d3', v_key, p_challenge_id, v_rank, ch.title
    );
    return;
  end if;
  if v_left <= interval '7 days' then
    v_key := p_user_id::text || ':' || p_challenge_id::text || ':' || p_period::text || ':final_week';
    perform public.send_bob_encouragement(
      p_user_id, 'final_week', v_key, p_challenge_id, null, ch.title
    );
  end if;
end;
$$;

create or replace function public.notify_bob_after_checkin(
  p_challenge_id uuid,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  v_uid uuid := coalesce(auth.uid(), p_user_id);
  v_period date;
  v_streak int;
  v_key text;
begin
  if v_uid is null then
    return;
  end if;
  select * into ch from public.challenges where id = p_challenge_id;
  if not found or ch.status is distinct from 'live' then
    return;
  end if;
  v_period := public.checkin_period_for(ch);
  v_streak := public.bob_checkin_streak(p_challenge_id, v_uid);
  if v_streak >= 5 then
    v_key := v_uid::text || ':' || p_challenge_id::text || ':' || v_period::text || ':checkin_streak_5plus';
    perform public.send_bob_encouragement(
      v_uid, 'checkin_streak_5plus', v_key, p_challenge_id, v_streak, ch.title
    );
  elsif v_streak = 2 then
    v_key := v_uid::text || ':' || p_challenge_id::text || ':' || v_period::text || ':checkin_streak_2';
    perform public.send_bob_encouragement(
      v_uid, 'checkin_streak_2', v_key, p_challenge_id, 2, ch.title
    );
  end if;
  perform public.notify_bob_challenge_progress(v_uid, p_challenge_id, v_period);
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

  v_key := v_uid::text || ':' || v_today::text || ':' || v_cat;
  perform public.send_bob_encouragement(v_uid, v_cat, v_key, null, v_gap, null);
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
         and coalesce(rec.status, '') in ('eliminated', 'failed') then
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

        if v_closed is not null then
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

create or replace function public.trg_bob_after_checkin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status is distinct from 'submitted') then
    begin
      perform public.notify_bob_after_checkin(new.challenge_id, new.user_id);
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists challenge_checkins_bob_after on public.challenge_checkins;
create trigger challenge_checkins_bob_after
  after insert or update of status, submitted_at on public.challenge_checkins
  for each row execute function public.trg_bob_after_checkin();

create or replace function public.notify_bob_on_open_self()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  perform public.notify_bob_on_open(auth.uid());
end;
$$;

grant execute on function public.notify_bob_on_open_self() to authenticated;
grant execute on function public.notify_bob_after_checkin(uuid, uuid) to authenticated;
revoke all on function public.send_bob_encouragement(uuid, text, text, uuid, int, text) from public, anon, authenticated;
revoke all on function public.pick_bob_line(uuid, text, int, text) from public, anon, authenticated;
revoke all on function public.notify_bob_on_open(uuid) from public, anon, authenticated;
revoke all on function public.tick_bob_encouragements() from public, anon, authenticated;

create or replace function public.tick_user_grants()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_prof public.profiles%rowtype;
  v_granted jsonb := '[]'::jsonb;
  v_row jsonb;
  v_streak int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if not found then
    raise exception 'PROFILE_MISSING';
  end if;

  begin
    perform public.notify_bob_on_open(v_uid);
  exception when others then
    null;
  end;

  v_row := public.claim_user_grant(v_uid, 'signup_100');
  if coalesce((v_row->>'granted')::boolean, false) then
    v_granted := v_granted || jsonb_build_array(v_row);
  end if;

  v_row := public.claim_user_grant(v_uid, 'daily_login');
  if coalesce((v_row->>'granted')::boolean, false) then
    v_granted := v_granted || jsonb_build_array(v_row);
  end if;

  v_streak := public.login_streak_days(v_uid);
  if v_streak >= 3 then
    v_row := public.claim_user_grant(v_uid, 'streak_3');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;
  if v_streak >= 7 then
    v_row := public.claim_user_grant(v_uid, 'streak_7');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;
  if v_streak >= 30 then
    v_row := public.claim_user_grant(v_uid, 'streak_30');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if public.fitness_profile_is_complete(v_prof) then
    v_row := public.claim_user_grant(v_uid, 'fitness_profile_complete');
    if coalesce((v_row->>'granted')::boolean, false) then
      v_granted := v_granted || jsonb_build_array(v_row);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'grants', v_granted, 'streak', v_streak);
end;
$$;

grant execute on function public.tick_user_grants() to authenticated;

create or replace function public.tick_official_series()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_s public.official_series%rowtype;
  v_duration int;
  v_tz text;
  v_start timestamptz;
  v_windows jsonb;
begin
  for v_s in select * from public.official_series loop
    perform pg_advisory_xact_lock(hashtext('official_series:' || v_s.slug));
    v_tz := coalesce(nullif(btrim(v_s.timezone), ''), 'America/Chicago');
    if v_tz = 'UTC' then
      v_tz := 'America/Chicago';
    end if;
    v_duration := coalesce(v_s.duration_days, 7);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'live'
        and ends_at is not null
        and now() >= ends_at
        and distributed_at is null
      for update skip locked
    loop
      begin
        perform public.distribute_challenge(rec.id);
      exception when others then
        null;
      end;
    end loop;

    update public.challenges
    set
      status = 'arming',
      armed_at = coalesce(armed_at, now()),
      updated_at = now()
    where series_id = v_s.slug
      and is_official
      and status = 'filling'
      and 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0) > 0
      and coalesce(prize_pool, 0) >= 1.5 * greatest(coalesce(host_budget, creator_contribution, 0), 0);

    for rec in
      select id
      from public.challenges
      where series_id = v_s.slug
        and is_official
        and status = 'arming'
        and armed_at is not null
        and now() >= armed_at + interval '1 hour'
      for update skip locked
    loop
      v_start := now();
      v_windows := public.official_compute_day_windows(v_start, v_tz, v_duration);
      update public.challenges
      set
        status = 'live',
        starts_at = v_start,
        day_windows = v_windows,
        timezone = v_tz,
        ends_at = (v_windows -> -1 ->> 'ends_at')::timestamptz,
        official_started_at = coalesce(official_started_at, v_start),
        updated_at = now()
      where id = rec.id;
      perform public.official_series_insert_filling(v_s.slug, 0);
    end loop;

    update public.challenges c
    set
      timezone = v_tz,
      day_windows = public.official_compute_day_windows(c.starts_at, v_tz, v_duration),
      ends_at = (public.official_compute_day_windows(c.starts_at, v_tz, v_duration) -> -1 ->> 'ends_at')::timestamptz,
      updated_at = now()
    where c.series_id = v_s.slug
      and c.is_official
      and c.status = 'live'
      and c.starts_at is not null
      and (
        c.day_windows is null
        or jsonb_typeof(c.day_windows) is distinct from 'array'
        or jsonb_array_length(c.day_windows) = 0
      );

    if not exists (
      select 1 from public.challenges
      where series_id = v_s.slug and status in ('filling', 'arming')
    ) then
      perform public.official_series_insert_filling(v_s.slug, 0);
    end if;
  end loop;

  begin
    perform public.tick_user_challenge_starts();
  exception when others then
    null;
  end;
  perform public.sync_challenge_misses();
  begin
    perform public.tick_bob_encouragements();
  exception when others then
    null;
  end;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.tick_official_series() to authenticated, service_role;

notify pgrst, 'reload schema';
