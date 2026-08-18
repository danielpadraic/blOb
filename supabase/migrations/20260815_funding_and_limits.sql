-- Funding model, creator contribution, and participant cap.
-- Safe to re-run.

alter table public.challenges
  add column if not exists funding_model text default 'participants';

alter table public.challenges
  add column if not exists creator_contribution numeric(10,2) default 0;

alter table public.challenges
  add column if not exists max_participants int;

update public.challenges
  set funding_model = 'participants'
  where funding_model is null;

update public.challenges
  set creator_contribution = 0
  where creator_contribution is null;

alter table public.challenges
  alter column funding_model set default 'participants';

alter table public.challenges
  alter column funding_model set not null;

alter table public.challenges
  alter column creator_contribution set default 0;

alter table public.challenges
  alter column creator_contribution set not null;

alter table public.challenges
  drop constraint if exists creator_contribution_positive;

alter table public.challenges
  add constraint creator_contribution_positive check (creator_contribution >= 0);

alter table public.challenges
  drop constraint if exists max_participants_positive;

alter table public.challenges
  add constraint max_participants_positive check (max_participants is null or max_participants > 0);

comment on column public.challenges.funding_model is 'Who funds the prize pool: creator, hybrid, or participants.';
comment on column public.challenges.creator_contribution is 'Coins the creator puts into the pool up front. 0 for participant-funded challenges.';
comment on column public.challenges.max_participants is 'Join cap. Null means unlimited.';
comment on column public.challenges.prize_pool is 'Creator contribution plus participant buy-ins. Updated on publish and join.';

alter table public.challenges
  drop constraint if exists buy_in_positive;

alter table public.challenges
  add constraint buy_in_positive check (buy_in_amount >= 0);

alter table public.challenges
  drop constraint if exists funding_model_allowed;

alter table public.challenges
  add constraint funding_model_allowed check (funding_model in ('creator', 'hybrid', 'participants'));

create or replace function public.join_challenge(p_challenge_id uuid)
returns public.challenge_participants
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.challenges%rowtype;
  participant public.challenge_participants%rowtype;
  my_credits numeric(12,2);
  joiner_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into ch
  from public.challenges
  where id = p_challenge_id
  for update;

  if not found then
    raise exception 'Challenge not found' using errcode = 'P0002';
  end if;

  if ch.status not in ('upcoming', 'open') then
    raise exception 'Challenge is not open to join' using errcode = 'P0001';
  end if;

  if now() >= ch.ends_at then
    raise exception 'Challenge has ended' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.challenge_participants
    where challenge_id = p_challenge_id
      and user_id = auth.uid()
  ) then
    raise exception 'Already joined this challenge' using errcode = '23505';
  end if;

  if ch.max_participants is not null then
    select count(*) into joiner_count
    from public.challenge_participants
    where challenge_id = p_challenge_id;
    if joiner_count >= ch.max_participants then
      raise exception 'This challenge is full' using errcode = 'P0001';
    end if;
  end if;

  if coalesce(ch.buy_in_amount, 0) > 0 then
    select credits into my_credits
    from public.profiles
    where id = auth.uid()
    for update;

    if my_credits < ch.buy_in_amount then
      raise exception 'Insufficient credits' using errcode = 'P0001';
    end if;

    update public.profiles
      set credits = credits - ch.buy_in_amount
      where id = auth.uid();

    update public.challenges
      set prize_pool = coalesce(prize_pool, 0) + ch.buy_in_amount
      where id = p_challenge_id;
  end if;

  insert into public.challenge_participants (challenge_id, user_id, status)
  values (p_challenge_id, auth.uid(), 'joined')
  returning * into participant;

  return participant;
end;
$$;
