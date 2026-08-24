alter table public.challenges
  add column if not exists privacy_mode text not null default 'public';

update public.challenges
set privacy_mode = 'private'
where privacy_mode = 'public'
  and (
    lower(coalesce(visibility, '')) in ('private', 'invite')
    or challenge_lane = 'private'
  );

alter table public.challenges
  drop constraint if exists challenges_privacy_mode_check;

alter table public.challenges
  add constraint challenges_privacy_mode_check
  check (privacy_mode in ('public', 'private', 'private_corporate'));

comment on column public.challenges.privacy_mode is
  'Containment: public (or friends-visible), private (invite-only), private_corporate (Lobby-only hard containment).';
