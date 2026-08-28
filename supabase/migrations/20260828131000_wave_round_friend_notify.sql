-- Friends get "{Name} waved." / "{Name} posted a Round." with a player deep link.

create or replace function public.trg_notify_wave_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_friend uuid;
begin
  if new.sequence_index is not null and new.sequence_index > 0 then
    return new;
  end if;
  v_name := public.profile_display_name(new.user_id);
  for v_friend in
    select case
      when f.user_a_id = new.user_id then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a_id = new.user_id or f.user_b_id = new.user_id)
  loop
    perform public.notify_user(
      v_friend,
      new.user_id,
      'story_shared',
      v_name || ' waved.',
      null,
      jsonb_build_object('story_id', new.id, 'href', '/wave/' || new.id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists stories_notify_wave_posted on public.stories;
create trigger stories_notify_wave_posted
  after insert on public.stories
  for each row execute function public.trg_notify_wave_posted();

create or replace function public.trg_notify_round_posted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_friend uuid;
begin
  v_name := public.profile_display_name(new.user_id);
  for v_friend in
    select case
      when f.user_a_id = new.user_id then f.user_b_id
      else f.user_a_id
    end
    from public.friendships f
    where f.status = 'accepted'
      and (f.user_a_id = new.user_id or f.user_b_id = new.user_id)
  loop
    perform public.notify_user(
      v_friend,
      new.user_id,
      'story_shared',
      v_name || ' posted a Round.',
      null,
      jsonb_build_object('reel_id', new.id, 'href', '/round/' || new.id)
    );
  end loop;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists reels_notify_round_posted on public.reels;
create trigger reels_notify_round_posted
  after insert on public.reels
  for each row execute function public.trg_notify_round_posted();
